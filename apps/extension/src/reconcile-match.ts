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

// One attempt to link a manga to a candidate result, from either the auto-link
// retry loop ("auto") or the panel's manual per-result Link button ("manual").
// Tagging the trigger keeps a manual click on a card that already went through
// an auto-link sweep from being mislabeled as part of that sweep.
export type LinkAttempt = {
    sourceId: string
    resultTitle: string
    latestChapter: string | null
    outcome: "linked" | "failed"
    // Raw cause.message, captured BEFORE describeError() sanitizes it for display.
    failureReason?: string
    trigger: "auto" | "manual"
}

// Per-manga record of what happened while reconciling a dead (or, in a library
// scan, merely improvable) source, for a "copy/download debug log" button - a
// structured alternative to a free-hand terminal copy of the panel.
export type TitleLogEntry = {
    mangaId: string
    title: string
    deadSource: string
    lastReadChapterNumber: number | null
    latestChapterNumber: number | null
    cleanedQuery: string
    officialMarkerStripped: boolean
    rawTitleFallbackUsed: boolean
    searchErrors: string[]
    // Unset (rather than 0) when the outer search catch fired before this could
    // be computed - lets the log distinguish "found nothing" from "never got far
    // enough to count".
    rawResultCount?: number
    closeMatchCount?: number
    displayedResultCount?: number
    autoLink: null | {
        exactMatchCount: number
        overlapFallbackUsed: boolean
        eligibleCount: number
        filteredCount: number
        // The FINAL order actually attempted, after both rankCandidates() and the
        // switchFailures reorder/filter - i.e. exactly what the retry loop iterated.
        rankedSourceIds: string[]
        // Ranked-and-eligible candidates dropped entirely by the switchFailures
        // >=3-failures exclusion, before any attempt was made on them.
        benchedSourceIds: string[]
        attempts: LinkAttempt[]
    }
    finalOutcome:
        | "auto-linked"
        | "manually-linked"
        | "manual-candidates"
        | "no-results"
        | "search-failed"
        | "auto-link-exhausted"
    finalMessage: string
}

export type SweepMeta = {
    startedAt: number
    finishedAt: number | null
    stopped: boolean
    autoLinkEnabled: boolean
    isLibraryScan: boolean
    total: number
}

// Every interpolated free-text field gets flattened to a single line before
// insertion, so an embedded newline in a title or a multi-line error message
// can't break the line-oriented format or masquerade as a section heading.
function flatten(s: string): string {
    return s.replace(/\s+/g, " ").trim()
}

function formatAttempt(a: LinkAttempt): string {
    const reason = a.failureReason ? ` - reason: ${flatten(a.failureReason)}` : ""
    return `  [${a.trigger}] ${a.sourceId} (${flatten(a.resultTitle)}, ch ${a.latestChapter ?? "?"}) -> ${a.outcome}${reason}`
}

function formatTitleBlock(entry: TitleLogEntry): string {
    const lines: string[] = []
    lines.push(`--- ${flatten(entry.title)} ---`)
    lines.push(`manga id: ${entry.mangaId}`)
    lines.push(`dead source: ${flatten(entry.deadSource)}`)
    lines.push(`read ch: ${entry.lastReadChapterNumber ?? "none"} | latest ch: ${entry.latestChapterNumber ?? "none"}`)
    lines.push(
        `query: "${flatten(entry.title)}" -> "${flatten(entry.cleanedQuery)}" ` +
            `(official marker stripped: ${entry.officialMarkerStripped ? "yes" : "no"}, ` +
            `raw-title fallback used: ${entry.rawTitleFallbackUsed ? "yes" : "no"})`
    )
    lines.push(
        `search funnel: raw=${entry.rawResultCount ?? "n/a"} close=${entry.closeMatchCount ?? "n/a"} ` +
            `displayed=${entry.displayedResultCount ?? "n/a"}`
    )
    if (entry.searchErrors.length > 0) {
        lines.push(`search errors: ${entry.searchErrors.map(flatten).join(" | ")}`)
    }
    if (entry.autoLink) {
        const al = entry.autoLink
        lines.push(
            `auto-link: exact=${al.exactMatchCount} overlapFallback=${al.overlapFallbackUsed ? "yes" : "no"} ` +
                `eligible=${al.eligibleCount} filtered=${al.filteredCount}`
        )
        lines.push(
            `ranked order (actually attempted): ${al.rankedSourceIds.length > 0 ? al.rankedSourceIds.join(", ") : "(none)"}`
        )
        lines.push(
            `benched (dropped by repeat-failure threshold): ${al.benchedSourceIds.length > 0 ? al.benchedSourceIds.join(", ") : "(none)"}`
        )
        if (al.attempts.length > 0) {
            lines.push("attempts:")
            for (const attempt of al.attempts) lines.push(formatAttempt(attempt))
        }
    }
    lines.push(`outcome: ${entry.finalOutcome} - ${flatten(entry.finalMessage)}`)
    return lines.join("\n")
}

function formatSection(title: string, entries: TitleLogEntry[]): string {
    const heading = `=== ${title} (${entries.length}) ===`
    const body = entries.length > 0 ? entries.map(formatTitleBlock).join("\n\n") : "(none)"
    return `${heading}\n${body}`
}

// Plain text built entirely via explicit join()/template-literal construction -
// never DOM-copied - so it's immune to the panel's flex-column card layout
// dropping line breaks between cards on a plain-text clipboard copy.
export function formatReconcileLog(entries: TitleLogEntry[], meta: SweepMeta | null, version: string): string {
    const generatedAt = new Date().toISOString()
    const metaLine = meta
        ? `auto-link: ${meta.autoLinkEnabled ? "on" : "off"} | library scan: ${meta.isLibraryScan ? "on" : "off"} | ` +
          `started: ${new Date(meta.startedAt).toISOString()} | ` +
          `finished: ${meta.finishedAt != null ? new Date(meta.finishedAt).toISOString() : "in progress"} | ` +
          `stopped early: ${meta.stopped ? "yes" : "no"} | total in sweep: ${meta.total}`
        : "sweep meta: none (these entries came from standalone searches, not a Search all sweep)"
    const header = [
        `AMR reconcile debug log`,
        `generated: ${generatedAt}`,
        `extension version: ${version}`,
        metaLine
    ].join("\n")

    const failed = entries.filter(
        e =>
            e.finalOutcome === "no-results" ||
            e.finalOutcome === "search-failed" ||
            e.finalOutcome === "auto-link-exhausted"
    )
    const manualCandidates = entries.filter(e => e.finalOutcome === "manual-candidates")
    const successes = entries.filter(e => e.finalOutcome === "auto-linked" || e.finalOutcome === "manually-linked")

    const summary =
        `summary: ${entries.length} title(s) recorded - ${failed.length} failed/exhausted, ` +
        `${manualCandidates.length} awaiting manual pick, ${successes.length} linked`

    return [
        header,
        summary,
        formatSection("Failures / exhausted", failed),
        formatSection("Manual candidates pending", manualCandidates),
        formatSection("Successes", successes)
    ].join("\n\n")
}
