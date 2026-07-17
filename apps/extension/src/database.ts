import { readingProgressSchema, sourceLinkRecordSchema } from "@amr/contracts"
import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import Dexie, { type EntityTable, type Table } from "dexie"
import { z } from "zod"
import {
    envelopeStructureSchema,
    historyEventSchema,
    importChapterSchema,
    libraryMangaSchema,
    pageBookmarkSchema
} from "./schema"

export interface CoverCacheRecord {
    mangaId: string
    blob: Blob
    cachedAt: number
}

export type LibraryManga = MangaRecord & {
    sourceId: string
    sourceUrl: string
    sourceMangaId?: string
    mangaUrl?: string
    latestChapterId?: string
    lastReadChapterId?: string
    // Domain-independent progress: the chapter *number* survives mirror/domain
    // changes that invalidate the URL-derived chapter IDs above.
    latestChapterNumber?: number
    lastReadChapterNumber?: number
    // When the user last read a chapter of this title (for "recently read" sort),
    // distinct from updatedAt which also moves on source update checks.
    lastReadAt?: number
    // Manual / "Do Not Scan": skip automatic update checks; the user maintains the
    // available + read chapter numbers by hand (e.g. Asura-style domain-hoppers).
    manualTracking?: boolean
    // On Hold: skip automatic update checks like manualTracking, but also hide from
    // the "reading" filter/pool so a paused title doesn't nag with an unread badge.
    // Unlike manualTracking the source link stays live - un-holding resumes normal checks.
    onHold?: boolean
    // User categories / labels for filtering the library.
    categories?: string[]
    // User-flagged adult content (covers blurred when the blur setting is on).
    nsfw?: boolean
    // Free-form per-manga notes the user keeps alongside the title.
    notes?: string
    // Genres fetched from the source (cached to avoid repeat network calls).
    genres?: string[]
    // Per-series reading overrides - when set, the reader uses these instead of
    // the global reading settings for chapters of this title.
    readingDirection?: "ltr" | "rtl" | "vertical"
    pageFit?: "width" | "height" | "contain" | "original"
    // Per-series override for the global "no gap continuous" reader setting -
    // undefined means "no override, use the global default".
    noGapContinuous?: boolean
    // Set by library:switch when moving to a source whose chapter numbering can't be
    // assumed comparable to the previous source's (e.g. MangaHub numbers chapters by
    // its own internal sequential URL slug, which can diverge from the numbering other
    // sources use for the same manga) - a future UI can use this to warn instead of
    // silently comparing chapter counts that don't mean what they look like they mean.
    chapterNumberingUnreliable?: boolean
}

export type HistoryEvent = {
    id?: number
    mangaId: string
    chapterId: string
    type: "started" | "completed"
    occurredAt: number
}

export type ChapterDownload = {
    chapterId: string
    mangaId: string
    pageBlobs: Blob[]
    pageCount: number
    downloadedAt: number
}

export type PageBookmark = {
    id: string
    mangaId: string
    chapterId: string
    pageIndex: number
    mangaTitle: string
    chapterTitle: string
    chapterUrl: string
    addedAt: number
}

export type AnalyticsEvent = {
    id?: number
    event:
        | "capture_ok" // chapter URL auto-captured from a tab
        | "capture_error" // capture failed (CF block, 404, etc.)
        | "reader_opened" // user opened chapter in AMR reader
        | "on_site_track" // marked read while reading on-site (via panel)
        | "panel_action" // any panel button click (detail: { action })
        | "resolve_direct" // chapter resolved via direct HTTP fetch
        | "resolve_tab" // chapter required the tab-fallback (CF-gated site)
    sourceId?: string
    ts: number
    detail?: string // JSON blob for event-specific fields
}

// Full export envelope, snapshotted automatically before any import/sync-pull
// mutation so a bad import can be undone. See createBackup/listBackups/restoreBackup
// below and the data:backup:list / data:backup:restore handlers in
// handlers/data-sync-settings.ts.
export type LibraryBackup = {
    id?: number
    createdAt: number
    reason: "pre-import" | "pre-sync-pull" | "pre-clear"
    envelope: Awaited<ReturnType<typeof exportDatabase>>
}

// Response shape for the `data:backup:list` message: just enough to render a list
// and let the user pick one to restore - deliberately excludes `envelope` (the full
// library snapshot) to keep the response small. Call `data:backup:restore` with the
// chosen `id` to actually apply it.
export type BackupSummary = { id: number; createdAt: number; reason: LibraryBackup["reason"] }

export class AmrDatabase extends Dexie {
    manga!: EntityTable<LibraryManga, "id">
    sourceLinks!: EntityTable<SourceLinkRecord, "mangaId">
    chapters!: EntityTable<ChapterRecord, "id">
    progress!: EntityTable<ReadingProgress, "chapterId">
    historyEvents!: EntityTable<HistoryEvent, "id">
    downloads!: EntityTable<ChapterDownload, "chapterId">
    covers!: Table<CoverCacheRecord, string>
    pageBookmarks!: EntityTable<PageBookmark, "id">
    analyticsEvents!: EntityTable<AnalyticsEvent, "id">
    backups!: EntityTable<LibraryBackup, "id">

    constructor() {
        super("all-mangas-reader")
        this.version(1).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed"
        })
        this.version(2).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt"
        })
        this.version(3).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt"
        })
        this.version(4).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId"
        })
        this.version(5).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId",
            pageBookmarks: "id, mangaId, chapterId, addedAt"
        })
        this.version(6).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId",
            pageBookmarks: "id, mangaId, chapterId, addedAt",
            analyticsEvents: "++id, event, ts, sourceId"
        })
        this.version(7).stores({
            manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
            sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
            chapters: "id, mangaId, sourceId, sortKey",
            progress: "chapterId, mangaId, updatedAt, completed",
            historyEvents: "++id, mangaId, chapterId, type, occurredAt",
            downloads: "chapterId, mangaId, downloadedAt",
            covers: "mangaId",
            pageBookmarks: "id, mangaId, chapterId, addedAt",
            analyticsEvents: "++id, event, ts, sourceId",
            // Pre-import/pre-sync-pull safety-net snapshots - see LibraryBackup.
            backups: "++id, createdAt, reason"
        })
        // Covers used to be inlined as base64 data: URIs directly into
        // LibraryManga.coverUrl, which bloats every library:list response, every
        // export, and every retained backup (see MAX_BACKUPS). This migration moves
        // any already-inlined cover into the covers table (keyed by mangaId, same
        // shape cacheCover() writes) and clears the data: URI off the manga record -
        // the UI already prefers the covers-table blob (via coverSrcs) over raw
        // coverUrl at every render site. Also adds an index on chapters.url so
        // chapter:siblings can do an indexed lookup instead of a full table scan.
        this.version(8)
            .stores({
                manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
                sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
                chapters: "id, mangaId, sourceId, sortKey, url",
                progress: "chapterId, mangaId, updatedAt, completed",
                historyEvents: "++id, mangaId, chapterId, type, occurredAt",
                downloads: "chapterId, mangaId, downloadedAt",
                covers: "mangaId",
                pageBookmarks: "id, mangaId, chapterId, addedAt",
                analyticsEvents: "++id, event, ts, sourceId",
                backups: "++id, createdAt, reason"
            })
            .upgrade(async tx => {
                // Manual loop instead of toCollection().modify() - the latter can't
                // reliably run async work (Blob construction, base64 decode) per record
                // in older Dexie upgrade patterns.
                const allManga = await tx.table("manga").toArray()
                for (const m of allManga) {
                    if (typeof m.coverUrl === "string" && m.coverUrl.startsWith("data:")) {
                        try {
                            const match = /^data:([^;]+);base64,(.+)$/.exec(m.coverUrl)
                            const mime = match?.[1]
                            const b64 = match?.[2]
                            if (!mime || !b64) continue
                            const binary = atob(b64)
                            const bytes = new Uint8Array(binary.length)
                            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                            const blob = new Blob([bytes], { type: mime })
                            await tx.table("covers").put({ mangaId: m.id, blob, cachedAt: Date.now() })
                            await tx.table("manga").update(m.id, { coverUrl: undefined })
                        } catch {
                            // Malformed data: URI - skip this record, don't abort the
                            // whole migration.
                        }
                    }
                }
            })
    }
}

export const db = new AmrDatabase()

export async function cacheCover(mangaId: string, blob: Blob): Promise<void> {
    await db.covers.put({ mangaId, blob, cachedAt: Date.now() })
}

export async function getCachedCover(mangaId: string): Promise<Blob | undefined> {
    return (await db.covers.get(mangaId))?.blob
}

// Batched lookup for loading a whole library's covers at once - one IndexedDB
// round-trip instead of one per manga, which matters once the library has
// hundreds of entries. Returns the full cover rows (blob + cachedAt) so the
// UI can tell a re-cached blob apart from an unchanged one (capture.ts
// re-caches the cover on every successful capture) without comparing bytes.
export async function getCachedCovers(mangaIds: readonly string[]): Promise<Map<string, CoverCacheRecord>> {
    const records = await db.covers.bulkGet([...mangaIds])
    const out = new Map<string, CoverCacheRecord>()
    records.forEach((record, i) => {
        if (record) out.set(mangaIds[i]!, record)
    })
    return out
}

export async function clearLibrary(): Promise<void> {
    await db.transaction(
        "rw",
        [
            db.manga,
            db.sourceLinks,
            db.chapters,
            db.progress,
            db.historyEvents,
            db.downloads,
            db.covers,
            db.pageBookmarks
        ],
        async () => {
            await Promise.all([
                db.manga.clear(),
                db.sourceLinks.clear(),
                db.chapters.clear(),
                db.progress.clear(),
                db.historyEvents.clear(),
                db.downloads.clear(),
                db.covers.clear(),
                db.pageBookmarks.clear()
            ])
        }
    )
}

export async function clearHistory(): Promise<void> {
    await db.transaction("rw", [db.historyEvents, db.progress], async () => {
        await Promise.all([db.historyEvents.clear(), db.progress.clear()])
    })
}

