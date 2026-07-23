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

const ZWJ = 0x200d
// C1 controls that move to a new line but aren't matched by JS \s: NEL, IND, RI. Mapped
// to a space so a title using them as a separator doesn't get its words glued together.
const LINE_MOVE_C1 = new Set([0x84, 0x85, 0x8d])

// Strip whole Unicode categories rather than hand-picked ranges, so sibling characters
// in the same class can't slip through the way earlier range-by-range attempts kept
// missing (ZWJ vs other zero-widths, one C1 control vs its siblings, one bidi mark vs
// the tag block). Cc = controls (ESC and friends - terminal forgery), Cf = format
// (bidi overrides that reorder text, invisible tag characters that smuggle hidden
// payloads, zero-width spaces), Cs = lone surrogates (invalid UTF-16 that corrupts the
// clipboard). ZWJ is the one Cf kept: it joins emoji sequences and can't forge or hide
// the log's structural markers. Emoji variation selectors (Mn) and skin-tone modifiers
// (So) are outside these categories and survive untouched.
const STRIP_CATEGORY = /\p{Cc}|\p{Cf}|\p{Cs}/u
// Characters that render with no visible advance width, used to decide the "(untitled)"
// fallback: whitespace, format/ignorable characters (Hangul fillers, remaining joiners),
// and ZWJ. A field made only of these shows blank and must get the placeholder.
const INVISIBLE = /\p{White_Space}|\p{Default_Ignorable_Code_Point}/u

function flatten(s: unknown): string {
    let out = ""
    for (const ch of String(s)) {
        const code = ch.codePointAt(0) ?? 0
        if (LINE_MOVE_C1.has(code)) {
            out += " "
            continue
        }
        // Whitespace (incl. tab/newline/CR and exotic spaces) is kept for the \s+ collapse
        // below, which turns it into a single ordinary space - preserving word boundaries.
        if (/\s/u.test(ch)) {
            out += ch
            continue
        }
        if (code === ZWJ) {
            out += ch
            continue
        }
        if (STRIP_CATEGORY.test(ch)) continue
        out += ch
    }
    return out.replace(/\s+/g, " ").trim()
}

function isVisuallyEmpty(s: string): boolean {
    for (const ch of s) {
        if ((ch.codePointAt(0) ?? 0) === ZWJ) continue
        if (INVISIBLE.test(ch)) continue
        return false
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
