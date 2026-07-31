import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { mangakatanaAdapter } from "./mangakatana"

const ORIGIN = "https://mangakatana.com"
const MANGA_ID = "the-archmages-restaurant.27314"
const MANGA_PATH = `/manga/${MANGA_ID}`
const CHAPTER_PATH = `/manga/${MANGA_ID}/c1`

const mangaHtml = `<!DOCTYPE html><html><head>
<meta property="og:title" content="The Archmage&#039;s Restaurant" />
<meta property="og:image" content="https://mangakatana.com/imgs/cover/09c/25/07835.avif" />
</head><body>
<h1 class="heading">The Archmage&#039;s Restaurant</h1>
<div class="genres">
  <a href="https://mangakatana.com/genre/shounen" class="text_0">Shounen</a>
  <a href="https://mangakatana.com/genre/isekai" class="text_0">Isekai</a>
</div>
<div class="chapters">
  <a href="https://mangakatana.com/manga/the-archmages-restaurant.27314/c3">Chapter 3</a>
  <a href="https://mangakatana.com/manga/the-archmages-restaurant.27314/c2">Chapter 2</a>
  <a href="https://mangakatana.com/manga/the-archmages-restaurant.27314/c1">Chapter 1</a>
</div>
<!-- a related-title genre link that must NOT be picked up as this manga's genre -->
<div class="related"><a href="https://mangakatana.com/genre/romance" class="text_0">Romance</a></div>
</body></html>`

// Real chapter pages carry a 1-entry DECOY array (different token for image 0) beside the
// real full array, with randomised var names. The extractor must pick the longest one.
const chapterHtml = `<!DOCTYPE html><html><head></head><body>
<div id="imgs"></div>
<script>
var ytaw=['https://i1.mangakatana.com/token/DECOYtoken/0.jpg'];
var thzq=['https://i1.mangakatana.com/token/realA/0.jpg','https://i1.mangakatana.com/token/realB/1.jpg','https://i1.mangakatana.com/token/realC/2.jpg'];
</script>
</body></html>`

