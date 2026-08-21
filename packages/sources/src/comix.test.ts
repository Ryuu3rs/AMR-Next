import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { comixAdapter } from "./comix"

const ORIGIN = "https://comix.to"
const SLUG = "nk830-lord-of-goblins"
const MANGA_PATH = `/title/${SLUG}`

// Minimal stand-in for the page's <script id="initial-data"> React Query dehydrated
// state. Only the un-encrypted "detail" query is available on a real page - the chapter
// feed itself is encrypted and token-gated, which is exactly why listChapters has to
// synthesise the range from latestChapter.
function initialDataHtml(detail: Record<string, unknown>): string {
    const payload = { queries: { '["manga","detail",84605]': detail } }
    return `<html><head><script id="initial-data" type="application/json">${JSON.stringify(payload)}</script></head><body></body></html>`
}

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

function listInput() {
    return {
        manga: {
            manga: { id: `comix:manga:${SLUG}` },
            sourceMangaId: SLUG
        }
    } as never
}

describe("comix parseMangaUrl", () => {
    it("resolves the slug from a chapter URL so siblings/mark-read can find the manga", () => {
        expect(comixAdapter.parseMangaUrl!(new URL(`${ORIGIN}/title/${SLUG}/6219258-chapter-1`))).toEqual({
            sourceMangaId: SLUG,
            mangaUrl: `${ORIGIN}/title/${SLUG}`
        })
        expect(comixAdapter.parseMangaUrl!(new URL(`${ORIGIN}/title/${SLUG}`))).toEqual({
            sourceMangaId: SLUG,
            mangaUrl: `${ORIGIN}/title/${SLUG}`
        })
        expect(comixAdapter.parseMangaUrl!(new URL("https://comix.to/browse"))).toBeNull()
    })
})

describe("comix listChapters", () => {
    it("synthesises the full chapter range from latestChapter so prev/next has somewhere to go", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [MANGA_PATH]: initialDataHtml({
                    title: "Lord of Goblins",
                    latestChapter: 120,
                    firstChapterUrl: `/title/${SLUG}/6219258-chapter-1`,
                    latestChapterUrl: `/title/${SLUG}/10079183-chapter-120`
                })
            },
            requests
        )

        const chapters = await comixAdapter.listChapters!(listInput(), context)

        // The whole run, not just the two the SSR names - the on-page panel needs a
        // populated list or its Next button has nothing to point at.
        expect(chapters).toHaveLength(120)
        expect(chapters[0]?.sortKey).toBe(1)
        expect(chapters[119]?.sortKey).toBe(120)
        // Real URLs are preferred where the SSR gave them.
        expect(chapters[0]?.url).toBe(`${ORIGIN}/title/${SLUG}/6219258-chapter-1`)
        expect(chapters[119]?.url).toBe(`${ORIGIN}/title/${SLUG}/10079183-chapter-120`)
        // Everything in between uses the placeholder-id form the site redirects to the
        // canonical chapter (verified live: /0-chapter-57 -> /6220912-chapter-57).
        expect(chapters[56]?.url).toBe(`${ORIGIN}/title/${SLUG}/0-chapter-57`)
        expect(chapters[56]?.sortKey).toBe(57)
    })

    it("emits a genuine Chapter 0 when the SSR exposes its URL", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [MANGA_PATH]: initialDataHtml({
                    title: "Lord of Goblins",
                    latestChapter: 3,
                    firstChapterUrl: `/title/${SLUG}/6219258-chapter-0`,
                    latestChapterUrl: `/title/${SLUG}/6219300-chapter-3`
                })
            },
            requests
        )

        const chapters = await comixAdapter.listChapters!(listInput(), context)

        // Chapter 0 must survive as sortKey 0 (and sort before Chapter 1), not be dropped
        // by a synthesis loop that starts at 1.
        expect(chapters.map(c => c.sortKey)).toEqual([0, 1, 2, 3])
        const zero = chapters[0]
        expect(zero?.sortKey).toBe(0)
        expect(zero?.url).toBe(`${ORIGIN}/title/${SLUG}/6219258-chapter-0`)
    })

    it("emits a fractional latest chapter that Math.floor would otherwise drop", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [MANGA_PATH]: initialDataHtml({
                    title: "Lord of Goblins",
                    latestChapter: 57.5,
                    firstChapterUrl: `/title/${SLUG}/6219258-chapter-1`,
                    latestChapterUrl: `/title/${SLUG}/6220912-chapter-57.5`
                })
            },
            requests
        )

        const chapters = await comixAdapter.listChapters!(listInput(), context)

        const maxSortKey = Math.max(...chapters.map(c => c.sortKey))
        expect(maxSortKey).toBe(57.5)
        const latest = chapters.find(c => c.sortKey === 57.5)
        expect(latest?.url).toBe(`${ORIGIN}/title/${SLUG}/6220912-chapter-57.5`)
    })

    it("caps the synthesised range so a malformed latestChapter can't spin out a huge list", async () => {
        const requests: string[] = []
        const context = createContext(
            { [MANGA_PATH]: initialDataHtml({ title: "Lord of Goblins", latestChapter: 999_999 }) },
            requests
        )

        const chapters = await comixAdapter.listChapters!(listInput(), context)

        expect(chapters.length).toBe(2000)
    })

    it("returns nothing when the page exposes no chapter count at all", async () => {
        const requests: string[] = []
        const context = createContext({ [MANGA_PATH]: initialDataHtml({ title: "Lord of Goblins" }) }, requests)

        const chapters = await comixAdapter.listChapters!(listInput(), context)

        expect(chapters).toEqual([])
    })
})

describe("comix resolveChapter", () => {
    it("canonicalises a leading-zero chapter number so its id matches listChapters", async () => {
        // A `0-chapter-08` permalink must resolve to the same id listChapters emits for
        // chapter 8 (":8"), not ":08" - otherwise the reader mints a duplicate row and
        // progress/prev-next stop matching.
        const requests: string[] = []
        const context = createContext(
            { [MANGA_PATH]: initialDataHtml({ title: "Lord of Goblins", latestChapter: 10 }) },
            requests
        )
        const resolved = await comixAdapter.resolveChapter!(
            { url: new URL(`${ORIGIN}/title/${SLUG}/0-chapter-08`) },
            context
        )
        expect(resolved.chapter.id).toBe(`comix:chapter:${SLUG}:8`)
        expect(resolved.chapter.sourceChapterId).toBe("8")
        expect(resolved.chapter.sortKey).toBe(8)

        const list = await comixAdapter.listChapters!(listInput(), context)
        const ch8 = list.find(c => c.sortKey === 8)
        expect(ch8?.id).toBe(resolved.chapter.id)
    })
})
