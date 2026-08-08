import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-community-register-"))

const { app } = await import("./index.js")
const { getUserById } = await import("./db.js")

async function register(username: unknown): Promise<Response> {
    return app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    })
}

test("rejects a reserved name with 400", async () => {
    const res = await register("Admin")
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: "that name is reserved" })
})

test("rejects a zero-width name with 400", async () => {
    const zwsp = String.fromCharCode(0x200b)
    const res = await register(`nar${zwsp}uto`)
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: "invalid characters" })
})

test("creates an emoji username and persists the NFC-trimmed value", async () => {
    const res = await register("  smile😀  ")
    assert.equal(res.status, 200)
    const { userId } = (await res.json()) as { userId: string }
    assert.ok(userId)
    assert.equal(getUserById(userId)?.username, "smile😀")
})

test("collides case-insensitively on an existing name (409)", async () => {
    const first = await register("Ryuu3rs")
    assert.equal(first.status, 200)
    const dup = await register("ryuu3rs")
    assert.equal(dup.status, 409)
    assert.deepEqual(await dup.json(), { error: "Username already taken" })
})
