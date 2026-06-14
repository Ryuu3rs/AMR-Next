import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    AJAX_PAGE_URLS,
    AJAX_PATH,
    ajaxJson,
    CHAPTER_PATH,
    CHAPTER_URL,
    chapterHtml,
    COVER_URL,
    MANGA_SLUG,
    REAL_PAGE_URLS
} from "./__fixtures__/mangaread"
import { mangareadAdapter } from "./mangaread"

// Mock keyed by pathname. The chapter page is GET; admin-ajax.php is POST.
// Omitting AJAX_PATH from the fixtures makes the POST 404 so the adapter falls
// back to HTML extraction.
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
            allowedOrigins: ["https://www.mangaread.org"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("mangareadAdapter.match", () => {
    it("classifies chapter, manga, and foreign URLs", () => {
        expect(mangareadAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(mangareadAdapter.match(new URL(`https://www.mangaread.org/manga/${MANGA_SLUG}/`))).toBe("manga")
        expect(mangareadAdapter.match(new URL("https://not-mangaread.org/manga/x/chapter-1/"))).toBe("none")
    })
})

describe("mangareadAdapter.resolveChapter", () => {
    it("extracts real src URLs from reading-content, ignoring data-src junk and sidebar/footer", async () => {
        const requests: string[] = []
        // No AJAX fixture -> POST 404 -> HTML fallback path exercised.
        const context = createContext({ [CHAPTER_PATH]: chapterHtml }, requests)

        const result = await mangareadAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.pages.map(p => p.url)).toEqual(REAL_PAGE_URLS)
        expect(result.chapter.title).toBe("Chapter 79")
        expect(result.chapter.sortKey).toBe(79)
        expect(result.manga.manga.coverUrl).toBe(COVER_URL)
        expect(result.manga.sourceMangaId).toBe(MANGA_SLUG)
        // AJAX attempted first (POST), then GET page already fetched.
        expect(requests.some(r => r.startsWith("POST"))).toBe(true)
    })

    it("prefers AJAX images when admin-ajax.php responds", async () => {
        const requests: string[] = []
        const context = createContext({ [CHAPTER_PATH]: chapterHtml, [AJAX_PATH]: ajaxJson }, requests)

        const result = await mangareadAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)

        expect(result.pages.map(p => p.url)).toEqual(AJAX_PAGE_URLS)
    })

    it("throws a descriptive error when no images are found", async () => {
        const requests: string[] = []
        const emptyHtml = '<html><body><div class="reading-content"></div></body></html>'
        const context = createContext({ [CHAPTER_PATH]: emptyHtml }, requests)

        await expect(mangareadAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)).rejects.toMatchObject({
            code: "invalid-response"
        })
    })
})
