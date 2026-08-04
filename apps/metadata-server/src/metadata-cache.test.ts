import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb } from "./db.ts"
import { resolveFromAniList } from "./anilist.ts"
import { resolveFromJikan, mapJikanManga } from "./jikan.ts"

// --- db-level: a no-match must never destroy an existing resolved row (Bug 1) ---
test("markNoMatch keeps an existing resolved row intact", () => {
    const { getByNormalizedTitle, upsertMetadata, markNoMatch } = createDb(":memory:")
    upsertMetadata({
        normalizedTitle: "naruto",
        anilistId: 30011,
        title: "Naruto",
        status: "completed",
        source: "anilist"
    })
    markNoMatch("naruto")
    const hit = getByNormalizedTitle("naruto")
    assert.equal(hit?.source, "anilist")
    assert.equal(hit?.result.title, "Naruto")
    assert.equal(hit?.result.anilistId, 30011)
})

test("markNoMatch creates a no-match only when nothing is cached", () => {
    const { getByNormalizedTitle, markNoMatch } = createDb(":memory:")
    markNoMatch("unknown title")
    assert.equal(getByNormalizedTitle("unknown title")?.source, "none")
})

// --- anilist-level: throw on transient, null only on genuine no-match (Bug 1) ---
test("resolveFromAniList throws on a transient failure, returns null on a genuine no-match", async () => {
    const realFetch = globalThis.fetch

    globalThis.fetch = async () => new Response("boom", { status: 500 })
    await assert.rejects(resolveFromAniList("anything"), /AniList/)

    globalThis.fetch = async () => new Response(JSON.stringify({ data: { Media: null } }), { status: 200 })
    assert.equal(await resolveFromAniList("no such title"), null)

    globalThis.fetch = realFetch
})

// --- route-level: a transient AniList failure serves stale-but-good and does NOT
//     poison the cache with a no-match (Bug 1 end to end) ---
test("resolve route serves stale-but-good and does not poison on a transient failure", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-meta-"))
    const { app } = await import("./index.ts")
    const { getDb } = await import("./db.ts")
    const store = getDb()

    // Seed a good row and force it stale (fetched_at far in the past).
    store.upsertMetadata({
        normalizedTitle: "one piece",
        anilistId: 30013,
        title: "One Piece",
        status: "ongoing",
        source: "anilist"
    })
    store.db.prepare("UPDATE title_metadata SET fetched_at = 1 WHERE normalized_title = 'one piece'").run()

    const realFetch = globalThis.fetch
    globalThis.fetch = async () => {
        throw new Error("network down")
    }
    try {
        const res = await app.request("/metadata/resolve?title=One%20Piece")
        const body = (await res.json()) as { title?: string }
        assert.equal(body.title, "One Piece") // stale-but-good served
    } finally {
        globalThis.fetch = realFetch
    }

    // The good row must survive - not overwritten to a no-match.
    assert.equal(store.getByNormalizedTitle("one piece")?.source, "anilist")
})

// --- jikan mapper: shape mapping incl. mal_id, status, oneshot ---
test("mapJikanManga maps mal_id, status, cover, genres and one-shot", () => {
    const result = mapJikanManga({
        mal_id: 1706,
        title: "Berserk",
        title_english: "Berserk",
        type: "Manga",
        status: "On Hiatus",
        genres: [{ name: "Action" }, { name: "Fantasy" }, { name: null }],
        images: { jpg: { image_url: "https://x/s.jpg", large_image_url: "https://x/l.jpg" } }
    })
    assert.equal(result.malId, 1706)
    assert.equal(result.status, "hiatus")
    assert.equal(result.coverUrl, "https://x/l.jpg")
    assert.deepEqual(result.genres, ["Action", "Fantasy"])
    assert.equal(result.isOneshot, undefined)

    assert.equal(mapJikanManga({ type: "One-shot", status: "Finished" }).isOneshot, true)
    assert.equal(mapJikanManga({ status: "Publishing" }).status, "ongoing")
    assert.equal(mapJikanManga({ status: "Discontinued" }).status, "cancelled")
})