export async function removeManga(mangaId: string): Promise<void> {
    await db.transaction(
        "rw",
        [
            db.manga,
            db.sourceLinks,
            db.chapters,
            db.progress,
            db.historyEvents,
            db.downloads,
            db.pageBookmarks,
            db.covers
        ],
        async () => {
            await db.manga.delete(mangaId)
            await db.sourceLinks.delete(mangaId)
            await db.chapters.where("mangaId").equals(mangaId).delete()
            await db.progress.where("mangaId").equals(mangaId).delete()
            await db.historyEvents.where("mangaId").equals(mangaId).delete()
            await db.downloads.where("mangaId").equals(mangaId).delete()
            await db.pageBookmarks.where("mangaId").equals(mangaId).delete()
            await db.covers.delete(mangaId)
        }
    )
}

export async function rekeyManga(oldId: string, next: LibraryManga, newSourceLink: SourceLinkRecord): Promise<void> {
    await db.transaction(
        "rw",
        [
            db.manga,
            db.sourceLinks,
            db.chapters,
            db.progress,
            db.historyEvents,
            db.downloads,
            db.pageBookmarks,
            db.covers
        ],
        async () => {
            if (next.id === oldId) {
                // Same ID - plain update, no migration needed
                await db.manga.put(next)
                await db.sourceLinks.put(newSourceLink)
                return
            }
            // Check if canonical new ID already exists (duplicate created by a prior capture)
            const existing = await db.manga.get(next.id)
            if (existing) {
                // Merge preserved user fields from whichever record has them. Build with
                // conditional spreads so we never assign `undefined` to an optional field
                // (exactOptionalPropertyTypes is on).
                const mergedLastReadNumber =
                    Math.max(existing.lastReadChapterNumber ?? 0, next.lastReadChapterNumber ?? 0) || undefined
                const mergedLastReadAt = Math.max(existing.lastReadAt ?? 0, next.lastReadAt ?? 0) || undefined
                const lastReadChapterId = next.lastReadChapterId ?? existing.lastReadChapterId
                const rating = next.rating ?? existing.rating
                // Categories are a list - union them instead of letting one side's tags
                // silently disappear just because the other record also had some set.
                const mergedCategories = [...new Set([...(existing.categories ?? []), ...(next.categories ?? [])])]
                const categories = mergedCategories.length > 0 ? mergedCategories : undefined
                const notes = next.notes ?? existing.notes
                const nsfw = next.nsfw ?? existing.nsfw
                const manualTracking = next.manualTracking ?? existing.manualTracking
                const onHold = next.onHold ?? existing.onHold
                const readingDirection = next.readingDirection ?? existing.readingDirection
                const pageFit = next.pageFit ?? existing.pageFit
                const noGapContinuous = next.noGapContinuous ?? existing.noGapContinuous
                next = {
                    ...next,
                    addedAt: Math.min(existing.addedAt, next.addedAt),
                    ...(mergedLastReadNumber !== undefined ? { lastReadChapterNumber: mergedLastReadNumber } : {}),
                    ...(lastReadChapterId !== undefined ? { lastReadChapterId } : {}),
                    ...(mergedLastReadAt !== undefined ? { lastReadAt: mergedLastReadAt } : {}),
                    ...(rating !== undefined ? { rating } : {}),
                    ...(categories !== undefined ? { categories } : {}),
                    ...(notes !== undefined ? { notes } : {}),
                    ...(nsfw !== undefined ? { nsfw } : {}),
                    ...(manualTracking !== undefined ? { manualTracking } : {}),
                    ...(onHold !== undefined ? { onHold } : {}),
                    ...(readingDirection !== undefined ? { readingDirection } : {}),
                    ...(pageFit !== undefined ? { pageFit } : {}),
                    ...(noGapContinuous !== undefined ? { noGapContinuous } : {})
                }
            }
            await db.manga.put(next)
            await db.manga.delete(oldId)
            // Delete old-source chapters - URLs are stale by definition after relink
            await db.chapters.where("mangaId").equals(oldId).delete()
            await db.sourceLinks.delete(oldId)
            await db.sourceLinks.put(newSourceLink)
            // Migrate history/progress/downloads/bookmarks to new id
            await db.progress.where("mangaId").equals(oldId).modify({ mangaId: next.id })
            await db.historyEvents.where("mangaId").equals(oldId).modify({ mangaId: next.id })
            await db.downloads.where("mangaId").equals(oldId).modify({ mangaId: next.id })
            await db.pageBookmarks.where("mangaId").equals(oldId).modify({ mangaId: next.id })
            const cover = await db.covers.get(oldId)
            if (cover && (await db.covers.get(next.id)) === undefined) {
                await db.covers.put({ ...cover, mangaId: next.id })
            }
            await db.covers.delete(oldId)
        }
    )
}

// Merges one or more "loser" duplicate manga records into a single surviving
// "primary" record. Modeled on rekeyManga's transaction shape and row
// re-pointing pattern (progress/historyEvents/downloads/pageBookmarks are
// re-pointed via modify(), not copied - safe because a loser's chapters have
// different chapter ids than the primary's, so there's no key collision on
// tables keyed by chapterId), but unlike rekeyManga this never deletes the
// primary's own chapters - only each loser's chapters/sourceLinks/manga rows,
// since a merge (unlike a relink) doesn't invalidate the surviving side.
export async function mergeMangaRecords(primaryId: string, loserIds: string[]): Promise<LibraryManga> {
    return db.transaction(
        "rw",
        [
            db.manga,
            db.sourceLinks,
            db.chapters,
            db.progress,
            db.historyEvents,
            db.downloads,
            db.pageBookmarks,
            db.covers
        ],
        async () => {
            const primary = await db.manga.get(primaryId)
            if (!primary) throw new Error(`Cannot merge duplicates: primary manga "${primaryId}" does not exist`)

            let merged: LibraryManga = primary

            // A stale/already-removed id (e.g. two merge calls racing on the same group)
            // shouldn't abort the whole merge - just skip it via the filter below.
            const loserRecords = (
                await Promise.all(loserIds.filter(id => id !== primaryId).map(id => db.manga.get(id)))
            ).filter((l): l is LibraryManga => l !== undefined)
            // Same-source losers must be processed before cross-source losers: `merged`
            // evolves per-iteration, so gating on `loser.sourceId === merged.sourceId` isn't
            // enough - if a cross-source loser fills an empty slot first, a later same-source
            // loser's legitimate max could carry that cross-source loser's inflated number
            // alongside a live id, since the id-carry fill condition would already be cleared.
            // Sorting relative to the PRIMARY's sourceId (which never changes) avoids that.
            loserRecords.sort(
                (a, b) => Number(b.sourceId === primary.sourceId) - Number(a.sourceId === primary.sourceId)
            )

            for (const loser of loserRecords) {
                const loserId = loser.id
                // Chapter numbers are only comparable within a single source: different
                // sources split/number the same manga's chapters differently (see the
                // chapterNumberingUnreliable comment on LibraryManga). Maxing across sources
                // let a loser's higher-but-differently-numbered count inflate the primary,
                // which the next update check then silently reverted while mis-reporting the
                // title as updated (its id-change branch always fires for a carried foreign
                // chapter id) - see checkUpdates's "advanced" gate for the other half of this
                // fix. So: max within the same source (a true re-added duplicate), but
                // across sources the primary's own number+id pairs win, and a loser's pair
                // is only adopted to fill a slot where the primary has neither a number nor
                // an id. Losers are processed same-source-first (see the sort above this
                // loop) so a later same-source loser's legitimate max can't reintroduce a
                // cross-source dangling id into a slot an earlier cross-source loser filled.
                // Note: lastReadChapterNumber inflated by a past cross-source merge before
                // this fix landed self-heals the next time the user reads any chapter of
                // the title (saveProgress overwrites both the number and id from real
                // progress) - no migration is attempted here.
                const sameSource = loser.sourceId === merged.sourceId
                const fillLastRead =
                    !sameSource && merged.lastReadChapterNumber === undefined && merged.lastReadChapterId === undefined
                const fillLatest =
                    !sameSource && merged.latestChapterNumber === undefined && merged.latestChapterId === undefined
                const mergedLastReadNumber = sameSource
                    ? Math.max(merged.lastReadChapterNumber ?? 0, loser.lastReadChapterNumber ?? 0) || undefined
                    : fillLastRead
                      ? loser.lastReadChapterNumber
                      : merged.lastReadChapterNumber
                const mergedLatestNumber = sameSource
                    ? Math.max(merged.latestChapterNumber ?? 0, loser.latestChapterNumber ?? 0) || undefined
                    : fillLatest
                      ? loser.latestChapterNumber
                      : merged.latestChapterNumber
                const loserLatestWins = sameSource
                    ? loser.latestChapterId !== undefined &&
                      ((loser.latestChapterNumber ?? 0) > (merged.latestChapterNumber ?? 0) ||
                          merged.latestChapterId === undefined)
                    : fillLatest && loser.latestChapterId !== undefined
                const loserLastReadWins = sameSource
                    ? loser.lastReadChapterId !== undefined &&
                      ((loser.lastReadChapterNumber ?? 0) > (merged.lastReadChapterNumber ?? 0) ||
                          merged.lastReadChapterId === undefined)
                    : fillLastRead && loser.lastReadChapterId !== undefined
                const mergedLastReadAt = Math.max(merged.lastReadAt ?? 0, loser.lastReadAt ?? 0) || undefined
                const mergedCategories = [...new Set([...(merged.categories ?? []), ...(loser.categories ?? [])])]
                const categories = mergedCategories.length > 0 ? mergedCategories : undefined
                // Notes: if both sides have non-empty notes, concatenate them (never
                // silently drop one side's notes just because the other also had some);
                // otherwise whichever side has notes wins.
                const notes =
                    merged.notes && loser.notes ? `${merged.notes}\n\n${loser.notes}` : (merged.notes ?? loser.notes)
                const rating = merged.rating ?? loser.rating
                const nsfw = merged.nsfw ?? loser.nsfw
                const manualTracking = merged.manualTracking ?? loser.manualTracking
                const onHold = merged.onHold ?? loser.onHold
                const readingDirection = merged.readingDirection ?? loser.readingDirection
                const pageFit = merged.pageFit ?? loser.pageFit
                const noGapContinuous = merged.noGapContinuous ?? loser.noGapContinuous

                merged = {
                    ...merged,
                    addedAt: Math.min(merged.addedAt, loser.addedAt),
                    ...(mergedLastReadNumber !== undefined ? { lastReadChapterNumber: mergedLastReadNumber } : {}),
                    ...(mergedLatestNumber !== undefined ? { latestChapterNumber: mergedLatestNumber } : {}),
                    ...(loserLatestWins ? { latestChapterId: loser.latestChapterId } : {}),
                    ...(loserLastReadWins ? { lastReadChapterId: loser.lastReadChapterId } : {}),
                    ...(mergedLastReadAt !== undefined ? { lastReadAt: mergedLastReadAt } : {}),
                    ...(categories !== undefined ? { categories } : {}),
                    ...(notes !== undefined ? { notes } : {}),
                    ...(rating !== undefined ? { rating } : {}),
                    ...(nsfw !== undefined ? { nsfw } : {}),
                    ...(manualTracking !== undefined ? { manualTracking } : {}),
                    ...(onHold !== undefined ? { onHold } : {}),
                    ...(readingDirection !== undefined ? { readingDirection } : {}),
                    ...(pageFit !== undefined ? { pageFit } : {}),
                    ...(noGapContinuous !== undefined ? { noGapContinuous } : {})
                }

                // Re-point (not copy) dependent rows onto the primary's id.
                await db.progress.where("mangaId").equals(loserId).modify({ mangaId: primaryId })
                await db.historyEvents.where("mangaId").equals(loserId).modify({ mangaId: primaryId })
                await db.downloads.where("mangaId").equals(loserId).modify({ mangaId: primaryId })
                await db.pageBookmarks.where("mangaId").equals(loserId).modify({ mangaId: primaryId })

                // Covers are keyed by mangaId and never re-resolved for ids that already have
                // one (see the backfill handler's skip condition) - carry the loser's blob when
                // the primary has none, then drop the loser's row so merge doesn't orphan blobs
                // (removeManga now cleans these up too, on plain removal).
                const loserCover = await db.covers.get(loserId)
                if (loserCover && (await db.covers.get(primaryId)) === undefined) {
                    await db.covers.put({ ...loserCover, mangaId: primaryId })
                }
                await db.covers.delete(loserId)

                // Loser chapters are stale by definition once its progress/history
                // point at the primary - same reasoning rekeyManga uses for the old
                // source's chapters after a relink.
                await db.chapters.where("mangaId").equals(loserId).delete()
                await db.sourceLinks.delete(loserId)
                await db.manga.delete(loserId)
            }

            await db.manga.put(merged)
            return merged
        }
    )
}

