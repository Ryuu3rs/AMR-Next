// AniList media relations, used to surface "next in the series" - if you've read a title,
// its direct SEQUEL is the single most obvious thing to read next. The network call lives on
// the AniList provider (metadata/anilist.ts); this module owns the query text, the response
// type, and the pure mapper so mapping stays unit-testable without a network.

import type { RecCandidate } from "./recommendations"

// The relation edges worth surfacing as "read this next". SEQUEL is the direct continuation;
// SIDE_STORY is an adjacent arc a caught-up reader often wants too. Prequels/parents/adaptations
// are deliberately excluded - they point backwards or sideways, not to what to read next.
const NEXT_RELATIONS = new Set(["SEQUEL", "SIDE_STORY"])

type RelationMedia = {
    id?: number | null
    type?: string | null
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null
    coverImage?: { large?: string | null; extraLarge?: string | null } | null
    genres?: (string | null)[] | null
}

export type RelationsResponse = {
    relations?: {
        edges?: ({ relationType?: string | null; node?: RelationMedia | null } | null)[] | null
    } | null
} | null

export const RELATIONS_QUERY = `
    query ($id: Int) {
        Media(id: $id, type: MANGA) {
            relations {
                edges {
                    relationType
                    node {
                        id
                        type
                        title { romaji english native }
                        coverImage { large extraLarge }
                        genres
                    }
                }
            }
        }
    }
`

// Pure mapping - exported for tests, no network. Keeps only forward MANGA relations
// (sequels/side-stories), dropping anime adaptations and anything missing an id/title.
export function mapSequels(raw: RelationsResponse): RecCandidate[] {
    const edges = raw?.relations?.edges ?? []
    const seen = new Set<number>()
    const out: RecCandidate[] = []
    for (const edge of edges) {
        if (!edge || !edge.relationType || !NEXT_RELATIONS.has(edge.relationType)) continue
        const node = edge.node
        if (!node || typeof node.id !== "number") continue
        // A MANGA sequel is what we want; an ANIME node is an adaptation, not a next read.
        if (node.type && node.type !== "MANGA") continue
        const title = node.title?.english ?? node.title?.romaji ?? node.title?.native ?? undefined
        if (!title) continue
        if (seen.has(node.id)) continue
        seen.add(node.id)
        const coverUrl = node.coverImage?.extraLarge ?? node.coverImage?.large ?? undefined
        const genres = (node.genres ?? []).filter((g): g is string => typeof g === "string" && g.length > 0)
        out.push({
            anilistId: node.id,
            title,
            ...(coverUrl ? { coverUrl } : {}),
            ...(genres.length > 0 ? { genres } : {})
        })
    }
    return out
}
