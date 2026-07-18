import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { createMangaBuddyAdapter } from "./mangabuddy"

const adapter = createMangaBuddyAdapter({
    id: "testbuddy",
    name: "Test Buddy",
    origin: "https://test-buddy.example",
    domains: ["test-buddy.example"]
})

const CHAPTER_URL = "https://test-buddy.example/cool-manga/chapter-12"

const arrayChapterHtml = `<!DOCTYPE html><html><head>
<title>Cool Manga Chapter 12 - Test Buddy</title>
<meta property="og:image" content="https://test-buddy.example/cover.jpg" /></head><body>
<script>
var chapImages = ["https://cdn.example/1.jpg","https://cdn.example/2.jpg"];
</script>
</body></html>`

const stringChapterHtml = `<!DOCTYPE html><html><head>
<title>Cool Manga Chapter 5 - Test Buddy</title></head><body>
<script>
var chapImages = "https://cdn.example/a.jpg,https://cdn.example/b.jpg,https://cdn.example/c.jpg";
</script>
</body></html>`

// Title with an isolated single-digit token ("2") before the real " - " separator. The old
// `[--|]` character class was a RANGE from "-" to "|" (matches digits/letters/punctuation in
// that code-point span), so `.split()` incorrectly split on the isolated "2" instead of the
// intended " - " boundary, truncating the title to "Chainsaw Man Part".
const isolatedDigitTitleHtml = `<!DOCTYPE html><html><head>
<title>Chainsaw Man Part 2 - Read Free Manga Online</title>
<meta property="og:image" content="https://test-buddy.example/cover.jpg" /></head><body>
<script>
var chapImages = ["https://cdn.example/1.jpg","https://cdn.example/2.jpg"];
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
            allowedOrigins: ["https://test-buddy.example"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("createMangaBuddyAdapter", () => {
    it("classifies chapter and manga URLs", () => {
        expect(adapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(adapter.match(new URL("https://test-buddy.example/manga/cool-manga"))).toBe("manga")
        expect(adapter.match(new URL("https://test-buddy.example/cool-manga"))).toBe("manga")
        expect(adapter.match(new URL("https://test-buddy.example/a/b/c/d"))).toBe("none")
    })

    it("resolves chapter images from the JS-array strategy", async () => {
        const context = createContext({ "/cool-manga/chapter-12": arrayChapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"])
        expect(result.chapter.sortKey).toBe(12)
        expect(result.manga.manga.coverUrl).toBe("https://test-buddy.example/cover.jpg")
    })

    it("falls back to the comma-separated-string strategy", async () => {
        const context = createContext({ "/cool-manga/chapter-5": stringChapterHtml })
        const result = await adapter.resolveChapter(
            { url: new URL("https://test-buddy.example/cool-manga/chapter-5") },
            context
        )
        expect(result.pages.map(p => p.url)).toEqual([
            "https://cdn.example/a.jpg",
            "https://cdn.example/b.jpg",
            "https://cdn.example/c.jpg"
        ])
        expect(result.chapter.sortKey).toBe(5)
    })

    it("extracts the full manga title when the <title> tag has an isolated digit before the real separator", async () => {
        // Regression guard for the malformed `[--|]` character class (parsed as a code-point
        // RANGE, not "hyphen or pipe") which truncated titles at any isolated char in that range.
        const context = createContext({ "/cool-manga/chapter-12": isolatedDigitTitleHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.manga.manga.title).toBe("Chainsaw Man Part 2")
    })

    it("still splits on a real hyphen separator (regression guard)", async () => {
        const context = createContext({ "/cool-manga/chapter-12": arrayChapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.manga.manga.title).toBe("Cool Manga Chapter 12")
    })
})
