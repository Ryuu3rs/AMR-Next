// Plain-text formatter for the user-exportable diagnostic log. Built by explicit
// string construction (never DOM-copied) so line breaks survive a clipboard copy, and
// every free-text field is flattened to one line (reusing updates-failure-log's Unicode
// sanitizer) so an injected newline can't forge a log line. Secrets are redacted before
// the log ever leaves the device - both known values (passed in) and by token pattern.

import type { LogEntry } from "./database"
import { flatten } from "./updates-failure-log"

// Backstop patterns for tokens that might appear in a captured message even if the exact
// value wasn't passed in `secrets` (e.g. a token echoed inside a fetch error string).
const TOKEN_PATTERNS: readonly RegExp[] = [
    /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub PAT (ghp_/gho_/ghu_/ghs_/ghr_)
    /github_pat_[A-Za-z0-9_]{20,}/g, // fine-grained GitHub PAT
    /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, // Authorization: Bearer <token>
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g // bare JWT (header.payload.signature)
]

function redact(text: string, secrets: readonly string[]): string {
    let out = text
    for (const secret of secrets) {
        // The log text is flattened (zero-width chars stripped, whitespace collapsed)
        // before it reaches here, so a secret carrying a U+200B or a double space no
        // longer matches the raw value literally. Redact both the raw secret and its
        // flattened form so an encoded variant can't slip past the literal split/join.
        for (const variant of new Set([secret, flatten(secret)])) {
            // Only redact non-trivial values so a blank/short config field can't blank the log.
            if (variant && variant.length >= 4) out = out.split(variant).join("[redacted]")
        }
    }
    for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, "[redacted]")
    return out
}

export type DiagnosticLogMeta = {
    version: string
    browser: string
    // Known secret values (AniList/gist tokens, community userId/username, gist id) to
    // redact literally. Empty/undefined entries are ignored.
    secrets: readonly string[]
}

export function formatDiagnosticLog(entries: readonly LogEntry[], meta: DiagnosticLogMeta): string {
    const secrets = meta.secrets.filter((s): s is string => typeof s === "string" && s.length > 0)
    const header = [
        "AMR diagnostic log",
        `generated: ${new Date().toISOString()}`,
        `extension version: ${meta.version}`,
        `browser: ${meta.browser}`,
        `entries: ${entries.length}`
    ].join("\n")

    const lines = entries.map(entry => {
        const time = new Date(entry.ts).toISOString()
        const src = entry.sourceId ? ` [${flatten(entry.sourceId)}]` : ""
        const detail = entry.detail ? ` | ${flatten(entry.detail)}` : ""
        // Redact the WHOLE assembled line, not per-field, so a secret is stripped no
        // matter which field it lands in (scope/sourceId were previously un-redacted)
        // and a secret spanning message+detail is caught too.
        const line = `${time} ${entry.level.toUpperCase()} ${flatten(entry.scope)}${src}: ${flatten(entry.message)}${detail}`
        return redact(line, secrets)
    })

    return `${header}\n\n${lines.join("\n") || "(no entries)"}`
}
