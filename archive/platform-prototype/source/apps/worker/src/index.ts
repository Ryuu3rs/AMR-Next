import type {
    IngestCatalogInput,
    IngestCatalogResult,
    IngestChapterPagesInput,
    IngestChapterPagesResult,
    IngestErrorInput
} from "@amr-next/contracts"
import { jikanSourceAdapter } from "./adapters/jikan-source.js"
import { kitsuSourceAdapter } from "./adapters/kitsu-source.js"
import { mangadexSourceAdapter } from "./adapters/mangadex-source.js"
import { mockSourceAdapter } from "./adapters/mock-source.js"
import type { SourceAdapter } from "./adapters/types.js"

const apiBase = (process.env.API_BASE_URL ?? "http://localhost:8787").trim().replace(/\/+$/, "")
const ingestApiKey = process.env.INGEST_API_KEY
const pollMs = Number(process.env.WORKER_POLL_MS ?? 30000)
const maxBackoffMs = Number(process.env.WORKER_MAX_BACKOFF_MS ?? 300000)
const retryAttempts = Math.min(Math.max(Number(process.env.WORKER_RETRY_ATTEMPTS ?? 3), 1), 6)
const retryBaseDelayMs = Math.min(Math.max(Number(process.env.WORKER_RETRY_BASE_MS ?? 600), 100), 10000)
const enableMangadex = process.env.WORKER_ENABLE_MANGADEX !== "false"
const enableJikan = process.env.WORKER_ENABLE_JIKAN !== "false"
const enableKitsu = process.env.WORKER_ENABLE_KITSU !== "false"

const adapters: SourceAdapter[] = []
if (enableMangadex) adapters.push(mangadexSourceAdapter)
if (enableJikan) adapters.push(jikanSourceAdapter)
if (enableKitsu) adapters.push(kitsuSourceAdapter)
if (process.env.WORKER_ENABLE_MOCK_SOURCE === "1" || process.env.WORKER_ENABLE_MOCK_SOURCE === "true") {
    adapters.push(mockSourceAdapter)
}

if (adapters.length === 0) {
    throw new Error("No worker adapters enabled. Set WORKER_ENABLE_* flags to enable at least one source adapter.")
}

const sleep = async (ms: number): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, ms))
}

const jitteredBackoff = (attempt: number): number => {
    const exp = retryBaseDelayMs * 2 ** Math.max(0, attempt - 1)
    const jitter = Math.floor(Math.random() * retryBaseDelayMs)
    return Math.min(exp + jitter, maxBackoffMs)
}

const summarizeError = (error: unknown): { message: string; details?: string } => {
    if (error instanceof Error) {
        return {
            message: error.message,
            details: error.stack?.slice(0, 1200)
        }
    }
    return {
        message: String(error)
    }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
        "content-type": "application/json"
    }
    if (ingestApiKey) headers["x-amr-ingest-key"] = ingestApiKey

    const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    })
    if (!response.ok) {
        const details = await response.text()
        throw new Error(`POST ${path} failed (${response.status}): ${details}`)
    }
    return (await response.json()) as T
}

async function apiGet<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {}
    if (ingestApiKey) headers["x-amr-ingest-key"] = ingestApiKey

    const response = await fetch(`${apiBase}${path}`, { headers })
    if (!response.ok) {
        const details = await response.text()
        throw new Error(`GET ${path} failed (${response.status}): ${details}`)
    }
    return (await response.json()) as T
}

async function reportIngestError(input: IngestErrorInput, nowIso: string): Promise<void> {
    try {
        await apiPost("/internal/ingest/errors", {
            ...input,
            at: input.at ?? nowIso
        } satisfies IngestErrorInput)
    } catch (reportError) {
        console.error("[worker] failed to report ingest error", reportError)
    }
}

async function withRetry<T>(
    label: string,
    operation: () => Promise<T>,
    onFinalError?: (error: unknown, attempts: number) => Promise<void>
): Promise<T> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
        try {
            return await operation()
        } catch (error) {
            lastError = error
            if (attempt >= retryAttempts) break
            const waitMs = jitteredBackoff(attempt)
            console.warn(`[worker] retry ${label} attempt=${attempt}/${retryAttempts} wait_ms=${waitMs}`)
            await sleep(waitMs)
        }
    }

    if (onFinalError) await onFinalError(lastError, retryAttempts)
    throw lastError instanceof Error ? lastError : new Error(`${label} failed`)
}

