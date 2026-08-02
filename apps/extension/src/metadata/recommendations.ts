// AniList "readers who liked X also liked Y" recommendations, used as the primary
// candidate source for the Suggestions engine. The network call lives on the AniList
// provider (metadata/anilist.ts) so it reuses that file's query helper and error
// discipline; this module owns the query text, the response type, and the pure mapper
// so the mapping stays unit-testable without a network.

// One recommended title, distilled to what the suggestions engine ranks on.
export type RecCandidate = {
    anilistId: number
    title: string
    coverUrl?: string
    genres?: string[]
    // AniList recommendation nodes do not carry authors; kept optional so the engine
    // can score author overlap when a candidate is enriched from another source.
    authors?: string[]
}

type RecMedia = {
    id?: number | null
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    coverImage?: { large?: string | null; extraLarge?: string | null } | null
    genres?: (string | null)[] | null
}

export type RecommendationsResponse = {
    recommendations?: {
        nodes?: ({ mediaRecommendation?: RecMedia | null } | null)[] | null
    } | null
} | null

export const RECOMMENDATIONS_QUERY = `
    query ($id: Int) {
        Media(id: $id, type: MANGA) {
            recommendations(sort: RATING_DESC) {
                nodes {
                    mediaRecommendation {
                        id
                        title { romaji english native }
                        coverImage { large extraLarge }
                        genres
                    }
                }
            }
        }
    }
`

// Pure mapping - exported for tests, no network. Drops nodes whose recommended media
// was deleted (null) or is missing an id/title, since those cannot be ranked or opened.
export function mapRecommendations(raw: RecommendationsResponse): RecCandidate[] {
    const nodes = raw?.recommendations?.nodes ?? []
    const seen = new Set<number>()
    const out: RecCandidate[] = []
    for (const node of nodes) {
        const media = node?.mediaRecommendation
        if (!media || typeof media.id !== "number") continue
        const title = media.title?.english ?? media.title?.romaji ?? media.title?.native ?? undefined
        if (!title) continue
        if (seen.has(media.id)) continue
        seen.add(media.id)
        const coverUrl = media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined
        const genres = (media.genres ?? []).filter((g): g is string => typeof g === "string" && g.length > 0)
        out.push({
            anilistId: media.id,
            title,
            ...(coverUrl ? { coverUrl } : {}),
            ...(genres.length > 0 ? { genres } : {})
        })
    }
    return out
}