export async function saveResolvedChapter(input: {
    manga: MangaRecord
    chapter: ChapterRecord
    sourceLink: SourceLinkRecord
    chapters?: ChapterRecord[]
}): Promise<void> {
    await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
        const existing = await db.manga.get(input.manga.id)
        const manga: LibraryManga = {
            ...input.manga,
            sourceId: input.chapter.sourceId,
            sourceUrl: input.chapter.url,
            ...(input.sourceLink.sourceMangaId ? { sourceMangaId: input.sourceLink.sourceMangaId } : {}),
            mangaUrl: input.sourceLink.url,
            latestChapterId: input.chapter.id,
            ...(Number.isFinite(input.chapter.sortKey) ? { latestChapterNumber: input.chapter.sortKey } : {}),
            // Preserve user-controlled and read-progress fields from the existing record
            // so a re-capture never silently clears ratings, categories, notes, or history.
            ...(existing?.lastReadChapterId ? { lastReadChapterId: existing.lastReadChapterId } : {}),
            ...(existing?.lastReadChapterNumber !== undefined
                ? { lastReadChapterNumber: existing.lastReadChapterNumber }
                : {}),
            ...(existing?.lastReadAt !== undefined ? { lastReadAt: existing.lastReadAt } : {}),
            ...(existing?.manualTracking !== undefined ? { manualTracking: existing.manualTracking } : {}),
            ...(existing?.onHold !== undefined ? { onHold: existing.onHold } : {}),
            ...(existing?.categories !== undefined ? { categories: existing.categories } : {}),
            ...(existing?.nsfw !== undefined ? { nsfw: existing.nsfw } : {}),
            ...(existing?.notes !== undefined ? { notes: existing.notes } : {}),
            ...(existing?.readingDirection !== undefined ? { readingDirection: existing.readingDirection } : {}),
            ...(existing?.pageFit !== undefined ? { pageFit: existing.pageFit } : {}),
            ...(existing?.noGapContinuous !== undefined ? { noGapContinuous: existing.noGapContinuous } : {}),
            // rating lives in MangaRecord - prefer existing if the source didn't supply one
            ...(!input.manga.rating && existing?.rating !== undefined ? { rating: existing.rating } : {})
        }
        await db.manga.put(manga)
        await db.sourceLinks.put(input.sourceLink)
        await db.chapters.bulkPut(input.chapters ?? [input.chapter])
    })
}

const MANGA_PATH_MARKERS = ["manga", "comic", "comics", "series", "manhwa", "manhua", "title", "read"]
const WEBTOONS_HOSTNAMES = new Set(["www.webtoons.com", "webtoons.com"])

// Returns null when no reliable per-title slug can be derived - callers must treat
// null as "unknown", never as a value that can match another null (see sameHostSlug).
function deriveSlug(u: URL): string | null {
    const segments = u.pathname.split("/").filter(Boolean)
    const markerIndex = segments.findIndex(s => MANGA_PATH_MARKERS.includes(s.toLowerCase()))
    const afterMarker = markerIndex >= 0 ? segments[markerIndex + 1] : undefined
    if (afterMarker) return afterMarker
    const last = segments[segments.length - 1] ?? ""
    const readerStyle = last.match(/^(.*?)-chapter[-_]/i)
    if (readerStyle?.[1]) return readerStyle[1]
    // Webtoons paths are always /<locale>/<genre>/<slug>/... with no MANGA_PATH_MARKERS
    // segment, so falling back to segments[0] degenerates to the locale token ("en") for
    // EVERY Webtoons URL - making sameHostSlug() spuriously match any two Webtoons titles.
    // Use the title_no query param (unique per series, present on both the .../list?title_no=X
    // and .../<series>/episode-N/viewer?title_no=X shapes) instead, and return null - never a
    // spuriously-matchable value - when even that's absent.
    if (WEBTOONS_HOSTNAMES.has(u.hostname)) {
        const titleNo = u.searchParams.get("title_no")
        return titleNo ? `title_no:${titleNo}` : null
    }
    return segments[0] || null
}

function deriveMangaUrl(u: URL, slug: string | null): string {
    const segments = u.pathname.split("/").filter(Boolean)
    const markerIndex = segments.findIndex(s => MANGA_PATH_MARKERS.includes(s.toLowerCase()))
    const marker = markerIndex >= 0 ? segments[markerIndex] : undefined
    if (marker && segments[markerIndex + 1]) return `${u.origin}/${marker.toLowerCase()}/${segments[markerIndex + 1]}/`
    return slug ? `${u.origin}/manga/${slug}/` : u.origin
}

function sameHostSlug(a: string, b: string): boolean {
    try {
        const ua = new URL(a)
        const ub = new URL(b)
        if (ua.hostname !== ub.hostname) return false
        const sa = deriveSlug(ua)
        // Boolean(sa) rejects null (and "") so two undeterminable slugs never match.
        return Boolean(sa) && sa === deriveSlug(ub)
    } catch {
        return false
    }
}

// Prefix match with a word-boundary check: the character immediately after the
// matched prefix must be "/" or end-of-string. A raw `url.startsWith(prefix)` treats
// ".../manga/solo-leveling" as a prefix of ".../manga/solo-leveling-ragnarok/chapter-3"
// since the substring matches with no boundary check - this rejects that false match
// while still accepting ".../manga/solo-leveling/chapter-3".
function startsWithUrlPrefix(url: string, prefix: string): boolean {
    const trimmed = prefix.replace(/\/$/, "")
    if (!url.startsWith(trimmed)) return false
    const boundary = url[trimmed.length]
    return boundary === undefined || boundary === "/"
}

function humanizeSlug(slug: string): string {
    return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim()
}

