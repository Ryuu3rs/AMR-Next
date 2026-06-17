import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    CHAPTER_PATH,
    CHAPTER_URL,
    CHAPTER_URL_COM,
    COVER_URL,
    MANGA_ID,
    MANGA_PATH,
    MANGA_URL,
    PAGE_URLS,
    SEARCH_PATH,
    chapterHtml,
    mangaHtml,
    searchHtml
} from "./__fixtures__/manganato"
import { manganatoAdapter } from "./manganato"

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[]): SourceContext {
    const fetch: FetchFunction = async (url, init) => {
        requests.push(`${init.method} ${url}`)
        const body = fixtures[new URL(url).pathname]
        return {
            ok: body !== undefined,
            status: body === undefined ? 404 : 200,
            text: async () => body ?? ""
        }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://chapmanganato.to", "https://manganato.com"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("manganatoAdapter.match", () => {
    it("classifies manga, chapter, multi-domain, and foreign URLs", () => {
        expect(manganatoAdapter.match(new URL(MANGA_URL))).toBe("manga")
        expect(manganatoAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(manganatoAdapter.match(new URL(CHAPTER_URL_COM))).toBe("chapter")
        expect(manganatoAdapter.match(new URL("https://manganato.com/manga-ps130464"))).toBe("manga")
        expect(manganatoAdapter.match(new URL("https://chapmanganelo.com/manga-ps130464/chapter-82"))).toBe("chapter")
        expect(manganatoAdapter.match(new URL("https://example.com/manga-ae977661"))).toBe("none")
        expect(manganatoAdapter.match(new URL("https://chapmanganato.to/"))).toBe("none")
    })
})

describe("manganatoAdapter.resolveChapter", () => {
    it("extracts page URLs from container-chapter-reader", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml }, requests)
        const result = await manganatoAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(PAGE_URLS)
        expect(result.chapter.title).toBe("Chapter 68")
        expect(result.chapter.sortKey).toBe(68)
        expect(result.chapter.sourceChapterId).toBe(`${MANGA_ID}:chapter-68`)
        expect(result.manga.manga.title).toBe("Solo Leveling")
        expect(result.manga.manga.coverUrl).toBe(COVER_URL)
    })

    it("normalizes a .com chapter URL to the .to request origin", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml }, requests)
        await manganatoAdapter.resolveChapter({ url: new URL(CHAPTER_URL_COM) }, context)
        expect(requests[0]).toBe(`GET https://chapmanganato.to${CHAPTER_PATH}`)
    })

    it("throws when no images found", async () => {
        const context = createContext({ [CHAPTER_PATH]: "<html><body>nope</body></html>" }, [])
        await expect(manganatoAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)).rejects.toMatchObject({
            code: "invalid-response"
        })
    })
})

describe("manganatoAdapter.listChapters", () => {
    it("extracts chapters sorted ascending", async () => {
        const context = createContext({ [MANGA_PATH]: mangaHtml }, [])
        const manga = await manganatoAdapter.resolveManga({ sourceMangaId: MANGA_ID }, context)
        const chapters = await manganatoAdapter.listChapters({ manga }, context)
        expect(chapters.map(c => c.sortKey)).toEqual([67, 68])
        expect(chapters[1].url).toBe(`https://chapmanganato.to/${MANGA_ID}/chapter-68`)
    })
})

describe("manganatoAdapter.search", () => {
    it("returns results from the search story endpoint", async () => {
        const context = createContext({ [SEARCH_PATH]: searchHtml }, [])
        const results = await manganatoAdapter.search("Solo Leveling", context)
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({ sourceMangaId: MANGA_ID, title: "Solo Leveling" })
    })
})

describe("manganatoAdapter.resolveCover", () => {
    it("returns og:image cover from manga page", async () => {
        const context = createContext({ [MANGA_PATH]: mangaHtml }, [])
        expect(await manganatoAdapter.resolveCover({ sourceMangaId: MANGA_ID }, context)).toBe(COVER_URL)
    })
})
