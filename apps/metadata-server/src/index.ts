import { serve } from "@hono/node-server"
import { pathToFileURL } from "node:url"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { resolveFromAniList, resolveFromAniListById } from "./anilist.js"
import { resolveFromJikan } from "./jikan.js"
import { getDb, isStale } from "./db.js"
import { normalizeTitle } from "./normalize.js"

export const app = new Hono()
const store = getDb()

app.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"] }))

app.get("/", c => c.json({ name: "AMR Metadata API", status: "ok" }))
app.get("/health", c => c.json({ ok: true }))

app.get("/metadata/resolve", async c => {
    const title = c.req.query("title")?.trim()
    if (!title) return c.json({ error: "title required" }, 400)

    const norm = normalizeTitle(title)
    const hit = store.getByNormalizedTitle(norm)

    if (hit && !isStale(hit.fetched_at)) {
        if (hit.source === "none") return c.json({ result: null })
        return c.json(hit.result)
    }

    let resolved: Awaited<ReturnType<typeof resolveFromAniList>>
    try {
        resolved = await resolveFromAniList(title)
    } catch {
        // Transient AniList failure - never cache a no-match here (that would poison a
        // real title for the full TTL). Serve a stale-but-good cached row if we have one
        // (stale-while-error); otherwise report no result WITHOUT a durable write.
        if (hit && hit.source !== "none") return c.json(hit.result)
        return c.json({ result: null })
    }

    if (resolved) {
        store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "anilist" })
        return c.json(resolved)
    }

    // AniList genuinely has no match - fall back to Jikan (free MAL API) so more titles
    // resolve a cover/status, and we capture the MAL id. Jikan is flaky, so a transient
    // failure must NOT poison the cache with a no-match: serve stale-but-good if we have
    // it, else report no result WITHOUT a durable write (retry next time).
    try {
        const fromJikan = await resolveFromJikan(title)
        if (fromJikan) {
            store.upsertMetadata({ ...fromJikan, normalizedTitle: norm, source: "jikan" })
            return c.json(fromJikan)
        }
    } catch {
        if (hit && hit.source !== "none") return c.json(hit.result)
        return c.json({ result: null })
    }

    // Both AniList and Jikan responded with a genuine no-match. markNoMatch keeps any
    // existing good row intact and only caches an empty no-match when nothing was known.
    store.markNoMatch(norm)
    return c.json({ result: null })
})

app.get("/metadata/by-anilist/:id", async c => {
    const id = Number(c.req.param("id"))
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400)

    const hit = store.getByAnilistId(id)
    if (hit && !isStale(hit.fetched_at) && hit.source !== "none") return c.json(hit.result)

    let resolved: Awaited<ReturnType<typeof resolveFromAniListById>>
    try {
        resolved = await resolveFromAniListById(id)
    } catch {
        // Transient failure - serve a stale-but-good cached row if present, else no result.
        if (hit && hit.source !== "none") return c.json(hit.result)
        return c.json({ result: null })
    }
    if (resolved) {
        const norm = resolved.title ? normalizeTitle(resolved.title) : `anilist:${id}`
        store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "anilist" })
        return c.json(resolved)
    }

    return c.json({ result: null })
})

app.post("/metadata/link", async c => {
    // /link overwrites the SHARED catalog for every user, so it must be authorized. It is
    // disabled unless METADATA_ADMIN_TOKEN is set, and then requires a matching bearer
    // token. Without this, any anonymous caller (CORS is open) could globally repoint any
    // title's metadata for the full cache TTL.
    const adminToken = process.env.METADATA_ADMIN_TOKEN
    const auth = c.req.header("Authorization")
    if (!adminToken || auth !== `Bearer ${adminToken}`) {
        return c.json({ error: "unauthorized" }, 403)
    }
    const body = (await c.req.json().catch(() => ({}))) as { normalizedTitle?: string; anilistId?: number }
    const anilistId = Number(body.anilistId)
    const rawTitle = (body.normalizedTitle ?? "").trim()
    if (!rawTitle || !Number.isInteger(anilistId) || anilistId <= 0) {
        return c.json({ error: "normalizedTitle and anilistId required" }, 400)
    }

    let resolved: Awaited<ReturnType<typeof resolveFromAniListById>>
    try {
        resolved = await resolveFromAniListById(anilistId)
    } catch {
        return c.json({ error: "AniList unavailable" }, 502)
    }
    if (!resolved) return c.json({ result: null })

    const norm = normalizeTitle(rawTitle)
    store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "manual" })
    return c.json(resolved)
})

// Only start the HTTP server when run directly (node src/index.ts), not when the app
// is imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT ?? 3000)
    serve({ fetch: app.fetch, port }, () => {
        console.log(`[AMR metadata] :${port}`)
    })
}
