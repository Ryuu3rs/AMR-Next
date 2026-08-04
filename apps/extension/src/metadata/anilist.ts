import type { MangaStatus, MetadataProvider, MetadataQuery, MetadataResult } from "./provider"
import {
    mapRecommendations,
    RECOMMENDATIONS_QUERY,
    type RecCandidate,
    type RecommendationsResponse
} from "./recommendations"

const ANILIST_GRAPHQL = "https://graphql.anilist.co"
const MIN_INTERVAL_MS = 700 // ~85 req/min, under AniList's 90/min limit

let lastRequest = 0
let requestChain: Promise<unknown> = Promise.resolve()

// Serializes every AniList query behind a single promise chain with a minimum gap
// between requests. The covers backfill runs four concurrent source groups whose
// metadata fallbacks all land here; without this they burst past AniList's rate
// limit and the 429s silently degrade to "no cover".
function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
    const run = requestChain.then(async () => {
        const wait = MIN_INTERVAL_MS - (Date.now() - lastRequest)
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
        lastRequest = Date.now()
        return fn()
    })
    requestChain = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

// AniList Media.status (MANGA) -> our publication-status enum.
function mapStatus(status: string | null | undefined): MangaStatus {
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
            // NOT_YET_RELEASED / null / anything unexpected
            return "unknown"
    }
}

type AniListMedia = {
    id: number
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    status?: string | null
    format?: string | null
    genres?: (string | null)[] | null
    tags?: ({ name?: string | null } | null)[] | null
    coverImage?: { extraLarge?: string | null; large?: string | null } | null
}

// Pure mapping - exported for tests, no network.
export function mapAniListMedia(media: AniListMedia): MetadataResult {
    const genres = (media.genres ?? []).filter((g): g is string => typeof g === "string" && g.length > 0)
    const tags = (media.tags ?? []).map(t => t?.name).filter((n): n is string => typeof n === "string" && n.length > 0)
    const coverUrl = media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined
    const title = media.title?.english ?? media.title?.romaji ?? media.title?.native ?? undefined
    return {
        anilistId: media.id,
        ...(title ? { title } : {}),
        status: mapStatus(media.status),
        ...(coverUrl ? { coverUrl } : {}),
        ...(genres.length > 0 ? { genres } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        isOneshot: media.format === "ONE_SHOT"
    }
}

const MEDIA_FIELDS = `
    id
    title { romaji english native }
    status
    format
    genres
    tags { name }
    coverImage { extraLarge large }
`

function query<T>(gql: string, variables: Record<string, unknown>): Promise<T | null> {
    return rateLimited(async () => {
        const res = await fetch(ANILIST_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: gql, variables })
        })
        if (!res.ok) return null
        const json = (await res.json()) as { data?: T }
        return json.data ?? null
    })
}

// AniList metadata provider - queries the public GraphQL API directly. Used as the
// fallback behind the VPS catalog (and, until the VPS service is deployed, the only
// provider). Returns null on no match or any network/parse failure so the caller can
// fall through or skip cleanly.
export const anilistProvider: MetadataProvider = {
    name: "anilist",

    async resolve(q: MetadataQuery): Promise<MetadataResult | null> {
        const title = q.title.trim()
        if (!title) return null
        try {
            const data = await query<{ Media: AniListMedia | null }>(
                `query ($search: String) { Media(search: $search, type: MANGA) { ${MEDIA_FIELDS} } }`,
                { search: title }
            )
            return data?.Media ? mapAniListMedia(data.Media) : null
        } catch {
            return null
        }
    },

    async getByAnilistId(id: number): Promise<MetadataResult | null> {
        try {
            const data = await query<{ Media: AniListMedia | null }>(
                `query ($id: Int) { Media(id: $id, type: MANGA) { ${MEDIA_FIELDS} } }`,
                { id }
            )
            return data?.Media ? mapAniListMedia(data.Media) : null
        } catch {
            return null
        }
    },

    async getRecommendations(id: number): Promise<RecCandidate[]> {
        try {
            const data = await query<{ Media: RecommendationsResponse }>(RECOMMENDATIONS_QUERY, { id })
            return data?.Media ? mapRecommendations(data.Media) : []
        } catch {
            return []
        }
    }
}
