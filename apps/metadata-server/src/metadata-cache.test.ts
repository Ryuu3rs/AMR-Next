import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb } from "./db.ts"
import { resolveFromAniList } from "./anilist.ts"

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
