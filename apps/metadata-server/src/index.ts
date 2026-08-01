import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { resolveFromAniList, resolveFromAniListById } from "./anilist.js"
import { getDb, isStale } from "./db.js"
import { normalizeTitle } from "./normalize.js"

const app = new Hono()
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

    const resolved = await resolveFromAniList(title)
    if (resolved) {
        store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "anilist" })
        return c.json(resolved)
    }

    store.markNoMatch(norm)
    return c.json({ result: null })
})

app.get("/metadata/by-anilist/:id", async c => {
    const id = Number(c.req.param("id"))
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400)

    const hit = store.getByAnilistId(id)
    if (hit && !isStale(hit.fetched_at) && hit.source !== "none") return c.json(hit.result)

    const resolved = await resolveFromAniListById(id)
    if (resolved) {
        const norm = resolved.title ? normalizeTitle(resolved.title) : `anilist:${id}`
        store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "anilist" })
        return c.json(resolved)
    }

    return c.json({ result: null })
})

app.post("/metadata/link", async c => {
    const body = (await c.req.json().catch(() => ({}))) as { normalizedTitle?: string; anilistId?: number }
    const anilistId = Number(body.anilistId)
    const rawTitle = (body.normalizedTitle ?? "").trim()
    if (!rawTitle || !Number.isInteger(anilistId) || anilistId <= 0) {
        return c.json({ error: "normalizedTitle and anilistId required" }, 400)
    }

    const resolved = await resolveFromAniListById(anilistId)
    if (!resolved) return c.json({ result: null })

    const norm = normalizeTitle(rawTitle)
    store.upsertMetadata({ ...resolved, normalizedTitle: norm, source: "manual" })
    return c.json(resolved)
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
    console.log(`[AMR metadata] :${port}`)
})
