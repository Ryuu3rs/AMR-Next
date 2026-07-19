import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import {
    ABSOLUTE_COVER,
    ABSOLUTE_COVER_2,
    ABSOLUTE_SLUG,
    ABSOLUTE_SLUG_2,
    ABSOLUTE_TITLE,
    ABSOLUTE_TITLE_2,
    absoluteHrefSearchHtml,
    noResultsSearchHtml,
    RELATIVE_COVER,
    RELATIVE_SLUG,
    RELATIVE_TITLE,
    relativeHrefSearchHtml,
    SEARCH_PATH,
    SEARCH_QUERY,
    twoAbsoluteHrefResultsSearchHtml
} from "./__fixtures__/olympustaff"
import { olympusstaffAdapter } from "./olympustaff"

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[] = []): SourceContext {
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
            allowedOrigins: ["https://olympustaff.com"],
            maxRequests: 10,
            maxResponseBytes: 1_000_000,
            timeoutMs: 1000
        }),
        now: () => 1_700_000_000_000,
        logger: { debug: () => undefined, warn: () => undefined }
    }
}

describe("olympusstaffAdapter.search", () => {
    it("matches result anchors that use an ABSOLUTE href, as served by the real site", async () => {
        const context = createContext({ [SEARCH_PATH]: absoluteHrefSearchHtml })

        const results = await olympusstaffAdapter.search!(SEARCH_QUERY, context)

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            sourceId: "olympustaff",
            sourceMangaId: ABSOLUTE_SLUG,
            title: ABSOLUTE_TITLE,
            url: `https://olympustaff.com/series/${ABSOLUTE_SLUG}`,
            coverUrl: ABSOLUTE_COVER
        })
    })

    it("collects every result when multiple cards all use absolute hrefs", async () => {
        const context = createContext({ [SEARCH_PATH]: twoAbsoluteHrefResultsSearchHtml })

        const results = await olympusstaffAdapter.search!(SEARCH_QUERY, context)

        expect(results.map(r => r.sourceMangaId)).toEqual([ABSOLUTE_SLUG, ABSOLUTE_SLUG_2])
        expect(results[1]).toMatchObject({
            sourceMangaId: ABSOLUTE_SLUG_2,
            title: ABSOLUTE_TITLE_2,
            coverUrl: ABSOLUTE_COVER_2
        })
    })

    it("still matches result anchors that use a bare relative href", async () => {
        const context = createContext({ [SEARCH_PATH]: relativeHrefSearchHtml })

        const results = await olympusstaffAdapter.search!(SEARCH_QUERY, context)

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            sourceMangaId: RELATIVE_SLUG,
            title: RELATIVE_TITLE,
            url: `https://olympustaff.com/series/${RELATIVE_SLUG}`,
            coverUrl: RELATIVE_COVER
        })
    })

    it("returns an empty array when the page has no result anchors", async () => {
        const context = createContext({ [SEARCH_PATH]: noResultsSearchHtml })

        const results = await olympusstaffAdapter.search!(SEARCH_QUERY, context)

        expect(results).toHaveLength(0)
    })

    it("returns an empty array for a blank query without making a request", async () => {
        const requests: string[] = []
        const context = createContext({}, requests)

        const results = await olympusstaffAdapter.search!("   ", context)

        expect(results).toHaveLength(0)
        expect(requests).toHaveLength(0)
    })

    it("sends the query as the ?search= param against /series", async () => {
        const requests: string[] = []
        const context = createContext({ [SEARCH_PATH]: absoluteHrefSearchHtml }, requests)

        await olympusstaffAdapter.search!(SEARCH_QUERY, context)

        expect(requests).toHaveLength(1)
        const url = new URL(requests[0]!.replace("GET ", ""))
        expect(url.pathname).toBe(SEARCH_PATH)
        expect(url.searchParams.get("search")).toBe(SEARCH_QUERY)
    })
})

describe("olympusstaffAdapter.match", () => {
    it("classifies manga and chapter URLs", () => {
        expect(olympusstaffAdapter.match(new URL(`https://olympustaff.com/series/${ABSOLUTE_SLUG}`))).toBe("manga")
        expect(olympusstaffAdapter.match(new URL(`https://olympustaff.com/series/${ABSOLUTE_SLUG}/12`))).toBe("chapter")
        expect(olympusstaffAdapter.match(new URL("https://olympustaff.com/other"))).toBe("none")
        expect(olympusstaffAdapter.match(new URL("https://unrelated.example/series/foo"))).toBe("none")
    })
})
