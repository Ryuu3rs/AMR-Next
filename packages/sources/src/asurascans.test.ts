import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { asuraScansAdapter } from "./asurascans"
import {
    BASE_MANGA_PATH,
    BASE_SLUG,
    CHAPTER_NUM,
    CHAPTER_URL,
    chapterHtml,
    LIVE_SLUG,
    MANGA_PATH,
    MANGA_URL,
    mangaHtml,
    PAGE_URLS,
    SEARCH_PATH,
    SEARCH_QUERY,
    searchHtml,
    STALE_HEX_SLUG,
    STALE_LEGACY_SLUG
} from "./__fixtures__/asurascans"

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
            allowedOrigins: ["https://asurascans.com"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

function makeMangaStub(sourceMangaId: string) {
    return {
        manga: {
            id: `asurascans:manga:${sourceMangaId}`,
            title: "Test",
            normalizedTitle: "test",
            authors: [],
            status: "unknown" as const,
            addedAt: 0,
            updatedAt: 0
        },
        sourceId: "asurascans",
        sourceMangaId,
        url: MANGA_URL
    }
}

describe("asuraScansAdapter.match", () => {
    it("classifies chapter, series, and foreign URLs", () => {
        expect(asuraScansAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(asuraScansAdapter.match(new URL(MANGA_URL))).toBe("manga")
        expect(asuraScansAdapter.match(new URL(`https://asurascans.com/comics/${BASE_SLUG}`))).toBe("manga")
        expect(asuraScansAdapter.match(new URL("https://not-asura.net/comics/x/"))).toBe("none")
    })
})

describe("asuraScansAdapter.listChapters", () => {
    it("parses the chapter list, keeps decimals, sorts ascending", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtml }, requests)
        const manga = makeMangaStub(LIVE_SLUG)

        const chapters = await asuraScansAdapter.listChapters({ manga, limit: 500 }, context)

        expect(chapters.map(c => c.sortKey)).toEqual([1, 156, 156.5, 157])
        const latest = chapters.at(-1)!
        expect(latest.title).toBe("Chapter 157")
        expect(latest.url).toBe(`https://asurascans.com/comics/${LIVE_SLUG}/chapter/157`)
        expect(latest.sourceChapterId).toBe(`${LIVE_SLUG}/157`)
        expect(requests).toEqual([`GET https://asurascans.com${MANGA_PATH}`])
    })

    it("self-heals a stale hex-hash slug by retrying the base slug and reading the live hash", async () => {
        const requests: string[] = []
        const context = createContext({ [BASE_MANGA_PATH]: mangaHtml }, requests)
        const manga = makeMangaStub(STALE_HEX_SLUG)

        const chapters = await asuraScansAdapter.listChapters({ manga, limit: 500 }, context)

        expect(chapters).toHaveLength(4)
        // URLs point at the live slug from the page...
        expect(chapters.at(-1)!.url).toBe(`https://asurascans.com/comics/${LIVE_SLUG}/chapter/157`)
        // ...while ids stay keyed to the stored slug so update-check still matches.
        expect(chapters.at(-1)!.mangaId).toBe(`asurascans:manga:${STALE_HEX_SLUG}`)
        expect(chapters.at(-1)!.id).toBe(`asurascans:chapter:${STALE_HEX_SLUG}-chapter-157`)
        expect(requests).toEqual([
            `GET https://asurascans.com/comics/${STALE_HEX_SLUG}/`,
            `GET https://asurascans.com${BASE_MANGA_PATH}`
        ])
    })

    it("self-heals a legacy numeric-prefix slug (asuracomic.net era)", async () => {
        const requests: string[] = []
        const context = createContext({ [BASE_MANGA_PATH]: mangaHtml }, requests)
        const manga = makeMangaStub(STALE_LEGACY_SLUG)

        const chapters = await asuraScansAdapter.listChapters({ manga, limit: 500 }, context)

        expect(chapters).toHaveLength(4)
        expect(chapters.at(-1)!.url).toBe(`https://asurascans.com/comics/${LIVE_SLUG}/chapter/157`)
        expect(chapters.at(-1)!.mangaId).toBe(`asurascans:manga:${STALE_LEGACY_SLUG}`)
    })

    it("throws when the base slug also 404s (series genuinely gone)", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)
        const manga = makeMangaStub(STALE_HEX_SLUG)

        await expect(asuraScansAdapter.listChapters({ manga, limit: 500 }, context)).rejects.toMatchObject({
            status: 404
        })
    })
})

describe("asuraScansAdapter.search", () => {
    it("parses series cards from the browse page", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH]: searchHtml }, requests)

        const results = await asuraScansAdapter.search!(SEARCH_QUERY, context)

        expect(results).toHaveLength(2)
        expect(results[0]!.sourceMangaId).toBe(LIVE_SLUG)
        expect(results[0]!.title).toBe("Dungeon Odyssey")
        expect(results[0]!.url).toBe(`https://asurascans.com/comics/${LIVE_SLUG}/`)
        expect(requests[0]!).toContain(`${SEARCH_PATH}?q=${SEARCH_QUERY}`)
    })
})

describe("asuraScansAdapter.resolveChapter", () => {
    it("extracts page URLs from the RSC flight payload", async () => {
        const requests: string[] = []
        const context = createContext({ [`/comics/${LIVE_SLUG}/chapter/${CHAPTER_NUM}`]: chapterHtml }, requests)

        const result = await asuraScansAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.pages.map(p => p.url)).toEqual(PAGE_URLS)
        expect(result.chapter.title).toBe(`Chapter ${CHAPTER_NUM}`)
        expect(result.chapter.sortKey).toBe(157)
        expect(result.chapter.url).toBe(CHAPTER_URL)
        expect(result.manga.sourceMangaId).toBe(LIVE_SLUG)
    })

    it("stores the clean series title, not the chapter-page title, and returns a resolvable chapter", async () => {
        const requests: string[] = []
        const context = createContext({ [`/comics/${LIVE_SLUG}/chapter/${CHAPTER_NUM}`]: chapterHtml }, requests)

        const result = await asuraScansAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.manga.manga.title).toBe("Dungeon Odyssey")
        expect(result.manga.manga.title).not.toMatch(/chapter/i)
        expect(result.manga.manga.normalizedTitle).toBe("dungeon odyssey")
        expect(result.manga.sourceMangaId).toBe(LIVE_SLUG)
        expect(result.manga.url).toBe(MANGA_URL)
        expect(result.chapter.sortKey).toBe(157)
        expect(result.chapter.mangaId).toBe(result.manga.manga.id)
    })
})
