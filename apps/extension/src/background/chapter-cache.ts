import type { ChapterRecord } from "@amr/contracts"
import { db } from "../database"
import { findSource, listChaptersBySource } from "../sources"
import { fetchChapterHtmlViaTab } from "./tab-fetch"
import { publishLive } from "../live"

// Manga IDs currently having their chapter list refreshed, mapped to the in-flight
// refresh promise - dedupes concurrent calls for the same manga (e.g. capturing
// chapter 1 then chapter 2 in quick succession) AND lets a caller that actually
// needs the result (reader:chapters on a cache-miss) await the same in-flight work
// instead of racing it or starting a second, redundant tab-fetch. Private: the
// library group (library:relink), the reader/capture group (doCaptureChapter,
// chapter:track, reader:chapters) all share this dedup, so it's hidden behind
// scheduleChapterListRefresh/ensureChapterListRefreshed below rather than exported
// directly - no two groups touch the same mutable Map.
const inFlightRefreshes = new Map<string, Promise<void>>()

// Start (or join) a chapter-list refresh, returning a promise that resolves once the
// cache reflects the result (success or failure - this never rejects). Use this
// instead of calling listChaptersWithTabFallback directly - it dedupes concurrent
// calls for the same manga, and lets a caller that needs the data (unlike
// scheduleChapterListRefresh's fire-and-forget callers) wait for it.
export function ensureChapterListRefreshed(
    source: ReturnType<typeof findSource>,
    sourceMangaId: string,
    mangaUrl: string,
    mangaId: string
): Promise<void> {
    if (!source) return Promise.resolve()
    const mangaKey = `${source.manifest.id}:${sourceMangaId}`
    const existing = inFlightRefreshes.get(mangaKey)
    if (existing) return existing
    const promise = listChaptersWithTabFallback(source, sourceMangaId, mangaUrl, mangaId)
        .catch(() => {})
        .finally(() => inFlightRefreshes.delete(mangaKey))
    inFlightRefreshes.set(mangaKey, promise)
    return promise
}

// Fire-and-forget: cache the full chapter list so the on-page panel can show
// prev/next siblings without a network round-trip on each visit. Call this instead
// of calling listChaptersWithTabFallback directly - it dedupes concurrent calls for
// the same manga.
export function scheduleChapterListRefresh(
    source: ReturnType<typeof findSource>,
    sourceMangaId: string,
    mangaUrl: string,
    mangaId: string
): void {
    void ensureChapterListRefreshed(source, sourceMangaId, mangaUrl, mangaId)
}

// Mine episode_no-style links from HTML and persist them as ChapterRecords.
// Works for both tab-injected viewer HTML (which has all episodes in the dropdown)
// and tab-injected list page HTML (which has the full paginated episode list).
// The `viewer?...episode_no=N&title_no=M` URL shape and the title_no match-check below
// are Webtoons-specific - this is only wired up for sources that implement
// getChapterListUrl, which today is Webtoons alone. A future source using this path
// with a different URL scheme would need its own title-match guard here.
// Returns the number of new episodes stored (0 = nothing useful found).
export async function mineAndCacheEpisodesFromHtml(
    mangaId: string,
    sourceId: string,
    sourceMangaId: string,
    hostname: string,
    html: string
): Promise<number> {
    const epLinks: Array<{ url: string; epNo: number }> = []
    const seen = new Set<number>()

    for (const m of html.matchAll(/href="([^"]*\bviewer\?[^"]*\bepisode_no=(\d+)[^"]*)"/gi)) {
        const rawHref = m[1] ?? ""
        const epNo = Number(m[2] ?? "")
        if (!rawHref || !Number.isFinite(epNo) || epNo < 1 || seen.has(epNo)) continue
        const decoded = rawHref.replace(/&amp;/g, "&")
        const epUrl = decoded.startsWith("http") ? decoded : `https://${hostname}${decoded}`
        // Viewer pages show "Recommended for you" widgets linking to OTHER series'
        // episodes, which also match this href pattern - only accept links whose
        // title_no matches the manga we're mining for, or every mined chapter list
        // gets polluted with wrong-series episodes (breaks Prev/Next entirely).
        let linkTitleNo: string | null
        try {
            linkTitleNo = new URL(epUrl).searchParams.get("title_no")
        } catch {
            continue
        }
        if (linkTitleNo !== sourceMangaId) continue
        seen.add(epNo)
        epLinks.push({ url: epUrl, epNo })
    }

    // Ignore if we only got the 2-3 paginate prev/next links present in SSR HTML.
    if (epLinks.length <= 2) return 0

    const dbChapters: ChapterRecord[] = epLinks.map(({ url, epNo }) => ({
        id: `${sourceId}:chapter:${sourceMangaId}:${epNo}`,
        mangaId,
        sourceId,
        title: `Episode ${epNo}`,
        url,
        sortKey: epNo,
        language: "en"
    }))

    await db.chapters.bulkPut(dbChapters)
    publishLive(["chapters"], [mangaId])

    // Self-heal: delete any chapter rows under this mangaId left over from before the
    // title_no filter above existed - those were mined from "Recommended for you"
    // links and have an id embedding a DIFFERENT sourceMangaId, so this prefix check
    // reliably identifies them without re-parsing every stored URL.
    const validIdPrefix = `${sourceId}:chapter:${sourceMangaId}:`
    const stale = await db.chapters
        .where("mangaId")
        .equals(mangaId)
        .filter(c => !c.id.startsWith(validIdPrefix))
        .toArray()
    if (stale.length > 0) await db.chapters.bulkDelete(stale.map(c => c.id))

    const maxEpNo = Math.max(...epLinks.map(e => e.epNo))
    const existing = await db.manga.get(mangaId)
    if (existing && maxEpNo > (existing.latestChapterNumber ?? 0)) {
        await db.manga.update(mangaId, {
            latestChapterNumber: maxEpNo,
            latestChapterId: `${sourceId}:chapter:${sourceMangaId}:${maxEpNo}`
        })
    }

    return epLinks.length
}

