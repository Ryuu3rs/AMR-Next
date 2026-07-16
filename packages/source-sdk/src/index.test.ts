import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
    SourceError,
    SourceRegistry,
    createBoundedRequestClient,
    decodeHtmlEntities,
    matchesSourceDomain,
    type SourceAdapter
} from "./index"

describe("decodeHtmlEntities", () => {
    it("decodes the common named entities every adapter used to hand-roll", () => {
        expect(decodeHtmlEntities("Rock &amp; Roll")).toBe("Rock & Roll")
        expect(decodeHtmlEntities("&quot;quoted&quot;")).toBe('"quoted"')
        expect(decodeHtmlEntities("Tom&#39;s")).toBe("Tom's")
        expect(decodeHtmlEntities("Tom&apos;s")).toBe("Tom's")
        expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c")
        expect(decodeHtmlEntities("one&nbsp;two")).toBe("one two")
    })

    it("decodes accented Latin-1 named entities (the bug: titles like Fianc&eacute;e)", () => {
        expect(decodeHtmlEntities("Daisy: How to Become the Duke&#39;s Fianc&eacute;e")).toBe(
            "Daisy: How to Become the Duke's Fiancée"
        )
        expect(decodeHtmlEntities("Na&iuml;ve Caf&eacute; owner Fr&auml;ulein M&uuml;ller")).toBe(
            "Naïve Café owner Fräulein Müller"
        )
    })

    it("decodes numeric decimal and hex entities", () => {
        expect(decodeHtmlEntities("&#233;&#233;")).toBe("éé")
        expect(decodeHtmlEntities("&#x27;&#x27;")).toBe("''")
        expect(decodeHtmlEntities("&#x00e9;")).toBe("é")
    })

    it("leaves unknown entity-like text alone instead of throwing", () => {
        expect(decodeHtmlEntities("A &notarealentity; B")).toBe("A &notarealentity; B")
    })

    it("trims the result", () => {
        expect(decodeHtmlEntities("  padded  ")).toBe("padded")
    })
})

describe("matchesSourceDomain", () => {
    it("matches exact domains without matching lookalikes", () => {
        expect(matchesSourceDomain("mangadex.org", ["mangadex.org"])).toBe(true)
        expect(matchesSourceDomain("fake-mangadex.org", ["mangadex.org"])).toBe(false)
    })

    it("matches wildcard subdomains but not the apex domain", () => {
        expect(matchesSourceDomain("uploads.mangadex.org", ["*.mangadex.org"])).toBe(true)
        expect(matchesSourceDomain("mangadex.org", ["*.mangadex.org"])).toBe(false)
    })

    it("normalizes case and a trailing dot", () => {
        expect(matchesSourceDomain("API.MANGADEX.ORG.", ["api.mangadex.org"])).toBe(true)
    })
})

describe("createBoundedRequestClient", () => {
    it("validates JSON and enforces the request limit", async () => {
        const client = createBoundedRequestClient({
            fetch: async () => ({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ value: 7 })
            }),
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 1,
            maxResponseBytes: 100,
            timeoutMs: 100
        })

        await expect(
            client.getJson(new URL("https://api.example.test/value"), z.object({ value: z.number() }))
        ).resolves.toEqual({ value: 7 })
        await expect(
            client.getJson(new URL("https://api.example.test/value"), z.object({ value: z.number() }))
        ).rejects.toMatchObject({ code: "request-limit" })
    })

    it("rejects unexpected origins and invalid payloads", async () => {
        const client = createBoundedRequestClient({
            fetch: async () => ({ ok: true, status: 200, text: async () => "{}" }),
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 2,
            maxResponseBytes: 100,
            timeoutMs: 100
        })

        await expect(
            client.getJson(new URL("https://other.test/value"), z.object({ value: z.number() }))
        ).rejects.toBeInstanceOf(SourceError)
        await expect(
            client.getJson(new URL("https://api.example.test/value"), z.object({ value: z.number() }))
        ).rejects.toMatchObject({ code: "invalid-response" })
    })
})

