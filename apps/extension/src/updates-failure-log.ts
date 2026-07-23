// Plain-text, copy-pasteable log of the titles that failed an update check, for the
// user to hand to a maintainer. Built by explicit string construction (never
// DOM-copied) so the card layout can't drop line breaks, and every interpolated
// free-text field is flattened to one line so an embedded newline in a title or error
// message can't forge a new log line or section heading.

export type UpdateFailureEntry = {
    mangaId: string
    title: string
    message: string
}

export type UpdateFailureMeta = {
    version: string
    checkedAt: number
    checked: number
    updated: number
    failed: number
}

// Code-point ranges of control/format characters stripped before whitespace collapse.
// Tab/newline/CR are deliberately excluded - the \s+ pass collapses them to a single
// space, preserving word boundaries. Everything here could otherwise corrupt a paste:
// C0 controls (incl. ESC 0x1b), DEL + C1 (0x7f-0x9f), zero-width chars, and bidi
// marks/overrides/isolates that can reorder a rendered line. Expressed as hex ranges
// rather than a regex with literal control chars so the source stays plain ASCII.
const UNSAFE_CODEPOINT_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x0, 0x8],
    [0xe, 0x1f],
    [0x7f, 0x9f],
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2066, 0x2069]
]

function isUnsafeFormatChar(code: number): boolean {
    return UNSAFE_CODEPOINT_RANGES.some(([lo, hi]) => code >= lo && code <= hi)
}

function flatten(s: unknown): string {
    let out = ""
    for (const ch of String(s)) {
        if (!isUnsafeFormatChar(ch.codePointAt(0) ?? 0)) out += ch
    }
    return out.replace(/\s+/g, " ").trim()
}

function isoOrUnknown(ts: number): string {
    // new Date(NaN).toISOString() throws, and checkedAt can be missing/NaN before the
    // first check completes - never let formatting the log throw. A finite-but-out-of-
    // range timestamp (e.g. 9e15) also throws RangeError, which the try/catch covers.
    if (!Number.isFinite(ts)) return "unknown"
    try {
        return new Date(ts).toISOString()
    } catch {
        return "unknown"
    }
}

function num(n: unknown): string {
    return typeof n === "number" && Number.isFinite(n) ? String(n) : "?"
}

export function formatUpdateFailureLog(errors: readonly UpdateFailureEntry[], meta: UpdateFailureMeta): string {
    const header = [
        "AMR update-failure log",
        `checked at: ${isoOrUnknown(meta?.checkedAt)}`,
        `extension version: ${flatten(meta?.version)}`,
        `checked: ${num(meta?.checked)} | updated: ${num(meta?.updated)} | failed: ${num(meta?.failed)}`
    ].join("\n")

    // Tolerate a null/undefined entry or a non-array (corrupt storage / a future producer
    // change) rather than throwing - the whole point is a resilient bug-report artifact.
    const rows = (Array.isArray(errors) ? errors : []).filter((e): e is UpdateFailureEntry => e != null)
    const body =
        rows.length > 0
            ? rows
                  .map(e => {
                      const id = flatten(e.mangaId)
                      const idPart = id ? ` [${id}]` : ""
                      return `- ${flatten(e.title) || "(untitled)"}${idPart}: ${flatten(e.message) || "(no message)"}`
                  })
                  .join("\n")
            : "(no per-title errors recorded)"

    return `${header}\n\n${body}`
}
