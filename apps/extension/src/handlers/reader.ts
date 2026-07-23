import type { ReadingProgress } from "@amr/contracts"
import {
    db,
    putChapters,
    recordAnalyticsEvent,
    saveProgress,
    saveReaderResolvedChapter,
    trackExternalChapter
} from "../database"
import { findSource, getSourceById, listChaptersBySource, resolveChapterFromHtml, resolveChapterUrl } from "../sources"
import {
    ensureChapterListRefreshed,
    mineAndCacheEpisodesFromHtml,
    scheduleChapterListRefresh
} from "../background/chapter-cache"
import { fetchChapterHtmlViaTab } from "../background/tab-fetch"
import { captureChapter, isBotBlocked } from "../background/capture"
import { publishLive } from "../live"
import type { HandlerMap } from "../background/handler-types"

export const readerHandlers: HandlerMap = {
    "page:current": async (_request, ctx) => {
        const tab = ctx.sender.tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
        const url = tab?.url
        if (!url) return { supported: false }
        let parsedUrl: URL
        try {
            parsedUrl = new URL(url)
        } catch {
            return { supported: false }
        }
        const source = findSource(parsedUrl)
        const pageType = source?.match(parsedUrl) ?? "none"
        return {
            supported: Boolean(source) && pageType !== "none",
            pageType,
            url,
            ...(source ? { sourceName: source.manifest.name } : {})
        }
    },

    "page:capture": async request => {
        return await captureChapter(request.url)
    },

    "reader:resolve": async request => {
        let resolved
        try {
            resolved = await resolveChapterUrl(request.url)
            const directSrcId = findSource(new URL(request.url))?.manifest.id
            void recordAnalyticsEvent({
                event: "resolve_direct",
                ...(directSrcId ? { sourceId: directSrcId } : {}),
                ts: Date.now()
            })
        } catch (fetchError) {
            if (isBotBlocked(fetchError)) {
                const srcId = findSource(new URL(request.url))?.manifest.id
                void recordAnalyticsEvent({
                    event: "resolve_tab",
                    ...(srcId ? { sourceId: srcId } : {}),
                    ts: Date.now()
                })
                const html = await fetchChapterHtmlViaTab(request.url)
                resolved = await resolveChapterFromHtml(request.url, html)
                // Mine all episode links from the rendered viewer DOM and cache
                // them so the on-site panel's prev/next and mark-as-read work.
                // Awaited (not fire-and-forget): it's a local regex parse + bulkPut,
                // not a network call, and the reader calls loadSiblings right after
                // this handler returns - a race here would leave siblings empty.
                await mineAndCacheEpisodesFromHtml(
                    resolved.manga.manga.id,
                    resolved.manga.sourceId,
                    resolved.manga.sourceMangaId,
                    new URL(request.url).hostname,
                    html
                ).catch(() => {})
            } else {
                throw fetchError
            }
        }
        // Persist chapter so saveProgress can look up its sortKey for
        // lastReadChapterNumber, plus backfill coverUrl into the library entry if
        // missing - one transaction. The live publish is driven by MUTATION_SCOPES
        // (["chapters", "library"]) so the library scope also covers the backfill.
        await saveReaderResolvedChapter({
            chapter: resolved.chapter,
            mangaId: resolved.manga.manga.id,
            ...(resolved.manga.manga.coverUrl ? { coverUrl: resolved.manga.manga.coverUrl } : {})
        })
        return resolved
    },

    "chapter:siblings": async request => {
        // Look up cached chapters from DB - no network call needed.
        // auto-capture already stored chapters when the user first visited.
        const chRecord = await db.chapters.where("url").equals(request.url).first()
        if (!chRecord) return { prevUrl: null, nextUrl: null, mangaTitle: null, chapterTitle: null }
        const manga = await db.manga.get(chRecord.mangaId)
        if (!manga) return { prevUrl: null, nextUrl: null, mangaTitle: null, chapterTitle: null }
        const siblings = await db.chapters.where("mangaId").equals(chRecord.mangaId).sortBy("sortKey")
        const idx = siblings.findIndex(c => c.url === request.url)
        const prev = idx > 0 ? siblings[idx - 1] : null
        const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
        return {
            prevUrl: prev?.url ?? null,
            nextUrl: next?.url ?? null,
            mangaTitle: manga.title,
            chapterTitle: chRecord.title ?? null
        }
    },

    "reader:chapters": async request => {
        const fromCache = async () => {
            const cached = await db.chapters.where("mangaId").equals(request.mangaId).sortBy("sortKey")
            return cached.map(c => ({ url: c.url, sortKey: c.sortKey, title: c.title }))
        }

        const source = getSourceById(request.sourceId)
        if (source?.getChapterListUrl) {
            // JS-rendered list page (e.g. Webtoons) - a plain SW fetch is known to
            // return a partial/empty list, so check the DB cache first instead of
            // attempting a fetch we already know will fail.
            const cached = await fromCache()
            if (cached.length > 0) {
                // Already have something to show - refresh in the background without
                // blocking this response (picks up newly published episodes, and keeps
                // paginating for the true total on a long-running series).
                scheduleChapterListRefresh(source, request.sourceMangaId, request.mangaUrl, request.mangaId)
                return cached
            }
            // Nothing cached yet - this is the very first time this title's chapter
            // list has ever been requested. Firing scheduleChapterListRefresh here and
            // returning the (empty) cache immediately would race it: reader:resolve's
            // own viewer-page mining only sees whatever handful of nearby episodes
            // Webtoons' viewer dropdown happens to have rendered, which is often too
            // few to populate the cache, so the response would come back empty and the
            // reader would show no prev/next controls on a title's first-ever open.
            // Await the tab-rendered list-page refresh (joins the same in-flight
            // refresh if one is already running, e.g. from auto-capture) so the first
            // response reflects real data instead of racing it.
            await ensureChapterListRefreshed(source, request.sourceMangaId, request.mangaUrl, request.mangaId)
            const refreshed = await fromCache()
            if (refreshed.length > 0) return refreshed
        }

        try {
            const chapters = await listChaptersBySource(request.sourceId, request.sourceMangaId, request.mangaUrl)
            // A list that's just the 2-3 paginate prev/next links isn't useful - fall
            // back to whatever's cached rather than showing a broken nav with 1-2 items.
            if (chapters.length <= 2) return await fromCache()
            await putChapters(chapters)
            publishLive(["chapters"], [request.mangaId])
            return chapters
                .map(c => ({ url: c.url, sortKey: c.sortKey, title: c.title }))
                .sort((a, b) => a.sortKey - b.sortKey)
        } catch {
            // Source can't list chapters over the network (e.g. mgeko, or bot-blocked
            // mid-session) - fall back to whatever's cached rather than no nav at all.
            return await fromCache()
        }
    },

    "reader:progress:get": async request => {
        return (await db.progress.get(request.chapterId)) ?? null
    },

    "reader:progress": async request => {
        const progress: ReadingProgress = {
            mangaId: request.mangaId,
            chapterId: request.chapterId,
            pageIndex: request.pageIndex,
            pageCount: request.pageCount,
            completed: request.completed,
            updatedAt: Date.now()
        }
        await saveProgress(progress)
        return progress
    },

    "chapter:track": async request => {
        const parsedUrl = new URL(request.url)
        const source = findSource(parsedUrl)
        if (!source || source.match(parsedUrl) !== "chapter") {
            return { supported: false as const }
        }
        void recordAnalyticsEvent({
            event: "on_site_track",
            sourceId: source.manifest.id,
            ts: Date.now()
        })
        const mangaInfo = source.parseMangaUrl?.(parsedUrl) ?? undefined
        const tracked = await trackExternalChapter({
            url: request.url,
            sourceId: source.manifest.id,
            ...(mangaInfo ? { mangaInfo } : {})
        })
        // No chapter-list refresh on a title that already has one. Marking a chapter read
        // must never re-open a tab crawl: on a getChapterListUrl source (Webtoons) that
        // crawl opens up to 20 background tabs, and "Mark read" was doing it on every
        // click. For an already-populated title the list is kept fresh by the page's own
        // auto-capture and, if the reader is open, by its loadSiblings subscriber - both
        // cooldown-gated.
        //
        // But a title being tracked for the FIRST time may have no other populate path at
        // all: auto-capture bails before scheduling anything when the user has auto-add
        // off, and the on-page panel's prev/next comes from a plain DB read that never
        // triggers a crawl. Schedule the populate exactly once - when THIS track created
        // the manga record. A count-based heuristic can't tell "not yet populated" from "a
        // real oneshot with one chapter", so it re-crawled a oneshot on every revisit; the
        // creation flag is unambiguous and fires only on the genuine first track.
        if (mangaInfo && tracked.created) {
            scheduleChapterListRefresh(source, mangaInfo.sourceMangaId, mangaInfo.mangaUrl, tracked.mangaId)
        }
        return { supported: true as const, ...tracked }
    },

    "chapter:open-in-reader": async request => {
        const srcId = findSource(new URL(request.url))?.manifest.id
        void recordAnalyticsEvent({
            event: "reader_opened",
            ...(srcId ? { sourceId: srcId } : {}),
            ts: Date.now()
        })
        void captureChapter(request.url).catch(() => {})
        const readerUrl = browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(request.url)}`)
        await browser.tabs.create({ url: readerUrl })
        return null
    }
}
