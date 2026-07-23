import { sourceRegistry } from "@amr/sources"
import { isNumberedChapter, latestNumberedChapter, matchesSourceDomain } from "@amr/source-sdk"
import { applyUpdateCheckResult, db, repairMangahubChapters, updateManga, type LibraryManga } from "../database"
import {
    checkSourcePermission,
    getMangaChapters,
    listChaptersForSource,
    listMangaChapters,
    resolveGenresFor,
    searchManga
} from "../sources"
import { getSettings } from "../settings"
import { isNewerVersion } from "../update-check"
import { EXTENSION_UPDATE_INTERVAL_HOURS, GITHUB_RELEASES_URL } from "../background/alarms"
import { isBotBlocked } from "../background/capture"
import { MANGAHUB_INTERNAL_ID_MIN, purgeStaleMangahubChapterRows } from "../background/chapter-cache"
import { delay, type HandlerMap } from "../background/handler-types"
import { publishLive } from "../live"

let updateCheckRunning = false
let updateCheckAborted = false
let genreBackfillRunning = false
let genreBackfillAborted = false

// Signal any running long, rate-limited background loop to stop at its next
// between-items boundary. Used when an extension update is waiting to be applied: a
// multi-minute loop keeps the service worker busy, which defers the update (the case
// that wedged installs). Both the update check AND the genre backfill are per-item
// loops with a ~350ms delay each, so both must yield. Aborting lets the worker go idle
// so the browser applies the pending update on its own - we intentionally do NOT force
// runtime.reload() (see the onUpdateAvailable listener in background.ts for why).
export function abortLongRunningTasks(): void {
    if (updateCheckRunning) updateCheckAborted = true
    if (genreBackfillRunning) genreBackfillAborted = true
}

// A crashed check (service worker killed mid-loop - browser closed, SW
// terminated/evicted) leaves updateProgress.running: true in storage forever:
// nothing but a fresh check's writeProgress() call ever flips it back, and the
// in-memory updateCheckRunning guard resets to false on every SW restart, so it
// can't tell a genuinely running check apart from a dead one. Treat a stored
// running: true older than this as dead rather than trusting it forever. Sized
// generously above what even a very large library could plausibly take: each
// title pauses 400ms for rate-limiting plus its own network round trip, so a
// library of many hundreds of titles can legitimately run several minutes -
// 15 minutes is comfortably past that while still recovering a stuck state quickly
// rather than leaving it wedged indefinitely.
const STALE_PROGRESS_TIMEOUT_MS = 15 * 60 * 1000

type UpdateProgress = {
    running: boolean
    done: number
    total: number
    currentTitle?: string
    sourceId?: string
    startedAt: number
}

// Proactively clear a stale "running" progress record left by a check whose
// service worker was killed mid-loop (browser closed, SW evicted, or - the case
// that bricked installs - an extension update landing while a check ran). Called
// from the background's onStartup/onInstalled: the in-memory updateCheckRunning
// guard is definitionally false in a freshly-started worker, so any persisted
// running: true at that point belongs to a dead check and nothing else will ever
// flip it back. Without this the check UI showed "running" forever until the next
// user-triggered check happened to hit the reactive stale-recovery in the
// updates:check handler. Leaves done/total/startedAt intact for display.
export async function clearStaleUpdateProgress(): Promise<void> {
    const stored = (await browser.storage.local.get("updateProgress"))["updateProgress"] as UpdateProgress | undefined
    // Re-check the in-memory guard AFTER the async get: onStartup fires this unawaited
    // while an overdue alarm can start a real check in the same fresh worker moments
    // later. If that check is now running, its progress record is live - clearing it
    // would flip the UI to "not running" mid-check until the next per-title write. The
    // guard is same-worker-accurate, so this reliably distinguishes a dead record from
    // a freshly-started one.
    if (!stored?.running || updateCheckRunning) return
    // Re-read immediately before writing: a full check can start AND finish between the
    // first get() above and here (an overdue alarm firing checkUpdates in the same fresh
    // worker), writing its own fresh progress. Writing {...stored} would then resurrect
    // the dead run's done/total over the real one. Only clear if the record is still the
    // exact stale one we read - same startedAt, still running.
    const current = (await browser.storage.local.get("updateProgress"))["updateProgress"] as UpdateProgress | undefined
    if (current?.running && current.startedAt === stored.startedAt && !updateCheckRunning) {
        await browser.storage.local.set({
            updateProgress: { ...current, running: false } satisfies UpdateProgress
        })
    }
}

