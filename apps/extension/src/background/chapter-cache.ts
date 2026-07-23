import type { ChapterRecord } from "@amr/contracts"
import { latestNumberedChapter } from "@amr/source-sdk"
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

// Fire-and-forget freshness refreshes are cheap for SW-fetch sources but expensive
// for tab-crawl sources (Webtoons: up to 20 real background tab loads, ~25s each).
// Gate them behind a per-manga cooldown so a burst of Prev/Next clicks or rapid
// captures doesn't re-run the crawl back-to-back. Module-scope on purpose: an MV3
// SW restart wiping this map just means at most one extra refresh per SW lifetime,
// which is acceptable - persisting it to storage would add an async read to every
// call for no real benefit. ensureChapterListRefreshed callers are NOT gated (they
// explicitly need the refresh to run and await it).
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000
// A crawl that cached nothing (tab-load timeout, challenge interstitial, unminable
// list) holds only this much cooldown instead of the full window, so the reader's
// next open can retry rather than showing no prev/next nav for 10 minutes - while a
// rapid burst of triggers is still gated enough to prevent the tab storm.
const FAILED_REFRESH_RETRY_MS = 60 * 1000
const lastRefreshStartedAt = new Map<string, number>()

// Site-wide sequential id floor for MangaHub's "alternate version" id-slug chapter
// anchors - see INTERNAL_ID_MIN in packages/sources/src/mangahub.ts (that package only
// exposes a single entrypoint, so this app-side copy mirrors the same threshold rather
// than importing it; keep the two in sync if it ever changes).
export const MANGAHUB_INTERNAL_ID_MIN = 100_000

// Delete MangaHub chapter rows left over from before extractChapters' dominant-slug/
// canonical-vs-id-slug dedupe fix - poisoned rows have a junk sortKey (a site-wide
// internal id, not a real chapter number) that's no longer present in a fresh
// chapter-list fetch. Mirrors the title_no self-heal in mineAndCacheEpisodesFromHtml
// above (Webtoons' equivalent stale-row purge), generalized for MangaHub. Call this
// from every path that persists a fresh MangaHub chapter list (checkUpdates and
// listChaptersWithTabFallback below) so the deletion logic never drifts between them.
export async function purgeStaleMangahubChapterRows(mangaId: string, freshChapterIds: Set<string>): Promise<void> {
    const stale = await db.chapters
        .where("mangaId")
        .equals(mangaId)
        .filter(c => c.sourceId === "mangahub" && c.sortKey >= MANGAHUB_INTERNAL_ID_MIN && !freshChapterIds.has(c.id))
        .toArray()
    if (stale.length > 0) await db.chapters.bulkDelete(stale.map(c => c.id))
}

// Test-only: clear cooldown state so tests aren't order-dependent on module-scope
// state leaking between test cases.
export function _resetRefreshCooldownForTests(): void {
    lastRefreshStartedAt.clear()
}

// Start (or join) a chapter-list refresh, returning a promise that resolves once the
// cache reflects the result (success or failure - this never rejects). Use this
// instead of calling listChaptersWithTabFallback directly - it dedupes concurrent
// calls for the same manga, joins an in-flight one, and (like
// scheduleChapterListRefresh) skips starting a fresh crawl if one already ran within
// REFRESH_COOLDOWN_MS. The cooldown gate matters because reader:chapters calls this on
// a cache miss, and the reader re-runs that on every ["chapters"] live event: without
// the gate, a Webtoons title whose crawl mined nothing cacheable would reopen the
// up-to-20-tab tab-crawl on every event (mark-as-read, open-in-reader, a background
// update check). The first-ever open still crawls (no prior timestamp); only repeats
// inside the window are skipped, leaving siblings from whatever the last crawl cached.
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
    const last = lastRefreshStartedAt.get(mangaKey)
    if (last !== undefined && Date.now() - last < REFRESH_COOLDOWN_MS) return Promise.resolve()
    // Record the attempt start (not completion) so a slow or failed crawl still
    // resets the cooldown clock for this manga - a schedule()/ensure() call moments
    // later shouldn't redundantly re-crawl.
    lastRefreshStartedAt.set(mangaKey, Date.now())
    // Roll the cooldown back to a short retry window when the crawl cached nothing, so a
    // flaky first open isn't locked out of prev/next nav for the full cooldown. A crawl
    // that DID cache keeps the full window. Uses the crawl's own returned count (not a
    // post-hoc db read), and treats a thrown crawl the same as "cached nothing" so a
    // failure fails toward allowing a retry, never toward the full lockout.
    const shortenCooldownForRetry = (): void => {
        lastRefreshStartedAt.set(mangaKey, Date.now() - (REFRESH_COOLDOWN_MS - FAILED_REFRESH_RETRY_MS))
    }
    const promise = listChaptersWithTabFallback(source, sourceMangaId, mangaUrl, mangaId)
        .then(
            cachedCount => {
                if (cachedCount === 0) shortenCooldownForRetry()
            },
            () => {
                shortenCooldownForRetry()
            }
        )
        .finally(() => inFlightRefreshes.delete(mangaKey))
    inFlightRefreshes.set(mangaKey, promise)
    return promise
}

