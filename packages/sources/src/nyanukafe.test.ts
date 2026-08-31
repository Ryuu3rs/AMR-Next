import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { nyanukafeAdapter } from "./nyanukafe"

const ORIGIN = "https://nyanukafe.com"
const SID = "63f559b92c0"

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
            maxResponseBytes: 5_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

// Real chapter anchors wrap ~1.4KB of nested markup (thumbnail + metadata) around the
// number, so the fixture pads each inner past a naive fixed-window cap to guard that.
function chapterAnchor(cid: string, label: string): string {
    const pad = "x".repeat(500)
    return `<a class="chapter-card" href="/chapter/${SID}-${cid}/"><div class="thumb"><img class="lazy" src="/assets/images/placeholder.svg" data-src="cdn.meowing.org/uploads/T${cid}"><!-- ${pad} --></div><div class="meta"><span class="num">${label}</span><span class="date">Jul 30, 2026</span><span class="views">1.2k</span></div></a>`
}
const seriesHtml = `<html><head>
<meta property="og:title" content="Demon Lord City">
<meta property="og:image" content="https://wsrv.nl/?url=cdn.meowing.org/uploads/CoVeR123&w=20">
</head><body>
<div id="chapters">
  ${chapterAnchor("c2", "Chapter 2")}
  ${chapterAnchor("c1", "Chapter 1.5")}
</div></body></html>`

const chapterHtml = `<html><head>
<meta property="og:title" content="Demon Lord City Chapter 2">
<meta property="og:image" content="https://wsrv.nl/?url=cdn.meowing.org/uploads/PAGE0">
</head><body>
<img src="/assets/images/placeholder.svg?clear=3" count="0" uid="PAGE0" class="lazy w-full myImage" alt="Loading Page..." loading="lazy">
<img src="/assets/images/placeholder.svg?clear=3" count="1" uid="PAGE1" class="lazy w-full myImage" alt="Loading Page..." loading="lazy">
<img src="/assets/images/placeholder.svg?clear=3" count="2" uid="PAGE2" class="lazy w-full myImage" alt="Loading Page..." loading="lazy">
</body></html>`

describe("nyanukafe match + parseMangaUrl", () => {
    it("recognizes series and chapter URLs", () => {
        expect(nyanukafeAdapter.match(new URL(`${ORIGIN}/series/${SID}`))).toBe("manga")
        expect(nyanukafeAdapter.match(new URL(`${ORIGIN}/chapter/${SID}-c1`))).toBe("chapter")
        expect(nyanukafeAdapter.match(new URL(`${ORIGIN}/browse`))).toBe("none")
    })
    it("derives the series id from a chapter URL", () => {
        expect(nyanukafeAdapter.parseMangaUrl!(new URL(`${ORIGIN}/chapter/${SID}-657c28c815e`))).toEqual({
            sourceMangaId: SID,
            mangaUrl: `${ORIGIN}/series/${SID}`
        })
        expect(nyanukafeAdapter.parseMangaUrl!(new URL(`${ORIGIN}/browse`))).toBeNull()
    })
})

describe("nyanukafe listChapters", () => {
    it("parses chapter number + url, sorted ascending", async () => {
        const ctx = createContext({ [`/series/${SID}`]: seriesHtml })
        const chapters = await nyanukafeAdapter.listChapters(
            { manga: { manga: { id: `nyanukafe:manga:${SID}` }, sourceMangaId: SID } } as never,
            ctx
        )
        expect(chapters.map(c => c.title)).toEqual(["Chapter 1.5", "Chapter 2"])
        expect(chapters.map(c => c.url)).toEqual([`${ORIGIN}/chapter/${SID}-c1`, `${ORIGIN}/chapter/${SID}-c2`])
        expect(chapters[0]!.sortKey).toBeLessThan(chapters[1]!.sortKey)
        expect(chapters[1]!.sourceChapterId).toBe(`${SID}-c2`)
    })
})

describe("nyanukafe resolveChapter", () => {
    it("builds ordered page URLs from count/uid markers on the meowing CDN", async () => {
        const ctx = createContext({ [`/chapter/${SID}-c2`]: chapterHtml })
        const res = await nyanukafeAdapter.resolveChapter({ url: new URL(`${ORIGIN}/chapter/${SID}-c2`) } as never, ctx)
        expect(res.pages.map(p => p.url)).toEqual([
            "https://cdn.meowing.org/uploads/PAGE0",
            "https://cdn.meowing.org/uploads/PAGE1",
            "https://cdn.meowing.org/uploads/PAGE2"
        ])
        expect(res.chapter.title).toBe("Chapter 2")
        // The trailing "Chapter N" is stripped so the manga title is the series name.
        expect(res.manga.manga.title).toBe("Demon Lord City")
    })

    it("orders pages by count even when the markup is shuffled", async () => {
        const shuffled = `<img count="2" uid="C"><img count="0" uid="A"><img count="1" uid="B">`
        const ctx = createContext({ [`/chapter/${SID}-cX`]: `<html><body>${shuffled}</body></html>` })
        const res = await nyanukafeAdapter.resolveChapter({ url: new URL(`${ORIGIN}/chapter/${SID}-cX`) } as never, ctx)
        expect(res.pages.map(p => p.url)).toEqual([
            "https://cdn.meowing.org/uploads/A",
            "https://cdn.meowing.org/uploads/B",
            "https://cdn.meowing.org/uploads/C"
        ])
    })
})

describe("nyanukafe resolveManga", () => {
    it("parses the title and unwraps the wsrv cover to the direct CDN url", async () => {
        const ctx = createContext({ [`/series/${SID}`]: seriesHtml })
        const res = await nyanukafeAdapter.resolveManga({ sourceMangaId: SID } as never, ctx)
        expect(res.manga.title).toBe("Demon Lord City")
        expect(res.manga.coverUrl).toBe("https://cdn.meowing.org/uploads/CoVeR123")
        expect(res.sourceMangaId).toBe(SID)
    })
})
