import type { ReadingProgress } from "@amr/contracts"
import { SourceError } from "@amr/source-sdk"
import { sourceAdapters } from "@amr/sources"
import {
    db,
    exportDatabase,
    getDownload,
    getLocalStats,
    importDatabase,
    listDownloads,
    removeDownload,
    saveDownload,
    saveProgress,
    saveResolvedChapter,
    trackExternalChapter,
    seedDatabase
} from "../src/database"
import { runtimeRequestSchema, type RuntimeResponse } from "../src/runtime"
import { getSettings, updateSettings } from "../src/settings"
import { getSyncConfig, getSyncStatus, pullFromGist, pushToGist, setSyncConfig } from "../src/sync"
import {
    findSource,
    listChaptersBySource,
    listChaptersForSource,
    listMangaChapters,
    resolveChapterUrl,
    resolveCoverFor,
    searchManga,
    getMangaChapters,
    checkSourcePermission
} from "../src/sources"

const COVER_BACKFILL_BATCH = 12

const updateAlarmName = "check-manga-updates"
const syncAlarmName = "sync-push"

async function configureUpdateAlarm() {
    const settings = await getSettings()
    await browser.alarms.clear(updateAlarmName)
    if (settings.updateIntervalHours > 0) {
        await browser.alarms.create(updateAlarmName, {
            periodInMinutes: settings.updateIntervalHours * 60
        })
    }
}

async function configureSyncAlarm() {
    const config = await getSyncConfig()
    await browser.alarms.clear(syncAlarmName)
    if (config.autoSync && config.token) {
        await browser.alarms.create(syncAlarmName, { periodInMinutes: 60 })
    }
}

async function autoPush() {
    const config = await getSyncConfig()
    if (!config.autoSync || !config.token) return
    try {
        await pushToGist(await exportDatabase())
    } catch (error) {
        console.warn("[AMR] Auto sync push failed", error)
    }
}

async function checkUpdates(sourceId?: string) {
    const settings = await getSettings()
    const all = await db.manga.toArray()
    const manga = sourceId ? all.filter(item => item.sourceId === sourceId) : all
    let checked = 0
    let updated = 0
    let failed = 0

    const errors: Array<{ mangaId: string; title: string; message: string }> = []

    for (const item of manga) {
        if (item.manualTracking) continue
        const link = await db.sourceLinks.get(item.id)
        if (!link) continue
        try {
            const chapters = await listMangaChapters(item, link, settings.language)
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
        }
    }

    // Keep only the most recent handful of errors so the status stays small.
    const status = { checked, updated, failed, checkedAt: Date.now(), errors: errors.slice(0, 20) }
    await browser.storage.local.set({ updateStatus: status })
    return status
}

function success<T>(data: T): RuntimeResponse<T> {
    return { ok: true, data }
}

function failure(error: unknown): RuntimeResponse {
    let message = error instanceof Error ? error.message : "The request failed"
    if (error instanceof SourceError && error.details) {
        const cause = error.details["cause"]
        const url = error.details["url"]
        const extra = [url ? String(url) : null, cause ? String(cause) : null].filter(Boolean).join(" — ")
        if (extra) message += ` [${extra}]`
    }
    return {
        ok: false,
        error: { code: "REQUEST_FAILED", message }
    }
}

function delay(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function fetchPageBlob(url: string): Promise<Blob> {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let res: Response
        try {
            res = await fetch(url)
        } catch (cause) {
            if (attempt < maxAttempts) {
                await delay(attempt * 300)
                continue
            }
            throw new SourceError("request-failed", "Failed to download a page", {
                url,
                cause: cause instanceof Error ? cause.message : String(cause)
            })
        }
        if (!res.ok) {
            const expired = res.status === 404 || res.status === 410
            if (!expired && attempt < maxAttempts) {
                await delay(attempt * 300)
                continue
            }
            throw new SourceError("request-failed", `Failed to download a page (${res.status})`, {
                url,
                status: res.status
            })
        }
        return res.blob()
    }
    throw new SourceError("request-failed", "Failed to download a page", { url })
}

