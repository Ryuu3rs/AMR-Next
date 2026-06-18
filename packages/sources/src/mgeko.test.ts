import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    CHAPTER_PATH,
    CHAPTER_SLUG,
    CHAPTER_URL,
    chapterHtml,
    COVER_URL,
    MANGA_PATH,
    MANGA_SLUG,
    MANGA_URL,
    mangaHtml,
    PAGE_URLS,
    SEARCH_PATH,
    SEARCH_QUERY,
    searchHtml
} from "./__fixtures__/mgeko"
import { mgekoAdapter } from "./mgeko"

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
            allowedOrigins: ["https://www.mgeko.cc"],
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
            id: `mgeko:manga:${sourceMangaId}`,
            title: "Test",
            normalizedTitle: "test",
            authors: [],
            status: "unknown" as const,
            addedAt: 0,
            updatedAt: 0
        },
        sourceId: "mgeko",
        sourceMangaId,
        url: MANGA_URL
    }
}

describe("mgekoAdapter.match", () => {
    it("classifies reader, comic, and foreign URLs", () => {
        expect(mgekoAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(mgekoAdapter.match(new URL("https://www.mgeko.cc/comic/some-comic/"))).toBe("manga")
        expect(mgekoAdapter.match(new URL("https://not-mgeko.cc/reader/en/x/"))).toBe("none")
    })
})

describe("mgekoAdapter.listChapters", () => {
    it("parses chapter list from manga page, sorted newest first", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtml }, requests)
        const manga = makeMangaStub(MANGA_SLUG)

        const chapters = await mgekoAdapter.listChapters({ manga, limit: 500 }, context)

        expect(chapters).toHaveLength(3)
        expect(chapters[0].sortKey).toBe(52)
        expect(chapters[0].title).toBe("Chapter 52")
        expect(chapters[0].url).toBe(`https://www.mgeko.cc/reader/en/${MANGA_SLUG}-chapter-52-eng-li/`)
        expect(chapters[2].sortKey).toBe(1)
        expect(requests).toEqual([`GET https://www.mgeko.cc${MANGA_PATH}`])
    })

    it("returns empty array when no matching chapter links found", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: "<html><body>no chapters</body></html>" }, requests)
        const manga = makeMangaStub(MANGA_SLUG)

        const chapters = await mgekoAdapter.listChapters({ manga, limit: 500 }, context)
        expect(chapters).toHaveLength(0)
    })
})

describe("mgekoAdapter.search", () => {
    it("returns results parsed from search page, skipping junk slugs", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH]: searchHtml }, requests)

        const results = await mgekoAdapter.search(SEARCH_QUERY, context)

        expect(results).toHaveLength(2)
        expect(results[0].sourceMangaId).toBe(MANGA_SLUG)
        expect(results[0].title).toBe("Barbarian's Adventure in a Fantasy World")
        expect(results[0].coverUrl).toBe(COVER_URL)
        expect(results[1].sourceMangaId).toBe("barbarian-quest")
        expect(requests[0]).toContain("?s=barbarian")
    })

    it("returns empty array for blank query", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)
        const results = await mgekoAdapter.search("   ", context)
        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })
})

describe("mgekoAdapter.resolveChapter", () => {
    it("extracts page URLs from the chapImages JS array", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml }, requests)

        const result = await mgekoAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.pages.map(p => p.url)).toEqual(PAGE_URLS)
        expect(result.chapter.title).toBe("Chapter 52")
        expect(result.chapter.sortKey).toBe(52)
        expect(result.chapter.sourceChapterId).toBe(CHAPTER_SLUG)
        expect(result.manga.manga.coverUrl).toBe(COVER_URL)
    })

    it("throws a descriptive error when no images are found", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: "<html><body>no images here</body></html>" }, requests)

        await expect(mgekoAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)).rejects.toMatchObject({
            code: "invalid-response"
        })
    })
})
