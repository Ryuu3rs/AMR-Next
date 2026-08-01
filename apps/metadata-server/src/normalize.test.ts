import assert from "node:assert/strict"
import test from "node:test"
import { normalizeTitle } from "./normalize.js"

test("lowercases with en locale", () => {
    assert.equal(normalizeTitle("Solo Leveling"), "solo leveling")
})

test("collapses runs of whitespace to single spaces", () => {
    assert.equal(normalizeTitle("One   Piece\t\nVol"), "one piece vol")
})

test("trims leading and trailing whitespace", () => {
    assert.equal(normalizeTitle("  Attack on Titan  "), "attack on titan")
})

test("is idempotent", () => {
    const once = normalizeTitle("  Jujutsu   Kaisen ")
    assert.equal(normalizeTitle(once), once)
})
