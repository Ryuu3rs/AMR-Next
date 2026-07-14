import { sourceRegistry } from "@amr/sources"
import { matchesSourceDomain } from "@amr/source-sdk"
import { db, type LibraryManga } from "../database"
import { checkSourcePermission, getMangaChapters, listMangaChapters, resolveGenresFor, searchManga } from "../sources"
import { getSettings } from "../settings"
import { isNewerVersion } from "../update-check"
import { EXTENSION_UPDATE_INTERVAL_HOURS, GITHUB_RELEASES_URL } from "../background/alarms"
import { delay, type HandlerMap } from "../background/handler-types"

let updateCheckRunning = false
let genreBackfillRunning = false

type UpdateProgress = {
    running: boolean
    done: number
    total: number
    currentTitle?: string
    sourceId?: string
    startedAt: number
}

export async function checkUpdates(sourceId?: string) {
    if (updateCheckRunning) return
    updateCheckRunning = true
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
            const link = await db.sourceLinks.get(item.id)
            if (link) {
                await writeProgress(item.title)
                try {
                    const chapters = await listMangaChapters(item, link, language)
                    const latest = chapters.reduce(
                        (current, chapter) => (chapter.sortKey > (current?.sortKey ?? -1) ? chapter : current),
                        chapters[0]
                    )
                    await db.transaction("rw", db.chapters, db.manga, async () => {
                        await db.chapters.bulkPut(chapters)
                        if (latest && latest.id !== item.latestChapterId) {
                            updated += 1
                            await db.manga.update(item.id, {
                                latestChapterId: latest.id,
                                sourceUrl: latest.url,
                                ...(Number.isFinite(latest.sortKey) ? { latestChapterNumber: latest.sortKey } : {}),
                                updatedAt: Date.now()
                            })
                        }
                    })
                    checked += 1
                } catch (error) {
                    failed += 1
                    const message = error instanceof Error ? error.message : "Update failed"
                    errors.push({ mangaId: item.id, title: item.title, message })
                    console.warn("[AMR] Update check failed", { mangaId: item.id, error })
                } finally {
                    // Pause between every iteration (success or failure) so sites don't
                    // rate-limit when the library has many titles from the same source.
                    await delay(400)
                }
            }
            done += 1
        }

        // Keep only the most recent handful of errors so the status stays small.
        const status = { checked, updated, failed, checkedAt: Date.now(), errors: errors.slice(0, 20) }
        const finalWrite: Record<string, unknown> = {
            updateProgress: { running: false, done, total, startedAt } satisfies UpdateProgress
        }
        // Only a full, all-sources check represents the library-wide status the Updates
        // page displays - a single-source "refresh this source" run would otherwise
        // clobber that global status with counts computed from just one source's manga.
        if (!sourceId) finalWrite["updateStatus"] = status
        await browser.storage.local.set(finalWrite)
        return status
    } finally {
        updateCheckRunning = false
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
    try {
        // Only process titles with a manga URL or source ID - sourceUrl is a chapter URL
        // and genre resolvers expect a series page, so passing it silently fails.
        const toFetch = await db.manga
            .filter(m => (!m.genres || m.genres.length === 0) && (!!m.mangaUrl || !!m.sourceMangaId))
            .toArray()
        if (toFetch.length === 0) return
        for (const manga of toFetch) {
            try {
                const genres = await resolveGenresFor({
                    sourceId: manga.sourceId,
                    ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {}),
                    ...(manga.mangaUrl ? { mangaUrl: manga.mangaUrl } : {})
                })
                if (genres.length > 0) {
                    await db.manga.update(manga.id, { genres } as Partial<LibraryManga>)
                }
            } catch {
                // Skip - source may not support genres or fetch failed transiently
            }
            // Respect the source rate limit (3 req/s) between requests.
            await new Promise<void>(r => setTimeout(r, 350))
        }
    } finally {
        genreBackfillRunning = false
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
    const fresh = all.filter(c => c.sortKey > sinceKey)
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
            void db.manga.update(request.mangaId, { genres } as Partial<LibraryManga>)
        }
        return genres
    }
}
