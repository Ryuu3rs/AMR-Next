import type { MangaStatus, MetadataResult } from "./types.js"

const ENDPOINT = "https://graphql.anilist.co"
const MIN_INTERVAL_MS = 700 // ~85 req/min, well under AniList's 90/min limit

const MEDIA_FIELDS = `
    id
    title { romaji english native }
    status
    format
    genres
    tags { name }
    coverImage { extraLarge large }
`

const SEARCH_QUERY = `query ($search: String) { Media(search: $search, type: MANGA) {${MEDIA_FIELDS}} }`
const BY_ID_QUERY = `query ($id: Int) { Media(id: $id, type: MANGA) {${MEDIA_FIELDS}} }`

type AniListMedia = {
    id: number
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    status?: string | null
    format?: string | null
    genres?: Array<string | null> | null
    tags?: Array<{ name?: string | null } | null> | null
    coverImage?: { extraLarge?: string | null; large?: string | null } | null
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
    // Keep the chain alive regardless of individual failures.
    queue = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

function mapStatus(status?: string | null): MangaStatus {
    switch (status) {
        case "RELEASING":
            return "ongoing"
        case "FINISHED":
            return "completed"
        case "HIATUS":
            return "hiatus"
        case "CANCELLED":
            return "cancelled"
        default:
            return "unknown"
    }
}

function mapMedia(media: AniListMedia): MetadataResult {
    const result: MetadataResult = { anilistId: media.id, status: mapStatus(media.status) }

    const title = media.title?.english ?? media.title?.romaji ?? media.title?.native
    if (title) result.title = title

    const coverUrl = media.coverImage?.extraLarge ?? media.coverImage?.large
    if (coverUrl) result.coverUrl = coverUrl

    const genres = (media.genres ?? []).filter((g): g is string => typeof g === "string" && g.length > 0)
    if (genres.length > 0) result.genres = genres

    const tags = (media.tags ?? []).map(t => t?.name).filter((n): n is string => typeof n === "string" && n.length > 0)
    if (tags.length > 0) result.tags = tags

    if (media.format === "ONE_SHOT") result.isOneshot = true

    return result
}

async function queryAniList(query: string, variables: Record<string, unknown>): Promise<AniListMedia | null> {
    return rateLimited(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ query, variables })
            })

            if (res.status === 429) {
                if (attempt === 0) {
                    const retryAfter = Number(res.headers.get("Retry-After")) || 60
                    await new Promise(r => setTimeout(r, retryAfter * 1000))
                    continue
                }
                // Transient (still rate-limited after a retry) - throw so the caller can
                // distinguish "AniList unavailable" from "no such title" and NOT poison
                // the cache with a no-match.
                throw new Error("AniList rate limited")
            }

            if (!res.ok) throw new Error(`AniList ${res.status}`)

            const body = (await res.json()) as { data?: { Media?: AniListMedia | null } }
            // A successful response with no Media is a GENUINE no-match -> null.
            return body.data?.Media ?? null
        }
        throw new Error("AniList rate limited")
    })
}

// Returns mapped metadata, or null for a genuine no-match. THROWS on a transient
// failure (network error, non-ok, exhausted rate limit) - callers must catch and must
// not cache a no-match in that case.
export async function resolveFromAniList(title: string): Promise<MetadataResult | null> {
    const media = await queryAniList(SEARCH_QUERY, { search: title })
    return media ? mapMedia(media) : null
}

export async function resolveFromAniListById(id: number): Promise<MetadataResult | null> {
    const media = await queryAniList(BY_ID_QUERY, { id })
    return media ? mapMedia(media) : null
}
