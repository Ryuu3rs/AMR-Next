import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    CHAPTER_HIGH_SLUGNUM_PATH,
    CHAPTER_HIGH_SLUGNUM_URL,
    CHAPTER_LIST_PATH,
    CHAPTER_LIST_SLUG,
    CHAPTER_LIST_URL,
    CHAPTER_LOW_SLUGNUM_PATH,
    CHAPTER_LOW_SLUGNUM_URL,
    CHAPTER_PATH,
    CHAPTER_URL,
    chapterListHtml,
    chapterListHtmlSwappedOrder,
    chapterPageHtml,
    chapterPageNoTitleNumberHtml,
    chapterPageRedirectedHtml,
    COVER_PATH,
    COVER_SLUG,
    COVER_URL,
    FOREIGN_SLUG,
    mangaDetailHtml,
    SEARCH_DECOY_SLUG,
    SEARCH_PATH_PAGE_1,
    SEARCH_PATH_PAGE_2,
    SEARCH_PATH_PAGE_3,
    SEARCH_QUERY,
    searchDecoyChapterNumberHtml,
    searchEmptyHtml,
    searchPage1Html,
    searchPage2Html
} from "./__fixtures__/mangahub"
import { mangahubAdapter } from "./mangahub"

function makeMangaStub(sourceMangaId: string, url: string) {
    return {
        manga: {
            id: `mangahub:manga:${sourceMangaId}`,
            title: "Test",
            normalizedTitle: "test",
            authors: [],
            status: "unknown" as const,
            addedAt: 0,
            updatedAt: 0
        },
        sourceId: "mangahub",
        sourceMangaId,
        url
    }
}

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[]): SourceContext {
    const fetch: FetchFunction = async (url, init) => {
        requests.push(`${init.method} ${url}`)
        const parsed = new URL(url)
        const body = fixtures[parsed.pathname]
        return {
            ok: body !== undefined,
            status: body === undefined ? 404 : 200,
            text: async () => body ?? ""
        }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://mangahub.io"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("mangahubAdapter.search", () => {
    it("fetches pages in order, dedupes across pages, and stops once a page is empty", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [SEARCH_PATH_PAGE_1]: searchPage1Html,
                [SEARCH_PATH_PAGE_2]: searchPage2Html,
                [SEARCH_PATH_PAGE_3]: searchEmptyHtml
            },
            requests
        )

        const results = await mangahubAdapter.search!(SEARCH_QUERY, context)

        // 2 unique results from page 1 + 1 new from page 2 (its repeat of
        // solo-leveling_105 is dropped by cross-page dedupe).
        expect(results.map(r => r.sourceMangaId)).toEqual([
            "solo-leveling_105",
            "solo-slime-s-ascension",
            "solo-max-level-newbie"
        ])

        // Trailing "Popular Manga Updates" slider markup after the last card
        // on page 1 must not leak into a result.
        expect(results.some(r => r.sourceMangaId === "unrelated-slider-item")).toBe(false)

        expect(results[0]).toMatchObject({
            sourceId: "mangahub",
            title: "Solo Leveling",
            url: "https://mangahub.io/manga/solo-leveling_105",
            coverUrl: "https://thumb.mghcdn.com/mh/solo-leveling.jpg",
            latestChapter: "200.5"
        })
        // Hex-entity decoding (&#x27;) in the heading text.
        expect(results[1]!.title).toBe("Solo Slime's Ascension")

        // All three pages are requested (page 3 comes back empty, ending the loop).
        expect(requests).toHaveLength(3)
        for (const [i, path] of [SEARCH_PATH_PAGE_1, SEARCH_PATH_PAGE_2, SEARCH_PATH_PAGE_3].entries()) {
            const url = new URL(requests[i]!.replace("GET ", ""))
            expect(url.pathname).toBe(path)
            expect(url.searchParams.get("q")).toBe(SEARCH_QUERY)
            expect(url.searchParams.get("order")).toBe("POPULAR")
            expect(url.searchParams.get("genre")).toBe("all")
        }
    })

    it("stops after the first page when it returns zero results", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH_PAGE_1]: searchEmptyHtml }, requests)

        const results = await mangahubAdapter.search!("zzzznonexistentquery9999", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(1)
    })

    it("returns empty array for a blank query without making requests", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const results = await mangahubAdapter.search!("   ", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })

    it("takes latestChapter from the chapter-link anchor, not a coincidental chapter-N elsewhere in the card", async () => {
        const requests: string[] = []
        const context = createContext(
            { [SEARCH_PATH_PAGE_1]: searchDecoyChapterNumberHtml, [SEARCH_PATH_PAGE_2]: searchEmptyHtml },
            requests
        )

        const results = await mangahubAdapter.search!("decoy", context)

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({ sourceMangaId: SEARCH_DECOY_SLUG, latestChapter: "52" })
    })
})