// Track a chapter the user is reading on the source site directly (used when the
// in-app reader can't load a site's images). Records progress + history by chapter
// number without scraping pages, matching an existing library title when possible.
export async function trackExternalChapter(input: {
    url: string
    sourceId: string
    completed?: boolean
    // When the source adapter can parse series-level info from the chapter URL, pass it
    // here so we use a stable, correct ID and series prefix URL instead of deriveSlug/deriveMangaUrl.
    // Important for sites like Webtoons where the path alone carries no per-title slug.
    mangaInfo?: { sourceMangaId: string; mangaUrl: string }
}): Promise<{ tracked: boolean; title: string; chapterNumber: number | null; mangaId: string }> {
    const now = Date.now()
    const u = new URL(input.url)
    // Some sites (e.g. Webtoons) never put the literal word "chapter" in the URL -
    // they use an episode_no query param instead - so also match that generic shape.
    const numberMatch =
        input.url.match(/chapter[-_ ]?(\d+(?:\.\d+)?)/i) ??
        input.url.match(/[?&](?:episode|chapter|ep)[-_]?no=(\d+(?:\.\d+)?)/i)
    const number = numberMatch?.[1] !== undefined ? Number(numberMatch[1]) : undefined

    // When caller supplies series-level info, try direct ID lookup first - finds the manga
    // even if it was previously added via resolveChapter (which uses a different code path).
    let manga: LibraryManga | undefined
    if (input.mangaInfo) {
        manga = await db.manga.get(`${input.sourceId}:manga:${input.mangaInfo.sourceMangaId}`)
    }

    if (!manga) {
        // Run an indexed same-source query first and check it against the two source-scoped
        // slug matchers before falling back to a full table scan for the cross-source prefix
        // matcher, since this fallback runs on every navigation on tracked/anti-scrape sites
        // and scales with library size. This means precedence flips only in the rare case
        // where a same-source slug match and a cross-source prefix match would both apply to
        // the same navigation - the indexed same-source match now wins instead of the
        // cross-source prefix match. Hostname-as-sourceId legacy rows are unaffected, since a
        // source-scoped query on a fake hostname sourceId never matches and they always fall
        // through to the full-scan cross-source pass below.
        const sameSource = await db.manga.where("sourceId").equals(input.sourceId).toArray()
        manga =
            sameSource.find(m => m.mangaUrl && sameHostSlug(m.mangaUrl, input.url)) ??
            sameSource.find(m => m.sourceUrl && sameHostSlug(m.sourceUrl, input.url))

        if (!manga) {
            const all = await db.manga.toArray()
            manga = all.find(m => m.mangaUrl && startsWithUrlPrefix(input.url, m.mangaUrl))
        }
    }

    if (!manga) {
        const slug = deriveSlug(u)
        const title = humanizeSlug(slug ?? "") || u.hostname
        const mangaId = input.mangaInfo
            ? `${input.sourceId}:manga:${input.mangaInfo.sourceMangaId}`
            : `${input.sourceId}:manga:${slug || u.pathname}`
        const mangaUrl = input.mangaInfo?.mangaUrl ?? deriveMangaUrl(u, slug)
        manga = {
            id: mangaId,
            title,
            normalizedTitle: title.toLocaleLowerCase("en"),
            sourceId: input.sourceId,
            sourceUrl: input.url,
            mangaUrl,
            authors: [],
            status: "unknown",
            addedAt: now,
            updatedAt: now
        }
        await db.manga.put(manga)
        await db.sourceLinks.put({
            mangaId: manga.id,
            sourceId: input.sourceId,
            url: mangaUrl,
            title: manga.title,
            addedAt: now,
            updatedAt: now
        })
    }

    const chapterKey = number !== undefined ? `ch-${number}` : (u.pathname.split("/").filter(Boolean).pop() ?? "ext")
    const chapterId = `${manga.id}:ext:${chapterKey}`
    await db.chapters.put({
        id: chapterId,
        mangaId: manga.id,
        sourceId: input.sourceId,
        title: number !== undefined ? `Chapter ${number}` : "External chapter",
        url: input.url,
        sortKey: number ?? 0
    })
    await saveProgress({
        mangaId: manga.id,
        chapterId,
        pageIndex: 0,
        pageCount: 1,
        completed: input.completed ?? true,
        updatedAt: now
    })
    return { tracked: true, title: manga.title, chapterNumber: number ?? null, mangaId: manga.id }
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
    await db.transaction("rw", db.progress, db.manga, db.chapters, db.historyEvents, async () => {
        const existing = await db.progress.get(progress.chapterId)
        // completed is a one-way ratchet: once a chapter has been completed, a later
        // report from an earlier page (paging back after finishing, or re-reading from
        // page 1 in a fresh reader session, since the progress reporter is recreated
        // per chapter-load) must not flip it back to false. pageIndex/updatedAt still
        // track the newest report. Mirrors the same regression guard the import path
        // applies to a stale imported completed:false (see importDatabase's progress
        // merge). This also keeps the "completed" historyEvent unique per chapter -
        // without the ratchet, regress-then-recomplete would insert a duplicate event.
        const next = existing?.completed && !progress.completed ? { ...progress, completed: true } : progress
        await db.progress.put(next)
        const chapter = await db.chapters.get(progress.chapterId)
        await db.manga.update(progress.mangaId, {
            lastReadChapterId: progress.chapterId,
            ...(chapter && Number.isFinite(chapter.sortKey) ? { lastReadChapterNumber: chapter.sortKey } : {}),
            lastReadAt: progress.updatedAt,
            updatedAt: progress.updatedAt
        })
        if (!existing) {
            await db.historyEvents.add({
                mangaId: progress.mangaId,
                chapterId: progress.chapterId,
                type: "started",
                occurredAt: progress.updatedAt
            })
        }
        if (next.completed && !existing?.completed) {
            await db.historyEvents.add({
                mangaId: progress.mangaId,
                chapterId: progress.chapterId,
                type: "completed",
                occurredAt: progress.updatedAt
            })
        }
    })
}

export async function saveDownload(d: ChapterDownload): Promise<void> {
    await db.downloads.put(d)
}

export async function getDownload(chapterId: string): Promise<ChapterDownload | undefined> {
    return db.downloads.get(chapterId)
}

export async function removeDownload(chapterId: string): Promise<void> {
    await db.downloads.delete(chapterId)
}

export async function listDownloads(): Promise<
    Array<{ chapterId: string; mangaId: string; pageCount: number; downloadedAt: number }>
> {
    const all = await db.downloads.orderBy("downloadedAt").reverse().toArray()
    return all.map(({ chapterId, mangaId, pageCount, downloadedAt }) => ({
        chapterId,
        mangaId,
        pageCount,
        downloadedAt
    }))
}

export async function downloadsCount(): Promise<number> {
    return db.downloads.count()
}

export async function exportDatabase() {
    return {
        format: "all-mangas-reader",
        version: 1,
        exportedAt: Date.now(),
        data: {
            manga: await db.manga.toArray(),
            sourceLinks: await db.sourceLinks.toArray(),
            chapters: await db.chapters.toArray(),
            progress: await db.progress.toArray(),
            historyEvents: await db.historyEvents.toArray(),
            // pageBookmarks round-trip through export/import (previously silently
            // dropped - see schema.ts's pageBookmarkSchema comment). db.downloads is
            // intentionally NOT exported here: it holds full-page Blobs and would bloat
            // a backup file enormously. db.covers is intentionally NOT exported either:
            // covers are re-fetchable from the source on demand, and are also Blobs.
            pageBookmarks: await db.pageBookmarks.toArray()
        }
    } as const
}

export type ImportResolution = "overwrite" | "skip" | "merge"

export type ImportConflict = {
    mangaId: string
    existingTitle: string
    importedTitle: string
    existingUpdatedAt: number
    importedUpdatedAt: number
}

export type ImportTable = "manga" | "sourceLinks" | "chapters" | "progress" | "historyEvents" | "pageBookmarks"

// Machine-readable reason a single record was left out of an import, so a UI can
// build a human-readable message ("Chapter 3 of 'Witch Hunter' had an invalid URL -
// skipped") without needing to parse raw zod error text itself.
export type ImportSkipCode = "RECORD_INVALID" | "MISSING_REQUIRED_FIELD" | "PARENT_SKIPPED"

export type ImportSkip = {
    table: ImportTable
    index: number
    id?: string
    code: ImportSkipCode
    issue: string
}

function extractId(raw: unknown, ...keys: string[]): string | undefined {
    if (!raw || typeof raw !== "object") return undefined
    const obj = raw as Record<string, unknown>
    for (const key of keys) {
        const value = obj[key]
        if (typeof value === "string" && value.length > 0) return value
    }
    return undefined
}

function classifyIssue(issue: { code?: string; message: string } | undefined): ImportSkipCode {
    // zod v4 issues don't carry a separate "received" field for invalid_type - the
    // fact of "field absent" only shows up in the message text ("received undefined").
    if (issue?.code === "invalid_type" && /received undefined/i.test(issue.message)) {
        return "MISSING_REQUIRED_FIELD"
    }
    return "RECORD_INVALID"
}

type ParsedRecord<T> = { index: number; value: T }

// Parses one table's array record-by-record instead of through a single z.array(...)
// schema, so one malformed row (future schema drift, a hand-edited file, an old
// export format quirk) is skipped and reported instead of aborting the whole import -
// see the batch notes' Bug 3 ("make it a weak link no more"). `items` may be missing
// or not an array at all (e.g. a legacy export, or a corrupt file); both are treated
// as "no records for this table" rather than a hard failure, matching the previous
// lenient-envelope behavior for missing optional tables.
function parseTable<T>(
    table: ImportTable,
    items: unknown,
    recordSchema: z.ZodType<T>,
    idKeys: string[],
    skipped: ImportSkip[]
): ParsedRecord<T>[] {
    if (!Array.isArray(items)) return []
    const out: ParsedRecord<T>[] = []
    items.forEach((raw, index) => {
        const result = recordSchema.safeParse(raw)
        if (result.success) {
            out.push({ index, value: result.data })
        } else {
            const issue = result.error.issues[0]
            const id = extractId(raw, ...idKeys)
            skipped.push({
                table,
                index,
                ...(id ? { id } : {}),
                code: classifyIssue(issue),
                issue: issue?.message ?? "Invalid record"
            })
        }
    })
    return out
}

