import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    COVER_PATH,
    COVER_SLUG,
    COVER_URL,
    mangaDetailHtml,
    SEARCH_PATH_PAGE_1,
    SEARCH_PATH_PAGE_2,
    SEARCH_PATH_PAGE_3,
    SEARCH_QUERY,
    searchEmptyHtml,
    searchPage1Html,
    searchPage2Html
} from "./__fixtures__/mangahub"
import { mangahubAdapter } from "./mangahub"

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
            allowedOrigins: ["https://mangahub.io"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("mangahubAdapter.search", () => {
    it("fetches pages in order, dedupes across pages, and stops once a page is empty", async () => {
        const requests: string[] = []
        const context = createContext(
            {
                [SEARCH_PATH_PAGE_1]: searchPage1Html,
                [SEARCH_PATH_PAGE_2]: searchPage2Html,
                [SEARCH_PATH_PAGE_3]: searchEmptyHtml
            },
            requests
        )

        const results = await mangahubAdapter.search!(SEARCH_QUERY, context)

        // 2 unique results from page 1 + 1 new from page 2 (its repeat of
        // solo-leveling_105 is dropped by cross-page dedupe).
        expect(results.map(r => r.sourceMangaId)).toEqual([
            "solo-leveling_105",
            "solo-slime-s-ascension",
            "solo-max-level-newbie"
        ])

        // Trailing "Popular Manga Updates" slider markup after the last card
        // on page 1 must not leak into a result.
        expect(results.some(r => r.sourceMangaId === "unrelated-slider-item")).toBe(false)

        expect(results[0]).toMatchObject({
            sourceId: "mangahub",
            title: "Solo Leveling",
            url: "https://mangahub.io/manga/solo-leveling_105",
            coverUrl: "https://thumb.mghcdn.com/mh/solo-leveling.jpg",
            latestChapter: "200.5"
        })
        // Hex-entity decoding (&#x27;) in the heading text.
        expect(results[1]!.title).toBe("Solo Slime's Ascension")

        // All three pages are requested (page 3 comes back empty, ending the loop).
        expect(requests).toHaveLength(3)
        for (const [i, path] of [SEARCH_PATH_PAGE_1, SEARCH_PATH_PAGE_2, SEARCH_PATH_PAGE_3].entries()) {
            const url = new URL(requests[i]!.replace("GET ", ""))
            expect(url.pathname).toBe(path)
            expect(url.searchParams.get("q")).toBe(SEARCH_QUERY)
            expect(url.searchParams.get("order")).toBe("POPULAR")
            expect(url.searchParams.get("genre")).toBe("all")
        }
    })

    it("stops after the first page when it returns zero results", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH_PAGE_1]: searchEmptyHtml }, requests)

        const results = await mangahubAdapter.search!("zzzznonexistentquery9999", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(1)
    })

    it("returns empty array for a blank query without making requests", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const results = await mangahubAdapter.search!("   ", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })
})

describe("mangahubAdapter.resolveCover", () => {
    it("fetches the manga detail page and returns the og:image cover URL", async () => {
        const requests: string[] = []
        const context = createContext({ [COVER_PATH]: mangaDetailHtml }, requests)

        const cover = await mangahubAdapter.resolveCover!({ sourceMangaId: COVER_SLUG }, context)

        expect(cover).toBe(COVER_URL)
        expect(requests).toHaveLength(1)
        expect(requests[0]).toBe(`GET https://mangahub.io${COVER_PATH}`)
    })

    it("returns undefined when the fetch fails", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const cover = await mangahubAdapter.resolveCover!({ sourceMangaId: "nonexistent-manga" }, context)

        expect(cover).toBeUndefined()
    })
})
