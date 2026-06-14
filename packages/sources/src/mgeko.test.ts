import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { CHAPTER_PATH, CHAPTER_SLUG, CHAPTER_URL, chapterHtml, COVER_URL, PAGE_URLS } from "./__fixtures__/mgeko"
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

describe("mgekoAdapter.match", () => {
    it("classifies reader, comic, and foreign URLs", () => {
        expect(mgekoAdapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(mgekoAdapter.match(new URL("https://www.mgeko.cc/comic/some-comic/"))).toBe("manga")
        expect(mgekoAdapter.match(new URL("https://not-mgeko.cc/reader/en/x/"))).toBe("none")
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