function parseImportData(value: unknown): {
    manga: LibraryManga[]
    sourceLinks: SourceLinkRecord[]
    chapters: ChapterRecord[]
    progress: ReadingProgress[]
    historyEvents: HistoryEvent[]
    pageBookmarks: PageBookmark[]
    skipped: ImportSkip[]
} {
    // Structure-only check: right format marker, right version, `data` is an object.
    // This is the only thing allowed to hard-fail the whole import - genuinely wrong
    // files (some other tool's export, a future version this build doesn't know about)
    // should still be rejected outright.
    const structure = envelopeStructureSchema.safeParse(value)
    if (!structure.success) {
        const issue = structure.error.issues[0]
        const where = issue && issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
        throw new Error(`Import file is invalid${where}: ${issue?.message ?? "unrecognized format"}`)
    }
    const data = structure.data.data as Record<string, unknown>
    const skipped: ImportSkip[] = []

    const mangaParsed = parseTable("manga", data["manga"], libraryMangaSchema, ["id"], skipped)
    const sourceLinksParsed = parseTable(
        "sourceLinks",
        data["sourceLinks"],
        sourceLinkRecordSchema,
        ["mangaId"],
        skipped
    )
    const chaptersParsed = parseTable("chapters", data["chapters"], importChapterSchema, ["id"], skipped)
    const progressParsed = parseTable("progress", data["progress"], readingProgressSchema, ["chapterId"], skipped)
    const historyEventsParsed = parseTable(
        "historyEvents",
        data["historyEvents"],
        historyEventSchema,
        ["chapterId"],
        skipped
    )
    const pageBookmarksParsed = parseTable("pageBookmarks", data["pageBookmarks"], pageBookmarkSchema, ["id"], skipped)

    // Referential integrity: a manga record that failed validation can still have
    // dependent chapters/sourceLinks/progress/history/bookmarks elsewhere in the
    // envelope that reference its id. Importing those would create orphaned rows
    // with no parent manga, so drop them too and record why - this is the same
    // "skippedIds" idea importDatabase already applies below for user-chosen "skip"
    // resolutions, just triggered by a validation failure instead of a user choice.
    const invalidMangaIds = new Set(
        skipped
            .filter((s): s is ImportSkip & { id: string } => s.table === "manga" && s.id !== undefined)
            .map(s => s.id)
    )

    function dropOrphans<T extends { mangaId: string }>(table: ImportTable, parsed: ParsedRecord<T>[]): T[] {
        if (invalidMangaIds.size === 0) return parsed.map(p => p.value)
        const kept: T[] = []
        for (const { index, value } of parsed) {
            if (invalidMangaIds.has(value.mangaId)) {
                skipped.push({
                    table,
                    index,
                    id: value.mangaId,
                    code: "PARENT_SKIPPED",
                    issue: `Referenced manga "${value.mangaId}" was skipped (invalid record), so this row was skipped too`
                })
            } else {
                kept.push(value)
            }
        }
        return kept
    }

    return {
        manga: mangaParsed.map(p => p.value) as LibraryManga[],
        sourceLinks: dropOrphans("sourceLinks", sourceLinksParsed) as SourceLinkRecord[],
        chapters: dropOrphans("chapters", chaptersParsed) as ChapterRecord[],
        progress: dropOrphans("progress", progressParsed) as ReadingProgress[],
        historyEvents: dropOrphans("historyEvents", historyEventsParsed) as HistoryEvent[],
        pageBookmarks: dropOrphans("pageBookmarks", pageBookmarksParsed) as PageBookmark[],
        skipped
    }
}

