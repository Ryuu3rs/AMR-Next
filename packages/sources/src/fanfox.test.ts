import { createBoundedRequestClient, type FetchFunction, type SourceContext } from "@amr/source-sdk"
import { describe, expect, it } from "vitest"
import { createFanfoxFamilyAdapter } from "./fanfox"

const ORIGIN = "https://fanfox.net"
const adapter = createFanfoxFamilyAdapter({
    id: "fanfox",
    name: "FanFox",
    origin: ORIGIN,
    domains: ["fanfox.net", "www.fanfox.net"]
})

function createContext(fixtures: Readonly<Record<string, string>>, requests: string[]): SourceContext {
    const fetch: FetchFunction = async (url, init) => {
        requests.push(`${init.method} ${url}`)
        const body = fixtures[new URL(url).pathname]
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

describe("fanfox search", () => {
    it("keeps a row whose empty-text cover anchor repeats the slug before the title anchor", async () => {
        // A results row emits two anchors for the same slug: an image-only cover anchor
        // (no visible text) first, then the real title anchor. The cover anchor must not
        // consume the slug, or the title anchor gets skipped as a duplicate.
        const html = `<html><body>
<a href="/manga/berserk/"><img src="https://fmcdn.mfcdn.net/berserk.jpg"></a>
<a href="/manga/berserk/">Berserk</a>
</body></html>`
        const requests: string[] = []
        const context = createContext({ "/search": html }, requests)

        const results = await adapter.search!("berserk", context)

        expect(results).toHaveLength(1)
        expect(results[0]?.sourceMangaId).toBe("berserk")
        expect(results[0]?.title).toBe("Berserk")
    })
})