export async function checkUpdates(sourceId?: string) {
    if (updateCheckRunning) return
    updateCheckRunning = true
    updateCheckAborted = false
    const startedAt = Date.now()
    try {
        let manga: LibraryManga[]
        let language: string
        try {
            const settings = await getSettings()
            const all = await db.manga.toArray()
            const scoped = sourceId ? all.filter(item => item.sourceId === sourceId) : all
            manga = scoped.filter(item => !item.manualTracking && !item.onHold)
            language = settings.language
        } catch (error) {
            // Loading settings/the library itself failed before the loop could even
            // start - record a failure state instead of leaving an unhandled rejection
            // (which the old request/response contract would also have surfaced badly)
            // and a progress indicator stuck showing "running" forever.
            const message = error instanceof Error ? error.message : "Update check failed to start"
            console.error("[AMR] Update check failed to start", error)
            const failure: Record<string, unknown> = {
                updateProgress: { running: false, done: 0, total: 0, startedAt } satisfies UpdateProgress
            }
            if (!sourceId) {
                failure["updateStatus"] = {
                    checked: 0,
                    updated: 0,
                    failed: 0,
                    checkedAt: Date.now(),
                    errors: [{ mangaId: "", title: "Update check", message }]
                }
            }
            await browser.storage.local.set(failure)
            return
        }

        let checked = 0
        let updated = 0
        let failed = 0
        let done = 0
        const total = manga.length
        const errors: Array<{ mangaId: string; title: string; message: string }> = []
        // Per-sourceId count of titles skipped this run because the source's own
        // listChapters call threw a bot-block-shaped error (e.g. a Cloudflare 403) -
        // see the per-title catch block below. Kept separate from `failed` since this
        // routine background loop has no tab-fallback to recover with, so a persistent
        // per-title "failed to update" row here is noisy and unactionable; one
        // aggregate notice per source is added to `errors` after the loop instead.
        const botBlockedCounts = new Map<string, number>()

        const writeProgress = async (currentTitle?: string) => {
            const progress: UpdateProgress = {
                running: true,
                done,
                total,
                ...(currentTitle ? { currentTitle } : {}),
                ...(sourceId ? { sourceId } : {}),
                startedAt
            }
            await browser.storage.local.set({ updateProgress: progress })
        }

        await writeProgress()

        for (const item of manga) {
            // Between-titles abort point: an extension update is waiting and needs the
            // worker idle. Stop cleanly here (never mid-transaction) and let the finally
            // below mark progress not-running so the UI doesn't show a wedged check.
            if (updateCheckAborted) break
            const link = await db.sourceLinks.get(item.id)
            if (link) {
                await writeProgress(item.title)
                try {
                    const chapters = await listMangaChapters(item, link, language)
                    // Prefer the highest NUMBERED chapter - an unguarded reduce over every
                    // sortKey lets a single unnumbered chapter (Infinity) win the "latest"
                    // contest and become latestChapterId/sourceUrl, pointing the manga at a
                    // chapter with no real number. Only fall back to picking among whatever
                    // was fetched (the old reduce) when NOTHING fetched is numbered - that
                    // keeps applyUpdateCheckResult's documented "non-finite means advanced"
                    // id-change self-heal working for a manga with no numbered chapters at all.
                    const latest =
                        latestNumberedChapter(chapters) ??
                        chapters.reduce(
                            (current, chapter) => (chapter.sortKey > (current?.sortKey ?? -1) ? chapter : current),
                            chapters[0]
                        )
                    // Always re-point on an id change - this is the self-heal path merges
                    // and relinks rely on (a carried/dangling latestChapterId gets
                    // replaced by the source's real latest row, and a merge-inflated
                    // latestChapterNumber drops back to the source's true count - see
                    // mergeMangaRecords's cross-source policy). But only COUNT it as an
                    // update and publish a live event when the chapter number actually
                    // advanced: an id change with a same-or-lower number is a re-slug or
                    // a post-merge correction, not a new chapter, and reporting it
                    // inflated the "N updated" status and pushed phantom entries onto
                    // the Updates page. Chapters without a finite sortKey can't be
                    // compared, so they keep the old id-change-means-updated behavior.
                    const { advanced } = await applyUpdateCheckResult({
                        mangaId: item.id,
                        chapters,
                        latest,
                        previousLatestChapterId: item.latestChapterId,
                        previousLatestChapterNumber: item.latestChapterNumber,
                        ...(link.sourceId === "mangahub"
                            ? { purgeStaleMangahub: (ids: Set<string>) => purgeStaleMangahubChapterRows(item.id, ids) }
                            : {})
                    })
                    if (advanced) {
                        updated += 1
                        publishLive(["chapters", "library"], [item.id])
                    }
                    checked += 1
                } catch (error) {
                    if (isBotBlocked(error)) {
                        botBlockedCounts.set(item.sourceId, (botBlockedCounts.get(item.sourceId) ?? 0) + 1)
                        console.debug("[AMR] Update check skipped (bot-blocked)", {
                            mangaId: item.id,
                            sourceId: item.sourceId
                        })
                        // Fall through WITHOUT failed+=1, WITHOUT errors.push, WITHOUT the
                        // console.warn below - this is a known, currently-unactionable-via-
                        // this-path condition (no tab-fallback in this routine background
                        // loop), not a real per-title failure.
                    } else {
                        failed += 1
                        const message = error instanceof Error ? error.message : "Update failed"
                        errors.push({ mangaId: item.id, title: item.title, message })
                        console.warn("[AMR] Update check failed", { mangaId: item.id, error })
                    }
                } finally {
                    // Pause between every iteration (success or failure) so sites don't
                    // rate-limit when the library has many titles from the same source.
                    await delay(400)
                }
            }
            done += 1
        }

        // One aggregate notice per bot-blocked source, not full silence - a user
        // still gets some signal that a whole source has stopped updating via this
        // path, without a persistent noisy row per title. unshift (not push) so
        // these survive the errors.slice(0, 20) cap below even when the library is
        // large enough to otherwise push them out.
        for (const [blockedSourceId, count] of botBlockedCounts) {
            errors.unshift({
                mangaId: "",
                title: blockedSourceId,
                message: `${count} title(s) skipped - this site is blocking automated checks; chapters still load in the reader`
            })
        }

        // Keep only the most recent handful of errors so the status stays small.
        const status = { checked, updated, failed, checkedAt: Date.now(), errors: errors.slice(0, 20) }
        const finalWrite: Record<string, unknown> = {
            updateProgress: { running: false, done, total, startedAt } satisfies UpdateProgress
        }
        // Only a full, all-sources check represents the library-wide status the Updates
        // page displays - a single-source "refresh this source" run would otherwise
        // clobber that global status with counts computed from just one source's manga.
        // An aborted check (extension update pending) also must not publish its partial
        // counts as a completed library-wide status: 3/500 titles checked would show on
        // the Updates page as a fresh, finished check. Leave the previous status intact.
        if (!sourceId && !updateCheckAborted) finalWrite["updateStatus"] = status
        await browser.storage.local.set(finalWrite)
        return status
    } finally {
        updateCheckRunning = false
        updateCheckAborted = false
    }
}

