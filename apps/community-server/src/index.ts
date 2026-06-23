import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { randomUUID } from "node:crypto"
import {
    createUser,
    getUserByUsername,
    getUserById,
    insertEvents,
    getUserChapterCount,
    getUserSourceCount,
    getStoredAchievements,
    storeAchievements,
    getUserRank,
    getRecommendations,
    getCommunityStats,
    type EventRow
} from "./db.js"
import { computeUnlocked } from "./achievements.js"

const app = new Hono()

app.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"] }))

app.get("/health", c => c.json({ ok: true }))

app.post("/register", async c => {
    const body = await c.req.json<{ username?: string }>().catch(() => ({}))
    const username = (body.username ?? "").trim()
    if (!username || !/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
        return c.json({ error: "Username must be 2–30 chars: letters, numbers, _ and –" }, 400)
    }
    if (getUserByUsername(username)) return c.json({ error: "Username already taken" }, 409)
    const userId = randomUUID()
    createUser(userId, username)
    return c.json({ userId })
})

app.post("/events", async c => {
    const body = await c.req
        .json<{
            userId?: string
            events?: Array<{
                type?: string
                sourceId?: string
                mangaTitle?: string
                genres?: string[]
                date?: string
            }>
        }>()
        .catch(() => ({}))

    if (!body.userId) return c.json({ error: "userId required" }, 400)
    if (!getUserById(body.userId)) return c.json({ error: "User not found" }, 404)

    const today = new Date().toISOString().slice(0, 10)
    const rows: EventRow[] = (body.events ?? [])
        .filter(e => e.type === "chapter_read" && e.sourceId && e.mangaTitle && e.date && e.date <= today)
        .slice(0, 500)
        .map(e => ({
            id: randomUUID(),
            sourceId: e.sourceId!,
            mangaTitle: e.mangaTitle!,
            genres: Array.isArray(e.genres) ? e.genres.filter(g => typeof g === "string").slice(0, 20) : [],
            date: e.date!.slice(0, 10)
        }))

    if (rows.length > 0) insertEvents(body.userId, rows)

    const chapters = getUserChapterCount(body.userId)
    const sources = getUserSourceCount(body.userId)
    const allUnlocked = computeUnlocked(chapters, sources)
    const alreadyStored = new Set(getStoredAchievements(body.userId))
    const newAchievements = allUnlocked.filter(id => !alreadyStored.has(id))
    if (newAchievements.length > 0) storeAchievements(body.userId, newAchievements)

    return c.json({
        rank: getUserRank(body.userId),
        newAchievements,
        recommendations: getRecommendations(body.userId)
    })
})

app.get("/community", c => c.json(getCommunityStats()))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
    console.log(`[AMR community] :${port}`)
})
