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

function flatten(s: string): string {
    return String(s).replace(/\s+/g, " ").trim()
}

function isoOrUnknown(ts: number): string {
    // new Date(NaN).toISOString() throws, and checkedAt can be missing/NaN before the
    // first check completes - never let formatting the log throw.
    if (!Number.isFinite(ts)) return "unknown"
    try {
        return new Date(ts).toISOString()
    } catch {
        return "unknown"
    }
}

export function formatUpdateFailureLog(errors: readonly UpdateFailureEntry[], meta: UpdateFailureMeta): string {
    const header = [
        "AMR update-failure log",
        `checked at: ${isoOrUnknown(meta.checkedAt)}`,
        `extension version: ${flatten(meta.version)}`,
        `checked: ${meta.checked} | updated: ${meta.updated} | failed: ${meta.failed}`
    ].join("\n")

    const body =
        errors.length > 0
            ? errors
                  .map(e => {
                      const id = flatten(e.mangaId)
                      const idPart = id ? ` [${id}]` : ""
                      return `- ${flatten(e.title) || "(untitled)"}${idPart}: ${flatten(e.message) || "(no message)"}`
                  })
                  .join("\n")
            : "(no per-title errors recorded)"

    return `${header}\n\n${body}`
}