const MANGAHUB_CHAPTER_REPAIR_FLAG = "mangahubChapterRepairDone"

// One-time repair sweep for libraries poisoned by the pre-fix extractChapters bug
// (MangaHub's id-slug "alternate version" chapter anchors getting ingested as real
// chapters, inflating latestChapterNumber into the hundreds-of-thousands/millions range
// - see INTERNAL_ID_MIN in packages/sources/src/mangahub.ts). latestChapterNumber only
// self-heals through a normal checkUpdates pass, but checkUpdates explicitly skips
// manualTracking/onHold titles and never runs at all if the user has disabled automatic
// update checking - some poisoned titles would otherwise never self-heal. This
// intentionally does NOT apply those exclusions: a poisoned badge on a manually-tracked
// or on-hold title needs the same one-time correction as everything else. Runs once per
// install, guarded by a persisted (not session-scoped) storage flag so it survives a
// service-worker restart. Best-effort: a failure on one title doesn't stop the sweep or
// block the completion flag from being set.
export async function repairMangahubChapterNumbers(): Promise<void> {
    const stored = await browser.storage.local.get(MANGAHUB_CHAPTER_REPAIR_FLAG)
    if (stored[MANGAHUB_CHAPTER_REPAIR_FLAG]) return

    // The initial query is pulled into its own try, separate from the completion
    // flag's finally below: a transient failure here (before any title was even
    // examined) must not permanently mark the one-shot sweep "done" with no retry
    // path - only a genuine run of the per-title loop (even one where every title
    // individually fails) earns that flag.
    let poisoned: LibraryManga[]
    try {
        poisoned = await db.manga
            .where("sourceId")
            .equals("mangahub")
            .filter(m => (m.latestChapterNumber ?? 0) >= MANGAHUB_INTERNAL_ID_MIN)
            .toArray()
    } catch (error) {
        console.error("[AMR] MangaHub chapter repair sweep failed to run", error)
        return
    }

    try {
        for (const manga of poisoned) {
            try {
                const link = await db.sourceLinks.get(manga.id)
                const sourceMangaId = link?.sourceMangaId ?? manga.sourceMangaId
                const mangaUrl = link?.url ?? manga.mangaUrl
                if (!sourceMangaId || !mangaUrl) continue

                const chapters = await listChaptersForSource(manga, "mangahub", sourceMangaId, mangaUrl)
                if (chapters.length === 0) continue

                // Same unnumbered-chapter guard as checkUpdates above: pick the highest
                // NUMBERED chapter first, only falling back to the unfiltered reduce when
                // nothing fetched is numbered.
                const latest =
                    latestNumberedChapter(chapters) ??
                    chapters.reduce(
                        (current, chapter) => (chapter.sortKey > (current?.sortKey ?? -1) ? chapter : current),
                        chapters[0]
                    )

                // Guard against writing back to a manga a concurrent remove/merge
                // deleted while the chapter-list fetch above was in flight - the
                // existence check is the first statement inside the transaction so
                // both the writes AND the publishLive call below are gated on it.
                const stillExists = await repairMangahubChapters({
                    mangaId: manga.id,
                    chapters,
                    latest,
                    purgeStaleMangahub: (ids: Set<string>) => purgeStaleMangahubChapterRows(manga.id, ids)
                })
                if (stillExists) publishLive(["chapters", "library"], [manga.id])
            } catch (error) {
                console.warn("[AMR] MangaHub chapter repair failed for one title", { mangaId: manga.id, error })
            }
        }
    } finally {
        await browser.storage.local.set({ [MANGAHUB_CHAPTER_REPAIR_FLAG]: true })
    }
}