// Fetch and cache the full chapter list for a manga.
// If the source provides getChapterListUrl (signals JS-rendered list page), tab-inject
// that URL directly - SW fetch would return a partial/empty list.
// Otherwise use the standard SW-fetch path and update the stored chapter count.
export async function listChaptersWithTabFallback(
    source: ReturnType<typeof findSource>,
    sourceMangaId: string,
    mangaUrl: string,
    mangaId: string
): Promise<void> {
    const listUrl = source?.getChapterListUrl?.(sourceMangaId, mangaUrl) ?? null

    if (listUrl) {
        // Tab injection: gets the fully-rendered DOM so we can mine all episode links.
        // The standalone list page paginates (Webtoons: &page=N, newest page first) -
        // page 1 alone badly undercounts long-running series (100+ episodes: page 1
        // only has the newest handful), so follow pagination up to a cap. Stop as
        // soon as a page adds nothing new, or its own pagination control stops
        // advertising a next page - mirrors the equivalent SW-fetch pagination loop
        // in webtoons.ts's own listChapters().
        const MAX_PAGES = 20
        for (let page = 1; page <= MAX_PAGES; page++) {
            const pageUrl = new URL(listUrl)
            if (page > 1) pageUrl.searchParams.set("page", String(page))
            const html = await fetchChapterHtmlViaTab(pageUrl.toString())
            const added = await mineAndCacheEpisodesFromHtml(
                mangaId,
                source!.manifest.id,
                sourceMangaId,
                pageUrl.hostname,
                html
            )
            if (added === 0) break
            // Webtoons uses &amp; in href attributes, so check for the raw number only.
            const hasNext = new RegExp(`page=${page + 1}(?:\\D|$)`).test(html)
            if (!hasNext) break
        }
        return
    }

    // Standard path: SW-fetch the chapter list then persist + update latest count.
    const chapters = await listChaptersBySource(source!.manifest.id, sourceMangaId, mangaUrl)
    if (chapters.length === 0) return
    await db.chapters.bulkPut(chapters)
    publishLive(["chapters"], [mangaId])
    const maxSortKey = Math.max(...chapters.map(c => c.sortKey))
    const latestChapter = chapters.find(c => c.sortKey === maxSortKey)
    const existing = await db.manga.get(mangaId)
    if (existing && maxSortKey > (existing.latestChapterNumber ?? 0)) {
        await db.manga.update(mangaId, {
            latestChapterNumber: maxSortKey,
            ...(latestChapter?.id ? { latestChapterId: latestChapter.id } : {})
        })
    }
}