function mergeManga(existing: LibraryManga, imported: LibraryManga): LibraryManga {
    const rating = existing.rating ?? imported.rating
    // Categories are a list - union them instead of letting one side's tags silently
    // disappear just because the other record also had some set.
    const mergedCategories = [...new Set([...(existing.categories ?? []), ...(imported.categories ?? [])])]
    const categories = mergedCategories.length > 0 ? mergedCategories : undefined
    const notes = existing.notes ?? imported.notes
    const nsfw = existing.nsfw ?? imported.nsfw
    const manualTracking = existing.manualTracking ?? imported.manualTracking
    const onHold = existing.onHold ?? imported.onHold
    const readingDirection = existing.readingDirection ?? imported.readingDirection
    const pageFit = existing.pageFit ?? imported.pageFit
    const noGapContinuous = existing.noGapContinuous ?? imported.noGapContinuous
    const lastReadChapterNumber =
        Math.max(existing.lastReadChapterNumber ?? 0, imported.lastReadChapterNumber ?? 0) || undefined
    const latestChapterNumber =
        Math.max(existing.latestChapterNumber ?? 0, imported.latestChapterNumber ?? 0) || undefined
    const lastReadAt = existing.lastReadAt
        ? imported.lastReadAt
            ? Math.max(existing.lastReadAt, imported.lastReadAt)
            : existing.lastReadAt
        : imported.lastReadAt
    return {
        ...imported,
        ...(rating !== undefined ? { rating } : {}),
        ...(categories !== undefined ? { categories } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(nsfw !== undefined ? { nsfw } : {}),
        ...(manualTracking !== undefined ? { manualTracking } : {}),
        ...(onHold !== undefined ? { onHold } : {}),
        ...(readingDirection !== undefined ? { readingDirection } : {}),
        ...(pageFit !== undefined ? { pageFit } : {}),
        ...(noGapContinuous !== undefined ? { noGapContinuous } : {}),
        ...(lastReadChapterNumber !== undefined ? { lastReadChapterNumber } : {}),
        ...(latestChapterNumber !== undefined ? { latestChapterNumber } : {}),
        ...(lastReadAt !== undefined ? { lastReadAt } : {}),
        addedAt: Math.min(existing.addedAt, imported.addedAt),
        updatedAt: Math.max(existing.updatedAt, imported.updatedAt)
    }
}

export async function previewImport(value: unknown): Promise<ImportConflict[]> {
    const data = parseImportData(value)
    if (data.manga.length === 0) return []
    const ids = data.manga.map(m => m.id)
    const existing = await db.manga.bulkGet(ids)
    const conflicts: ImportConflict[] = []
    for (let i = 0; i < data.manga.length; i++) {
        const ex = existing[i]
        const im = data.manga[i]!
        if (ex) {
            conflicts.push({
                mangaId: im.id,
                existingTitle: ex.title,
                importedTitle: im.title,
                existingUpdatedAt: ex.updatedAt,
                importedUpdatedAt: im.updatedAt
            })
        }
    }
    return conflicts
}

export async function importDatabase(
    value: unknown,
    resolutions: Record<string, ImportResolution> = {}
): Promise<{ manga: number; chapters: number; skipped: ImportSkip[] }> {
    const data = parseImportData(value)

    const skippedIds = new Set<string>()
    const mangaToWrite: LibraryManga[] = []

    if (data.manga.length > 0) {
        const ids = data.manga.map(m => m.id)
        const existing = await db.manga.bulkGet(ids)
        for (let i = 0; i < data.manga.length; i++) {
            const im = data.manga[i]!
            const ex = existing[i]
            // Default to merge (not overwrite) so read progress is never silently lost
            // when no explicit resolution is chosen. Merge takes Math.max of the manga
            // record's own chapter-number fields; the progress table below is merged
            // separately by updatedAt recency, since it isn't covered by mergeManga.
            const resolution = ex ? (resolutions[im.id] ?? "merge") : "overwrite"
            if (resolution === "skip") {
                skippedIds.add(im.id)
            } else if (resolution === "merge" && ex) {
                mangaToWrite.push(mergeManga(ex, im))
            } else {
                mangaToWrite.push(im)
            }
        }
    }

    const sourceLinksToWrite = data.sourceLinks.filter(sl => !skippedIds.has(sl.mangaId))
    const chaptersToWrite = data.chapters.filter(ch => !skippedIds.has(ch.mangaId))
    const candidateProgress = data.progress.filter(p => !skippedIds.has(p.mangaId))
    // Drop the auto-increment id from imported history events - a backup from a
    // different profile has its own id sequence starting at 1, so bulkPut-ing those
    // ids raw would silently overwrite unrelated local history at the same keys.
    // historyEvents.id isn't referenced as a foreign key anywhere else, so letting
    // Dexie assign fresh ids on insert is safe.
    const historyToWrite = data.historyEvents
        .filter(h => !skippedIds.has(h.mangaId))
        .map(({ id: _id, ...rest }) => rest)
    // pageBookmarks use a string primary key (`${chapterId}:${pageIndex}`, see
    // toggleBookmark), which is semantically stable across profiles - unlike
    // historyEvents' arbitrary auto-increment id, the same key really does mean "the
    // same bookmark", so bulkPut-ing it raw (last-write-wins) is correct here.
    const bookmarksToWrite = data.pageBookmarks.filter(b => !skippedIds.has(b.mangaId))

    await db.transaction(
        "rw",
        [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents, db.pageBookmarks],
        async () => {
            if (mangaToWrite.length > 0) await db.manga.bulkPut(mangaToWrite)
            if (sourceLinksToWrite.length > 0) await db.sourceLinks.bulkPut(sourceLinksToWrite)
            if (chaptersToWrite.length > 0) await db.chapters.bulkPut(chaptersToWrite)
            if (candidateProgress.length > 0) {
                // Progress isn't covered by mergeManga's Math.max logic - bulkPut-ing it raw
                // let a stale imported record (e.g. completed: false) regress a chapter that's
                // locally marked completed: true. Only overwrite when the incoming record is
                // at least as recent as what's already stored.
                const existingProgress = await db.progress.bulkGet(candidateProgress.map(p => p.chapterId))
                const progressToWrite = candidateProgress.filter((p, i) => {
                    const existing = existingProgress[i]
                    return !existing || p.updatedAt >= existing.updatedAt
                })
                if (progressToWrite.length > 0) await db.progress.bulkPut(progressToWrite)
            }
            if (historyToWrite.length > 0) await db.historyEvents.bulkPut(historyToWrite)
            if (bookmarksToWrite.length > 0) await db.pageBookmarks.bulkPut(bookmarksToWrite)
        }
    )
    return { manga: mangaToWrite.length, chapters: chaptersToWrite.length, skipped: data.skipped }
}

const MAX_BACKUPS = 3

// Automatic, silent safety-net snapshot taken before any import/sync-pull mutation
// (see the data:import and sync:pull handlers in handlers/data-sync-settings.ts) so
// a bad import/merge can be undone. No user prompt - zero friction by design.
export async function createBackup(reason: LibraryBackup["reason"]): Promise<void> {
    const envelope = await exportDatabase()
    await db.backups.add({ createdAt: Date.now(), reason, envelope })
    const all = await db.backups.orderBy("createdAt").reverse().toArray()
    const stale = all.slice(MAX_BACKUPS)
    if (stale.length > 0) {
        await db.backups.bulkDelete(stale.map(b => b.id!))
    }
}

export async function listBackups(): Promise<BackupSummary[]> {
    const all = await db.backups.orderBy("createdAt").reverse().toArray()
    return all.map(b => ({ id: b.id!, createdAt: b.createdAt, reason: b.reason }))
}

// Clears exactly the tables covered by the export/import envelope - unlike
// clearLibrary(), this deliberately leaves db.downloads and db.covers untouched
// (neither is part of a backup/import envelope, so wiping them on restore would
// destroy data the restore has no way to bring back) and leaves db.backups untouched
// (restoring must not delete the very backups list it's operating on).
async function clearImportableTables(): Promise<void> {
    await db.transaction(
        "rw",
        [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents, db.pageBookmarks],
        async () => {
            await Promise.all([
                db.manga.clear(),
                db.sourceLinks.clear(),
                db.chapters.clear(),
                db.progress.clear(),
                db.historyEvents.clear(),
                db.pageBookmarks.clear()
            ])
        }
    )
}

export async function restoreBackup(id: number): Promise<{ manga: number; chapters: number; skipped: ImportSkip[] }> {
    const backup = await db.backups.get(id)
    if (!backup) throw new Error(`No backup found with id ${id}`)
    // Read the envelope out into a local variable before taking the pre-restore
    // snapshot below. createBackup() prunes to MAX_BACKUPS, which could delete this
    // very backup row (if the user has done 3+ restore cycles) - reading it first
    // means that pruning can never invalidate the data we're about to restore.
    const envelope = backup.envelope
    // Restoring must actually undo, not merge - snapshot current state first (so the
    // restore itself is undoable), then replace current state with the backup's
    // snapshot wholesale instead of importDatabase's default merge-mode resolution
    // (existing-wins on most fields, Math.max on chapter numbers), which would leave
    // a bad import's junk data and clobbered values sitting alongside the restore.
    await createBackup("pre-import")
    await clearImportableTables()
    return await importDatabase(envelope)
}

export async function seedDatabase(): Promise<void> {
    const now = Date.now()
    const seedEntries: Array<{
        manga: LibraryManga
        chapterUrl: string
        sourceId: string
        chapterTitle: string
        sortKey: number
    }> = [
        {
            manga: {
                id: "seed-md-001",
                title: "Buried Injustice",
                normalizedTitle: "buried injustice",
                coverUrl: "/sample-covers/buried-injustice.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangadex",
                sourceUrl: "https://mangadex.org/chapter/3dff8b5f-844e-4964-abd7-641c34f1f091",
                sourceMangaId: "62994137-014f-4499-b88a-c219b115fd64",
                mangaUrl: "https://mangadex.org/title/62994137-014f-4499-b88a-c219b115fd64",
                addedAt: now - 86400000 * 7,
                updatedAt: now - 3600000 * 2,
                latestChapterId: "seed-md-001-ch"
            },
            chapterUrl: "https://mangadex.org/chapter/3dff8b5f-844e-4964-abd7-641c34f1f091",
            sourceId: "mangadex",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-mr-001",
                title: "Entomologist In Sichuan Tang Clan",
                normalizedTitle: "entomologist in sichuan tang clan",
                coverUrl: "/sample-covers/entomologist.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/chapter-79/?style=list",
                sourceMangaId: "entomologist-in-sichuan-tang-clan",
                mangaUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/",
                addedAt: now - 86400000 * 5,
                updatedAt: now - 3600000 * 5,
                latestChapterId: "seed-mr-001-ch"
            },
            chapterUrl: "https://www.mangaread.org/manga/entomologist-in-sichuan-tang-clan/chapter-79/?style=list",
            sourceId: "mangaread",
            chapterTitle: "Chapter 79",
            sortKey: 79
        },
        {
            manga: {
                id: "seed-mr-002",
                title: "Legendary Youngest Son Of The Marquis House",
                normalizedTitle: "legendary youngest son of the marquis house",
                coverUrl: "/sample-covers/legendary-marquis.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mangaread",
                sourceUrl:
                    "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/chapter-161/?style=list",
                sourceMangaId: "legendary-youngest-son-of-the-marquis-house",
                mangaUrl: "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/",
                addedAt: now - 86400000 * 3,
                updatedAt: now - 3600000 * 8,
                latestChapterId: "seed-mr-002-ch"
            },
            chapterUrl:
                "https://www.mangaread.org/manga/legendary-youngest-son-of-the-marquis-house/chapter-161/?style=list",
            sourceId: "mangaread",
            chapterTitle: "Chapter 161",
            sortKey: 161
        },
        {
            manga: {
                id: "seed-mgk-001",
                title: "Barbarian's Adventure In A Fantasy World",
                normalizedTitle: "barbarian's adventure in a fantasy world",
                coverUrl: "/sample-covers/barbarian-fantasy.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "mgeko",
                sourceUrl: "https://www.mgeko.cc/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/",
                sourceMangaId: "barbarians-adventure-in-a-fantasy-world",
                mangaUrl: "https://www.mgeko.cc/comic/barbarians-adventure-in-a-fantasy-world/",
                addedAt: now - 86400000 * 2,
                updatedAt: now - 3600000 * 12,
                latestChapterId: "seed-mgk-001-ch"
            },
            chapterUrl: "https://www.mgeko.cc/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/",
            sourceId: "mgeko",
            chapterTitle: "Chapter 52",
            sortKey: 52
        },
        {
            manga: {
                id: "seed-wc-001",
                title: "Jujutsu Kaisen",
                normalizedTitle: "jujutsu kaisen",
                coverUrl: "/sample-covers/jujutsu-kaisen.jpg",
                authors: ["Gege Akutami"],
                status: "ongoing",
                sourceId: "weebcentral",
                sourceUrl: "https://weebcentral.com/chapters/01KWX62ZXF6VQDFEM1ADY98TFD/",
                sourceMangaId: "01KWX62ZXF6VQDFEM1ADY98TFD",
                mangaUrl: "https://weebcentral.com/chapters/01KWX62ZXF6VQDFEM1ADY98TFD/",
                addedAt: now - 86400000 * 10,
                updatedAt: now - 3600000 * 1,
                latestChapterId: "seed-wc-001-ch"
            },
            chapterUrl: "https://weebcentral.com/chapters/01KWX62ZXF6VQDFEM1ADY98TFD/",
            sourceId: "weebcentral",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-dyn-001",
                title: "Bloom Into You",
                normalizedTitle: "bloom into you",
                coverUrl: "/sample-covers/bloom-into-you.jpg",
                authors: ["Nio Nakatani"],
                status: "completed",
                sourceId: "dynasty-scans",
                sourceUrl: "https://dynasty-scans.com/chapters/bloom_into_you_ch1",
                sourceMangaId: "bloom_into_you",
                mangaUrl: "https://dynasty-scans.com/series/bloom_into_you",
                addedAt: now - 86400000 * 9,
                updatedAt: now - 3600000 * 6,
                latestChapterId: "seed-dyn-001-ch"
            },
            chapterUrl: "https://dynasty-scans.com/chapters/bloom_into_you_ch1",
            sourceId: "dynasty-scans",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-ac-001",
                title: "Return of the Disaster-Class Hero",
                normalizedTitle: "return of the disaster-class hero",
                coverUrl: "/sample-covers/disaster-class-hero.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "asuracomic",
                sourceUrl: "https://asuracomic.net/series/return-of-the-disaster-class-hero-4dbc9a3a/1",
                sourceMangaId: "return-of-the-disaster-class-hero-4dbc9a3a",
                mangaUrl: "https://asuracomic.net/series/return-of-the-disaster-class-hero-4dbc9a3a",
                addedAt: now - 86400000 * 8,
                updatedAt: now - 3600000 * 3,
                latestChapterId: "seed-ac-001-ch"
            },
            chapterUrl: "https://asuracomic.net/series/return-of-the-disaster-class-hero-4dbc9a3a/1",
            sourceId: "asuracomic",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-as-001",
                title: "Omniscient Reader's Viewpoint",
                normalizedTitle: "omniscient reader's viewpoint",
                coverUrl: "/sample-covers/omniscient-reader.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "asurascans",
                sourceUrl: "https://asurascans.com/comics/omniscient-readers-viewpoint-9182bca3/chapter/1",
                sourceMangaId: "omniscient-readers-viewpoint-9182bca3",
                mangaUrl: "https://asurascans.com/comics/omniscient-readers-viewpoint-9182bca3",
                addedAt: now - 86400000 * 6,
                updatedAt: now - 3600000 * 4,
                latestChapterId: "seed-as-001-ch"
            },
            chapterUrl: "https://asurascans.com/comics/omniscient-readers-viewpoint-9182bca3/chapter/1",
            sourceId: "asurascans",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-oms-001",
                title: "The Beginning After The End",
                normalizedTitle: "the beginning after the end",
                coverUrl: "/sample-covers/beginning-after-end.jpg",
                authors: ["TurtleMe"],
                status: "ongoing",
                sourceId: "asuracomic",
                sourceUrl: "https://asuracomic.net/series/the-beginning-after-the-end/chapter-1",
                sourceMangaId: "the-beginning-after-the-end",
                mangaUrl: "https://asuracomic.net/series/the-beginning-after-the-end",
                addedAt: now - 86400000 * 14,
                updatedAt: now - 3600000 * 9,
                latestChapterId: "seed-oms-001-ch"
            },
            chapterUrl: "https://asuracomic.net/series/the-beginning-after-the-end/chapter-1",
            sourceId: "asuracomic",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-ts-001",
                title: "Kukuku! He is the Weakest of the Four Heavenly Kings",
                normalizedTitle: "kukuku! he is the weakest of the four heavenly kings",
                coverUrl: "/sample-covers/nano-machine.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "thunderscans",
                sourceUrl:
                    "https://en-thunderscans.com/kukuku-he-is-the-weakest-of-the-four-heavenly-kings-i-was-dismissed-from-my-job-but-somehow-i-became-the-master-of-a-hero-and-a-holy-maiden-chapter-1/",
                sourceMangaId:
                    "kukuku-he-is-the-weakest-of-the-four-heavenly-kings-i-was-dismissed-from-my-job-but-somehow-i-became-the-master-of-a-hero-and-a-holy-maiden",
                mangaUrl:
                    "https://en-thunderscans.com/manga/kukuku-he-is-the-weakest-of-the-four-heavenly-kings-i-was-dismissed-from-my-job-but-somehow-i-became-the-master-of-a-hero-and-a-holy-maiden/",
                addedAt: now - 86400000 * 13,
                updatedAt: now - 3600000 * 7,
                latestChapterId: "seed-ts-001-ch"
            },
            chapterUrl:
                "https://en-thunderscans.com/kukuku-he-is-the-weakest-of-the-four-heavenly-kings-i-was-dismissed-from-my-job-but-somehow-i-became-the-master-of-a-hero-and-a-holy-maiden-chapter-1/",
            sourceId: "thunderscans",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-wt-001",
                title: "Daisy: How to Become the Duke's Fiancée",
                normalizedTitle: "daisy: how to become the duke's fiancée",
                coverUrl: "/sample-covers/tower-of-god.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "webtoons",
                sourceUrl:
                    "https://www.webtoons.com/en/romance/daisy-how-to-become-the-dukes-fiancee/episode-1/viewer?title_no=8579&episode_no=1",
                sourceMangaId: "8579",
                mangaUrl:
                    "https://www.webtoons.com/en/romance/daisy-how-to-become-the-dukes-fiancee/list?title_no=8579",
                addedAt: now - 86400000 * 12,
                updatedAt: now - 3600000 * 2,
                latestChapterId: "seed-wt-001-ch"
            },
            chapterUrl:
                "https://www.webtoons.com/en/romance/daisy-how-to-become-the-dukes-fiancee/episode-1/viewer?title_no=8579&episode_no=1",
            sourceId: "webtoons",
            chapterTitle: "Episode 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-mh-001",
                title: "Attack on Titan",
                normalizedTitle: "attack on titan",
                coverUrl: "/sample-covers/attack-on-titan.jpg",
                authors: ["Hajime Isayama"],
                status: "completed",
                sourceId: "mangahub",
                sourceUrl: "https://mangahub.io/chapter/shingeki-no-kyojin/chapter-1",
                sourceMangaId: "shingeki-no-kyojin",
                mangaUrl: "https://mangahub.io/manga/shingeki-no-kyojin",
                addedAt: now - 86400000 * 11,
                updatedAt: now - 3600000 * 15,
                latestChapterId: "seed-mh-001-ch"
            },
            chapterUrl: "https://mangahub.io/chapter/shingeki-no-kyojin/chapter-1",
            sourceId: "mangahub",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-ff-001",
                title: "Ogami Tsumiki to Kinichijou",
                normalizedTitle: "ogami tsumiki to kinichijou",
                coverUrl: "/sample-covers/ghost-story.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "fanfox",
                sourceUrl: "https://fanfox.net/manga/ogami_tsumiki_to_kinichijou/c106/1.html",
                sourceMangaId: "ogami_tsumiki_to_kinichijou",
                mangaUrl: "https://fanfox.net/manga/ogami_tsumiki_to_kinichijou/",
                addedAt: now - 86400000 * 20,
                updatedAt: now - 86400000 * 1,
                latestChapterId: "seed-ff-001-ch"
            },
            chapterUrl: "https://fanfox.net/manga/ogami_tsumiki_to_kinichijou/c106/1.html",
            sourceId: "fanfox",
            chapterTitle: "Ch.106",
            sortKey: 106
        },
        {
            manga: {
                id: "seed-ops-001",
                title: "Eleceed",
                normalizedTitle: "eleceed",
                coverUrl: "/sample-covers/eleceed.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "olympustaff",
                sourceUrl: "https://olympustaff.com/series/eleceed/1",
                sourceMangaId: "eleceed",
                mangaUrl: "https://olympustaff.com/series/eleceed",
                addedAt: now - 86400000 * 4,
                updatedAt: now - 3600000 * 10,
                latestChapterId: "seed-ops-001-ch"
            },
            chapterUrl: "https://olympustaff.com/series/eleceed/1",
            sourceId: "olympustaff",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-mf-001",
                title: "One Punch Man",
                normalizedTitle: "one punch man",
                coverUrl: "/sample-covers/one-punch-man.jpg",
                authors: ["ONE", "Yusuke Murata"],
                status: "ongoing",
                sourceId: "mangafreak",
                sourceUrl: "https://ww2.mangafreak.me/Read1_One_Punch_Man_1",
                sourceMangaId: "One_Punch_Man",
                mangaUrl: "https://ww2.mangafreak.me/Manga/One_Punch_Man",
                addedAt: now - 86400000 * 16,
                updatedAt: now - 3600000 * 18,
                latestChapterId: "seed-mf-001-ch"
            },
            chapterUrl: "https://ww2.mangafreak.me/Read1_One_Punch_Man_1",
            sourceId: "mangafreak",
            chapterTitle: "Chapter 1",
            sortKey: 1
        },
        {
            manga: {
                id: "seed-cx-001",
                title: "My Possession Became a Ghost Story",
                normalizedTitle: "my possession became a ghost story",
                coverUrl: "/sample-covers/ghost-story.jpg",
                authors: [],
                status: "ongoing",
                sourceId: "comix",
                sourceUrl: "https://comix.to/title/80d0m-my-possession-became-a-ghost-story/10251750-chapter-0",
                sourceMangaId: "80d0m-my-possession-became-a-ghost-story",
                mangaUrl: "https://comix.to/title/80d0m-my-possession-became-a-ghost-story",
                addedAt: now - 86400000 * 1,
                updatedAt: now - 3600000 * 20,
                latestChapterId: "seed-cx-001-ch"
            },
            chapterUrl: "https://comix.to/title/80d0m-my-possession-became-a-ghost-story/10251750-chapter-0",
            sourceId: "comix",
            chapterTitle: "Chapter 0",
            sortKey: 0
        }
    ]

    const seedManga = seedEntries.map(e => e.manga)
    const seedChapters: import("@amr/contracts").ChapterRecord[] = seedEntries.map(e => ({
        id: e.manga.latestChapterId!,
        mangaId: e.manga.id,
        sourceId: e.sourceId,
        title: e.chapterTitle,
        sortKey: e.sortKey,
        url: e.chapterUrl
    }))
    const seedLinks: import("@amr/contracts").SourceLinkRecord[] = seedEntries.map(e => ({
        mangaId: e.manga.id,
        sourceId: e.sourceId,
        ...(e.manga.sourceMangaId ? { sourceMangaId: e.manga.sourceMangaId } : {}),
        url: e.manga.mangaUrl ?? e.chapterUrl,
        title: e.manga.title,
        addedAt: e.manga.addedAt,
        updatedAt: e.manga.updatedAt
    }))
    await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
        const staleIds = (await db.manga.where("id").startsWith("seed-").primaryKeys()) as string[]
        if (staleIds.length > 0) {
            await db.manga.bulkDelete(staleIds)
            await db.sourceLinks.bulkDelete(staleIds)
            await db.chapters.where("mangaId").anyOf(staleIds).delete()
        }
        await db.manga.bulkPut(seedManga)
        await db.sourceLinks.bulkPut(seedLinks)
        await db.chapters.bulkPut(seedChapters)
    })
}

