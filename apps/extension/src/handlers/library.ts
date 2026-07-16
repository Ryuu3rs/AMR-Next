import type { SourceLinkRecord } from "@amr/contracts"
import { SourceError } from "@amr/source-sdk"
import { sourceRegistry } from "@amr/sources"
import {
    db,
    cacheCover,
    clearHistory,
    clearLibrary,
    createBackup,
    getActivityCalendar,
    getLocalStats,
    rekeyManga,
    removeManga,
    type LibraryManga
} from "../database"
import { findSource, listChaptersForSource, resolveChapterUrl, resolveCoverFor, resolveMangaUrl } from "../sources"
import { scheduleChapterListRefresh } from "../background/chapter-cache"
import { fetchCoverBlob } from "../background/covers"
import type { HandlerMap } from "../background/handler-types"
import { publishLive } from "../live"

const COVER_BACKFILL_BATCH = 20

// IDs attempted this session so a cover that keeps failing to resolve/fetch
// doesn't loop forever. Cleared when a full backfill pass completes (remaining
// hits 0).
const coverBackfillAttempted = new Set<string>()

export const libraryHandlers: HandlerMap = {
    "library:list": async () => {
        return db.manga.orderBy("updatedAt").reverse().toArray()
    },

    "library:get": async request => {
        return (await db.manga.get(request.mangaId)) ?? null
    },

    "library:remove": async request => {
        await removeManga(request.mangaId)
        return null
    },

    "library:clear": async () => {
        // Safety-net snapshot before the fully destructive wipe - matches the
        // data:import / sync:pull pattern (see handlers/data-sync-settings.ts) so a
        // library clear is undoable via data:backup:restore like any other
        // destructive path.
        await createBackup("pre-clear")
        await clearLibrary()
        return null
    },

    "library:clear-history": async () => {
        await clearHistory()
        return null
    },

    "library:rate": async request => {
        const rating = request.rating === 0 ? undefined : request.rating
        await db.manga.update(request.mangaId, { rating } as Partial<{ rating: number }>)
        return null
    },

    "library:manual": async request => {
        await db.manga.update(request.mangaId, {
            manualTracking: request.manual ? true : undefined
        } as Partial<{ manualTracking: boolean }>)
        return null
    },

    "library:hold": async request => {
        await db.manga.update(request.mangaId, {
            onHold: request.onHold ? true : undefined
        } as Partial<{ onHold: boolean }>)
        return null
    },

    "library:dismiss": async request => {
        // Clear the hostname-style sourceId that flags this as a broken import
        // so it no longer appears in the reconcile panel.
        const target = await db.manga.get(request.mangaId)
        if (target && target.sourceId.includes(".")) {
            await db.manga.update(request.mangaId, {
                sourceId: "manual",
                manualTracking: true
            } as Partial<{ sourceId: string; manualTracking: boolean }>)
        }
        return null
    },

    "library:numbers": async request => {
        const patch: Record<string, number | string | undefined> = {}
        if (request.latestChapterNumber !== undefined)
            patch["latestChapterNumber"] = request.latestChapterNumber ?? undefined
        if (request.lastReadChapterNumber !== undefined)
            patch["lastReadChapterNumber"] = request.lastReadChapterNumber ?? undefined
        if (request.lastReadChapterId !== undefined) patch["lastReadChapterId"] = request.lastReadChapterId ?? undefined
        if (Object.keys(patch).length > 0) {
            await db.manga.update(request.mangaId, patch as Partial<{ latestChapterNumber: number }>)
        }
        return null
    },

    "library:categories": async request => {
        const categories = [...new Set(request.categories.map(c => c.trim()).filter(Boolean))]
        await db.manga.update(request.mangaId, {
            categories: categories.length > 0 ? categories : undefined
        } as Partial<{ categories: string[] }>)
        return null
    },

    "library:relink": async request => {
        const resolved = await resolveChapterUrl(request.url)
        const existing = await db.manga.get(request.mangaId)
        if (!existing) throw new SourceError("not-found", "That title is not in your library")
        const newId = resolved.manga.manga.id
        const now = Date.now()
        const relinkCover = existing.coverUrl ?? resolved.manga.manga.coverUrl
        const next: LibraryManga = {
            // Start from resolved manga (correct source fields)
            ...resolved.manga.manga,
            id: newId,
            sourceId: resolved.manga.sourceId,
            ...(resolved.manga.sourceMangaId ? { sourceMangaId: resolved.manga.sourceMangaId } : {}),
            sourceUrl: resolved.chapter.url,
            mangaUrl: resolved.manga.url,
            // Preserve user data from the existing record
            title: existing.title || resolved.manga.manga.title,
            ...(relinkCover ? { coverUrl: relinkCover } : {}),
            addedAt: existing.addedAt,
            ...(existing.lastReadChapterId ? { lastReadChapterId: existing.lastReadChapterId } : {}),
            ...(existing.lastReadChapterNumber !== undefined
                ? { lastReadChapterNumber: existing.lastReadChapterNumber }
                : {}),
            ...(existing.lastReadAt !== undefined ? { lastReadAt: existing.lastReadAt } : {}),
            ...(existing.rating !== undefined ? { rating: existing.rating } : {}),
            ...(existing.categories !== undefined ? { categories: existing.categories } : {}),
            ...(existing.notes !== undefined ? { notes: existing.notes } : {}),
            ...(existing.nsfw !== undefined ? { nsfw: existing.nsfw } : {}),
            ...(existing.manualTracking !== undefined ? { manualTracking: existing.manualTracking } : {}),
            ...(existing.onHold !== undefined ? { onHold: existing.onHold } : {}),
            ...(existing.readingDirection !== undefined ? { readingDirection: existing.readingDirection } : {}),
            ...(existing.pageFit !== undefined ? { pageFit: existing.pageFit } : {}),
            ...(existing.noGapContinuous !== undefined ? { noGapContinuous: existing.noGapContinuous } : {}),
            updatedAt: now
        }
        const newSourceLink: SourceLinkRecord = {
            mangaId: newId,
            sourceId: resolved.manga.sourceId,
            ...(resolved.manga.sourceMangaId ? { sourceMangaId: resolved.manga.sourceMangaId } : {}),
            url: resolved.manga.url,
            title: next.title,
            addedAt: now,
            updatedAt: now
        }
        await rekeyManga(request.mangaId, next, newSourceLink)
        await db.chapters.put(resolved.chapter)
        // Fire-and-forget: populate the chapter list for the new source
        const relinkSource = findSource(new URL(request.url))
        scheduleChapterListRefresh(relinkSource, resolved.manga.sourceMangaId, resolved.manga.url, newId)
        return { sourceId: resolved.manga.sourceId, mangaId: newId }
    },

    "library:link-url": async request => {
        // Link a library entry to a manga page URL without fetching it.
        // Used for CF-gated sources that can't appear in reconcile search
        // but whose chapters work via the tab-render fallback.
        const existing = await db.manga.get(request.mangaId)
        if (!existing) throw new SourceError("not-found", "That title is not in your library")
        const url = new URL(request.mangaUrl)
        const adapter = findSource(url)
        if (!adapter || adapter.match(url) !== "manga")
            throw new SourceError(
                "unsupported-url",
                "That URL is not a recognized manga page - make sure it's the series page, not a chapter"
            )
        // Delegate ID extraction to the adapter - handles MangaDex-style URLs
        // where the last segment is an SEO slug, not the internal ID.
        // Fallback to last path segment for CF-gated adapters that reject direct fetches.
        let sourceMangaId: string
        try {
            sourceMangaId = await resolveMangaUrl(url)
        } catch {
            const segs = url.pathname.split("/").filter(Boolean)
            sourceMangaId = segs[segs.length - 1] ?? ""
        }
        if (!sourceMangaId) throw new SourceError("invalid-input", "Could not extract manga ID from that URL")
        const sourceId = adapter.manifest.id
        await db.transaction("rw", db.manga, db.sourceLinks, async () => {
            await db.manga.update(request.mangaId, {
                sourceId,
                sourceMangaId,
                mangaUrl: request.mangaUrl,
                manualTracking: false,
                updatedAt: Date.now()
            } as Partial<{
                sourceId: string
                sourceMangaId: string
                mangaUrl: string
                manualTracking: boolean
                updatedAt: number
            }>)
            await db.sourceLinks.put({
                mangaId: request.mangaId,
                sourceId,
                sourceMangaId,
                url: request.mangaUrl,
                title: existing.title,
                addedAt: existing.addedAt,
                updatedAt: Date.now()
            })
        })
        // Fire-and-forget chapter fetch so chapters appear immediately
        // after linking rather than waiting for the next update alarm.
        void (async () => {
            try {
                const linked = await db.manga.get(request.mangaId)
                if (!linked) return
                const chapters = await listChaptersForSource(linked, sourceId, sourceMangaId, request.mangaUrl)
                if (chapters.length === 0) return
                const latest = chapters.reduce((cur, ch) => (ch.sortKey > (cur?.sortKey ?? -1) ? ch : cur), chapters[0])
                await db.transaction("rw", db.chapters, db.manga, async () => {
                    await db.chapters.bulkPut(chapters)
                    if (latest) {
                        await db.manga.update(request.mangaId, {
                            latestChapterId: latest.id,
                            sourceUrl: latest.url,
                            ...(Number.isFinite(latest.sortKey) ? { latestChapterNumber: latest.sortKey } : {}),
                            updatedAt: Date.now()
                        })
                    }
                })
                publishLive(["chapters", "library"], [request.mangaId])
            } catch {
                // best-effort; update alarm will retry
            }
        })()
        return { sourceId }
    },

    "library:switch": async request => {
        const existing = await db.manga.get(request.mangaId)
        if (!existing) throw new SourceError("not-found", "That title is not in your library")
        const chapters = await listChaptersForSource(
            existing,
            request.sourceId,
            request.sourceMangaId,
            request.mangaUrl
        )
        const switchAdapter = sourceRegistry.get(request.sourceId)
        const hasPages = switchAdapter?.manifest.capabilities.includes("pages") ?? true
        if (chapters.length === 0 && hasPages) throw new SourceError("invalid-response", "No chapters on that mirror")
        const latest = chapters.reduce(
            (current, chapter) => (chapter.sortKey > (current?.sortKey ?? -1) ? chapter : current),
            chapters[0]
        )
        await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
            // Old mirror's chapters are stale by definition after switching source -
            // otherwise they coexist with the new mirror's under the same mangaId and
            // chapter:siblings interleaves dead and live URLs in prev/next.
            await db.chapters
                .where("mangaId")
                .equals(request.mangaId)
                .and(c => c.sourceId !== request.sourceId)
                .delete()
            await db.chapters.bulkPut(chapters)
            await db.manga.update(request.mangaId, {
                sourceId: request.sourceId,
                sourceMangaId: request.sourceMangaId,
                mangaUrl: request.mangaUrl,
                ...(latest
                    ? {
                          sourceUrl: latest.url,
                          latestChapterId: latest.id,
                          ...(Number.isFinite(latest.sortKey) ? { latestChapterNumber: latest.sortKey } : {})
                      }
                    : {}),
                updatedAt: Date.now()
            })
            await db.manga.update(request.mangaId, {
                manualTracking: undefined
            } as unknown as Partial<{ manualTracking: boolean }>)
            // MangaHub numbers chapters by its own internal sequential URL slug
            // (chapter-N), which can diverge from the numbering other sources use for
            // the same manga. This handler never touches the existing
            // lastReadChapterNumber, so after switching TO mangahub from a different
            // source it sits next to mangahub's latestChapterNumber with nothing
            // indicating the two may not be directly comparable. Flag it so a future
            // UI can warn instead of silently comparing chapter counts that don't mean
            // what they look like they mean.
            const numberingMayMismatch =
                request.sourceId === "mangahub" &&
                existing.sourceId !== "mangahub" &&
                existing.lastReadChapterNumber !== undefined
            await db.manga.update(request.mangaId, {
                chapterNumberingUnreliable: numberingMayMismatch ? true : undefined
            } as Partial<{ chapterNumberingUnreliable: boolean }>)
            await db.sourceLinks.put({
                mangaId: request.mangaId,
                sourceId: request.sourceId,
                sourceMangaId: request.sourceMangaId,
                url: request.mangaUrl,
                title: existing.title,
                addedAt: existing.addedAt,
                updatedAt: Date.now()
            })
        })
        return { sourceId: request.sourceId, latest: latest?.sortKey ?? null }
    },

    "library:nsfw": async request => {
        await db.manga.update(request.mangaId, {
            nsfw: request.nsfw ? true : undefined
        } as Partial<{ nsfw: boolean }>)
        return null
    },

    "library:covers:backfill": async () => {
        const all = await db.manga.toArray()
        // Candidates: titles with no cover, plus titles whose cover is still a
        // remote URL (which can fail to render from the extension origin, and may
        // not have a cached blob yet). seed- ids and already-attempted (this
        // session) ids are excluded so a failed fetch doesn't loop forever.
        const candidates = all.filter(
            m =>
                !m.id.startsWith("seed-") &&
                !coverBackfillAttempted.has(m.id) &&
                (!m.coverUrl || /^https?:\/\//.test(m.coverUrl))
        )
        // One bulk lookup instead of a per-record covers.get - a remote coverUrl
        // that already has a cached blob doesn't need to be re-fetched.
        const cachedRows = await db.covers.bulkGet(candidates.map(m => m.id))
        const alreadyCachedIds = new Set(candidates.filter((_, i) => cachedRows[i] !== undefined).map(m => m.id))
        const targets = candidates.filter(m => !(m.coverUrl && alreadyCachedIds.has(m.id)))

        let updated = 0
        for (const m of targets.slice(0, COVER_BACKFILL_BATCH)) {
            coverBackfillAttempted.add(m.id)
            try {
                const storedRemoteCover = m.coverUrl && /^https?:\/\//.test(m.coverUrl) ? m.coverUrl : undefined
                const remote = storedRemoteCover ?? (await resolveCoverFor(m))
                if (!remote) continue
                let touched = false
                // Store the source's own remote URL as-is - covers are never inlined
                // as data: URIs anymore (see database.ts's v8 migration).
                if (!m.coverUrl) {
                    await db.manga.update(m.id, { coverUrl: remote })
                    touched = true
                }
                // Cache the raw blob so the UI can serve it from IndexedDB without
                // hotlinking the source CDN on every render. Non-fatal: the URL is
                // already stored (either just now, or previously).
                const blob = await fetchCoverBlob(remote)
                if (blob) {
                    await cacheCover(m.id, blob)
                    touched = true
                }
                if (touched) updated += 1
            } catch (error) {
                console.warn("[AMR] Cover backfill failed", { mangaId: m.id, error })
            }
        }
        const remaining = Math.max(0, targets.length - COVER_BACKFILL_BATCH)
        if (remaining === 0) coverBackfillAttempted.clear()
        return { updated, remaining }
    },

    "stats:get": async () => {
        return getLocalStats()
    },

    "history:list": async () => {
        const events = await db.historyEvents.orderBy("occurredAt").reverse().limit(60).toArray()
        const ids = [...new Set(events.map(e => e.mangaId))]
        const mangas = await db.manga.bulkGet(ids)
        const titleById = new Map(ids.map((id, i) => [id, mangas[i]?.title ?? id]))
        const chapterIds = [...new Set(events.map(e => e.chapterId).filter((c): c is string => Boolean(c)))]
        const chapters = await db.chapters.bulkGet(chapterIds)
        const chapterById = new Map(chapterIds.map((id, i) => [id, chapters[i]]))
        return events.map(e => {
            const chapter = e.chapterId ? chapterById.get(e.chapterId) : undefined
            return {
                mangaId: e.mangaId,
                title: titleById.get(e.mangaId) ?? e.mangaId,
                type: e.type,
                occurredAt: e.occurredAt,
                chapterNumber: chapter && Number.isFinite(chapter.sortKey) ? chapter.sortKey : null,
                chapterTitle: chapter?.title ?? null,
                chapterUrl: chapter?.url ?? null
            }
        })
    },

    "activity:get": async request => {
        return getActivityCalendar(request.days ?? 120)
    },

    "chapter:adjacent": async request => {
        const manga = await db.manga.get(request.mangaId)
        if (!manga) return { current: null, next: null, prev: null }
        const current = manga.lastReadChapterNumber ?? null
        try {
            const chapters = await listChaptersForSource(
                manga,
                manga.sourceId,
                manga.sourceMangaId ?? "",
                manga.mangaUrl ?? manga.sourceUrl
            )
            let next: (typeof chapters)[number] | null = null
            let prev: (typeof chapters)[number] | null = null
            if (current === null) {
                for (const chapter of chapters) {
                    if (!next || chapter.sortKey < next.sortKey) next = chapter
                }
            } else {
                for (const chapter of chapters) {
                    if (chapter.sortKey > current && (!next || chapter.sortKey < next.sortKey)) next = chapter
                    if (chapter.sortKey < current && (!prev || chapter.sortKey > prev.sortKey)) prev = chapter
                }
            }
            return {
                current,
                next: next ? { url: next.url, title: next.title, number: next.sortKey } : null,
                prev: prev ? { url: prev.url, title: prev.title, number: prev.sortKey } : null
            }
        } catch {
            return { current: null, next: null, prev: null }
        }
    },

    "library:note": async request => {
        await db.manga.update(request.mangaId, {
            notes: request.note.trim() || undefined
        } as Partial<{ notes: string }>)
        return null
    },

    "library:reading-prefs": async request => {
        const patch: {
            readingDirection?: LibraryManga["readingDirection"] | undefined
            pageFit?: LibraryManga["pageFit"] | undefined
            noGapContinuous?: boolean | undefined
        } = {}
        if (request.readingDirection !== undefined) patch.readingDirection = request.readingDirection ?? undefined
        if (request.pageFit !== undefined) patch.pageFit = request.pageFit ?? undefined
        if (request.noGapContinuous !== undefined) patch.noGapContinuous = request.noGapContinuous ?? undefined
        if (Object.keys(patch).length > 0) {
            await db.manga.update(request.mangaId, patch as Partial<LibraryManga>)
        }
        return null
    }
}
