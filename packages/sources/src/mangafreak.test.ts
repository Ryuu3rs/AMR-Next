import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    BLIND_GUESS_COVER_URL,
    CHAPTER_NUM,
    CHAPTER_PATH,
    CHAPTER_URL,
    chapterHtml,
    MANGA_PATH,
    MANGA_SLUG,
    MANGA_URL,
    mangaHtml,
    mangaHtmlNoCoverMeta,
    ORIGIN,
    PAGE_URLS,
    REAL_COVER_URL,
    SEARCH_PATH,
    SEARCH_QUERY,
    searchHtml
} from "./__fixtures__/mangafreak"
import { mangafreakAdapter } from "./mangafreak"

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
            allowedOrigins: [ORIGIN],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("mangafreakAdapter.match", () => {
    it("classifies manga, chapter, and foreign URLs", () => {
        expect(mangafreakAdapter.match(new URL(MANGA_URL))).toBe("manga")
        expect(mangafreakAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(mangafreakAdapter.match(new URL("https://not-mangafreak.me/Manga/Foo"))).toBe("none")
    })
})

describe("mangafreakAdapter.resolveManga", () => {
    it("extracts the real cover from the manga page's og:image tag", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtml }, requests)

        const result = await mangafreakAdapter.resolveManga({ sourceMangaId: MANGA_SLUG }, context)

        expect(result.manga.coverUrl).toBe(REAL_COVER_URL)
        expect(result.manga.title).toBe("One Piece")
        expect(requests).toEqual([`GET ${MANGA_URL}`])
    })

    it("falls back to the blind CDN-path guess when no og:image/twitter:image tag is present", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtmlNoCoverMeta }, requests)

        const result = await mangafreakAdapter.resolveManga({ sourceMangaId: MANGA_SLUG }, context)

        expect(result.manga.coverUrl).toBe(BLIND_GUESS_COVER_URL)
    })

    it("falls back to the blind CDN-path guess when the manga page fetch fails", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const result = await mangafreakAdapter.resolveManga({ sourceMangaId: MANGA_SLUG }, context)

        expect(result.manga.coverUrl).toBe(BLIND_GUESS_COVER_URL)
    })
})

describe("mangafreakAdapter.resolveCover", () => {
    it("fetches the manga page and extracts the real cover end-to-end", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtml }, requests)

        const cover = await mangafreakAdapter.resolveCover!({ sourceMangaId: MANGA_SLUG }, context)

        expect(cover).toBe(REAL_COVER_URL)
        expect(requests).toEqual([`GET ${MANGA_URL}`])
    })

    it("falls back to the blind CDN-path guess when extraction fails", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: mangaHtmlNoCoverMeta }, requests)

        const cover = await mangafreakAdapter.resolveCover!({ sourceMangaId: MANGA_SLUG }, context)

        expect(cover).toBe(BLIND_GUESS_COVER_URL)
    })

    it("returns undefined when no slug can be determined", async () => {
        const context = createContext({}, [])
        const cover = await mangafreakAdapter.resolveCover!({}, context)
        expect(cover).toBeUndefined()
    })
})

describe("mangafreakAdapter.resolveChapter", () => {
    it("resolves pages and uses the real cover extracted from the manga page", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml, [MANGA_PATH]: mangaHtml }, requests)

        const result = await mangafreakAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.pages.map(p => p.url)).toEqual(PAGE_URLS)
        expect(result.chapter.sourceChapterId).toBe(CHAPTER_NUM)
        expect(result.manga.manga.coverUrl).toBe(REAL_COVER_URL)
        expect(result.manga.manga.title).toBe("One Piece")
    })

    it("falls back to the blind CDN-path guess when the manga page has no cover meta tag", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml, [MANGA_PATH]: mangaHtmlNoCoverMeta }, requests)

        const result = await mangafreakAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.manga.manga.coverUrl).toBe(BLIND_GUESS_COVER_URL)
    })

    it("throws a descriptive error when no images are found", async () => {
        const context = createContext({ [CHAPTER_PATH]: "<html><body>no images</body></html>" }, [])

        await expect(mangafreakAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)).rejects.toMatchObject({
            code: "invalid-response"
        })
    })
})

describe("mangafreakAdapter.parseMangaUrl", () => {
    it("derives the manga slug and list URL from a chapter URL without any network call", () => {
        const result = mangafreakAdapter.parseMangaUrl!(new URL(CHAPTER_URL))
        expect(result).toEqual({ sourceMangaId: MANGA_SLUG, mangaUrl: MANGA_URL })
    })

    it("preserves the mirror host (ww1/ww2/...) the chapter URL was on", () => {
        const mirrorChapterUrl = CHAPTER_URL.replace(ORIGIN, "https://ww5.mangafreak.me")
        const result = mangafreakAdapter.parseMangaUrl!(new URL(mirrorChapterUrl))
        expect(result).toEqual({ sourceMangaId: MANGA_SLUG, mangaUrl: `https://ww5.mangafreak.me/Manga/${MANGA_SLUG}` })
    })

    it("returns null for a manga (non-chapter) URL", () => {
        expect(mangafreakAdapter.parseMangaUrl!(new URL(MANGA_URL))).toBeNull()
    })

    it("returns null for a foreign URL", () => {
        expect(mangafreakAdapter.parseMangaUrl!(new URL("https://not-mangafreak.me/Read1_Foo_1"))).toBeNull()
    })
})

describe("mangafreakAdapter.search", () => {
    it("prefers a real per-result thumbnail, falling back to the blind guess when absent", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH]: searchHtml }, requests)

        const results = await mangafreakAdapter.search!(SEARCH_QUERY, context)

        expect(results).toHaveLength(2)
        expect(results[0]!.sourceMangaId).toBe(MANGA_SLUG)
        expect(results[0]!.coverUrl).toBe(REAL_COVER_URL)
        expect(results[1]!.sourceMangaId).toBe("One_Punch_Man")
        expect(results[1]!.coverUrl).toBe(`https://images.mangafreak.me/manga_images/one_punch_man.jpg`)
    })

    it("returns empty array for blank query", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)
        const results = await mangafreakAdapter.search!("   ", context)
        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })
})
