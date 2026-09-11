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

test("normalizeTitle strips a trailing source name but leaves real pipes-less titles alone", async () => {
    const { normalizeTitle } = await import("./db.js")
    assert.equal(normalizeTitle("Villain To Kill | Weeb Central"), "Villain To Kill")
    assert.equal(normalizeTitle("  Blame!  "), "Blame!")
    assert.equal(normalizeTitle("A | B"), "A | B")
})

test("events dedup per chapter, and genres backfill across rows of the same title", async () => {
    const { getCommunityStats } = await import("./db.js")
    createUser("t9_me", "user_t9_me")
    const base = { sourceId: "src", mangaTitle: "Backfill Saga | Weeb Central", date: "2026-08-02" }
    insertEvents("t9_me", [
        { id: "t9_a", ...base, genres: [], chapter: "1" },
        { id: "t9_b", ...base, genres: [], chapter: "2" },
        { id: "t9_c", ...base, genres: [], chapter: "2" }
    ])
    insertEvents("t9_me", [{ id: "t9_d", ...base, genres: ["Action", "Drama"], chapter: "3" }])
    insertEvents("t9_me", [{ id: "t9_e", ...base, genres: [], chapter: "4" }])

    const Database = (await import("better-sqlite3")).default
    const raw = new Database(join(process.env.DATA_DIR!, "community.db"), { readonly: true })
    const rows = raw
        .prepare("SELECT manga_title, genres, chapter FROM events WHERE user_id = ? ORDER BY chapter")
        .all("t9_me") as Array<{ manga_title: string; genres: string; chapter: string }>
    assert.equal(rows.length, 4, "chapter 2 twice collapses to one row; chapters 1-4 all kept")
    assert.ok(rows.every(r => r.manga_title === "Backfill Saga"))
    assert.ok(
        rows.every(r => r.genres === JSON.stringify(["Action", "Drama"])),
        "earlier and later empties filled"
    )
    assert.equal(typeof getCommunityStats().topGenres, "object")
})

test("normalizeTitle only strips a KNOWN source name, never a real subtitle (bughunt #5/#6/#7)", async () => {
    const { normalizeTitle } = await import("./db.js")
    // A real subtitle that happens to sit after " | " must survive - two spin-offs stay distinct.
    assert.equal(normalizeTitle("Attack on Titan | Before the Fall"), "Attack on Titan | Before the Fall")
    assert.notEqual(normalizeTitle("Attack on Titan | Before the Fall"), normalizeTitle("Attack on Titan | No Regrets"))
    // Fullwidth pipe (CJK sources) is treated as a separator.
    assert.equal(normalizeTitle("Naruto ｜ MangaHub"), "Naruto")
    // A long real source name (would have exceeded the old 40-char cap) still strips.
    assert.equal(normalizeTitle("One Piece | Thunder Scans EN"), "One Piece")
    // Only the trailing source segment is removed; an inner pipe is kept, and the result is idempotent.
    assert.equal(normalizeTitle("Re | Zero | Weeb Central"), "Re | Zero")
    assert.equal(normalizeTitle("Re | Zero"), "Re | Zero")
})

test("numeric chapter variants collapse to one dedup key; whitespace-only drops to per-day (bughunt #4)", async () => {
    const Database = (await import("better-sqlite3")).default
    createUser("tc_me", "user_tc_me")
    const base = { sourceId: "src", mangaTitle: "Chapter Norm Saga", date: "2026-08-03", genres: [] as string[] }
    insertEvents("tc_me", [
        { id: "tc_1", ...base, chapter: "5" },
        { id: "tc_2", ...base, chapter: " 5" },
        { id: "tc_3", ...base, chapter: "5 " },
        { id: "tc_4", ...base, chapter: "05" },
        { id: "tc_5", ...base, chapter: "5.0" }
    ])
    createUser("tc_ws", "user_tc_ws")
    const ws = { sourceId: "src", mangaTitle: "WS Saga", date: "2026-08-03", genres: [] as string[] }
    insertEvents("tc_ws", [
        { id: "tc_w1", ...ws, chapter: "   " },
        { id: "tc_w2", ...ws, chapter: "" }
    ])
    const raw = new Database(join(process.env.DATA_DIR!, "community.db"), { readonly: true })
    const numeric = raw.prepare("SELECT COUNT(*) c FROM events WHERE user_id = ?").get("tc_me") as { c: number }
    const whitespace = raw.prepare("SELECT COUNT(*) c FROM events WHERE user_id = ?").get("tc_ws") as { c: number }
    raw.close()
    assert.equal(numeric.c, 1, "5 / ' 5' / '5 ' / 05 / 5.0 are one chapter")
    assert.equal(whitespace.c, 1, "whitespace-only and empty chapters dedup per day")
})

test("a malformed stored genres value does not crash the /events batch (bughunt #8)", async () => {
    const Database = (await import("better-sqlite3")).default
    const rw = new Database(join(process.env.DATA_DIR!, "community.db"))
    createUser("tp_seed", "user_tp_seed")
    // Inject a poison row directly - not producible via the API, but a repair/migration could.
    rw.prepare("INSERT INTO events (id, user_id, source_id, manga_title, genres, date) VALUES (?, ?, ?, ?, ?, ?)").run(
        "tp_bad",
        "tp_seed",
        "src",
        "Poison Saga",
        "not-json",
        "2026-08-04"
    )
    rw.close()
    createUser("tp_me", "user_tp_me")
    assert.doesNotThrow(() =>
        insertEvents("tp_me", [
            { id: "tp_a", sourceId: "src", mangaTitle: "Poison Saga", genres: [], date: "2026-08-04", chapter: "1" },
            { id: "tp_b", sourceId: "src", mangaTitle: "Other Saga", genres: [], date: "2026-08-04", chapter: "1" }
        ])
    )
    const ro = new Database(join(process.env.DATA_DIR!, "community.db"), { readonly: true })
    const n = ro.prepare("SELECT COUNT(*) c FROM events WHERE user_id = ?").get("tp_me") as { c: number }
    ro.close()
    assert.equal(n.c, 2, "both rows inserted; the poison lookup is swallowed, sibling not lost")
})

test("ratings are stored under the normalized title so they join reads (bughunt #3)", async () => {
    const Database = (await import("better-sqlite3")).default
    createUser("tr_u", "user_tr_u")
    upsertRating("tr_u", "Rate Norm Saga | Weeb Central", 5)
    const ro = new Database(join(process.env.DATA_DIR!, "community.db"), { readonly: true })
    const row = ro.prepare("SELECT manga_title FROM ratings WHERE user_id = ?").get("tr_u") as { manga_title: string }
    ro.close()
    assert.equal(row.manga_title, "Rate Norm Saga", "rating keyed on the normalized title, not the raw one")
    // getMangaStats normalizes its argument too, so a raw or normalized lookup hits the same rows.
    assert.deepEqual(getMangaStats("Rate Norm Saga | Weeb Central"), getMangaStats("Rate Norm Saga"))
})
