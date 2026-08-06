import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-community-"))

const { createUser, insertEvents, getCoReadRecommendations, getRecommendations, upsertRating, getMangaStats } =
    await import("./db.js")

let seq = 0
// Distinct title/user namespaces per test - the db is a shared module singleton, so
// unique names keep tests from contaminating each other's co-read graph.
function seed(userId: string, titles: string[]): void {
    createUser(userId, `user_${userId}`)
    insertEvents(
        userId,
        titles.map(mangaTitle => ({
            id: `evt_${seq++}`,
            sourceId: `src_${mangaTitle}`,
            mangaTitle,
            genres: [],
            date: "2026-08-01"
        }))
    )
}

test("surfaces only titles read by at least the k-anonymity floor of co-readers, ranked", () => {
    // me owns t1a/t1b. t1x is read by 3 distinct co-readers -> surfaces. t1y by only 2 ->
    // suppressed by the floor even though it is a genuine co-read.
    seed("t1_me", ["t1a", "t1b"])
    seed("t1_u1", ["t1a", "t1x", "t1y"])
    seed("t1_u2", ["t1a", "t1x", "t1y"])
    seed("t1_u3", ["t1b", "t1x"])

    const recs = getCoReadRecommendations("t1_me")

    assert.deepEqual(
        recs.map(r => r.title),
        ["t1x"]
    )
    assert.equal(recs[0].sourceId, "src_t1x")
    // Own titles never recommended.
    assert.ok(!recs.map(r => r.title).includes("t1a"))
    assert.ok(!recs.map(r => r.title).includes("t1b"))
})

test("does not leak a single co-reader's library (intersection/probe attack is blocked)", () => {
    // Attacker seeds only a niche title the victim reads. The victim is the sole co-reader,
    // so each of the victim's other titles has just 1 co-reader and must be suppressed.
    seed("atk", ["niche_probe"])
    seed("victim", ["niche_probe", "secret_a", "secret_b", "secret_c"])

    const recs = getCoReadRecommendations("atk")

    assert.deepEqual(recs, [])
})

test("excludes titles only read by non-co-readers", () => {
    seed("t3_me", ["t3a", "t3b"])
    seed("t3_u1", ["t3a", "t3shared"])
    seed("t3_u2", ["t3a", "t3shared"])
    seed("t3_u3", ["t3b", "t3shared"])
    seed("t3_stranger", ["t3only"]) // shares nothing with me3

    const titles = getCoReadRecommendations("t3_me").map(r => r.title)
    assert.ok(titles.includes("t3shared"))
    assert.ok(!titles.includes("t3only"))
})

test("returns [] on no overlap / cold start", () => {
    seed("lonely", ["z_unique_1", "z_unique_2"])
    assert.deepEqual(getCoReadRecommendations("lonely"), [])

    seed("empty", [])
    assert.deepEqual(getCoReadRecommendations("empty"), [])
})

test("getMangaStats suppresses exact values below the k-anonymity floor", () => {
    // A single reader + single rater must not disclose that one user's exact rating or presence.
    seed("ms_solo", ["ms_lonely_title"])
    createUser("ms_solo_rater", "user_ms_solo_rater")
    upsertRating("ms_solo_rater", "ms_lonely_title", 5)

    const solo = getMangaStats("ms_lonely_title")
    assert.equal(solo.avgRating, null)
    assert.equal(solo.ratingCount, 0)
    assert.equal(solo.readerCount, 0)

    // A title with >= MIN_DISTINCT_READERS (3) readers and raters returns real stats.
    seed("ms_r1", ["ms_popular_title"])
    seed("ms_r2", ["ms_popular_title"])
    seed("ms_r3", ["ms_popular_title"])
    createUser("ms_v1", "user_ms_v1")
    createUser("ms_v2", "user_ms_v2")
    createUser("ms_v3", "user_ms_v3")
    upsertRating("ms_v1", "ms_popular_title", 4)
    upsertRating("ms_v2", "ms_popular_title", 5)
    upsertRating("ms_v3", "ms_popular_title", 3)

    const popular = getMangaStats("ms_popular_title")
    assert.equal(popular.readerCount, 3)
    assert.equal(popular.ratingCount, 3)
    assert.equal(popular.avgRating, 4)
})

function seedWithGenres(userId: string, entries: Array<{ title: string; genres: string[] }>): void {
    createUser(userId, `user_${userId}`)
    insertEvents(
        userId,
        entries.map(e => ({
            id: `evt_${seq++}`,
            sourceId: `src_${e.title}`,
            mangaTitle: e.title,
            genres: e.genres,
            date: "2026-08-01"
        }))
    )
}

test("genre recommender applies the k-anonymity floor", () => {
    // me's top genre is Action. gr_popular is read by 3 distinct others -> surfaces.
    // gr_solo is read by only 1 other -> suppressed, so it cannot leak that user's library.
    seedWithGenres("gr_me", [{ title: "gr_own", genres: ["Action"] }])
    seedWithGenres("gr_u1", [
        { title: "gr_solo", genres: ["Action"] },
        { title: "gr_popular", genres: ["Action"] }
    ])
    seedWithGenres("gr_u2", [{ title: "gr_popular", genres: ["Action"] }])
    seedWithGenres("gr_u3", [{ title: "gr_popular", genres: ["Action"] }])

    const titles = getRecommendations("gr_me").map(r => r.title)
    assert.ok(titles.includes("gr_popular"))
    assert.ok(!titles.includes("gr_solo"))
})
