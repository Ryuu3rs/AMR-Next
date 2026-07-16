import "fake-indexeddb/auto"
import type { ChapterRecord } from "@amr/contracts"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db, type LibraryManga } from "../database"

const fetchChapterHtmlViaTabMock = vi.fn()
vi.mock("./tab-fetch", () => ({
    fetchChapterHtmlViaTab: (...args: unknown[]) => fetchChapterHtmlViaTabMock(...args)
}))

const { mineAndCacheEpisodesFromHtml, listChaptersWithTabFallback, ensureChapterListRefreshed } =
    await import("./chapter-cache")

const SOURCE_ID = "webtoons"
const SOURCE_MANGA_ID = "99"
const MANGA_ID = `${SOURCE_ID}:manga:${SOURCE_MANGA_ID}`
const HOSTNAME = "www.webtoons.com"
const MANGA_URL = `https://${HOSTNAME}/en/fantasy/slug/`
const LIST_URL = `https://${HOSTNAME}/en/fantasy/slug/list?title_no=${SOURCE_MANGA_ID}`

const manga: LibraryManga = {
    id: MANGA_ID,
    title: "Test Series",
    normalizedTitle: "test series",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1,
    sourceId: SOURCE_ID,
    sourceUrl: `https://${HOSTNAME}/en/fantasy/slug/`,
    sourceMangaId: SOURCE_MANGA_ID,
    mangaUrl: `https://${HOSTNAME}/en/fantasy/slug/`
}

function link(titleNo: string, epNo: number): string {
    return `href="/en/fantasy/slug/ep-${epNo}/viewer?title_no=${titleNo}&episode_no=${epNo}"`
}

beforeEach(async () => {
    await Promise.all([db.manga.clear(), db.chapters.clear()])
})

describe("mineAndCacheEpisodesFromHtml", () => {
    it("rejects episode links whose title_no does not match the mined manga (Recommended for you pollution guard)", async () => {
        await db.manga.put(manga)
        const html = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
                ${link(SOURCE_MANGA_ID, 3)}
                <div class="recommend">
                    ${link("777", 5)}
                    ${link("888", 12)}
                </div>
            </div>
        `

        const stored = await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, html)

        expect(stored).toBe(3)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(3)
        expect(chapters.every(c => c.id.startsWith(`${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:`))).toBe(true)
        expect(chapters.map(c => c.sortKey).sort((a, b) => a - b)).toEqual([1, 2, 3])
    })

    it("self-heals by deleting stale chapter rows embedding a different sourceMangaId", async () => {
        await db.manga.put(manga)
        // Pre-seed a stale row simulating pre-fix pollution: stored under MANGA_ID but
        // whose id embeds a different sourceMangaId ("777").
        const staleChapter: ChapterRecord = {
            id: `${SOURCE_ID}:chapter:777:5`,
            mangaId: MANGA_ID,
            sourceId: SOURCE_ID,
            title: "Episode 5",
            url: `https://${HOSTNAME}/en/fantasy/slug/ep-5/viewer?title_no=777&episode_no=5`,
            sortKey: 5
        }
        await db.chapters.put(staleChapter)

        const cleanHtml = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
                ${link(SOURCE_MANGA_ID, 3)}
            </div>
        `

        await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, cleanHtml)

        expect(await db.chapters.get(staleChapter.id)).toBeUndefined()
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters.every(c => c.id.startsWith(`${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:`))).toBe(true)
    })

    it("returns 0 and stores nothing when the HTML has 2 or fewer matching links (pagination-only guard)", async () => {
        await db.manga.put(manga)
        const html = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
            </div>
        `

        const stored = await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, html)

        expect(stored).toBe(0)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(0)
    })
})

// A fake source matching the subset of findSource()'s return value that
// listChaptersWithTabFallback/ensureChapterListRefreshed actually touch.
function fakeSource(getChapterListUrl: (sourceMangaId: string, mangaUrl: string) => string | null) {
    return { manifest: { id: SOURCE_ID }, getChapterListUrl } as unknown as Parameters<
        typeof ensureChapterListRefreshed
    >[0]
}

