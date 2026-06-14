import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { createMadaraAdapter } from "./madara"

// Synthetic Madara site to prove the factory generalizes beyond mangaread:
// a different origin, manga path ("series"), and chapter prefix ("ch").
const adapter = createMadaraAdapter({
    id: "testmadara",
    name: "Test Madara",
    origin: "https://test-madara.example",
    domains: ["test-madara.example"],
    mangaPath: "series",
    chapterPrefix: "ch"
})

const CHAPTER_URL = "https://test-madara.example/series/cool-manga/ch-12/"

const chapterHtml = `<!DOCTYPE html><html class="postid-999"><head>
<title>Cool Manga - Chapter 12 - Test Madara</title>
<meta property="og:image" content="https://test-madara.example/cover.jpg" /></head><body>
<div class="reading-content">
  <div class="page-break no-gaps"><img id="image-0" src="https://cdn.example/p1.jpg" data-src="https://test-madara.example/wp-content/uploads/junk-150x150.jpg" /></div>
  <div class="page-break no-gaps"><img id="image-1" src="https://cdn.example/p2.jpg" data-src="https://test-madara.example/wp-content/uploads/sticker.webp" /></div>
</div>
<div class="entry-header"></div></body></html>`

function createContext(fixtures: Readonly<Record<string, string>>): SourceContext {
    const fetch: FetchFunction = async url => {
        const body = fixtures[new URL(url).pathname]
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" }
    }
    return {
        request: createBoundedRequestClient({
            fetch,
            allowedOrigins: ["https://test-madara.example"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("createMadaraAdapter", () => {
    it("matches configured manga/series and chapter URLs", () => {
        expect(adapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(adapter.match(new URL("https://test-madara.example/series/cool-manga/"))).toBe("manga")
        expect(adapter.match(new URL("https://test-madara.example/manga/cool-manga/ch-12/"))).toBe("none")
        expect(adapter.match(new URL("https://other.example/series/x/ch-1/"))).toBe("none")
    })

    it("resolves a chapter, preferring real src over junk data-src", async () => {
        const context = createContext({ "/series/cool-manga/ch-12/": chapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"])
        expect(result.chapter.title).toBe("Chapter 12")
        expect(result.chapter.sortKey).toBe(12)
        expect(result.manga.manga.coverUrl).toBe("https://test-madara.example/cover.jpg")
        expect(result.manga.sourceMangaId).toBe("cool-manga")
    })
})