export async function checkExtensionUpdate(force = false): Promise<void> {
    const stored = (await browser.storage.local.get("extensionUpdate"))["extensionUpdate"] as
        | { checkedAt: number }
        | undefined
    if (!force && stored && Date.now() - stored.checkedAt < EXTENSION_UPDATE_INTERVAL_HOURS * 3_600_000) return
    // Clear stale result before fetch so the UI never shows an outdated banner
    // while the fresh check is in-flight.
    if (force) await browser.storage.local.remove("extensionUpdate")
    try {
        const response = await fetch(GITHUB_RELEASES_URL, {
            headers: { Accept: "application/vnd.github.v3+json" }
        })
        if (!response.ok) return
        const json = (await response.json()) as { tag_name?: string; html_url?: string }
        const latestVersion = (json.tag_name ?? "").replace(/^v/, "")
        const releaseUrl = json.html_url ?? ""
        if (!latestVersion) return
        const currentVersion = browser.runtime.getManifest().version
        await browser.storage.local.set({
            extensionUpdate: {
                available: isNewerVersion(latestVersion, currentVersion),
                latestVersion,
                releaseUrl,
                checkedAt: Date.now()
            }
        })
    } catch {
        // best-effort
    }
}

export async function backfillMangaGenres(): Promise<void> {
    if (genreBackfillRunning) return
    genreBackfillRunning = true
    genreBackfillAborted = false
    try {
        // Only process titles with a manga URL or source ID - sourceUrl is a chapter URL
        // and genre resolvers expect a series page, so passing it silently fails.
        const toFetch = await db.manga
            .filter(m => (!m.genres || m.genres.length === 0) && (!!m.mangaUrl || !!m.sourceMangaId))
            .toArray()
        if (toFetch.length === 0) return
        for (const manga of toFetch) {
            // Yield to a pending extension update - same between-items abort as checkUpdates.
            if (genreBackfillAborted) break
            try {
                const genres = await resolveGenresFor({
                    sourceId: manga.sourceId,
                    ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {}),
                    ...(manga.mangaUrl ? { mangaUrl: manga.mangaUrl } : {})
                })
                if (genres.length > 0) {
                    await updateManga(manga.id, { genres } as Partial<LibraryManga>)
                }
            } catch {
                // Skip - source may not support genres or fetch failed transiently
            }
            // Respect the source rate limit (3 req/s) between requests.
            await new Promise<void>(r => setTimeout(r, 350))
        }
        publishLive(["library"])
    } finally {
        genreBackfillRunning = false
        genreBackfillAborted = false
    }
}