export async function getLocalStats() {
    const [manga, progress, history, downloadedChapters] = await Promise.all([
        db.manga.toArray(),
        db.progress.toArray(),
        db.historyEvents.orderBy("occurredAt").toArray(),
        db.downloads.count()
    ])
    const mangaCount = manga.length
    const completedChapters = progress.filter(item => item.completed).length

    const ratedCount = manga.filter(m => m.rating !== undefined).length
    const categoriesCount = new Set(manga.flatMap(m => m.categories ?? [])).size
    const sourcesUsed = new Set(manga.map(m => m.sourceId)).size
    const manualCount = manga.filter(m => m.manualTracking === true).length
    const completedSeries = manga.filter(
        m =>
            m.latestChapterNumber !== undefined &&
            m.lastReadChapterNumber !== undefined &&
            m.lastReadChapterNumber >= m.latestChapterNumber
    ).length
    const dayKeys = [...new Set(history.map(event => new Date(event.occurredAt).toISOString().slice(0, 10)))].sort()
    const readingDays = dayKeys.length

    const dayMs = 86_400_000
    const asDay = (key: string) => Date.parse(`${key}T00:00:00Z`)
    let longestStreak = 0
    let run = 0
    let prev: number | null = null
    for (const key of dayKeys) {
        const t = asDay(key)
        run = prev !== null && t - prev === dayMs ? run + 1 : 1
        longestStreak = Math.max(longestStreak, run)
        prev = t
    }
    // Current streak: consecutive days ending today or yesterday.
    let currentStreak = 0
    const todayKey = new Date().toISOString().slice(0, 10)
    let cursor = asDay(todayKey)
    const daySet = new Set(dayKeys.map(asDay))
    if (!daySet.has(cursor) && daySet.has(cursor - dayMs)) cursor -= dayMs
    while (daySet.has(cursor)) {
        currentStreak += 1
        cursor -= dayMs
    }
    const weekAgo = Date.now() - 7 * dayMs
    const chaptersThisWeek = history.filter(e => e.type === "completed" && e.occurredAt >= weekAgo).length
    const chaptersToday = history.filter(
        e => e.type === "completed" && new Date(e.occurredAt).toISOString().slice(0, 10) === todayKey
    ).length

    const ACHIEVEMENT_DEFS: Array<{
        id: string
        title: string
        description: string
        category: string
        metric: number
        target: number
    }> = [
        {
            id: "first-chapter",
            title: "First Chapter",
            description: "Complete one chapter",
            category: "Chapters",
            metric: completedChapters,
            target: 1
        },
        {
            id: "chapters-10",
            title: "Just Warming Up",
            description: "Complete ten chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 10
        },
        {
            id: "chapters-50",
            title: "Bookworm",
            description: "Complete 50 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 50
        },
        {
            id: "chapters-100",
            title: "Page Turner",
            description: "Complete 100 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 100
        },
        {
            id: "chapters-250",
            title: "Voracious",
            description: "Complete 250 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 250
        },
        {
            id: "chapters-500",
            title: "Marathon",
            description: "Complete 500 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 500
        },
        {
            id: "chapters-1000",
            title: "Living Library",
            description: "Complete 1000 chapters",
            category: "Chapters",
            metric: completedChapters,
            target: 1000
        },
        {
            id: "manga-1",
            title: "First Title",
            description: "Save your first manga",
            category: "Library",
            metric: mangaCount,
            target: 1
        },
        {
            id: "manga-5",
            title: "Shelf Starter",
            description: "Save five manga",
            category: "Library",
            metric: mangaCount,
            target: 5
        },
        {
            id: "manga-10",
            title: "Collector",
            description: "Save ten manga",
            category: "Library",
            metric: mangaCount,
            target: 10
        },
        {
            id: "manga-25",
            title: "Curator",
            description: "Save 25 manga",
            category: "Library",
            metric: mangaCount,
            target: 25
        },
        {
            id: "manga-50",
            title: "Archivist",
            description: "Save 50 manga",
            category: "Library",
            metric: mangaCount,
            target: 50
        },
        {
            id: "manga-100",
            title: "Hoarder",
            description: "Save 100 manga",
            category: "Library",
            metric: mangaCount,
            target: 100
        },
        {
            id: "streak-3",
            title: "Consistent",
            description: "Keep a three-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 3
        },
        {
            id: "streak-7",
            title: "Dedicated",
            description: "Reach a seven-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 7
        },
        {
            id: "streak-14",
            title: "Committed",
            description: "Reach a fourteen-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 14
        },
        {
            id: "streak-30",
            title: "Unstoppable",
            description: "Reach a thirty-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 30
        },
        {
            id: "streak-60",
            title: "Relentless",
            description: "Reach a sixty-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 60
        },
        {
            id: "streak-100",
            title: "Centurion",
            description: "Reach a hundred-day reading streak",
            category: "Streaks",
            metric: longestStreak,
            target: 100
        },
        {
            id: "active-days-7",
            title: "Explorer",
            description: "Read on seven different days",
            category: "Activity",
            metric: readingDays,
            target: 7
        },
        {
            id: "active-days-30",
            title: "Regular",
            description: "Read on 30 different days",
            category: "Activity",
            metric: readingDays,
            target: 30
        },
        {
            id: "active-days-100",
            title: "Veteran",
            description: "Read on 100 different days",
            category: "Activity",
            metric: readingDays,
            target: 100
        },
        {
            id: "weekly-reader",
            title: "Weekly Reader",
            description: "Complete ten chapters in a week",
            category: "Pace",
            metric: chaptersThisWeek,
            target: 10
        },
        {
            id: "binge-week",
            title: "Binge Week",
            description: "Complete 30 chapters in a week",
            category: "Pace",
            metric: chaptersThisWeek,
            target: 30
        },
        {
            id: "day-blitz",
            title: "Day Blitz",
            description: "Complete ten chapters in a single day",
            category: "Pace",
            metric: chaptersToday,
            target: 10
        },
        {
            id: "rate-5",
            title: "Critic",
            description: "Rate five titles",
            category: "Curation",
            metric: ratedCount,
            target: 5
        },
        {
            id: "rate-25",
            title: "Reviewer",
            description: "Rate 25 titles",
            category: "Curation",
            metric: ratedCount,
            target: 25
        },
        {
            id: "categories-3",
            title: "Organizer",
            description: "Create three categories",
            category: "Curation",
            metric: categoriesCount,
            target: 3
        },
        {
            id: "manual-1",
            title: "Hands On",
            description: "Mark a title for manual tracking",
            category: "Curation",
            metric: manualCount,
            target: 1
        },
        {
            id: "complete-series-1",
            title: "The End",
            description: "Catch up to the latest chapter of a series",
            category: "Curation",
            metric: completedSeries,
            target: 1
        },
        {
            id: "complete-series-5",
            title: "Caught Up",
            description: "Catch up on five full series",
            category: "Curation",
            metric: completedSeries,
            target: 5
        },
        {
            id: "offline-5",
            title: "Going Offline",
            description: "Download five chapters for offline reading",
            category: "Offline",
            metric: downloadedChapters,
            target: 5
        },
        {
            id: "offline-25",
            title: "Stocked Up",
            description: "Download 25 chapters for offline reading",
            category: "Offline",
            metric: downloadedChapters,
            target: 25
        },
        {
            id: "sources-3",
            title: "Source Hopper",
            description: "Read from three distinct sources",
            category: "Sources",
            metric: sourcesUsed,
            target: 3
        },
        {
            id: "sources-5",
            title: "Source Connoisseur",
            description: "Read from five distinct sources",
            category: "Sources",
            metric: sourcesUsed,
            target: 5
        }
    ]

    return {
        mangaCount,
        completedChapters,
        readingDays,
        currentStreak,
        longestStreak,
        chaptersThisWeek,
        chaptersToday,
        ratedCount,
        categoriesCount,
        downloadedChapters,
        sourcesUsed,
        completedSeries,
        estimatedMinutes: completedChapters * 5,
        minutesThisWeek: chaptersThisWeek * 5,
        achievements: ACHIEVEMENT_DEFS.map(def => ({
            id: def.id,
            title: def.title,
            description: def.description,
            category: def.category,
            target: def.target,
            progress: Math.min(def.metric, def.target),
            unlocked: def.metric >= def.target
        }))
    }
}

