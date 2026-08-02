import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-community-"))

const { createUser, insertEvents, getCoReadRecommendations } = await import("./db.js")

let seq = 0
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

test("ranks co-read titles by overlap-weighted co-read frequency", () => {
    seed("me", ["A", "B"])
    seed("u2", ["A", "C"])
    seed("u3", ["A", "B", "C", "D"])
    seed("u4", ["E"])

    const recs = getCoReadRecommendations("me")

    assert.deepEqual(
        recs.map(r => r.title),
        ["C", "D"]
    )
    assert.equal(recs[0].sourceId, "src_C")
})

test("excludes the caller's own titles", () => {
    const recs = getCoReadRecommendations("me")
    const titles = recs.map(r => r.title)
    assert.ok(!titles.includes("A"))
    assert.ok(!titles.includes("B"))
})

test("excludes titles only read by non-co-readers", () => {
    const recs = getCoReadRecommendations("me")
    assert.ok(!recs.map(r => r.title).includes("E"))
})

test("returns [] on no overlap / cold start", () => {
    seed("lonely", ["Z_unique_1", "Z_unique_2"])
    assert.deepEqual(getCoReadRecommendations("lonely"), [])

    seed("empty", [])
    assert.deepEqual(getCoReadRecommendations("empty"), [])
})
