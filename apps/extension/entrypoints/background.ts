import type { ReadingProgress } from "@amr/contracts"
import { SourceError } from "@amr/source-sdk"
import {
    db,
    exportDatabase,
    getLocalStats,
    importDatabase,
    saveProgress,
    saveResolvedChapter,
    seedDatabase
} from "../src/database"
import { runtimeRequestSchema, type RuntimeResponse } from "../src/runtime"
import { getSettings, updateSettings } from "../src/settings"
import {
    findSource,
    listMangaChapters,
    resolveChapterUrl,
    resolveCoverFor,
    searchManga,
    getMangaChapters,
    checkSourcePermission
} from "../src/sources"

const COVER_BACKFILL_BATCH = 12

const updateAlarmName = "check-manga-updates"

async function configureUpdateAlarm() {
    const settings = await getSettings()
    await browser.alarms.clear(updateAlarmName)
    if (settings.updateIntervalHours > 0) {
        await browser.alarms.create(updateAlarmName, {
            periodInMinutes: settings.updateIntervalHours * 60
        })
    }
}

async function checkUpdates() {
    const manga = await db.manga.toArray()
    let checked = 0
    let updated = 0
    let failed = 0

    for (const item of manga) {
        const link = await db.sourceLinks.get(item.id)
        if (!link) continue
        try {
            const chapters = await listMangaChapters(item, link)
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
            console.warn("[AMR] Update check failed", { mangaId: item.id, error })
        }
    }

    const status = { checked, updated, failed, checkedAt: Date.now() }
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
    })

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === updateAlarmName) void checkUpdates()
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
                            [db.manga, db.sourceLinks, db.chapters, db.progress, db.historyEvents],
                            async () => {
                                await db.manga.delete(request.mangaId)
                                await db.sourceLinks.delete(request.mangaId)
                                await db.chapters.where("mangaId").equals(request.mangaId).delete()
                                await db.progress.where("mangaId").equals(request.mangaId).delete()
                                await db.historyEvents.where("mangaId").equals(request.mangaId).delete()
                            }
                        )
                        return success(null)
                    case "library:rate": {
                        const rating = request.rating === 0 ? undefined : request.rating
                        await db.manga.update(request.mangaId, { rating } as Partial<{ rating: number }>)
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
                    case "data:export":
                        return success(await exportDatabase())
                    case "data:import":
                        return success(await importDatabase(request.envelope))
                    case "data:seed":
                        return success(await seedDatabase())
                    case "manga:search":
                        return success(await searchManga(request.query))
                    case "manga:chapters":
                        return success(await getMangaChapters(request.mangaId))
                    case "source:permission:check":
                        return success(await checkSourcePermission())
                    case "updates:check":
                        return success(await checkUpdates())
                    case "updates:get": {
                        const stored = await browser.storage.local.get("updateStatus")
                        return success(stored["updateStatus"] ?? null)
                    }
                    case "page:current": {
                        const tab = sender.tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
                        const url = tab?.url
                        if (!url) return success({ supported: false })
                        const parsedUrl = new URL(url)
                        const source = findSource(parsedUrl)
                        return success({
                            supported: Boolean(source),
                            pageType: source?.match(parsedUrl) ?? "none",
                            url
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
