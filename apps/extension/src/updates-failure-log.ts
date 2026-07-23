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

// Zero-width joiner. Deliberately NOT stripped: it joins emoji sequences (a family
// emoji is MAN+ZWJ+WOMAN+ZWJ+GIRL) and, unlike the bidi controls below, it cannot
// reorder text or emit terminal escapes - stripping it only shatters legitimate titles.
const ZWJ = 0x200d
// Next line: a C1 control that behaves like a line break but is NOT matched by JS \s,
// so it's mapped to a space rather than deleted, preserving the word boundary.
const NEL = 0x85

// Code points deleted outright before whitespace collapse. Tab/LF/VT/FF/CR are excluded
// because the \s+ pass collapses them to a single space, keeping word boundaries.
// Everything here could otherwise corrupt a pasted log: C0/C1 controls (incl. ESC 0x1b),
// invisible/zero-width characters that can defeat the "(untitled)" fallback, the bidi
// marks/overrides/isolates that reorder a rendered line, and lone surrogates (a valid
// astral character iterates as a single code point >= 0x10000, so only UNPAIRED
// surrogates land in this range - they'd otherwise reach the clipboard as invalid UTF-16).
const UNSAFE_CODEPOINT_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x0, 0x8],
    [0xe, 0x1f],
    [0x7f, 0x84],
    [0x86, 0x9f],
    [0xad, 0xad],
    [0x61c, 0x61c],
    [0x180e, 0x180e],
    [0x200b, 0x200c],
    [0x200e, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x2064],
    [0x2066, 0x2069],
    [0xd800, 0xdfff],
    [0xfff9, 0xfffb]
]

function isUnsafeFormatChar(code: number): boolean {
    return UNSAFE_CODEPOINT_RANGES.some(([lo, hi]) => code >= lo && code <= hi)
}

function flatten(s: unknown): string {
    let out = ""
    for (const ch of String(s)) {
        const code = ch.codePointAt(0) ?? 0
        if (code === NEL) {
            out += " "
            continue
        }
        if (isUnsafeFormatChar(code)) continue
        out += ch
    }
    return out.replace(/\s+/g, " ").trim()
}

// True for "" and for a value made only of joiners - ZWJ survives flatten, so a title of
// nothing but ZWJ would otherwise render as a blank field instead of the placeholder.
function isVisuallyEmpty(s: string): boolean {
    for (const ch of s) {
        if ((ch.codePointAt(0) ?? 0) !== ZWJ) return false
    }
    return true
}

function orPlaceholder(s: string, placeholder: string): string {
    return isVisuallyEmpty(s) ? placeholder : s
}

function isoOrUnknown(ts: number): string {
    // new Date(NaN).toISOString() throws, and checkedAt can be missing/NaN before the
    // first check completes - never let formatting the log throw. A finite-but-out-of-
    // range timestamp (e.g. 8.64e15 + 1) also throws RangeError, which the catch covers.
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
        `extension version: ${orPlaceholder(flatten(meta?.version), "unknown")}`,
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
                      const idPart = isVisuallyEmpty(id) ? "" : ` [${id}]`
                      const title = orPlaceholder(flatten(e.title), "(untitled)")
                      const message = orPlaceholder(flatten(e.message), "(no message)")
                      return `- ${title}${idPart}: ${message}`
                  })
                  .join("\n")
            : "(no per-title errors recorded)"

    return `${header}\n\n${body}`
}
