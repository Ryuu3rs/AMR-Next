import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "amr-community-admin-"))
process.env.COMMUNITY_ADMIN_TOKEN = "admin-secret"

const { app } = await import("./index.js")

const AUTH = { authorization: "Bearer admin-secret" }

function adminPost(path: string, body: unknown): Promise<Response> {
    return app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify(body)
    })
}

test("/admin/check gates on the token", async () => {
    assert.equal((await app.request("/admin/check")).status, 403)
    assert.equal((await app.request("/admin/check", { headers: { authorization: "Bearer wrong" } })).status, 403)
    assert.equal((await app.request("/admin/check", { headers: AUTH })).status, 200)
})

test("/admin/announce rejects an empty title + all admin routes are gated", async () => {
    assert.equal((await app.request("/admin/announce", { method: "POST" })).status, 403)
    assert.equal((await app.request("/admin/stats")).status, 403)
    assert.equal((await app.request("/admin/announcements")).status, 403)
    assert.equal((await adminPost("/admin/announce", { body: "no title" })).status, 400)
})

test("create + list + public feed with targeting", async () => {
    // Broadcast to everyone.
    assert.equal((await adminPost("/admin/announce", { title: "Hello all", body: "0.21 is out" })).status, 200)
    // Firefox-only.
    assert.equal(
        (
            await adminPost("/admin/announce", {
                title: "FF note",
                body: "firefox only",
                targetType: "browser",
                targetValue: "firefox"
            })
        ).status,
        200
    )

    const all = (await (await app.request("/admin/announcements", { headers: AUTH })).json()) as {
        announcements: unknown[]
    }
    assert.equal(all.announcements.length, 2)

    // A chrome install sees only the broadcast; a firefox install sees both.
    const chrome = (await (await app.request("/announcements?browser=chrome&version=0.21.0")).json()) as {
        announcements: Array<{ title: string }>
    }
    assert.deepEqual(
        chrome.announcements.map(a => a.title),
        ["Hello all"]
    )
    const firefox = (await (await app.request("/announcements?browser=firefox&version=0.21.0")).json()) as {
        announcements: Array<{ title: string }>
    }
    assert.equal(firefox.announcements.length, 2)
})

test("version targeting + expiry window", async () => {
    // Targeted at a version nobody in the next query is on.
    await adminPost("/admin/announce", { title: "v-only", body: "x", targetType: "version", targetValue: "0.99.0" })
    // Already expired (ends_at in the past).
    await adminPost("/admin/announce", { title: "expired", body: "x", endsAt: 1 })

    const feed = (await (await app.request("/announcements?browser=firefox&version=0.21.0")).json()) as {
        announcements: Array<{ title: string }>
    }
    const titles = feed.announcements.map(a => a.title)
    assert.ok(!titles.includes("v-only"), "wrong-version announcement must not show")
    assert.ok(!titles.includes("expired"), "expired announcement must not show")

    const matched = (await (await app.request("/announcements?browser=chrome&version=0.99.0")).json()) as {
        announcements: Array<{ title: string }>
    }
    assert.ok(
        matched.announcements.some(a => a.title === "v-only"),
        "the matching version must see the version-targeted announcement"
    )
})

test("delete + /admin/stats", async () => {
    const res = await adminPost("/admin/announce", { title: "temp", body: "delete me" })
    const { id } = (await res.json()) as { id: string }
    const del = await app.request("/admin/announce", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ id })
    })
    assert.deepEqual(await del.json(), { ok: true, deleted: true })

    const stats = (await (await app.request("/admin/stats", { headers: AUTH })).json()) as {
        installs: { total: number }
        users: number
        announcements: number
    }
    assert.ok(typeof stats.installs.total === "number")
    assert.ok(typeof stats.users === "number")
    assert.ok(typeof stats.announcements === "number")
})