// Mirrors real markup: <div class="item"> carries a trailing class, the title anchor
// carries target="_blank" after href, and there is whitespace between <h3> and <a>.
const searchHtml = `<html><body>
<div id="book_list">
  <div class="item" data-jump="0">
    <div class="wrap_img"><a href="https://mangakatana.com/manga/the-archmages-restaurant.27314"><img src="https://mangakatana.com/imgs/cover/09c/25/07835.jpg" alt="[Cover]"></a></div>
    <div class="text"><h3 class="title">
      <a href="https://mangakatana.com/manga/the-archmages-restaurant.27314" target="_blank">The Archmage's Restaurant</a></h3></div>
  </div>
  <div class="item" data-jump="0">
    <div class="wrap_img"><a href="https://mangakatana.com/manga/some-other.999"><img src="https://mangakatana.com/imgs/cover/aa/bb/000.jpg" alt="[Cover]"></a></div>
    <div class="text"><h3 class="title">
      <a href="https://mangakatana.com/manga/some-other.999" target="_blank">Some Other Manga</a></h3></div>
  </div>
</div></body></html>`

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[] = []): SourceContext {
    const fetch: FetchFunction = async (url, init) => {
        requests.push(`${init.method} ${url}`)
        const body = fixtures[new URL(url).pathname]
        return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" }
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

describe("mangakatana match + parseMangaUrl", () => {
    it("classifies manga and chapter URLs", () => {
        expect(mangakatanaAdapter.match(new URL(`${ORIGIN}${MANGA_PATH}`))).toBe("manga")
        expect(mangakatanaAdapter.match(new URL(`${ORIGIN}${CHAPTER_PATH}`))).toBe("chapter")
        expect(mangakatanaAdapter.match(new URL(`${ORIGIN}/`))).toBe("none")
        expect(mangakatanaAdapter.match(new URL("https://example.com/manga/x.1"))).toBe("none")
    })

    it("resolves the manga id from both a manga URL and a chapter URL", () => {
        const expected = { sourceMangaId: MANGA_ID, mangaUrl: `${ORIGIN}${MANGA_PATH}` }
        expect(mangakatanaAdapter.parseMangaUrl!(new URL(`${ORIGIN}${CHAPTER_PATH}`))).toEqual(expected)
        expect(mangakatanaAdapter.parseMangaUrl!(new URL(`${ORIGIN}${MANGA_PATH}`))).toEqual(expected)
        expect(mangakatanaAdapter.parseMangaUrl!(new URL(`${ORIGIN}/`))).toBeNull()
    })
})

describe("mangakatana listChapters", () => {
    it("extracts all chapters, numbered from the visible label, sorted descending", async () => {
        const context = createContext({ [MANGA_PATH]: mangaHtml })
        const chapters = await mangakatanaAdapter.listChapters!(
            { manga: { manga: { id: `mangakatana:manga:${MANGA_ID}` }, sourceMangaId: MANGA_ID } } as never,
            context
        )
        expect(chapters.map(c => c.sortKey)).toEqual([3, 2, 1])
        expect(chapters[0]?.url).toBe(`${ORIGIN}/manga/${MANGA_ID}/c3`)
        expect(chapters[2]?.id).toBe(`mangakatana:chapter:${MANGA_ID}:1`)
    })
})

describe("mangakatana chapter numbering", () => {
    it("uses the visible label number, not the URL c-number, when they diverge", async () => {
        // Re-slugged chapter: URL says c99, label says Chapter 5. Label wins.
        const html = `<div class="chapters">
  <a href="${ORIGIN}/manga/${MANGA_ID}/c99">Chapter 5</a>
  <a href="${ORIGIN}/manga/${MANGA_ID}/c4">Chapter 4</a>
</div>`
        const context = createContext({ [MANGA_PATH]: html })
        const chapters = await mangakatanaAdapter.listChapters!(
            { manga: { manga: { id: `mangakatana:manga:${MANGA_ID}` }, sourceMangaId: MANGA_ID } } as never,
            context
        )
        expect(chapters.find(c => c.sourceChapterId === "99")?.sortKey).toBe(5)
    })

    it("interpolates an unnumbered bonus chapter between its neighbours instead of sorting it first", async () => {
        // "Bonus" has no number; it must NOT jump ahead of Chapter 5 via the +Infinity sentinel.
        const html = `<div class="chapters">
  <a href="${ORIGIN}/manga/${MANGA_ID}/c5">Chapter 5</a>
  <a href="${ORIGIN}/manga/${MANGA_ID}/c4">Bonus Side Story</a>
  <a href="${ORIGIN}/manga/${MANGA_ID}/c3">Chapter 3</a>
</div>`
        const context = createContext({ [MANGA_PATH]: html })
        const chapters = await mangakatanaAdapter.listChapters!(
            { manga: { manga: { id: `mangakatana:manga:${MANGA_ID}` }, sourceMangaId: MANGA_ID } } as never,
            context
        )
        // Descending order: Chapter 5 first, the bonus sits between 3 and 5, Chapter 3 last.
        expect(chapters.map(c => c.sourceChapterId)).toEqual(["5", "4", "3"])
        const bonus = chapters.find(c => c.sourceChapterId === "4")!
        expect(bonus.sortKey).toBeGreaterThan(3)
        expect(bonus.sortKey).toBeLessThan(5)
    })
})

describe("mangakatana resolveChapter", () => {
    it("picks the longest image array (ignoring the decoy) in page order", async () => {
        const context = createContext({ [MANGA_PATH]: mangaHtml, [CHAPTER_PATH]: chapterHtml })
        const result = await mangakatanaAdapter.resolveChapter({ url: new URL(`${ORIGIN}${CHAPTER_PATH}`) }, context)
        expect(result.pages.map(p => p.url)).toEqual([
            "https://i1.mangakatana.com/token/realA/0.jpg",
            "https://i1.mangakatana.com/token/realB/1.jpg",
            "https://i1.mangakatana.com/token/realC/2.jpg"
        ])
        expect(result.chapter.sortKey).toBe(1)
        expect(result.manga.manga.title).toBe("The Archmage's Restaurant")
        expect(result.manga.manga.coverUrl).toBe("https://mangakatana.com/imgs/cover/09c/25/07835.avif")
    })

    it("throws when no image array is present", async () => {
        const context = createContext({
            [MANGA_PATH]: mangaHtml,
            [CHAPTER_PATH]: "<html><body>no images</body></html>"
        })
        await expect(
            mangakatanaAdapter.resolveChapter({ url: new URL(`${ORIGIN}${CHAPTER_PATH}`) }, context)
        ).rejects.toThrow()
    })
})

describe("mangakatana resolveManga + resolveGenres", () => {
    it("reads title, cover and genres scoped to the genres block (not related links)", async () => {
        const context = createContext({ [MANGA_PATH]: mangaHtml })
        const manga = await mangakatanaAdapter.resolveManga({ url: new URL(`${ORIGIN}${MANGA_PATH}`) }, context)
        expect(manga.manga.title).toBe("The Archmage's Restaurant")
        expect(manga.manga.coverUrl).toBe("https://mangakatana.com/imgs/cover/09c/25/07835.avif")
        expect(manga.sourceMangaId).toBe(MANGA_ID)

        const genres = await mangakatanaAdapter.resolveGenres!({ sourceMangaId: MANGA_ID }, context)
        expect(genres).toEqual(["Shounen", "Isekai"])
    })
})

describe("mangakatana search", () => {
    it("extracts result cards with title, id and cover", async () => {
        const context = createContext({ "/": searchHtml })
        const results = await mangakatanaAdapter.search!("archmage", context)
        expect(results.map(r => r.title)).toEqual(["The Archmage's Restaurant", "Some Other Manga"])
        expect(results[0]?.sourceMangaId).toBe(MANGA_ID)
        expect(results[0]?.url).toBe(`${ORIGIN}${MANGA_PATH}`)
        expect(results[0]?.coverUrl).toBe("https://mangakatana.com/imgs/cover/09c/25/07835.jpg")
    })
})