// Chapters with a sortKey newer than the manga's last-read position, falling back
// to the last 3 chapters (by sortKey) when nothing is newer - e.g. a freshly added
// title with no read progress yet still gets a short preview list.
async function newChaptersFor(mangaId: string) {
    const manga = await db.manga.get(mangaId)
    if (!manga) return []
    const all = await db.chapters.where("mangaId").equals(mangaId).sortBy("sortKey")
    const sinceKey = manga.lastReadChapterNumber ?? -1
    // isNumberedChapter first - Infinity > sinceKey is always true, so an unguarded
    // filter reports every unnumbered chapter as "new" on every single check, forever.
    const fresh = all.filter(c => isNumberedChapter(c.sortKey) && c.sortKey > sinceKey)
    return (fresh.length > 0 ? fresh : all.slice(-3)).map(c => ({
        id: c.id,
        title: c.title,
        sortKey: c.sortKey,
        url: c.url
    }))
}

export const updatesSourcesHandlers: HandlerMap = {
    "updates:check": async request => {
        // Fire-and-forget: a full library check can take several minutes (rate-limited
        // network calls per title), far longer than an MV3 message channel/service-worker
        // lifetime reliably survives. Awaiting checkUpdates() here caused "message channel
        // closed before a response was received" once the channel died mid-loop. Callers
        // now track progress via the updateProgress/updateStatus storage keys instead.
        if (updateCheckRunning) {
            return { started: false, alreadyRunning: true }
        }
        // updateCheckRunning only tracks this service-worker instance's lifetime, so a
        // check that crashed a previous instance mid-loop leaves no in-memory trace of
        // itself - only the persisted updateProgress record. Consult it before starting
        // a new check: a recent running: true means a check is plausibly still active
        // (report alreadyRunning as before), while a stale one means the previous run's
        // service worker died without ever getting to clear it - self-heal so the next
        // triggered check (this one) isn't blocked by a state nothing will ever clear.
        const storedProgress = (await browser.storage.local.get("updateProgress"))["updateProgress"] as
            | UpdateProgress
            | undefined
        if (storedProgress?.running) {
            if (Date.now() - storedProgress.startedAt < STALE_PROGRESS_TIMEOUT_MS) {
                return { started: false, alreadyRunning: true }
            }
            console.warn("[AMR] Clearing stale updateProgress from a crashed check", storedProgress)
            await browser.storage.local.set({
                updateProgress: { ...storedProgress, running: false } satisfies UpdateProgress
            })
        }
        void checkUpdates(request.sourceId).catch(error => {
            console.error("[AMR] Update check crashed unexpectedly", error)
        })
        return { started: true }
    },
    "updates:get": async () => {
        const stored = await browser.storage.local.get("updateStatus")
        return stored["updateStatus"] ?? null
    },
    "updates:new-chapters": async request => {
        return await newChaptersFor(request.mangaId)
    },
    "extension-update:check": async request => {
        await checkExtensionUpdate(request.force ?? false)
        const stored = await browser.storage.local.get("extensionUpdate")
        return (
            (stored["extensionUpdate"] as
                | { available: boolean; latestVersion: string; releaseUrl: string }
                | undefined) ?? null
        )
    },
    "sources:list": async () => {
        return sourceRegistry.list().map(adapter => ({
            id: adapter.manifest.id,
            name: adapter.manifest.name,
            domains: adapter.manifest.domains,
            capabilities: adapter.manifest.capabilities,
            canSearch: Boolean(adapter.search),
            homepage: adapter.manifest.homepage
        }))
    },
    "sources:ping": async () => {
        const checks = await Promise.all(
            sourceRegistry.list().map(async adapter => {
                const origin =
                    adapter.manifest.homepage ??
                    (adapter.manifest.domains[0] ? `https://${adapter.manifest.domains[0]}` : undefined)
                if (!origin) return { id: adapter.manifest.id, alive: false, status: "dead" as const }
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), 10000)
                try {
                    // Background fetches are privileged - no CORS restriction for origins
                    // in host_permissions. Distinguish four states:
                    //   live  - server answered normally (2xx/3xx) from a domain the adapter
                    //           actually registers
                    //   moved - server answered normally, but the final URL (after redirects -
                    //           fetch follows them by default) lands on a domain the adapter
                    //           doesn't register. Likely a hijacked/parked/repurposed domain
                    //           still returning 200s, not the real source anymore
                    //   gated - bot-blocked (403/429 from CF or rate-limiting);
                    //           chapter reads still work via the tab fallback
                    //   dead  - truly unreachable (timeout, DNS, 5xx)
                    let res = await fetch(origin, {
                        method: "HEAD",
                        signal: controller.signal,
                        credentials: "omit"
                    })
                    // Some live sites reject HEAD outright (404/405) even though a normal
                    // GET succeeds - retry once with GET before declaring the source dead.
                    if (res.status === 404 || res.status === 405) {
                        res = await fetch(origin, {
                            method: "GET",
                            signal: controller.signal,
                            credentials: "omit"
                        })
                    }
                    if (res.status === 403 || res.status === 429) {
                        return { id: adapter.manifest.id, alive: true, status: "gated" as const }
                    }
                    if (res.status >= 400) {
                        return { id: adapter.manifest.id, alive: false, status: "dead" as const }
                    }
                    let finalHost: string | undefined
                    try {
                        finalHost = res.url ? new URL(res.url).hostname : undefined
                    } catch {
                        finalHost = undefined
                    }
                    if (finalHost && !matchesSourceDomain(finalHost, adapter.manifest.domains)) {
                        return { id: adapter.manifest.id, alive: true, status: "moved" as const, finalHost }
                    }
                    return { id: adapter.manifest.id, alive: true, status: "live" as const }
                } catch {
                    return { id: adapter.manifest.id, alive: false, status: "dead" as const }
                } finally {
                    clearTimeout(timer)
                }
            })
        )
        await browser.storage.local.set({
            sourceHealth: Object.fromEntries(checks.map(c => [c.id, { alive: c.alive, at: Date.now() }]))
        })
        return checks
    },
    "sources:health": async () => {
        const stored = await browser.storage.local.get("sourceHealth")
        return stored["sourceHealth"] ?? {}
    },
    "source:permission:check": async () => {
        return await checkSourcePermission()
    },
    "manga:search": async request => {
        return await searchManga(request.query)
    },
    "manga:chapters": async request => {
        const settings = await getSettings()
        return await getMangaChapters(request.mangaId, settings.language)
    },
    "manga:genres": async request => {
        const manga = await db.manga.get(request.mangaId)
        if (!manga) return [] as string[]
        // Return cached genres immediately if available, skip the network call.
        if (manga.genres && manga.genres.length > 0) return manga.genres
        const genres = await resolveGenresFor({
            sourceId: manga.sourceId,
            ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {}),
            ...(manga.mangaUrl ? { mangaUrl: manga.mangaUrl } : {})
        })
        if (genres.length > 0) {
            void updateManga(request.mangaId, { genres } as Partial<LibraryManga>)
        }
        return genres
    }
}