async function runCycle(): Promise<boolean> {
    const started = Date.now()
    const nowIso = new Date().toISOString()
    let hasFailure = false

    try {
        const health = await withRetry("health", async () => await fetch(`${apiBase}/health`).then(res => res.json()))
        const ingestResults: IngestCatalogResult[] = []
        const pageResults: IngestChapterPagesResult[] = []

        for (const adapter of adapters) {
            let items: IngestCatalogInput["items"] = []
            try {
                items = await withRetry(
                    `${adapter.id}:pull_snapshot`,
                    async () => await adapter.pullSnapshot({ nowIso }),
                    async error => {
                        const details = summarizeError(error)
                        await reportIngestError(
                            {
                                source: adapter.id,
                                stage: "pull_snapshot",
                                message: details.message,
                                details: details.details,
                                retryable: true
                            },
                            nowIso
                        )
                    }
                )
            } catch {
                hasFailure = true
                continue
            }

            try {
                const payload: IngestCatalogInput = {
                    source: adapter.id,
                    harvestedAt: nowIso,
                    items
                }
                const result = await withRetry(
                    `${adapter.id}:post_catalog`,
                    async () => await apiPost<IngestCatalogResult>("/internal/ingest/catalog", payload),
                    async error => {
                        const details = summarizeError(error)
                        await reportIngestError(
                            {
                                source: adapter.id,
                                stage: "post_catalog",
                                message: details.message,
                                details: details.details,
                                retryable: true
                            },
                            nowIso
                        )
                    }
                )
                ingestResults.push(result)
            } catch {
                hasFailure = true
                continue
            }

            if (adapter.pullChapterPages) {
                try {
                    const chapterPages = await withRetry(
                        `${adapter.id}:pull_chapter_pages`,
                        async () => await adapter.pullChapterPages?.({ nowIso }, items),
                        async error => {
                            const details = summarizeError(error)
                            await reportIngestError(
                                {
                                    source: adapter.id,
                                    stage: "pull_chapter_pages",
                                    message: details.message,
                                    details: details.details,
                                    retryable: true
                                },
                                nowIso
                            )
                        }
                    )

                    if (chapterPages && chapterPages.length > 0) {
                        const pagePayload: IngestChapterPagesInput = {
                            source: adapter.id,
                            harvestedAt: nowIso,
                            items: chapterPages
                        }
                        const pageResult = await withRetry(
                            `${adapter.id}:post_chapter_pages`,
                            async () =>
                                await apiPost<IngestChapterPagesResult>("/internal/ingest/chapter-pages", pagePayload),
                            async error => {
                                const details = summarizeError(error)
                                await reportIngestError(
                                    {
                                        source: adapter.id,
                                        stage: "post_chapter_pages",
                                        message: details.message,
                                        details: details.details,
                                        retryable: true
                                    },
                                    nowIso
                                )
                            }
                        )
                        pageResults.push(pageResult)
                    }
                } catch {
                    hasFailure = true
                }
            }
        }

        let latestRunId = "-"
        let totals = "m0/c0/s0/a0"
        let discoverItems = 0
        try {
            const discover = await withRetry(
                "discover_health",
                async () => await fetch(`${apiBase}/v1/discover?page=1&pageSize=5`).then(res => res.json())
            )
            const ingestRunHead = await withRetry(
                "ingest_run_head",
                async () =>
                    await apiGet<{ items: Array<{ id: string; source: string }> }>("/internal/ingest/runs?limit=1")
            )
            const overview = await withRetry(
                "ingest_overview",
                async () =>
                    await apiGet<{
                        totalManga: number
                        totalChapters: number
                        totalSourceLinks: number
                        totalAliases: number
                        totalIngestRuns: number
                        latestIngestAt: string | null
                    }>("/internal/ingest/overview")
            )
            latestRunId = ingestRunHead.items[0]?.id ?? "-"
            totals = `m${overview.totalManga}/c${overview.totalChapters}/s${overview.totalSourceLinks}/a${overview.totalAliases}`
            discoverItems = discover.items?.length ?? 0
        } catch (error) {
            hasFailure = true
            const details = summarizeError(error)
            await reportIngestError(
                {
                    source: "worker",
                    stage: "cycle_observability",
                    message: details.message,
                    details: details.details,
                    retryable: true
                },
                nowIso
            )
        }

        const upsertSummary =
            ingestResults
                .map(result => `${result.source}:m${result.mangaUpserts}/c${result.chapterUpserts}`)
                .join(", ") || "-"
        const pageSummary = pageResults.map(result => `${result.source}:p${result.upserts}`).join(", ") || "-"

        console.log(
            `[worker] cycle ${hasFailure ? "partial" : "ok"} | api=${
                health.version
            } | discover_items=${discoverItems} | upserts=${upsertSummary} | pages=${pageSummary} | run=${latestRunId} | totals=${totals} | ms=${
                Date.now() - started
            }`
        )
        return !hasFailure
    } catch (error) {
        console.error(`[worker] cycle failed | ms=${Date.now() - started}`, error)
        const details = summarizeError(error)
        await reportIngestError(
            {
                source: "worker",
                stage: "cycle",
                message: details.message,
                details: details.details,
                retryable: true
            },
            nowIso
        )
        return false
    }
}

async function runLoop(): Promise<void> {
    let failureStreak = 0
    console.log(`[worker] started | api=${apiBase} | adapters=${adapters.length} | poll_ms=${pollMs}`)
    while (true) {
        const ok = await runCycle()
        failureStreak = ok ? 0 : Math.min(failureStreak + 1, 8)
        const delay = ok ? pollMs : Math.min(pollMs * 2 ** failureStreak, maxBackoffMs)
        if (!ok) {
            console.warn(`[worker] backoff | streak=${failureStreak} | next_ms=${delay}`)
        }
        await sleep(delay)
    }
}

void runLoop()
