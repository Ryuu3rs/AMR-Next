import type { MangaStatus, MetadataResult } from "./types.js"

// Jikan is the free, unauthenticated MAL API. Used only as a fallback when AniList has
// no match, so more titles resolve a cover/status - and it hands us the MAL id for
// free. Read-only public data: it can never touch a user's list.
const ENDPOINT = "https://api.jikan.moe/v4/manga"
// Jikan allows ~3 req/s and ~60 req/min; 1100ms keeps us comfortably under both.
const MIN_INTERVAL_MS = 1100

type JikanImage = { image_url?: string | null; large_image_url?: string | null }
type JikanManga = {
    mal_id?: number | null
    title?: string | null
    title_english?: string | null
    type?: string | null
    status?: string | null
    genres?: Array<{ name?: string | null } | null> | null
    images?: { jpg?: JikanImage | null } | null
}

let lastRequest = 0
let queue: Promise<unknown> = Promise.resolve()

function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
        const wait = MIN_INTERVAL_MS - (Date.now() - lastRequest)
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
        lastRequest = Date.now()
        return fn()
    })
    queue = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

function mapStatus(status?: string | null): MangaStatus {
    switch (status) {
        case "Publishing":
            return "ongoing"
        case "Finished":
            return "completed"
        case "On Hiatus":
            return "hiatus"
        case "Discontinued":
            return "cancelled"
        default:
            return "unknown"
    }
}

export function mapJikanManga(manga: JikanManga): MetadataResult {
    const result: MetadataResult = { status: mapStatus(manga.status) }

    if (typeof manga.mal_id === "number") result.malId = manga.mal_id

    const title = manga.title_english ?? manga.title
    if (title) result.title = title

    const coverUrl = manga.images?.jpg?.large_image_url ?? manga.images?.jpg?.image_url
    if (coverUrl) result.coverUrl = coverUrl

    const genres = (manga.genres ?? [])
        .map(g => g?.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0)
    if (genres.length > 0) result.genres = genres

    if (manga.type === "One-shot") result.isOneshot = true

    return result
}

async function queryJikan(title: string): Promise<JikanManga | null> {
    return rateLimited(async () => {
        const url = `${ENDPOINT}?q=${encodeURIComponent(title)}&limit=1`
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(url, { headers: { Accept: "application/json" } })

            if (res.status === 429) {
                if (attempt === 0) {
                    const retryAfter = Number(res.headers.get("Retry-After")) || 2
                    await new Promise(r => setTimeout(r, retryAfter * 1000))
                    continue
                }
                throw new Error("Jikan rate limited")
            }

            // 5xx (Jikan is often flaky/504) and any other non-ok are transient - throw
            // so the caller does NOT cache a no-match for a title Jikan simply couldn't
            // answer right now.
            if (!res.ok) throw new Error(`Jikan ${res.status}`)

            const body = (await res.json()) as { data?: JikanManga[] }
            // A successful response with an empty data array is a GENUINE no-match -> null.
            return body.data?.[0] ?? null
        }
        throw new Error("Jikan rate limited")
    })
}

// Returns mapped metadata, or null for a genuine no-match. THROWS on a transient
// failure (network error, non-ok, exhausted rate limit) - callers must catch and must
// not cache a no-match in that case.
export async function resolveFromJikan(title: string): Promise<MetadataResult | null> {
    const manga = await queryJikan(title)
    return manga ? mapJikanManga(manga) : null
}
