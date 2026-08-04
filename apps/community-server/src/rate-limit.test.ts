import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-community-rl-"))
process.env.RL_MAX_BUCKETS = "50"

const { withinRateLimit, clientIpFromForwardedFor, rlBuckets } = await import("./index.js")

test("client IP is the trusted last hop, not the forgeable first hop", () => {
    assert.equal(clientIpFromForwardedFor("1.1.1.1, 9.9.9.9"), "9.9.9.9")
    assert.equal(clientIpFromForwardedFor("2.2.2.2, 3.3.3.3, 9.9.9.9"), "9.9.9.9")
    assert.equal(clientIpFromForwardedFor(undefined), "unknown")
    assert.equal(clientIpFromForwardedFor(""), "unknown")
})

test("forged/rotating first hops do not bypass the limit", () => {
    rlBuckets.clear()
    const realIp = "203.0.113.7"
    let allowed = 0
    for (let i = 0; i < 20; i++) {
        // Attacker rotates the first hop every request; Traefik still appends one fixed real
        // hop, so all requests share a single bucket and get capped at the limit.
        if (withinRateLimit(`10.0.0.${i}, ${realIp}`, "spoof", 5, 60_000)) allowed++
    }
    assert.equal(allowed, 5)
})

test("bucket map does not grow unbounded under a flood of unique client IPs", () => {
    rlBuckets.clear()
    for (let i = 0; i < 500; i++) {
        withinRateLimit(`198.51.100.${i}, 172.16.0.${i}`, "flood", 100, 60_000)
    }
    assert.ok(rlBuckets.size <= 50, `expected <= 50 buckets, got ${rlBuckets.size}`)
})
