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
    // How strongly AniList users endorsed THIS recommendation edge (the node's net vote
    // count). A widely-upvoted "if you liked X, read Y" is a stronger signal than a lone
    // suggestion; the engine folds it into the score. Clamped to >= 0 (downvoted edges).
    recStrength?: number
    // The recommended title's own community rating (0-100) and popularity (number of users
    // with it on a list). Used to surface "hidden gems": highly rated but not widely read.
    averageScore?: number
    popularity?: number
    // Every Latin title AniList knows for this series (english, romaji, synonyms), best-first.
    // A source search tries these in turn, because a Korean/Chinese title's romaji rarely
    // matches how scanlation sites index it - the English name or a synonym usually does.
    searchTitles?: string[]
}

type RecMedia = {
    id?: number | null
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    synonyms?: (string | null)[] | null
    coverImage?: { large?: string | null; extraLarge?: string | null } | null
    genres?: (string | null)[] | null
    averageScore?: number | null
    popularity?: number | null
}

// Latin-script titles only: a native (Hangul/Kanji) string never matches a scanlation site's
// index, so it's not a useful search term. english/romaji/synonyms are.
function buildSearchTitles(media: RecMedia): string[] {
    const raw = [media.title?.english, media.title?.romaji, ...(media.synonyms ?? [])]
    const out: string[] = []
    const seen = new Set<string>()
    for (const t of raw) {
        if (typeof t !== "string") continue
        const trimmed = t.trim()
        if (!trimmed) continue
        // Skip a title with no Latin letters (pure CJK/Hangul) - it won't match sources.
        if (!/[a-z]/i.test(trimmed)) continue
        const key = trimmed.toLocaleLowerCase("en")
        if (seen.has(key)) continue
        seen.add(key)
        out.push(trimmed)
        if (out.length >= 6) break
    }
    return out
}

export type RecommendationsResponse = {
    recommendations?: {
        nodes?: ({ rating?: number | null; mediaRecommendation?: RecMedia | null } | null)[] | null
    } | null
} | null

export const RECOMMENDATIONS_QUERY = `
    query ($id: Int) {
        Media(id: $id, type: MANGA) {
            recommendations(sort: RATING_DESC) {
                nodes {
                    rating
                    mediaRecommendation {
                        id
                        title { romaji english native }
                        synonyms
                        coverImage { large extraLarge }
                        genres
                        averageScore
                        popularity
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
        const recStrength = typeof node?.rating === "number" ? Math.max(0, node.rating) : undefined
        const averageScore =
            typeof media.averageScore === "number" && media.averageScore > 0 ? media.averageScore : undefined
        const popularity = typeof media.popularity === "number" && media.popularity >= 0 ? media.popularity : undefined
        const searchTitles = buildSearchTitles(media)
        out.push({
            anilistId: media.id,
            title,
            ...(coverUrl ? { coverUrl } : {}),
            ...(genres.length > 0 ? { genres } : {}),
            ...(recStrength !== undefined ? { recStrength } : {}),
            ...(averageScore !== undefined ? { averageScore } : {}),
            ...(popularity !== undefined ? { popularity } : {}),
            ...(searchTitles.length > 0 ? { searchTitles } : {})
        })
    }
    return out
}
