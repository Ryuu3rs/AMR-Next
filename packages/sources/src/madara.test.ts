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

// Adapter with preferSrcAttribute to simulate mangaread.org-style anti-scraping.
const srcFirstAdapter = createMadaraAdapter({
    id: "testmadara-srcfirst",
    name: "Test Madara SrcFirst",
    origin: "https://test-madara.example",
    domains: ["test-madara.example"],
    mangaPath: "series",
    chapterPrefix: "ch",
    preferSrcAttribute: true
})

const CHAPTER_URL = "https://test-madara.example/series/cool-manga/ch-12/"

// id="image-N" layout: real URL in src, junk thumbnail in data-src (Strategy 0).
const chapterHtml = `<!DOCTYPE html><html class="postid-999"><head>
<title>Cool Manga - Chapter 12 - Test Madara</title>
<meta property="og:image" content="https://test-madara.example/cover.jpg" /></head><body>
<div class="reading-content">
  <div class="page-break no-gaps"><img id="image-0" src="https://cdn.example/p1.jpg" data-src="https://test-madara.example/wp-content/uploads/junk-150x150.jpg" /></div>
  <div class="page-break no-gaps"><img id="image-1" src="https://cdn.example/p2.jpg" data-src="https://test-madara.example/wp-content/uploads/sticker.webp" /></div>
</div>
<div class="entry-header"></div></body></html>`

// wp-manga-chapter-img layout with decoy data-src (mangaread.org anti-scraping pattern).
// No id="image-N" so Strategy 0 is skipped; only preferSrcAttribute can save this.
const srcFirstChapterHtml = `<!DOCTYPE html><html class="postid-888"><head>
<title>Cool Manga - Chapter 12 - Test Madara</title>
<meta property="og:image" content="https://test-madara.example/cover.jpg" /></head><body>
<div class="reading-content">
  <div class="page-break no-gaps"><img class="wp-manga-chapter-img" src="https://cdn.example/r1.jpg" data-src="https://prot.example/token/aaa" /></div>
  <div class="page-break no-gaps"><img class="wp-manga-chapter-img" src="https://cdn.example/r2.jpg" data-src="https://prot.example/token/bbb" /></div>
</div>
<div class="entry-header"></div></body></html>`

// mangaread.org layout: id="image-N" + wp-manga-chapter-img, real URL in src but with leading
// whitespace/newlines before the URL — the exact live markup mangaread.org emits.
const whitespaceSourceHtml = `<!DOCTYPE html><html class="postid-119390"><head>
<title>The Chaebeol's Youngest Son Chapter 195 - Test Madara</title>
<meta property="og:image" content="https://test-madara.example/cover.jpg" /></head><body>
<div class="reading-content">
  <div class="page-break no-gaps"><img id="image-0" src="
			https://cdn.example/ws1.jpg" class="wp-manga-chapter-img"></div>
  <div class="page-break no-gaps"><img id="image-1" src="
			https://cdn.example/ws2.jpg" class="wp-manga-chapter-img"></div>
</div>
<div class="entry-header"></div></body></html>`

