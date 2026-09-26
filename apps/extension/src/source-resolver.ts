import { anilistProvider } from "./metadata/anilist"
import {
    cleanQuery,
    dedupeCandidates,
    filterEligibleCandidates,
    normTitle,
    rankCandidates,
    scoreOverlapFallback,
    selectCloseMatches,
    selectExactMatches
} from "./reconcile-match"
import { getSettings } from "./settings"
import { getPagesCapableSourceIds, searchManga, type MangaSearchResult } from "./sources"

// How confident the resolver is that `best` is the same series as the requested title:
//   high - an exact normalized-title match that also clears the chapter-count
//          eligibility floor (a safe auto-adopt candidate in a later slice)
//   low  - candidates exist but none is a clean exact+eligible match (manual review)
//   none - nothing plausible was found
export type ResolveConfidence = "high" | "low" | "none"

// Read-only lookup input. anilistId lets the resolver derive tracker-authoritative
// title variants lazily; searchTitles, when the caller already has them, skips that
// derivation entirely; title is the always-present fallback query.
export type ResolveSourceInput = {
    anilistId?: number
    title: string
    searchTitles?: string[]
}

export type ResolveResult = {
    matched: boolean
    // Best-ranked candidate (top eligible exact match for "high", else top-ranked
    // overall). Absent only when nothing was found.
    best?: MangaSearchResult
    // Every deduped candidate for the winning query variant, ranked.
    candidates: MangaSearchResult[]
    confidence: ResolveConfidence
    // The query variant that produced `candidates`, for logging/debug.
    query?: string
}

function noMatch(): ResolveResult {
    return { matched: false, candidates: [], confidence: "none" }
}

// The title variants to try, best-first: an explicit searchTitles list wins; else,
// when an anilistId is known, the tracker's Latin variants are fetched lazily; else
// just the local title. Deriving from the tracker is skipped entirely when the
// caller already supplied variants, so this never fires an unnecessary AniList call.
async function resolveVariants(input: ResolveSourceInput): Promise<string[]> {
    if (input.searchTitles && input.searchTitles.length > 0) return input.searchTitles
    if (input.anilistId != null && anilistProvider.resolveSearchTitles) {
        const derived = await anilistProvider.resolveSearchTitles(input.anilistId)
        if (derived.length > 0) return derived
    }
    return [input.title]
}

// Turns a non-empty candidate set into a ranked ResolveResult. "high" confidence
// requires an exact normalized-title match that also passes the chapter-count
// eligibility floor (filterEligibleCandidates with no read position, no library
// scan) - the same safety gate the reconcile auto-link path uses.
function finalize(candidates: MangaSearchResult[], want: string, query: string): ResolveResult {
    const exactMatches = selectExactMatches(candidates, want)
    const exactMatchSet = new Set(exactMatches)
    const { eligible } = filterEligibleCandidates(
        candidates,
        { lastReadChapterNumber: null, latestChapterNumber: null },
        false,
        exactMatchSet
    )
    const pagesCapable = getPagesCapableSourceIds()
    const ranked = rankCandidates(candidates, pagesCapable)
    const eligibleExact = rankCandidates(
        eligible.filter(c => exactMatchSet.has(c)),
        pagesCapable
    )
    const high = eligibleExact.length > 0
    const best = high ? eligibleExact[0] : ranked[0]
    return {
        matched: true,
        candidates: ranked,
        confidence: high ? "high" : "low",
        ...(best ? { best } : {}),
        ...(query ? { query } : {})
    }
}

// Resolve a single title to live source candidates, tracker-first and read-only:
// tries each title variant against the aggregate source search (best-first, stopping
// at the first variant with a close-title match), scores/dedupes/ranks with the
// shared reconcile helpers, and reports a confidence. Writes nothing - adopting a
// result into the library is a later slice. One logical title per call; the
// cross-title background sweep is also a later slice. Relies on searchManga's own
// per-source skip-memo for rate-limit friendliness.
export async function resolveSource(input: ResolveSourceInput): Promise<ResolveResult> {
    const title = input.title.trim()
    if (!title) return noMatch()

    const settings = await getSettings()
    const excluded = new Set(settings.searchDisabledSourceIds)
    const variants = await resolveVariants({ ...input, title })

    // Remembered overlap-only fallback from the first variant that returned results
    // but no close match - used only if no later variant produces a close match, so
    // an exact match on a better variant always wins over an earlier fuzzy one.
    let fallback: { candidates: MangaSearchResult[]; want: string; query: string } | null = null

    for (const variant of variants) {
        const query = cleanQuery(variant)
        if (!query) continue
        const want = normTitle(query)
        let results: MangaSearchResult[]
        try {
            results = await searchManga(query, excluded)
        } catch {
            continue
        }
        if (results.length === 0) continue
        const close = selectCloseMatches(results, want)
        if (close.length > 0) return finalize(dedupeCandidates(close), want, query)
        if (!fallback) {
            const scored = scoreOverlapFallback(results, want)
            if (scored.length > 0) fallback = { candidates: scored, want, query }
        }
    }

    if (fallback) return finalize(fallback.candidates, fallback.want, fallback.query)
    return noMatch()
}
