import assert from "node:assert/strict"
import test from "node:test"
import { createDb, isStale, STALE_TTL_SECONDS } from "./db.js"

function freshDb() {
    return createDb(":memory:")
}

test("upsert -> get round trip by normalized title", () => {
    const store = freshDb()
    store.upsertMetadata({
        normalizedTitle: "solo leveling",
        anilistId: 105398,
        title: "Solo Leveling",
        status: "completed",
        coverUrl: "https://example.com/cover.jpg",
        genres: ["Action", "Adventure"],
        tags: ["Superpowers"],
        isOneshot: false,
        source: "anilist"
    })

    const hit = store.getByNormalizedTitle("solo leveling")
    assert.ok(hit)
    assert.equal(hit.source, "anilist")
    assert.deepEqual(hit.result, {
        anilistId: 105398,
        title: "Solo Leveling",
        status: "completed",
        coverUrl: "https://example.com/cover.jpg",
        genres: ["Action", "Adventure"],
        tags: ["Superpowers"]
    })
})

test("getByAnilistId returns the stored row", () => {
    const store = freshDb()
    store.upsertMetadata({
        normalizedTitle: "one piece",
        anilistId: 30013,
        title: "One Piece",
        status: "ongoing",
        source: "anilist"
    })

    const hit = store.getByAnilistId(30013)
    assert.ok(hit)
    assert.equal(hit.result.anilistId, 30013)
    assert.equal(hit.result.status, "ongoing")
})

test("oneshot format maps back to isOneshot", () => {
    const store = freshDb()
    store.upsertMetadata({
        normalizedTitle: "a oneshot",
        title: "A Oneshot",
        status: "completed",
        isOneshot: true,
        source: "anilist"
    })

    const hit = store.getByNormalizedTitle("a oneshot")
    assert.ok(hit)
    assert.equal(hit.result.isOneshot, true)
})

test("upsert replaces an existing normalized title", () => {
    const store = freshDb()
    store.upsertMetadata({ normalizedTitle: "dup", status: "unknown", source: "anilist" })
    store.upsertMetadata({ normalizedTitle: "dup", status: "ongoing", title: "Dup", source: "manual" })

    const hit = store.getByNormalizedTitle("dup")
    assert.ok(hit)
    assert.equal(hit.source, "manual")
    assert.equal(hit.result.status, "ongoing")
    assert.equal(hit.result.title, "Dup")

    const rows = store.db.prepare("SELECT COUNT(*) as n FROM title_metadata WHERE normalized_title = 'dup'").get() as {
        n: number
    }
    assert.equal(rows.n, 1)
})

test("markNoMatch stores a source='none' row that returns no metadata content", () => {
    const store = freshDb()
    store.markNoMatch("nonexistent series")

    const hit = store.getByNormalizedTitle("nonexistent series")
    assert.ok(hit)
    assert.equal(hit.source, "none")
    assert.deepEqual(hit.result.genres, undefined)
    assert.deepEqual(hit.result.tags, undefined)
    assert.equal(hit.result.status, "unknown")
})

test("isStale respects the TTL boundary", () => {
    const now = 1_000_000_000
    assert.equal(isStale(now, now), false)
    assert.equal(isStale(now - STALE_TTL_SECONDS, now), false)
    assert.equal(isStale(now - STALE_TTL_SECONDS - 1, now), true)
})
