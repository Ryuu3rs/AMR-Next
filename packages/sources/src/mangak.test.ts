import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { mangakAdapter } from "./mangak"

const ORIGIN = "https://mangak.io"
const SLUG = "semantic-error"

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

function makeMangaStub(sourceMangaId: string) {
    return {
        manga: {
            id: `mangak:manga:${sourceMangaId}`,
            title: "Test",
            normalizedTitle: "test",
            authors: [],
            status: "unknown" as const,
            addedAt: 0,
            updatedAt: 0
        },
        sourceId: "mangak",
        sourceMangaId,
        url: `${ORIGIN}/${sourceMangaId}`
    }
}

const mangaHtml = `<!doctype html><html><head>
<meta property="og:title" content="Semantic Error - MangaK" />
<meta property="og:image" content="https://rx.resmk.org/covers/semantic-error.webp" />
</head><body>
<a href="/${SLUG}/chapter-0">Chapter 0</a>
<a href="/${SLUG}/chapter-1">Chapter 1</a>
<a href="/${SLUG}/chapter-106">Chapter 106</a>
<a href="/${SLUG}/chapter-106">Chapter 106 (dup)</a>
<a href="/genre/romance">Romance</a>
<script>self.__next_f.push([1,"[\\"/${SLUG}/chapter-2\\",\\"/${SLUG}/chapter-280-237\\"]"])</script>
</body></html>`

const chapterHtml = `<!doctype html><html><head>
<meta property="og:title" content="Semantic Error - MangaK" />
<meta property="og:image" content="https://rx.resmk.org/covers/semantic-error.webp" />
</head><body>
<img src="https://rx.qvzre.org/r/p/aa/1.webp" />
<img src="https://rx.qvzrf.org/r/p/aa/2.webp" />
<img src="https://rx.qvzrg.org/r/p/aa/3.jpg" />
<img src="https://rx.qvzre.org/r/p/aa/1.webp" />
</body></html>`

const searchHtml = `<!doctype html><html><body>
<a href="/${SLUG}"><img alt="Semantic Error" src="https://rx.resmk.org/covers/semantic-error.webp" /></a>
<a href="/the-beginning-after-the-end"><img alt="The Beginning After The End" src="https://rx.resmk.org/covers/tbate.webp" /></a>
<a href="/${SLUG}/chapter-106">Chapter 106</a>
<a href="/search">Search</a>
<a href="/genres">Genres</a>
</body></html>`

describe("mangakAdapter.match", () => {
    it("classifies chapter, manga, reserved, and foreign URLs", () => {
        expect(mangakAdapter.match(new URL(`${ORIGIN}/${SLUG}/chapter-106`))).toBe("chapter")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/${SLUG}/chapter-0`))).toBe("chapter")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/the-beginning-after-the-end/chapter-280-237`))).toBe("chapter")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/${SLUG}`))).toBe("manga")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/${SLUG}/`))).toBe("manga")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/search`))).toBe("none")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/genres`))).toBe("none")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/api`))).toBe("none")
        expect(mangakAdapter.match(new URL(`${ORIGIN}/`))).toBe("none")
        expect(mangakAdapter.match(new URL(`https://not-mangak.io/${SLUG}`))).toBe("none")
    })
})

describe("mangakAdapter.listChapters", () => {
    it("parses all chapter numbers incl. chapter-0 and a dash-decimal, sorted ascending", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}`]: mangaHtml }, requests)
        const chapters = await mangakAdapter.listChapters({ manga: makeMangaStub(SLUG), limit: 500 }, context)

        expect(chapters.map(c => c.sortKey)).toEqual([0, 1, 2, 106, 280.237])
        const zero = chapters.find(c => c.sortKey === 0)
        expect(zero!.title).toBe("Chapter 0")
        expect(zero!.url).toBe(`${ORIGIN}/${SLUG}/chapter-0`)
        const decimal = chapters.find(c => c.sortKey === 280.237)
        expect(decimal!.url).toBe(`${ORIGIN}/${SLUG}/chapter-280-237`)
        expect(decimal!.title).toBe("Chapter 280.237")
        expect(requests).toEqual([`GET ${ORIGIN}/${SLUG}`])
    })

    it("respects input.limit by slicing the tail", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}`]: mangaHtml }, requests)
        const chapters = await mangakAdapter.listChapters({ manga: makeMangaStub(SLUG), limit: 2 }, context)
        expect(chapters.map(c => c.sortKey)).toEqual([106, 280.237])
    })
})