// Fire-and-forget: cache the full chapter list so the on-page panel can show
// prev/next siblings without a network round-trip on each visit. Call this instead
// of calling listChaptersWithTabFallback directly - it dedupes concurrent calls for
// the same manga, and skips the refresh entirely if one was started for this manga
// within the last REFRESH_COOLDOWN_MS (see comment above).
export function scheduleChapterListRefresh(
    source: ReturnType<typeof findSource>,
    sourceMangaId: string,
    mangaUrl: string,
    mangaId: string
): void {
    if (!source) return
    const mangaKey = `${source.manifest.id}:${sourceMangaId}`
    const last = lastRefreshStartedAt.get(mangaKey)
    if (last !== undefined && Date.now() - last < REFRESH_COOLDOWN_MS) return
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

    // SW can be killed between any two awaits, so the write + stale-row cleanup +
    // latest-chapter update must land together - otherwise a mid-sequence restart
    // leaves stale cross-series chapter rows undeleted and/or manga.latestChapterNumber/
    // latestChapterId stuck pointing at a stale episode.
    let changed = false
    await db.transaction("rw", db.chapters, db.manga, async () => {
        const validIdPrefix = `${sourceId}:chapter:${sourceMangaId}:`
        const existingIds = new Set((await db.chapters.where("mangaId").equals(mangaId).primaryKeys()) as string[])
        await db.chapters.bulkPut(dbChapters)
        const addedNew = dbChapters.some(c => !existingIds.has(c.id))

        // Self-heal: delete any chapter rows under this mangaId left over from before the
        // title_no filter above existed - those were mined from "Recommended for you"
        // links and have an id embedding a DIFFERENT sourceMangaId, so this prefix check
        // reliably identifies them without re-parsing every stored URL.
        const stale = await db.chapters
            .where("mangaId")
            .equals(mangaId)
            .filter(c => !c.id.startsWith(validIdPrefix))
            .toArray()
        if (stale.length > 0) await db.chapters.bulkDelete(stale.map(c => c.id))

        const maxEpNo = Math.max(...epLinks.map(e => e.epNo))
        const existing = await db.manga.get(mangaId)
        let latestChanged = false
        if (existing && maxEpNo > (existing.latestChapterNumber ?? -1)) {
            await db.manga.update(mangaId, {
                latestChapterNumber: maxEpNo,
                latestChapterId: `${sourceId}:chapter:${sourceMangaId}:${maxEpNo}`
            })
            latestChanged = true
        }
        changed = addedNew || stale.length > 0 || latestChanged
    })
    // Only announce a real change. A no-op re-mine of an already-cached list must not
    // emit a live event: the reader re-runs loadSiblings on every ["chapters"] event,
    // and an unconditional publish here fed a tab-crawl -> publish -> loadSiblings loop
    // that reopened a background source tab endlessly (Webtoons' tab-list path).
    if (changed) publishLive(["chapters"], [mangaId])

    return epLinks.length
}

// Fetch and cache the full chapter list for a manga.
// If the source provides getChapterListUrl (signals JS-rendered list page), tab-inject
// that URL directly - SW fetch would return a partial/empty list.
// Otherwise use the standard SW-fetch path and update the stored chapter count.
// Returns how many chapters this crawl mined/cached (0 when it produced nothing) so
// the caller can decide the cooldown without a post-hoc db.chapters count() - that
// re-count was unscoped and raced concurrent writers/deleters (remove/merge/relink)
// of the same mangaId, and could read the wrong result either direction.
export async function listChaptersWithTabFallback(
    source: ReturnType<typeof findSource>,
    sourceMangaId: string,
    mangaUrl: string,
    mangaId: string
): Promise<number> {
    const listUrl = source?.getChapterListUrl?.(sourceMangaId, mangaUrl) ?? null

    if (listUrl) {
        let totalCached = 0
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
            totalCached += added
            // Webtoons uses &amp; in href attributes, so check for the raw number only.
            const hasNext = new RegExp(`page=${page + 1}(?:\\D|$)`).test(html)
            if (!hasNext) break
        }
        return totalCached
    }

    // Standard path: SW-fetch the chapter list then persist + update latest count.
    const chapters = await listChaptersBySource(source!.manifest.id, sourceMangaId, mangaUrl)
    if (chapters.length === 0) return 0
    // Same bulkPut + stale-purge + latest-count write sequence as checkUpdates in
    // updates-sources.ts - wrapped in one transaction there for the same SW-restart
    // reason, so this sibling call site needs it too.
    let changed = false
    await db.transaction("rw", db.chapters, db.manga, async () => {
        const existingIds = new Set((await db.chapters.where("mangaId").equals(mangaId).primaryKeys()) as string[])
        await db.chapters.bulkPut(chapters)
        let addedNew = chapters.some(c => !existingIds.has(c.id))
        if (source!.manifest.id === "mangahub") {
            const before = existingIds.size
            await purgeStaleMangahubChapterRows(mangaId, new Set(chapters.map(c => c.id)))
            if (!addedNew) {
                const after = await db.chapters.where("mangaId").equals(mangaId).count()
                addedNew = after !== before
            }
        }
        // latestNumberedChapter filters to a finite sortKey before comparing - a plain
        // Math.max over every fetched sortKey let a single unnumbered chapter
        // (sortKey: UNNUMBERED_SORT_KEY / Infinity) beat any real chapter number and
        // get persisted as latestChapterNumber, which IndexedDB keeps but backup
        // export turns into null and import validation then rejects outright. When
        // nothing fetched is numbered, skip the write entirely rather than falling
        // back to an unnumbered chapter.
        const latestChapter = latestNumberedChapter(chapters)
        const existing = await db.manga.get(mangaId)
        let latestChanged = false
        if (existing && latestChapter && latestChapter.sortKey > (existing.latestChapterNumber ?? -1)) {
            await db.manga.update(mangaId, {
                latestChapterNumber: latestChapter.sortKey,
                latestChapterId: latestChapter.id
            })
            latestChanged = true
        }
        changed = addedNew || latestChanged
    })
    // See mineAndCacheEpisodesFromHtml: a no-op re-fetch must not emit a live event,
    // or the reader's loadSiblings subscriber re-drives this crawl in a loop.
    if (changed) publishLive(["chapters"], [mangaId])
    return chapters.length
}
