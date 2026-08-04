import { serve } from "@hono/node-server"
import { pathToFileURL } from "node:url"
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
    getCoReadRecommendations,
    getCommunityStats,
    upsertRating,
    getMangaStats,
    type EventRow
} from "./db.js"
import { computeUnlocked } from "./achievements.js"

const app = new Hono()

app.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type"] }))

// Best-effort in-memory per-IP rate limit (single instance). Generous windows - only stops
// abuse/DoS bursts (register spam, unbounded event floods), never a normal user.
type RlBucket = { count: number; resetAt: number }
export const rlBuckets = new Map<string, RlBucket>()

// Our reverse proxy (Traefik) appends the real client IP as the rightmost X-Forwarded-For
// hop; every hop to its left is client-supplied and forgeable. Trusting the FIRST hop lets a
// caller rotate/spoof it per request to dodge the limit and to mint unbounded distinct
// buckets. Count TRUSTED_PROXY_DEPTH from the right instead so a forged prefix maps to one
// real bucket.
const TRUSTED_PROXY_DEPTH = (() => {
    const v = Number(process.env.TRUSTED_PROXY_DEPTH)
    return Number.isInteger(v) && v > 0 ? v : 1
})()

// Cap the bucket map so a flood of unique keys cannot grow it without limit (memory DoS).
const RL_MAX_BUCKETS = (() => {
    const v = Number(process.env.RL_MAX_BUCKETS)
    return Number.isInteger(v) && v > 0 ? v : 10000
})()

export function clientIpFromForwardedFor(forwardedFor: string | undefined): string {
    const hops = (forwardedFor ?? "")
        .split(",")
        .map(h => h.trim())
        .filter(Boolean)
    if (hops.length === 0) return "unknown"
    const idx = Math.max(0, hops.length - TRUSTED_PROXY_DEPTH)
    return hops[idx] || "unknown"
}

function evictExpiredOrOldest(now: number): void {
    for (const [key, bucket] of rlBuckets) {
        if (now > bucket.resetAt) rlBuckets.delete(key)
    }
    if (rlBuckets.size < RL_MAX_BUCKETS) return
    const target = Math.max(1, Math.floor(RL_MAX_BUCKETS * 0.1))
    let removed = 0
    for (const key of rlBuckets.keys()) {
        rlBuckets.delete(key)
        if (++removed >= target) break
    }
}

export function withinRateLimit(
    forwardedFor: string | undefined,
    name: string,
    limit: number,
    windowMs: number
): boolean {
    const key = `${name}:${clientIpFromForwardedFor(forwardedFor)}`
    const now = Date.now()
    const bucket = rlBuckets.get(key)
    if (bucket && now <= bucket.resetAt) {
        if (bucket.count >= limit) return false
        bucket.count += 1
        return true
    }
    if (rlBuckets.size >= RL_MAX_BUCKETS) evictExpiredOrOldest(now)
    rlBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
}

app.get("/", c => c.json({ name: "AMR Community API", version: "1.0.0", status: "ok" }))
app.get("/health", c => c.json({ ok: true }))

app.post("/register", async c => {
    if (!withinRateLimit(c.req.header("x-forwarded-for"), "register", 10, 60 * 60 * 1000)) {
        return c.json({ error: "Too many requests" }, 429)
    }
    const body = await c.req.json<{ username?: string }>().catch(() => ({}))
    const username = (body.username ?? "").trim()
    if (!username || !/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
        return c.json({ error: "Username must be 2-30 chars: letters, numbers, _ and -" }, 400)
    }
    if (getUserByUsername(username)) return c.json({ error: "Username already taken" }, 409)
    const userId = randomUUID()
    createUser(userId, username)
    return c.json({ userId })
})

app.post("/events", async c => {
    if (!withinRateLimit(c.req.header("x-forwarded-for"), "events", 120, 60 * 1000)) {
        return c.json({ error: "Too many requests" }, 429)
    }
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

app.post("/rate", async c => {
    if (!withinRateLimit(c.req.header("x-forwarded-for"), "rate", 120, 60 * 1000)) {
        return c.json({ error: "Too many requests" }, 429)
    }
    const body = await c.req.json<{ userId?: string; mangaTitle?: string; rating?: number }>().catch(() => ({}))
    if (!body.userId || !body.mangaTitle) return c.json({ error: "userId and mangaTitle required" }, 400)
    if (!getUserById(body.userId)) return c.json({ error: "User not found" }, 404)
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return c.json({ error: "Rating must be 1-5" }, 400)
    upsertRating(body.userId, body.mangaTitle.trim(), rating)
    return c.json({ ok: true })
})

app.get("/recommendations", c => {
    if (!withinRateLimit(c.req.header("x-forwarded-for"), "recommendations", 120, 60 * 1000)) {
        return c.json({ error: "Too many requests" }, 429)
    }
    const userId = c.req.query("userId")?.trim()
    if (!userId) return c.json({ error: "userId required" }, 400)
    if (!getUserById(userId)) return c.json({ error: "User not found" }, 404)
    return c.json({ recommendations: getCoReadRecommendations(userId) })
})

app.get("/manga", c => {
    const title = c.req.query("title")?.trim()
    if (!title) return c.json({ error: "title required" }, 400)
    return c.json(getMangaStats(title))
})

app.get("/community", c => c.json(getCommunityStats()))

// Only listen when run directly, not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT ?? 3000)
    serve({ fetch: app.fetch, port }, () => {
        console.log(`[AMR community] :${port}`)
    })
}