describe("mangakAdapter.resolveManga", () => {
    it("strips the ' - MangaK' title suffix and reads the cover", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}`]: mangaHtml }, requests)
        const result = await mangakAdapter.resolveManga({ url: new URL(`${ORIGIN}/${SLUG}`) }, context)
        expect(result.manga.title).toBe("Semantic Error")
        expect(result.manga.coverUrl).toBe("https://rx.resmk.org/covers/semantic-error.webp")
        expect(result.sourceMangaId).toBe(SLUG)
    })
})

describe("mangakAdapter.resolveChapter", () => {
    it("extracts rx.*.org page images in first-seen order, deduped", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}/chapter-106`]: chapterHtml }, requests)
        const result = await mangakAdapter.resolveChapter({ url: new URL(`${ORIGIN}/${SLUG}/chapter-106`) }, context)

        expect(result.pages.map(p => p.url)).toEqual([
            "https://rx.qvzre.org/r/p/aa/1.webp",
            "https://rx.qvzrf.org/r/p/aa/2.webp",
            "https://rx.qvzrg.org/r/p/aa/3.jpg"
        ])
        expect(result.chapter.title).toBe("Chapter 106")
        expect(result.chapter.sortKey).toBe(106)
        expect(result.chapter.sourceChapterId).toBe(`${SLUG}:chapter-106`)
        expect(result.manga.manga.title).toBe("Semantic Error")
    })

    it("normalizes a dash-decimal chapter token to a decimal sortKey", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}/chapter-280-237`]: chapterHtml }, requests)
        const result = await mangakAdapter.resolveChapter(
            { url: new URL(`${ORIGIN}/${SLUG}/chapter-280-237`) },
            context
        )
        expect(result.chapter.sortKey).toBe(280.237)
        expect(result.chapter.title).toBe("Chapter 280.237")
    })

    it("throws invalid-response when no images are found", async () => {
        const requests: string[] = []
        const context = createContext({ [`/${SLUG}/chapter-1`]: "<html><body>no images</body></html>" }, requests)
        await expect(
            mangakAdapter.resolveChapter({ url: new URL(`${ORIGIN}/${SLUG}/chapter-1`) }, context)
        ).rejects.toMatchObject({ code: "invalid-response" })
    })

    it("throws a network-origin error on a Cloudflare challenge page", async () => {
        const requests: string[] = []
        const context = createContext(
            { [`/${SLUG}/chapter-1`]: '<html><body><div class="cf-browser-verification">cf_chl</div></body></html>' },
            requests
        )
        await expect(
            mangakAdapter.resolveChapter({ url: new URL(`${ORIGIN}/${SLUG}/chapter-1`) }, context)
        ).rejects.toMatchObject({ code: "request-failed" })
    })
})

describe("mangakAdapter.search", () => {
    it("parses distinct series slugs and excludes chapter/reserved links", async () => {
        const requests: string[] = []
        const context = createContext({ "/search": searchHtml }, requests)
        const results = await mangakAdapter.search!("semantic", context)

        expect(results.map(r => r.sourceMangaId)).toEqual([SLUG, "the-beginning-after-the-end"])
        expect(results[0]!.title).toBe("Semantic Error")
        expect(results[0]!.url).toBe(`${ORIGIN}/${SLUG}`)
        expect(results[0]!.coverUrl).toBe("https://rx.resmk.org/covers/semantic-error.webp")
        expect(requests[0]!).toContain("/search?q=semantic")
    })

    it("returns empty array for a blank query without a request", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)
        expect(await mangakAdapter.search!("   ", context)).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })
})