// Standard lazy-load layout: data-src = real URL, src = base64 placeholder (most Madara sites).
const lazyLoadChapterHtml = `<!DOCTYPE html><html class="postid-777"><head>
<title>Cool Manga - Chapter 12 - Test Madara</title>
<meta property="og:image" content="https://test-madara.example/cover.jpg" /></head><body>
<div class="reading-content">
  <div class="page-break no-gaps"><img class="wp-manga-chapter-img" data-src="https://cdn.example/l1.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" /></div>
  <div class="page-break no-gaps"><img class="wp-manga-chapter-img" data-src="https://cdn.example/l2.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" /></div>
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

// Creates a context that captures all fetched URLs so tests can assert ?style=list is sent.
function createCapturingContext(fixtures: Readonly<Record<string, string>>): {
    context: SourceContext
    fetchedUrls: string[]
} {
    const fetchedUrls: string[] = []
    const fetch: FetchFunction = async url => {
        fetchedUrls.push(url)
        const body = fixtures[new URL(url).pathname]
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" }
    }
    return {
        context: {
            request: createBoundedRequestClient({
                fetch,
                allowedOrigins: ["https://test-madara.example"],
                maxRequests: 10,
                maxResponseBytes: 1_000_000,
                timeoutMs: 1000
            }),
            now: () => 1_700_000_000_000,
            logger: { debug: () => undefined, warn: () => undefined }
        },
        fetchedUrls
    }
}

describe("createMadaraAdapter", () => {
    it("matches configured manga/series and chapter URLs", () => {
        expect(adapter.match(new URL(CHAPTER_URL))).toBe("chapter")
        expect(adapter.match(new URL("https://test-madara.example/series/cool-manga/"))).toBe("manga")
        expect(adapter.match(new URL("https://test-madara.example/manga/cool-manga/ch-12/"))).toBe("none")
        expect(adapter.match(new URL("https://other.example/series/x/ch-1/"))).toBe("none")
    })

    it("always fetches chapter with ?style=list (legacy add_list_to_chapter_url behaviour)", async () => {
        const { context, fetchedUrls } = createCapturingContext({ "/series/cool-manga/ch-12/": chapterHtml })
        await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        const chapterFetch = fetchedUrls.find(u => u.includes("/series/cool-manga/ch-12/"))
        expect(chapterFetch).toBeDefined()
        expect(new URL(chapterFetch!).searchParams.get("style")).toBe("list")
    })

    it("resolves a chapter via Strategy 0 (id=image-N, src first)", async () => {
        const context = createContext({ "/series/cool-manga/ch-12/": chapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"])
        expect(result.chapter.title).toBe("Chapter 12")
        expect(result.chapter.sortKey).toBe(12)
        expect(result.manga.manga.coverUrl).toBe("https://test-madara.example/cover.jpg")
        expect(result.manga.sourceMangaId).toBe("cool-manga")
    })

    it("resolves a chapter via Strategy 0 when src has leading whitespace (mangaread.org live markup)", async () => {
        // mangaread.org emits src="   \n\t\thttps://..." with tabs/newlines before the URL.
        // getImgAttr must trim the captured value or startsWith("http") will fail.
        const context = createContext({ "/series/cool-manga/ch-12/": whitespaceSourceHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/ws1.jpg", "https://cdn.example/ws2.jpg"])
    })

    it("resolves a chapter via Strategy 1 with preferSrcAttribute=true (mangaread.org anti-scraping)", async () => {
        // wp-manga-chapter-img + real URL in src + decoy http URL in data-src.
        // Without preferSrcAttribute, Strategy 1 returns the decoy URL.
        // With it, Strategy 1 reads src first and returns the real URL.
        const context = createContext({ "/series/cool-manga/ch-12/": srcFirstChapterHtml })
        const result = await srcFirstAdapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/r1.jpg", "https://cdn.example/r2.jpg"])
    })

    it("resolves a chapter via Strategy 1 with standard lazy-load (data-src first)", async () => {
        // Base64 placeholder in src, real URL in data-src — the common modern Madara pattern.
        const context = createContext({ "/series/cool-manga/ch-12/": lazyLoadChapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual(["https://cdn.example/l1.jpg", "https://cdn.example/l2.jpg"])
    })

    it("without preferSrcAttribute, Strategy 1 returns decoy data-src URL (showing why the flag is needed)", async () => {
        // Standard adapter (data-src first) on the anti-scraping HTML returns decoy URLs.
        const context = createContext({ "/series/cool-manga/ch-12/": srcFirstChapterHtml })
        const result = await adapter.resolveChapter({ url: new URL(CHAPTER_URL) }, context)
        expect(result.pages.map(p => p.url)).toEqual([
            "https://prot.example/token/aaa",
            "https://prot.example/token/bbb"
        ])
    })

    it("lists chapters from the manga page", async () => {
        const mangaHtml = `<html><body>
<div id="manga-chapters-holder" data-id="555">
<ul class="main version-chap">
  <li class="wp-manga-chapter"><a href="https://test-madara.example/series/cool-manga/ch-2/">Chapter 2</a></li>
  <li class="wp-manga-chapter"><a href="https://test-madara.example/series/cool-manga/ch-1/">Chapter 1</a></li>
</ul></div></body></html>`
        const context = createContext({ "/series/cool-manga/": mangaHtml })
        const manga = {
            manga: {
                id: "testmadara:manga:cool-manga",
                title: "Cool Manga",
                normalizedTitle: "cool manga",
                authors: [],
                status: "unknown" as const,
                addedAt: 0,
                updatedAt: 0
            },
            sourceId: "testmadara",
            sourceMangaId: "cool-manga",
            url: "https://test-madara.example/series/cool-manga/"
        }
        const chapters = await adapter.listChapters({ manga }, context)
        expect(chapters.map(c => c.sortKey)).toEqual([1, 2])
        expect(chapters[1]).toMatchObject({
            sourceChapterId: "cool-manga:ch-2",
            title: "Chapter 2",
            language: "en"
        })
    })

    it("parses search results with cover and latest chapter", async () => {
        const searchHtml = `<html><body>
<div class="c-tabs-item__content">
  <div class="tab-thumb"><a href="https://test-madara.example/series/cool-manga/"><img src="https://cdn.example/cool.jpg" /></a></div>
  <div class="post-title"><h3><a href="https://test-madara.example/series/cool-manga/">Cool Manga</a></h3></div>
  <div class="latest-chap"><span class="chapter"><a>Chapter 12</a></span></div>
</div>
<div class="c-tabs-item__content">
  <div class="post-title"><h3><a href="https://test-madara.example/series/other-title/">Other Title</a></h3></div>
  <span class="chapter"><a>Chapter 7</a></span>
</div>
</body></html>`
        const context = createContext({ "/": searchHtml })
        const results = await adapter.search!("cool", context)
        expect(results).toHaveLength(2)
        expect(results[0]).toMatchObject({
            sourceId: "testmadara",
            sourceMangaId: "cool-manga",
            title: "Cool Manga",
            latestChapter: "12"
        })
        expect(results[0]?.coverUrl).toBe("https://cdn.example/cool.jpg")
        expect(results[1]?.sourceMangaId).toBe("other-title")
    })
})
