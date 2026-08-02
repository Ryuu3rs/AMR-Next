import { normalizeTitle } from "@amr/normalize"
import type { LibraryManga } from "./database"
import type { RecCandidate } from "./metadata/recommendations"

// A ranked suggestion surfaced in the Suggestions tab. Pure output of scoreSuggestions:
// no covers are fetched here, the candidate's own coverUrl is carried through.
export type Suggestion = {
    anilistId: number
    title: string
    coverUrl?: string
    genres?: string[]
    // How many owned titles recommended this candidate (AniList co-recommendation count).
    frequency: number
    // Genre/author overlap against the library profile, normalized to [0, 1].
    overlapScore: number
    // True when the candidate is also a community "readers also read" pick (badge marker).
    community: boolean
    // Final weighted rank; higher is a stronger suggestion.
    score: number
    // Owned titles that led here, for the card's "because you read X, Y" line.
    reasons: string[]
}

export type CommunityRec = {
    title: string
    sourceId: string
}

export type SuggestionsInput = {
    library: LibraryManga[]
    anilistRecs: Map<number, RecCandidate[]>
    communityRecs?: CommunityRec[]
}

// Rank weights. Frequency is the primary signal (AniList co-recommendation), overlap is
// a secondary content signal, community membership is a fixed boost. Overlap is scaled up
// because it is normalized to [0, 1] while frequency is a small integer count.
const WEIGHT_FREQUENCY = 1
const WEIGHT_OVERLAP = 3
const COMMUNITY_BOOST = 2

type Aggregate = {
    candidate: RecCandidate
    frequency: number
    reasons: string[]
    seenOwners: Set<number>
}

// Sums a set of profile weights for the terms a candidate carries. Deterministic.
function overlap(terms: string[] | undefined, profile: Map<string, number>, total: number): number {
    if (!terms || terms.length === 0 || total === 0) return 0
    let sum = 0
    for (const term of terms) {
        sum += profile.get(term.toLocaleLowerCase("en")) ?? 0
    }
    return sum / total
}

export function scoreSuggestions(input: SuggestionsInput): Suggestion[] {
    const { library, anilistRecs, communityRecs } = input

    const ownedAnilistIds = new Set<number>()
    const ownedTitles = new Set<string>()
    const ownerTitleById = new Map<number, string>()
    const genreProfile = new Map<string, number>()
    const authorProfile = new Map<string, number>()
    let genreTotal = 0
    let authorTotal = 0

    for (const manga of library) {
        if (typeof manga.anilistId === "number") {
            ownedAnilistIds.add(manga.anilistId)
            if (!ownerTitleById.has(manga.anilistId)) ownerTitleById.set(manga.anilistId, manga.title)
        }
        ownedTitles.add(manga.normalizedTitle || normalizeTitle(manga.title))
        for (const genre of manga.genres ?? []) {
            const key = genre.toLocaleLowerCase("en")
            genreProfile.set(key, (genreProfile.get(key) ?? 0) + 1)
            genreTotal += 1
        }
        for (const author of manga.authors ?? []) {
            const key = author.toLocaleLowerCase("en")
            authorProfile.set(key, (authorProfile.get(key) ?? 0) + 1)
            authorTotal += 1
        }
    }

    const communityTitles = new Set((communityRecs ?? []).map(rec => normalizeTitle(rec.title)))

    const aggregates = new Map<number, Aggregate>()
    for (const [ownerId, candidates] of anilistRecs) {
        const ownerTitle = ownerTitleById.get(ownerId)
        for (const candidate of candidates) {
            const existing = aggregates.get(candidate.anilistId)
            if (existing) {
                if (!existing.seenOwners.has(ownerId)) {
                    existing.seenOwners.add(ownerId)
                    existing.frequency += 1
                    if (ownerTitle && !existing.reasons.includes(ownerTitle)) existing.reasons.push(ownerTitle)
                }
                continue
            }
            aggregates.set(candidate.anilistId, {
                candidate,
                frequency: 1,
                reasons: ownerTitle ? [ownerTitle] : [],
                seenOwners: new Set([ownerId])
            })
        }
    }

    const suggestions: Suggestion[] = []
    for (const agg of aggregates.values()) {
        const { candidate } = agg
        if (ownedAnilistIds.has(candidate.anilistId)) continue
        if (ownedTitles.has(normalizeTitle(candidate.title))) continue

        const genreOverlap = overlap(candidate.genres, genreProfile, genreTotal)
        const authorOverlap = overlap(candidate.authors, authorProfile, authorTotal)
        const overlapScore = Math.min(1, genreOverlap + authorOverlap)
        const community = communityTitles.has(normalizeTitle(candidate.title))
        const score =
            agg.frequency * WEIGHT_FREQUENCY + overlapScore * WEIGHT_OVERLAP + (community ? COMMUNITY_BOOST : 0)

        suggestions.push({
            anilistId: candidate.anilistId,
            title: candidate.title,
            ...(candidate.coverUrl ? { coverUrl: candidate.coverUrl } : {}),
            ...(candidate.genres ? { genres: candidate.genres } : {}),
            frequency: agg.frequency,
            overlapScore,
            community,
            score,
            reasons: agg.reasons
        })
    }

    suggestions.sort(
        (a, b) =>
            b.score - a.score ||
            b.frequency - a.frequency ||
            a.anilistId - b.anilistId ||
            a.title.localeCompare(b.title)
    )
    return suggestions
}
