# Plan: diagnostic log export (#12)

Capture structured diagnostic events into a bounded local buffer the user can export to
a file, so field issues (weebcentral truncation, import, metadata) can be diagnosed
without devtools. Reuses existing infrastructure - not a parallel system.

## Data model (Dexie v10 - new table)

```ts
type LogEntry = {
    id?: number
    ts: number
    level: "debug" | "info" | "warn" | "error"
    scope: string // "capture" | "update-check" | "reader" | "metadata" | "anilist" | "import" | "chapters" ...
    message: string // short human line
    detail?: string // JSON blob, redacted
    sourceId?: string
}
```

New Dexie table `logs: "++id, ts, level"` added as `this.version(10)` (current is v9).
Mirrors the existing `analyticsEvents` table exactly.

## recordLog helper (database.ts)

Copies `recordAnalyticsEvent`'s append-then-prune shape, but trims by COUNT (keep last
~2000) instead of age:

```ts
const LOG_MAX = 2000
export async function recordLog(entry: Omit<LogEntry, "id">): Promise<void> {
    await db.logs.add(entry)
    const count = await db.logs.count()
    if (count > LOG_MAX) {
        const excess = await db.logs
            .orderBy("id")
            .limit(count - LOG_MAX)
            .primaryKeys()
        await db.logs.bulkDelete(excess)
    }
}
```

Fire-and-forget at call sites (never blocks the real work).

## Logger module `src/diag-log.ts`

`diag.info/warn/error(scope, message, detail?)` -> `console.*` (unchanged devtools
behavior) AND `void recordLog(...)`. From content-script/UI contexts (no db access),
route via a `log:record` runtime message (same shape as `analytics:record`).

## Emit sites (the diagnostic-relevant ones, not all 22 console calls)

- **chapter-list counts** - "listed N chapters for {sourceId}" after each listChapters
  (this is exactly what would have surfaced the weebcentral 9-vs-244 truncation).
- capture errors/ok (background/capture.ts).
- update-check per-title failures (updates-sources.ts - already has an errors array).
- metadata provider outcomes (vps/anilist resolve hit/miss/error).
- import summary (converted/skipped/needsAttention counts).
- reader resolve path (direct vs tab, already analytics - can add a log line).

## Export

- Handler `log:export` -> returns all `LogEntry[]` (newest-first). READ_ONLY.
- Formatter `src/diagnostic-log.ts formatDiagnosticLog(entries, version)` modeled on
  `updates-failure-log.ts`: header (generated, extension version, browser), one line per
  entry `[ISO ts] LEVEL scope: message | detail`, reusing that file's control/format-
  Unicode flattening AND adding secret redaction.
- UI: an "Export log" `data-row` in the Data section (App.svelte ~3762) with **Copy**
  (formatted text to clipboard) + **Download** (Blob -> object-URL anchor,
  `amr-diagnostic-log-<date>.txt`), mirroring `ImportReconcile.downloadDebugLog` +
  `copyUpdateFailureLog` (with its re-entrancy + component-alive guards).

## Redaction (must strip before the log leaves the device)

Reuse/extend `updates-failure-log.ts`'s sanitizer, plus secret-stripping:

- GitHub PATs (`ghp_…`, `github_pat_…`), `Authorization: token/Bearer …`.
- AniList bearer tokens (opaque strings after `Bearer`).
- Community `userId`/`username` (community.ts), gist `gistId` (syncConfig).
- URL query strings / embedded credentials generally.
  Titles/source URLs are the user's own library data - kept (they're sharing to get help);
  a one-line UI note says the log includes their library's titles/sources.

## Wiring

- runtime.ts: add `log:export` (+ `log:record` for content-script/UI emit).
- dispatch.ts: register a `logHandlers` group.
- mutation-scopes.ts: `log:export` + `log:record` -> READ_ONLY.
- Dexie v10 migration block.

## Tests

- recordLog count-cap trim.
- formatDiagnosticLog redaction (tokens/userId/gistId stripped; newline-forgery flattened).
- log:export handler returns entries.

## Scope for review

MVP = recordLog + the high-value emit sites above + Export button + redaction + tests.
NOT wrapping every console.\* call - only the diagnostic-relevant ones. Format: both a
copyable formatted .txt and a downloadable file (mirrors the reconcile log which does both).

## Open question

1. Buffer size 2000 entries OK? (a few hundred KB worst case.)
2. Export as formatted .txt (easy to paste to you) - confirm, vs raw JSON, vs both.