// --- jikan resolver: throw on transient, null only on a genuine no-match ---
test("resolveFromJikan throws on a transient failure, returns null on a genuine no-match", async () => {
    const realFetch = globalThis.fetch

    globalThis.fetch = async () => new Response("gateway timeout", { status: 504 })
    await assert.rejects(resolveFromJikan("anything"), /Jikan/)

    globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
    assert.equal(await resolveFromJikan("no such title"), null)

    globalThis.fetch = realFetch
})

// --- route: AniList no-match falls back to Jikan and caches it as source 'jikan' ---
test("resolve route falls back to Jikan when AniList has no match", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-meta-"))
    const { app } = await import("./index.ts")
    const { getDb } = await import("./db.ts")
    const store = getDb()

    const realFetch = globalThis.fetch
    globalThis.fetch = async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes("anilist.co")) {
            return new Response(JSON.stringify({ data: { Media: null } }), { status: 200 })
        }
        // Jikan
        return new Response(JSON.stringify({ data: [{ mal_id: 42, title: "Jikan Only Title", status: "Finished" }] }), {
            status: 200
        })
    }
    try {
        const res = await app.request("/metadata/resolve?title=Jikan%20Only%20Title")
        const body = (await res.json()) as { malId?: number; status?: string }
        assert.equal(body.malId, 42)
        assert.equal(body.status, "completed")
    } finally {
        globalThis.fetch = realFetch
    }

    const hit = store.getByNormalizedTitle("jikan only title")
    assert.equal(hit?.source, "jikan")
    assert.equal(hit?.result.malId, 42)
})

// --- route: a Jikan transient failure must not poison the cache with a no-match ---
test("resolve route does not cache a no-match when Jikan is transiently down", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-meta-"))
    const { app } = await import("./index.ts")
    const { getDb } = await import("./db.ts")
    const store = getDb()

    const realFetch = globalThis.fetch
    globalThis.fetch = async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes("anilist.co")) {
            return new Response(JSON.stringify({ data: { Media: null } }), { status: 200 })
        }
        return new Response("gateway timeout", { status: 504 }) // Jikan down
    }
    try {
        const res = await app.request("/metadata/resolve?title=Both%20Down%20Title")
        const body = (await res.json()) as { result?: null }
        assert.equal(body.result, null)
    } finally {
        globalThis.fetch = realFetch
    }

    // No durable no-match row written - a retry can still find it once Jikan recovers.
    assert.equal(store.getByNormalizedTitle("both down title"), undefined)
})

// --- /metadata/link must be authorized (Bug: unauthenticated shared-cache poisoning) ---
test("POST /metadata/link is rejected without an admin token", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-meta-"))
    delete process.env.METADATA_ADMIN_TOKEN
    const { app } = await import("./index.ts")

    const res = await app.request("/metadata/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ normalizedTitle: "naruto", anilistId: 999999 })
    })
    assert.equal(res.status, 403)
})

test("POST /metadata/link rejects a wrong token and accepts the correct one (constant-time compare)", async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-meta-"))
    process.env.METADATA_ADMIN_TOKEN = "s3cret-admin-token"
    const { app } = await import("./index.ts")

    const wrong = await app.request("/metadata/link", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer nope" },
        body: JSON.stringify({ normalizedTitle: "naruto", anilistId: 30011 })
    })
    assert.equal(wrong.status, 403)

    const realFetch = globalThis.fetch
    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({ data: { Media: { id: 30011, title: { english: "Naruto" }, status: "FINISHED" } } }),
            {
                status: 200
            }
        )
    try {
        const ok = await app.request("/metadata/link", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer s3cret-admin-token" },
            body: JSON.stringify({ normalizedTitle: "naruto", anilistId: 30011 })
        })
        assert.equal(ok.status, 200)
        const body = (await ok.json()) as { anilistId?: number }
        assert.equal(body.anilistId, 30011)
    } finally {
        globalThis.fetch = realFetch
        delete process.env.METADATA_ADMIN_TOKEN
    }
})