describe("mangahubAdapter.listChapters", () => {
    it("dedupes canonical + id-slug anchors by true chapter number and excludes foreign slider anchors", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_LIST_PATH]: chapterListHtml }, requests)
        const manga = makeMangaStub(CHAPTER_LIST_SLUG, CHAPTER_LIST_URL)

        const chapters = await mangahubAdapter.listChapters({ manga }, context)

        expect(chapters).toHaveLength(4)
        expect(chapters.map(c => c.sortKey)).toEqual([1, 2, 3, 4])
        // Every surviving sortKey is a real chapter number, never a site-wide internal id.
        for (const c of chapters) expect(c.sortKey).toBeLessThan(100_000)

        // ch2 and ch3 both had a canonical + id-slug duplicate (in opposite document
        // orders) - the canonical URL must win regardless of which came first.
        expect(chapters.find(c => c.sortKey === 1)!.url).toBe(
            `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-1`
        )
        expect(chapters.find(c => c.sortKey === 2)!.url).toBe(
            `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2`
        )
        expect(chapters.find(c => c.sortKey === 3)!.url).toBe(
            `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-3`
        )
        // ch4 only ever appeared as an id-slug anchor - falls back to that URL.
        expect(chapters.find(c => c.sortKey === 4)!.url).toBe(
            `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650004`
        )

        // Foreign "you might also like" slider anchors (different slug) must be
        // completely absent - none of their real chapter numbers (15, 16, 17) leaked in,
        // and nothing in the output references FOREIGN_SLUG.
        expect(chapters.some(c => c.sortKey === 15 || c.sortKey === 16 || c.sortKey === 17)).toBe(false)
        expect(chapters.some(c => c.url.includes(FOREIGN_SLUG))).toBe(false)
    })

    it("discards an id-slug anchor with no visible chapter number and an internal-id-range href", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_LIST_PATH]: chapterListHtml }, requests)
        const manga = makeMangaStub(CHAPTER_LIST_SLUG, CHAPTER_LIST_URL)

        const chapters = await mangahubAdapter.listChapters({ manga }, context)

        // chapter-2650099 (no visible "#N" text) never produces a chapter record.
        expect(chapters.some(c => c.url.includes("chapter-2650099"))).toBe(false)
    })

    it("produces the identical correct result regardless of canonical/id-slug anchor order", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_LIST_PATH]: chapterListHtml }, requests)
        const swappedContext = createContext({ [CHAPTER_LIST_PATH]: chapterListHtmlSwappedOrder }, requests)
        const manga = makeMangaStub(CHAPTER_LIST_SLUG, CHAPTER_LIST_URL)

        const chapters = await mangahubAdapter.listChapters({ manga }, context)
        const swappedChapters = await mangahubAdapter.listChapters({ manga }, swappedContext)

        expect(swappedChapters).toEqual(chapters)
    })
})

describe("mangahubAdapter.resolveChapter", () => {
    it("derives the chapter number from the page title for a normal canonical chapter", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterPageHtml }, requests)

        const result = await mangahubAdapter.resolveChapter!({ url: new URL(CHAPTER_URL) }, context)

        expect(result.chapter.sortKey).toBe(52)
        expect(result.chapter.title).toBe("Chapter 52")
    })

    it("falls back to the URL slug number when the title has no chapter number but the slug number is real", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_LOW_SLUGNUM_PATH]: chapterPageNoTitleNumberHtml }, requests)

        const result = await mangahubAdapter.resolveChapter!({ url: new URL(CHAPTER_LOW_SLUGNUM_URL) }, context)

        expect(result.chapter.sortKey).toBe(42)
    })

    it("throws instead of returning a chapter 0 record when neither the title nor a real slug number is available", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_HIGH_SLUGNUM_PATH]: chapterPageRedirectedHtml }, requests)

        await expect(
            mangahubAdapter.resolveChapter!({ url: new URL(CHAPTER_HIGH_SLUGNUM_URL) }, context)
        ).rejects.toMatchObject({ code: "invalid-response" })
    })
})

describe("mangahubAdapter.resolveCover", () => {
    it("fetches the manga detail page and returns the og:image cover URL", async () => {
        const requests: string[] = []
        const context = createContext({ [COVER_PATH]: mangaDetailHtml }, requests)

        const cover = await mangahubAdapter.resolveCover!({ sourceMangaId: COVER_SLUG }, context)

        expect(cover).toBe(COVER_URL)
        expect(requests).toHaveLength(1)
        expect(requests[0]).toBe(`GET https://mangahub.io${COVER_PATH}`)
    })

    it("returns undefined when the fetch fails", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const cover = await mangahubAdapter.resolveCover!({ sourceMangaId: "nonexistent-manga" }, context)

        expect(cover).toBeUndefined()
    })
})