function pageHtml(epNos: number[], nextPage: number | null): string {
    const links = epNos.map(n => link(SOURCE_MANGA_ID, n)).join("\n")
    const nextLink = nextPage !== null ? `<a href="?title_no=${SOURCE_MANGA_ID}&page=${nextPage}">Next</a>` : ""
    return `<div>${links}${nextLink}</div>`
}

describe("listChaptersWithTabFallback pagination (Webtoons-style JS-rendered list pages)", () => {
    beforeEach(() => {
        fetchChapterHtmlViaTabMock.mockReset()
    })

    it("follows pagination across multiple pages and merges the full episode range", async () => {
        await db.manga.put(manga)
        fetchChapterHtmlViaTabMock
            .mockResolvedValueOnce(pageHtml([15, 14, 13, 12, 11], 2))
            .mockResolvedValueOnce(pageHtml([10, 9, 8, 7, 6], 3))
            .mockResolvedValueOnce(pageHtml([5, 4, 3, 2, 1], null))

        const source = fakeSource(() => LIST_URL)
        await listChaptersWithTabFallback(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalledTimes(3)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters.map(c => c.sortKey).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
    })

    it("stops as soon as a page adds nothing new, without fetching further pages", async () => {
        await db.manga.put(manga)
        fetchChapterHtmlViaTabMock
            .mockResolvedValueOnce(pageHtml([5, 4, 3, 2, 1], 2))
            // Page 2 only has the 2-link pagination noise mineAndCacheEpisodesFromHtml
            // ignores - simulates running past the last real page.
            .mockResolvedValueOnce(pageHtml([1, 2], null))

        const source = fakeSource(() => LIST_URL)
        await listChaptersWithTabFallback(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalledTimes(2)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(5)
    })

    it("stops once a page's own pagination control stops advertising a next page", async () => {
        await db.manga.put(manga)
        fetchChapterHtmlViaTabMock.mockResolvedValueOnce(pageHtml([3, 2, 1], null))

        const source = fakeSource(() => LIST_URL)
        await listChaptersWithTabFallback(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalledTimes(1)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(3)
    })

    it("requests page N via a &page=N query param on every page after the first", async () => {
        await db.manga.put(manga)
        fetchChapterHtmlViaTabMock
            .mockResolvedValueOnce(pageHtml([10, 9, 8, 7, 6], 2))
            .mockResolvedValueOnce(pageHtml([5, 4, 3, 2, 1], null))

        const source = fakeSource(() => LIST_URL)
        await listChaptersWithTabFallback(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        expect(fetchChapterHtmlViaTabMock).toHaveBeenNthCalledWith(1, LIST_URL)
        expect(fetchChapterHtmlViaTabMock).toHaveBeenNthCalledWith(2, `${LIST_URL}&page=2`)
    })
})

describe("ensureChapterListRefreshed", () => {
    beforeEach(() => {
        fetchChapterHtmlViaTabMock.mockReset()
    })

    it("joins an in-flight refresh instead of starting a second one for the same manga", async () => {
        await db.manga.put(manga)
        let resolveFirst!: (html: string) => void
        fetchChapterHtmlViaTabMock.mockImplementationOnce(
            () =>
                new Promise<string>(resolve => {
                    resolveFirst = resolve
                })
        )

        const source = fakeSource(() => LIST_URL)
        const first = ensureChapterListRefreshed(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)
        const second = ensureChapterListRefreshed(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        resolveFirst(pageHtml([3, 2, 1], null))
        await Promise.all([first, second])

        expect(fetchChapterHtmlViaTabMock).toHaveBeenCalledTimes(1)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(3)
    })

    it("resolves once the cache reflects the mined episodes (awaitable, unlike scheduleChapterListRefresh)", async () => {
        await db.manga.put(manga)
        fetchChapterHtmlViaTabMock.mockResolvedValueOnce(pageHtml([3, 2, 1], null))

        const source = fakeSource(() => LIST_URL)
        await ensureChapterListRefreshed(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)

        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(3)
    })

    it("never rejects, even when the underlying fetch throws", async () => {
        fetchChapterHtmlViaTabMock.mockRejectedValueOnce(new Error("tab load timed out"))
        const source = fakeSource(() => LIST_URL)

        await expect(ensureChapterListRefreshed(source, SOURCE_MANGA_ID, MANGA_URL, MANGA_ID)).resolves.toBeUndefined()
    })
})
