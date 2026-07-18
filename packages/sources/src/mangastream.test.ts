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

// Title with an isolated single-digit token ("2") before the real " - " separator. The old
// `[--|]` character class was a RANGE from "-" to "|" (matches digits/letters/punctuation in
// that code-point span), so `.split()` incorrectly split on the isolated "2" instead of the
// intended " - " boundary, truncating the title to "Chainsaw Man Part".
const isolatedDigitTitleHtml = `<!DOCTYPE html><html><head>
<title>Chainsaw Man Part 2 - Read Free Manga Online</title>
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

    it("search keeps real cards and drops nav/sidebar junk", async () => {
        const searchHtml = `<html><body>
<nav><a href="https://test-stream.example/manga/popular/" title="Popular">Popular</a>
<a href="https://test-stream.example/manga/latest/" title="Latest">Latest</a></nav>
<div class="listupd">
  <div class="bsx"><a href="https://test-stream.example/manga/buried-injustice/" title="Buried Injustice"><img src="x.jpg"/></a></div>
  <div class="bsx"><a href="https://test-stream.example/manga/sir-dont-show-off/" title="Sir, Don&#039;t Show Off"></a></div>
</div></body></html>`
        const context = createContext({ "/": searchHtml })
        const results = await adapter.search!("anything", context)
        expect(results.map(r => r.title)).toEqual(["Buried Injustice", "Sir, Don't Show Off"])
        expect(results.every(r => r.sourceMangaId !== "popular" && r.sourceMangaId !== "latest")).toBe(true)
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

    it("extracts the full manga title when the <title> tag has an isolated digit before the real separator", async () => {
        // Regression guard for the malformed `[--|]` character class (parsed as a code-point
        // RANGE, not "hyphen or pipe") which truncated titles at any isolated char in that range.
        const context = createContext({ "/cool-manga-chapter-12/": isolatedDigitTitleHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.manga.manga.title).toBe("Chainsaw Man Part 2")
    })

    it("still splits on a real hyphen separator (regression guard)", async () => {
        const context = createContext({ "/cool-manga-chapter-12/": chapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.manga.manga.title).toBe("Cool Manga Chapter 12")
    })
})