describe("createBoundedRequestClient retry + rate limit", () => {
    it("retries transient failures then succeeds", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                if (calls < 3) return { ok: false, status: 503, text: async () => "busy" }
                return { ok: true, status: 200, text: async () => "ok-body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 5,
            maxResponseBytes: 100,
            timeoutMs: 100,
            maxRetries: 2,
            sleep: async () => undefined,
            random: () => 0
        })

        await expect(client.getText(new URL("https://api.example.test/x"))).resolves.toBe("ok-body")
        expect(calls).toBe(3)
    })

    it("does not retry deterministic 4xx responses", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                return { ok: false, status: 404, text: async () => "nope" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 5,
            maxResponseBytes: 100,
            timeoutMs: 100,
            sleep: async () => undefined
        })

        await expect(client.getText(new URL("https://api.example.test/x"))).rejects.toMatchObject({
            code: "not-found"
        })
        expect(calls).toBe(1)
    })

    it("gives up after maxRetries on persistent transient failure", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                return { ok: false, status: 500, text: async () => "err" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100,
            maxRetries: 2,
            sleep: async () => undefined,
            random: () => 0
        })

        await expect(client.getText(new URL("https://api.example.test/x"))).rejects.toMatchObject({
            code: "request-failed"
        })
        expect(calls).toBe(3)
    })

    it("spaces requests according to the rate limit", async () => {
        const waits: number[] = []
        const client = createBoundedRequestClient({
            fetch: async () => ({ ok: true, status: 200, text: async () => "x" }),
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100,
            rateLimit: { requests: 1, intervalMs: 1000 },
            sleep: async ms => {
                waits.push(ms)
            }
        })

        await client.getText(new URL("https://api.example.test/a"))
        await client.getText(new URL("https://api.example.test/b"))
        await client.getText(new URL("https://api.example.test/c"))

        expect(waits.filter(w => w > 0).length).toBeGreaterThanOrEqual(2)
    })
})

describe("createBoundedRequestClient GET coalescing", () => {
    it("coalesces concurrent identical GETs into one fetch", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                await Promise.resolve()
                return { ok: true, status: 200, text: async () => "shared-body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100
        })

        const url = new URL("https://api.example.test/same")
        const [a, b] = await Promise.all([client.getText(url), client.getText(url)])

        expect(a).toBe("shared-body")
        expect(b).toBe("shared-body")
        expect(calls).toBe(1)
    })

    it("does not coalesce different URLs", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                await Promise.resolve()
                return { ok: true, status: 200, text: async () => "body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100
        })

        await Promise.all([
            client.getText(new URL("https://api.example.test/one")),
            client.getText(new URL("https://api.example.test/two"))
        ])

        expect(calls).toBe(2)
    })

    it("sequential GETs after settle are not shared", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                await Promise.resolve()
                return { ok: true, status: 200, text: async () => "body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100
        })

        const url = new URL("https://api.example.test/same")
        await client.getText(url)
        await client.getText(url)

        expect(calls).toBe(2)
    })
})

describe("createBoundedRequestClient TTL cache", () => {
    it("serves second GET from cache without fetching", async () => {
        let calls = 0
        const fakeNow = 1000
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                return { ok: true, status: 200, text: async () => "cached-body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100,
            cacheTtlMs: 5000,
            now: () => fakeNow
        })
        const url = new URL("https://api.example.test/item")
        const a = await client.getText(url)
        const b = await client.getText(url)
        expect(a).toBe("cached-body")
        expect(b).toBe("cached-body")
        expect(calls).toBe(1)
    })

    it("refetches after TTL expires", async () => {
        let calls = 0
        let fakeNow = 1000
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                return { ok: true, status: 200, text: async () => `body-${calls}` }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100,
            cacheTtlMs: 5000,
            now: () => fakeNow
        })
        const url = new URL("https://api.example.test/item")
        await client.getText(url)
        fakeNow += 6000
        const second = await client.getText(url)
        expect(second).toBe("body-2")
        expect(calls).toBe(2)
    })

    it("does not cache POST responses", async () => {
        let calls = 0
        const client = createBoundedRequestClient({
            fetch: async () => {
                calls += 1
                return { ok: true, status: 200, text: async () => "post-body" }
            },
            allowedOrigins: ["https://api.example.test"],
            maxRequests: 10,
            maxResponseBytes: 100,
            timeoutMs: 100,
            cacheTtlMs: 5000
        })
        const url = new URL("https://api.example.test/form")
        await client.postForm(url, { q: "a" })
        await client.postForm(url, { q: "a" })
        expect(calls).toBe(2)
    })
})

describe("SourceRegistry", () => {
    const adapter = {
        manifest: {
            id: "test",
            name: "Test",
            domains: ["example.test"],
            languages: ["en"],
            capabilities: ["manga", "chapters", "pages"],
            requestRateLimit: { requests: 1, intervalMs: 1000 },
            fixtureVersion: 1
        },
        match: (url: URL) => (url.hostname === "example.test" ? "manga" : "none")
    } as SourceAdapter

    it("registers and matches adapters deterministically", () => {
        const registry = new SourceRegistry([adapter])

        expect(registry.get("test")).toBe(adapter)
        expect(registry.match(new URL("https://example.test/title/1"))).toBe(adapter)
        expect(registry.list()).toEqual([adapter])
    })

    it("rejects duplicate source IDs", () => {
        expect(() => new SourceRegistry([adapter, adapter])).toThrow("Source is already registered")
    })
})