async function captureChapter(url: string) {
    const settings = await getSettings()
    const parsedUrl = new URL(url)
    const source = findSource(parsedUrl)

    if (!source || source.match(parsedUrl) !== "chapter") {
        return { supported: false as const }
    }

    if (!settings.autoAdd) {
        return { supported: true as const, added: false as const }
    }

    const resolved = await resolveChapterUrl(url)
    await saveResolvedChapter({
        manga: resolved.manga.manga,
        chapter: resolved.chapter,
        sourceLink: {
            mangaId: resolved.manga.manga.id,
            sourceId: resolved.manga.sourceId,
            sourceMangaId: resolved.manga.sourceMangaId,
            url: resolved.manga.url,
            title: resolved.manga.manga.title,
            addedAt: Date.now(),
            updatedAt: Date.now()
        }
    })

    await browser.action.setBadgeBackgroundColor({ color: "#2d8a61" })
    await browser.action.setBadgeText({ text: "ADD" })
    setTimeout(() => void browser.action.setBadgeText({ text: "" }), 4000)

    return { supported: true as const, added: true as const, manga: resolved.manga.manga }
}

export default defineBackground(() => {
    browser.runtime.onInstalled.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
    })

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === updateAlarmName) void checkUpdates()
        if (alarm.name === syncAlarmName) void autoPush()
    })

    browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (!changeInfo.url) return
        void captureChapter(changeInfo.url).catch(error => {
            console.warn("[AMR] Automatic chapter capture failed", error)
        })
    })

    browser.runtime.onMessage.addListener((message, sender) => {
        return (async () => {
            try {
                const request = runtimeRequestSchema.parse(message)

                switch (request.type) {
                    case "library:list":
                        return success(await db.manga.orderBy("updatedAt").reverse().toArray())
                    case "library:remove":
                        await db.transaction(
                            "rw",
                            [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents, db.downloads],
                            async () => {
                                await db.manga.delete(request.mangaId)
                                await db.sourceLinks.delete(request.mangaId)
                                await db.chapters.where("mangaId").equals(request.mangaId).delete()
                                await db.progress.where("mangaId").equals(request.mangaId).delete()
                                await db.historyEvents.where("mangaId").equals(request.mangaId).delete()
                                await db.downloads.where("mangaId").equals(request.mangaId).delete()
                            }
                        )
                        return success(null)
                    case "library:rate": {
                        const rating = request.rating === 0 ? undefined : request.rating
                        await db.manga.update(request.mangaId, { rating } as Partial<{ rating: number }>)
                        return success(null)
                    }
                    case "library:manual": {
                        await db.manga.update(request.mangaId, {
                            manualTracking: request.manual ? true : undefined
                        } as Partial<{ manualTracking: boolean }>)
                        return success(null)
                    }
                    case "library:numbers": {
                        const patch: Record<string, number | undefined> = {}
                        if (request.latestChapterNumber !== undefined)
                            patch["latestChapterNumber"] = request.latestChapterNumber ?? undefined
                        if (request.lastReadChapterNumber !== undefined)
                            patch["lastReadChapterNumber"] = request.lastReadChapterNumber ?? undefined
                        if (Object.keys(patch).length > 0) {
                            await db.manga.update(request.mangaId, patch as Partial<{ latestChapterNumber: number }>)
                        }
                        return success(null)
                    }
                    case "library:categories": {
                        const categories = [...new Set(request.categories.map(c => c.trim()).filter(Boolean))]
                        await db.manga.update(request.mangaId, {
                            categories: categories.length > 0 ? categories : undefined
                        } as Partial<{ categories: string[] }>)
                        return success(null)
                    }
                    case "library:relink": {
                        const resolved = await resolveChapterUrl(request.url)
                        const existing = await db.manga.get(request.mangaId)
                        if (!existing) throw new SourceError("not-found", "That title is not in your library")
                        await db.transaction("rw", db.manga, db.sourceLinks, async () => {
                            await db.manga.update(request.mangaId, {
                                sourceId: resolved.manga.sourceId,
                                sourceUrl: resolved.chapter.url,
                                ...(resolved.manga.sourceMangaId
                                    ? { sourceMangaId: resolved.manga.sourceMangaId }
                                    : {}),
                                mangaUrl: resolved.manga.url,
                                latestChapterId: resolved.chapter.id,
                                ...(Number.isFinite(resolved.chapter.sortKey)
                                    ? { latestChapterNumber: resolved.chapter.sortKey }
                                    : {}),
                                updatedAt: Date.now()
                            })
                            await db.sourceLinks.put({
                                mangaId: request.mangaId,
                                sourceId: resolved.manga.sourceId,
                                ...(resolved.manga.sourceMangaId
                                    ? { sourceMangaId: resolved.manga.sourceMangaId }
                                    : {}),
                                url: resolved.manga.url,
                                title: existing.title,
                                addedAt: existing.addedAt,
                                updatedAt: Date.now()
                            })
                        })
                        return success({ sourceId: resolved.manga.sourceId })
                    }
                    case "library:switch": {
                        const existing = await db.manga.get(request.mangaId)
                        if (!existing) throw new SourceError("not-found", "That title is not in your library")
                        const chapters = await listChaptersForSource(
                            existing,
                            request.sourceId,
                            request.sourceMangaId,
                            request.mangaUrl
                        )
                        if (chapters.length === 0)
                            throw new SourceError("invalid-response", "No chapters on that mirror")
                        const latest = chapters.reduce(
                            (current, chapter) => (chapter.sortKey > (current?.sortKey ?? -1) ? chapter : current),
                            chapters[0]
                        )
                        await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
                            await db.chapters.bulkPut(chapters)
                            await db.manga.update(request.mangaId, {
                                sourceId: request.sourceId,
                                sourceMangaId: request.sourceMangaId,
                                mangaUrl: request.mangaUrl,
                                ...(latest
                                    ? {
                                          sourceUrl: latest.url,
                                          latestChapterId: latest.id,
                                          ...(Number.isFinite(latest.sortKey)
                                              ? { latestChapterNumber: latest.sortKey }
                                              : {})
                                      }
                                    : {}),
                                updatedAt: Date.now()
                            })
                            await db.sourceLinks.put({
                                mangaId: request.mangaId,
                                sourceId: request.sourceId,
                                sourceMangaId: request.sourceMangaId,
                                url: request.mangaUrl,
                                title: existing.title,
                                addedAt: existing.addedAt,
                                updatedAt: Date.now()
                            })
                        })
                        return success({ sourceId: request.sourceId, latest: latest?.sortKey ?? null })
                    }
                    case "library:nsfw": {
                        await db.manga.update(request.mangaId, {
                            nsfw: request.nsfw ? true : undefined
                        } as Partial<{ nsfw: boolean }>)
                        return success(null)
                    }
                    case "library:covers:backfill": {
                        const all = await db.manga.toArray()
                        const missing = all.filter(m => !m.coverUrl && !m.id.startsWith("seed-"))
                        let updated = 0
                        for (const m of missing.slice(0, COVER_BACKFILL_BATCH)) {
                            try {
                                const cover = await resolveCoverFor(m)
                                if (cover) {
                                    await db.manga.update(m.id, { coverUrl: cover })
                                    updated += 1
                                }
                            } catch (error) {
                                console.warn("[AMR] Cover backfill failed", { mangaId: m.id, error })
                            }
                        }
                        return success({ updated, remaining: Math.max(0, missing.length - COVER_BACKFILL_BATCH) })
                    }
                    case "stats:get":
                        return success(await getLocalStats())
                    case "history:list": {
                        const events = await db.historyEvents.orderBy("occurredAt").reverse().limit(60).toArray()
                        const ids = [...new Set(events.map(e => e.mangaId))]
                        const mangas = await db.manga.bulkGet(ids)
                        const titleById = new Map(ids.map((id, i) => [id, mangas[i]?.title ?? id]))
                        return success(
                            events.map(e => ({
                                mangaId: e.mangaId,
                                title: titleById.get(e.mangaId) ?? e.mangaId,
                                type: e.type,
                                occurredAt: e.occurredAt
                            }))
                        )
                    }
                    case "data:export":
                        return success(await exportDatabase())
                    case "data:import":
                        return success(await importDatabase(request.envelope))
                    case "data:seed":
                        return success(await seedDatabase())
                    case "sync:status":
                        return success(await getSyncStatus())
                    case "sync:config": {
                        const patch = Object.fromEntries(
                            Object.entries(request.config).filter(([, v]) => v !== undefined)
                        )
                        const next = await setSyncConfig(patch)
                        await configureSyncAlarm()
                        return success({
                            hasToken: Boolean(next.token),
                            ...(next.gistId ? { gistId: next.gistId } : {}),
                            autoSync: next.autoSync
                        })
                    }
                    case "sync:push": {
                        const envelope = await exportDatabase()
                        return success(await pushToGist(envelope))
                    }
                    case "sync:pull": {
                        const envelope = await pullFromGist()
                        return success(await importDatabase(envelope))
                    }
                    case "manga:search":
                        return success(await searchManga(request.query))
                    case "manga:chapters": {
                        const settings = await getSettings()
                        return success(await getMangaChapters(request.mangaId, settings.language))
                    }
                    case "source:permission:check":
                        return success(await checkSourcePermission())
                    case "sources:list":
                        return success(
                            sourceAdapters.map(adapter => ({
                                id: adapter.manifest.id,
                                name: adapter.manifest.name,
                                domains: adapter.manifest.domains,
                                capabilities: adapter.manifest.capabilities,
                                canSearch: Boolean(adapter.search),
                                homepage: adapter.manifest.homepage
                            }))
                        )
                    case "sources:ping": {
                        const checks = await Promise.all(
                            sourceAdapters.map(async adapter => {
                                const origin =
                                    adapter.manifest.homepage ??
                                    (adapter.manifest.domains[0] ? `https://${adapter.manifest.domains[0]}` : undefined)
                                if (!origin) return { id: adapter.manifest.id, alive: false }
                                const controller = new AbortController()
                                const timer = setTimeout(() => controller.abort(), 7000)
                                try {
                                    await fetch(origin, { method: "GET", mode: "no-cors", signal: controller.signal })
                                    return { id: adapter.manifest.id, alive: true }
                                } catch {
                                    return { id: adapter.manifest.id, alive: false }
                                } finally {
                                    clearTimeout(timer)
                                }
                            })
                        )
                        return success(checks)
                    }
                    case "updates:check":
                        return success(await checkUpdates(request.sourceId))
                    case "updates:get": {
                        const stored = await browser.storage.local.get("updateStatus")
                        return success(stored["updateStatus"] ?? null)
                    }
                    case "page:current": {
                        const tab = sender.tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
                        const url = tab?.url
                        if (!url) return success({ supported: false })
                        let parsedUrl: URL
                        try {
                            parsedUrl = new URL(url)
                        } catch {
                            return success({ supported: false })
                        }
                        const source = findSource(parsedUrl)
                        const pageType = source?.match(parsedUrl) ?? "none"
                        return success({
                            supported: Boolean(source) && pageType !== "none",
                            pageType,
                            url,
                            ...(source ? { sourceName: source.manifest.name } : {})
                        })
                    }
                    case "page:capture":
                        return success(await captureChapter(request.url))
                    case "reader:resolve": {
                        const resolved = await resolveChapterUrl(request.url)
                        // Backfill coverUrl into library entry if missing
                        if (resolved.manga.manga.coverUrl) {
                            const existing = await db.manga.get(resolved.manga.manga.id)
                            if (existing && !existing.coverUrl) {
                                await db.manga.update(resolved.manga.manga.id, {
                                    coverUrl: resolved.manga.manga.coverUrl
                                })
                            }
                        }
                        return success(resolved)
                    }
                    case "reader:chapters": {
                        try {
                            const chapters = await listChaptersBySource(
                                request.sourceId,
                                request.sourceMangaId,
                                request.mangaUrl
                            )
                            return success(
                                chapters
                                    .map(c => ({ url: c.url, sortKey: c.sortKey, title: c.title }))
                                    .sort((a, b) => a.sortKey - b.sortKey)
                            )
                        } catch {
                            // Source can't list chapters (e.g. mgeko) — no nav.
                            return success([])
                        }
                    }
                    case "reader:progress:get":
                        return success((await db.progress.get(request.chapterId)) ?? null)
                    case "reader:progress": {
                        const progress: ReadingProgress = {
                            mangaId: request.mangaId,
                            chapterId: request.chapterId,
                            pageIndex: request.pageIndex,
                            pageCount: request.pageCount,
                            completed: request.completed,
                            updatedAt: Date.now()
                        }
                        await saveProgress(progress)
                        return success(progress)
                    }
                    case "chapter:download": {
                        const resolved = await resolveChapterUrl(request.url)
                        let pages = resolved.pages.slice(0, 200)
                        const pageBlobs: Blob[] = []
                        let reResolved = false
                        for (let index = 0; index < pages.length; index += 1) {
                            const page = pages[index]
                            if (!page) continue
                            let blob: Blob
                            try {
                                blob = await fetchPageBlob(page.url)
                            } catch (error) {
                                const expired =
                                    error instanceof SourceError &&
                                    (error.details?.["status"] === 404 || error.details?.["status"] === 410)
                                if (expired && !reResolved) {
                                    reResolved = true
                                    const refreshed = await resolveChapterUrl(request.url)
                                    pages = refreshed.pages.slice(0, 200)
                                    index -= 1
                                    continue
                                }
                                throw error
                            }
                            pageBlobs.push(blob)
                        }
                        await saveDownload({
                            chapterId: resolved.chapter.id,
                            mangaId: resolved.manga.manga.id,
                            pageBlobs,
                            pageCount: pageBlobs.length,
                            downloadedAt: Date.now()
                        })
                        return success({ chapterId: resolved.chapter.id, pageCount: pageBlobs.length })
                    }
                    case "chapter:track": {
                        const parsedUrl = new URL(request.url)
                        const source = findSource(parsedUrl)
                        if (!source || source.match(parsedUrl) !== "chapter") {
                            return success({ supported: false as const })
                        }
                        const tracked = await trackExternalChapter({
                            url: request.url,
                            sourceId: source.manifest.id
                        })
                        return success({ supported: true as const, ...tracked })
                    }
                    case "chapter:download:get":
                        return success((await getDownload(request.chapterId)) ?? null)
                    case "chapter:download:remove":
                        await removeDownload(request.chapterId)
                        return success(null)
                    case "downloads:list":
                        return success(await listDownloads())
                    case "settings:get":
                        return success(await getSettings())
                    case "settings:update": {
                        const settings = await updateSettings(
                            Object.fromEntries(
                                Object.entries(request.settings).filter(([, value]) => value !== undefined)
                            ) as Partial<Awaited<ReturnType<typeof getSettings>>>
                        )
                        await configureUpdateAlarm()
                        return success(settings)
                    }
                }
            } catch (error) {
                return failure(error)
            }
        })()
    })
})
