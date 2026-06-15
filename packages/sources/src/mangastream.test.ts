import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { createMangaStreamAdapter } from "./mangastream"

const adapter = createMangaStreamAdapter({
    id: "teststream",
    name: "Test Stream",
    origin: "https://test-stream.example",
    domains: ["test-stream.example"]
})

const CHAPTER_URL = "https://test-stream.example/cool-manga-chapter-12/"

const chapterHtml = `<!DOCTYPE html><html><head>
<title>Cool Manga Chapter 12 - Test Stream</title>
<meta property="og:image" content="https://test-stream.example/cover.jpg" /></head><body>
<script>
ts_reader.run({"post_id":42,"sources":[{"source":"Main","images":["https://cdn.example/1.jpg","https://cdn.example/2.jpg"]}]});
</script>
</body></html>`

function createContext(fixtures: Readonly<Record<string, string>>): SourceContext {
    const fetch: FetchFunction = async url => {
        const body = fixtures[new URL(url).pathname]
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://test-stream.example"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("createMangaStreamAdapter", () => {
    it("classifies chapter (root slug) and manga URLs", () => {
        expect(adapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(adapter.match(new URL("https://test-stream.example/manga/cool-manga/"))).toBe("manga")
        expect(adapter.match(new URL("https://test-stream.example/random-page/"))).toBe("none")
    })

    it("resolves chapter images from the ts_reader blob", async () => {
        const context = createContext({ "/cool-manga-chapter-12/": chapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"])
        expect(result.chapter.sortKey).toBe(12)
        expect(result.manga.manga.coverUrl).toBe("https://test-stream.example/cover.jpg")
    })

    it("falls back to #readerarea images", async () => {
        const html = `<html><body><div id="readerarea">
<img src="https://cdn.example/a.jpg" /><img src="https://cdn.example/b.png" />
</div></div></body></html>`
        const context = createContext({ "/cool-manga-chapter-3/": html })
        const result = await adapter.resolveChapter(
            { url: new URL("https://test-stream.example/cool-manga-chapter-3/") },
            context
        )
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/a.jpg", "https://cdn.example/b.png"])
    })
})
