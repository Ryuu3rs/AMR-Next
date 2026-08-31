// AniList genre browse, used only to BACKFILL the Suggestions page when a library is too
// small or niche to produce many "readers also liked" recommendations. The network call
// lives on the AniList provider (metadata/anilist.ts); this module owns the query text, the
// response type, and the pure mapper so mapping stays unit-testable without a network.

import type { RecCandidate } from "./recommendations"

type BrowseMedia = {
    id?: number | null
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    coverImage?: { large?: string | null; extraLarge?: string | null } | null
    genres?: (string | null)[] | null
    averageScore?: number | null
    popularity?: number | null
}

export type BrowseResponse = {
    Page?: {
        media?: (BrowseMedia | null)[] | null
    } | null
} | null

// Highest-rated MANGA in a genre, with a popularity floor so backfill still surfaces titles
// people actually read rather than obscure zero-list entries. Sorted by score, not
// popularity, so the fill leans toward quality within the genre the user already likes.
export const BROWSE_QUERY = `
    query ($genre: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
            media(type: MANGA, genre: $genre, sort: SCORE_DESC, popularity_greater: 5000) {
                id
                title { romaji english native }
                coverImage { large extraLarge }
                genres
                averageScore
                popularity
            }
        }
    }
`

// Pure mapping - exported for tests, no network. Drops entries missing an id/title.
export function mapBrowse(raw: BrowseResponse): RecCandidate[] {
    const media = raw?.Page?.media ?? []
    const seen = new Set<number>()
    const out: RecCandidate[] = []
    for (const item of media) {
        if (!item || typeof item.id !== "number") continue
        const title = item.title?.english ?? item.title?.romaji ?? item.title?.native ?? undefined
        if (!title) continue
        if (seen.has(item.id)) continue
        seen.add(item.id)
        const coverUrl = item.coverImage?.extraLarge ?? item.coverImage?.large ?? undefined
        const genres = (item.genres ?? []).filter((g): g is string => typeof g === "string" && g.length > 0)
        const averageScore =
            typeof item.averageScore === "number" && item.averageScore > 0 ? item.averageScore : undefined
        const popularity = typeof item.popularity === "number" && item.popularity >= 0 ? item.popularity : undefined
        out.push({
            anilistId: item.id,
            title,
            ...(coverUrl ? { coverUrl } : {}),
            ...(genres.length > 0 ? { genres } : {}),
            ...(averageScore !== undefined ? { averageScore } : {}),
            ...(popularity !== undefined ? { popularity } : {})
        })
    }
    return out
}
