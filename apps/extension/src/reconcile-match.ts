// Strips (Official)/[Official]/«Official»-style decoration groups from a title before
// matching. \b word boundaries reject "Unofficial"/"Officially" (which legitimately
// contain "official" as a substring but aren't the marker) - only a bracketed group
// whose content is exactly/contains the standalone word "official" is stripped.
export function cleanQuery(title: string): string {
    return title.replace(/\s*[(\[«][^)\]»]*\bofficial\b[^)\]»]*[)\]»]/gi, "").trim()
}

export type RankableCandidate = {
    sourceId: string
    latestChapter?: string // may be "?" or a numeric string
}

// Ranks eligible auto-link candidates: sources with the "pages" capability first,
// "mangahub" pushed last among otherwise-equal candidates, then by chapter count
// descending. A single bad pick here (e.g. kagane, which can silently return an
// empty chapter list from a background-context Cloudflare 403) is recovered from
// by the caller retrying the next-ranked candidate, not by this ordering itself.
export function rankCandidates<T extends RankableCandidate>(
    candidates: T[],
    pagesCapableSourceIds: ReadonlySet<string>
): T[] {
    return [...candidates].sort((a, b) => {
        const aPages = pagesCapableSourceIds.has(a.sourceId)
        const bPages = pagesCapableSourceIds.has(b.sourceId)
        if (aPages !== bPages) return aPages ? -1 : 1
        const aMangahub = a.sourceId === "mangahub"
        const bMangahub = b.sourceId === "mangahub"
        if (aMangahub !== bMangahub) return aMangahub ? 1 : -1
        return (parseFloat(b.latestChapter ?? "") || 0) - (parseFloat(a.latestChapter ?? "") || 0)
    })
}
