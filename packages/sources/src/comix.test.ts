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