function localDayKey(d: Date): string {
    const year = d.getFullYear()
    const month = `${d.getMonth() + 1}`.padStart(2, "0")
    const day = `${d.getDate()}`.padStart(2, "0")
    return `${year}-${month}-${day}`
}

export async function getActivityCalendar(days = 120): Promise<Array<{ date: string; count: number }>> {
    const events = await db.historyEvents.where("type").equals("completed").toArray()
    const perDay = new Map<string, Set<string>>()
    for (const event of events) {
        const key = localDayKey(new Date(event.occurredAt))
        const seen = perDay.get(key)
        if (seen) seen.add(event.chapterId)
        else perDay.set(key, new Set([event.chapterId]))
    }
    const result: Array<{ date: string; count: number }> = []
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    cursor.setDate(cursor.getDate() - (days - 1))
    for (let i = 0; i < days; i += 1) {
        const key = localDayKey(cursor)
        result.push({ date: key, count: perDay.get(key)?.size ?? 0 })
        cursor.setDate(cursor.getDate() + 1)
    }
    return result
}

export async function recordAnalyticsEvent(event: Omit<AnalyticsEvent, "id">): Promise<void> {
    await db.analyticsEvents.add(event)
    // Keep last 90 days only - prune inline to avoid a separate cleanup job.
    const cutoff = Date.now() - 90 * 86_400_000
    void db.analyticsEvents.where("ts").below(cutoff).delete()
}

export async function getAnalyticsSummary(days = 30) {
    const since = Date.now() - days * 86_400_000
    const [events, allManga] = await Promise.all([
        db.analyticsEvents.where("ts").above(since).toArray(),
        db.manga.toArray()
    ])

    const sourceErrors = new Map<string, number>()
    const sourceCaptures = new Map<string, number>()
    const panelActions = new Map<string, number>()
    const errorTypeCount = new Map<string, number>()
    let captureOk = 0,
        captureErrors = 0,
        readerOpened = 0,
        onSiteTrack = 0,
        directResolves = 0,
        tabResolves = 0

    for (const ev of events) {
        if (ev.event === "capture_ok") {
            captureOk++
            if (ev.sourceId) sourceCaptures.set(ev.sourceId, (sourceCaptures.get(ev.sourceId) ?? 0) + 1)
        } else if (ev.event === "capture_error") {
            captureErrors++
            if (ev.sourceId) sourceErrors.set(ev.sourceId, (sourceErrors.get(ev.sourceId) ?? 0) + 1)
            try {
                const d = ev.detail ? (JSON.parse(ev.detail) as { errorType?: string }) : null
                const type = d?.errorType ?? "unknown"
                errorTypeCount.set(type, (errorTypeCount.get(type) ?? 0) + 1)
            } catch {
                errorTypeCount.set("unknown", (errorTypeCount.get("unknown") ?? 0) + 1)
            }
        } else if (ev.event === "reader_opened") {
            readerOpened++
        } else if (ev.event === "on_site_track") {
            onSiteTrack++
        } else if (ev.event === "resolve_direct") {
            directResolves++
        } else if (ev.event === "resolve_tab") {
            tabResolves++
        } else if (ev.event === "panel_action" && ev.detail) {
            try {
                const d = JSON.parse(ev.detail) as { action?: string }
                const a = d.action ?? "unknown"
                panelActions.set(a, (panelActions.get(a) ?? 0) + 1)
            } catch {
                // ignore malformed detail
            }
        }
    }

    const readerRate = captureOk > 0 ? Math.round((readerOpened / captureOk) * 100) : 0
    const errorRate =
        captureOk + captureErrors > 0 ? Math.round((captureErrors / (captureOk + captureErrors)) * 100) : 0

    // Aggregate genre, author, and status distributions from the full library.
    // Genres are only counted for manga that have had their genres fetched and cached.
    const genreCounts = new Map<string, number>()
    const authorCounts = new Map<string, number>()
    const statusCounts = new Map<string, number>()

    for (const m of allManga) {
        for (const g of m.genres ?? []) {
            genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
        }
        for (const a of m.authors ?? []) {
            authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1)
        }
        const st = m.status ?? "unknown"
        statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1)
    }

    return {
        days,
        captureOk,
        captureErrors,
        readerOpened,
        onSiteTrack,
        directResolves,
        tabResolves,
        readerRate,
        errorRate,
        topSources: [...sourceCaptures.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sourceId, count]) => ({ sourceId, count })),
        topErrors: [...sourceErrors.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sourceId, count]) => ({ sourceId, count })),
        panelActions: [...panelActions.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => ({ action, count })),
        topGenres: [...genreCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([genre, count]) => ({ genre, count })),
        topAuthors: [...authorCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([author, count]) => ({ author, count })),
        statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
        errorTypes: [...errorTypeCount.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }))
    }
}

export async function toggleBookmark(data: Omit<PageBookmark, "id" | "addedAt">): Promise<boolean> {
    const id = `${data.chapterId}:${data.pageIndex}`
    const existing = await db.pageBookmarks.get(id)
    if (existing) {
        await db.pageBookmarks.delete(id)
        return false
    }
    await db.pageBookmarks.put({ ...data, id, addedAt: Date.now() })
    return true
}

export async function bookmarkedPagesForChapter(chapterId: string): Promise<number[]> {
    const records = await db.pageBookmarks.where("chapterId").equals(chapterId).toArray()
    return records.map(r => r.pageIndex)
}

export async function listBookmarks(): Promise<PageBookmark[]> {
    return db.pageBookmarks.orderBy("addedAt").reverse().toArray()
}

export async function removeBookmark(id: string): Promise<void> {
    await db.pageBookmarks.delete(id)
}
