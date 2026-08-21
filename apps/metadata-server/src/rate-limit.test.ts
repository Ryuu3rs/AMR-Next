import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-metadata-rl-"))

const { app } = await import("./index.js")

test("/metadata/resolve rejects an over-long title before touching AniList", async () => {
    const res = await app.request(`/metadata/resolve?title=${"a".repeat(5000)}`)
    assert.equal(res.status, 400)
})

test("/metadata/resolve rate-limits a burst from one IP", async () => {
    // Over-long titles are rejected (400) AFTER the rate-limit check but BEFORE any network
    // call, so the burst exercises the limiter without hitting AniList - the 121st request
    // from the same IP must 429 rather than 400.
    const longTitle = "a".repeat(5000)
    let limited = false
    for (let i = 0; i < 200; i++) {
        const res = await app.request(`/metadata/resolve?title=${longTitle}`, {
            headers: { "x-forwarded-for": "9.9.9.9" }
        })
        if (res.status === 429) {
            limited = true
            break
        }
    }
    assert.ok(limited, "expected a 429 after a burst from one IP")
})
