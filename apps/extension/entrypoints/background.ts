import type { ReadingProgress } from "@amr/contracts"
import { SourceError, SourceRequestError } from "@amr/source-sdk"
import { sourceRegistry } from "@amr/sources"
import {
    db,
    cacheCover,
    exportDatabase,
    getActivityCalendar,
    getDownload,
    getLocalStats,
    importDatabase,
    previewImport,
    listDownloads,
    removeDownload,
    removeManga,
    saveDownload,
    saveProgress,
    saveResolvedChapter,
    trackExternalChapter,
    seedDatabase,
    toggleBookmark,
    bookmarkedPagesForChapter,
    listBookmarks,
    removeBookmark
} from "../src/database"
import { runtimeRequestSchema, type RuntimeResponse } from "../src/runtime"
import { getSettings, updateSettings } from "../src/settings"
import { getSyncConfig, getSyncStatus, pullFromGist, pushToGist, setSyncConfig } from "../src/sync"
import { isNewerVersion } from "../src/update-check"
import { SOURCE_ORIGINS } from "../src/permissions"
import {
    findSource,
    listChaptersBySource,
    listChaptersForSource,
    listMangaChapters,
    resolveChapterUrl,
    resolveChapterFromHtml,
    resolveCoverFor,
    resolveGenresFor,
    searchManga,
    getMangaChapters,
    checkSourcePermission
} from "../src/sources"

const COVER_BACKFILL_BATCH = 20

// IDs attempted this session so covers that can't be inlined don't loop forever.
// Cleared when a full backfill pass completes (remaining hits 0).
const coverBackfillAttempted = new Set<string>()

// Tab IDs opened internally by fetchChapterHtmlViaTab. Excluded from the main
// tabs.onUpdated listener so our own background tabs don't re-trigger captureChapter
// and race against the in-flight tab fetch.
const internalTabIds = new Set<number>()

// URLs currently being captured — deduplicate concurrent calls for the same URL
// (e.g. rapid navigation events or the same URL from multiple listener paths).
const capturingUrls = new Set<string>()

const updateAlarmName = "check-manga-updates"
const syncAlarmName = "sync-push"
const extensionUpdateAlarmName = "check-extension-update"

const EXTENSION_UPDATE_INTERVAL_HOURS = 24
const GITHUB_RELEASES_URL = "https://api.github.com/repos/Ryuu3rs/AMR-Next/releases/latest"

async function checkExtensionUpdate(): Promise<void> {
    const stored = (await browser.storage.local.get("extensionUpdate"))["extensionUpdate"] as
        | { checkedAt: number }
        | undefined
    if (stored && Date.now() - stored.checkedAt < EXTENSION_UPDATE_INTERVAL_HOURS * 3_600_000) return
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

// Open a background tab, wait for it to fully load, then extract the page HTML.
// Used as a fallback when direct fetch is blocked by bot-detection (5xx, 403).
// The tab uses the user's real browser session (cookies, TLS fingerprint).
async function fetchChapterHtmlViaTab(url: string): Promise<string> {
    const tab = await browser.tabs.create({ url, active: false })
    const tabId = tab.id
    if (!tabId) throw new Error("Tab creation failed")
    internalTabIds.add(tabId)
    try {
        await new Promise<void>((resolve, reject) => {
            const listener = (changedId: number, info: { status?: string }) => {
                if (changedId === tabId && info.status === "complete") {
                    clearTimeout(timeoutId)
                    browser.tabs.onUpdated.removeListener(listener)
                    resolve()
                }
            }
            const timeoutId = setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener)
                reject(new Error("Tab load timed out"))
            }, 25_000)
            browser.tabs.onUpdated.addListener(listener)
        })
        const results = await browser.scripting.executeScript({
            target: { tabId },
            func: () => document.documentElement.outerHTML
        })
        const html = results[0]?.result
        return typeof html === "string" ? html : ""
    } finally {
        internalTabIds.delete(tabId)
        await browser.tabs.remove(tabId).catch(() => {})
    }
}

function isBotBlocked(error: unknown): boolean {
    if (!(error instanceof SourceRequestError)) return false
    const { status } = error
    // Retry via tab for: bot-blocked (403, 502, 503), network errors (undefined status)
    return status === 403 || status === 502 || status === 503 || status === undefined
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
    if (capturingUrls.has(url)) return { supported: true as const, added: false as const }
    capturingUrls.add(url)
    try {
        return await doCaptureChapter(url)
    } finally {
        capturingUrls.delete(url)
    }
}

async function doCaptureChapter(url: string) {
    const settings = await getSettings()
    const parsedUrl = new URL(url)
    const source = findSource(parsedUrl)

    if (!source || source.match(parsedUrl) !== "chapter") {
        return { supported: false as const }
    }

    if (!settings.autoAdd) {
        return { supported: true as const, added: false as const }
    }

    let resolved
    try {
        resolved = await resolveChapterUrl(url)
    } catch (error) {
        // The source's images can't be scraped (anti-scrape / spoiler / dead CDN).
        // Still add the title and track it by URL so the library follows progress
        // even when the chapter only reads on the source site.
        const tracked = await trackExternalChapter({ url, sourceId: source.manifest.id, completed: false })
        console.debug("[AMR] Captured chapter without scraping", { url, error })
        await flashAddedBadge()
        return { supported: true as const, added: true as const, external: true as const, title: tracked.title }
    }

    const rawCover = resolved.manga.manga.coverUrl
    const inlinedCover = rawCover ? ((await inlineCover(rawCover)) ?? rawCover) : undefined
    await saveResolvedChapter({
        manga: { ...resolved.manga.manga, ...(inlinedCover ? { coverUrl: inlinedCover } : {}) },
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

    await flashAddedBadge()
    return { supported: true as const, added: true as const, manga: resolved.manga.manga }
}

async function flashAddedBadge() {
    await browser.action.setBadgeBackgroundColor({ color: "#2d8a61" })
    await browser.action.setBadgeText({ text: "ADD" })
    setTimeout(() => void browser.action.setBadgeText({ text: "" }), 4000)
}

const MAX_COVER_BYTES = 2 * 1024 * 1024

// Fetch a remote cover and inline it as a data: URL so it renders from the
// extension origin without tripping the source CDN's hotlink/referer checks.
// Returns undefined on any failure so callers can keep the original URL.
async function inlineCover(url: string): Promise<string | undefined> {
    if (url.startsWith("data:")) return url
    try {
        const res = await fetch(url)
        if (!res.ok) return undefined
        const blob = await res.blob()
        if (blob.size === 0 || blob.size > MAX_COVER_BYTES || !blob.type.startsWith("image/")) return undefined
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ""
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] as number)
        return `data:${blob.type};base64,${btoa(binary)}`
    } catch {
        return undefined
    }
}

// Self-contained — serialized and injected into the page via scripting.executeScript.
// Must not reference any external variables or imports.
function injectChapterPrompt(chapterUrl: string): void {
    const BANNER_ID = "__amr-chapter-prompt__"
    if (document.getElementById(BANNER_ID)) return

    const host = document.createElement("div")
    host.id = BANNER_ID
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = `
        <style>
            .banner {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                background: #16213e;
                border: 1px solid rgba(255,255,255,0.10);
                border-radius: 14px;
                padding: 14px 16px;
                display: flex;
                align-items: center;
                gap: 14px;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 14px;
                color: #e2e8f0;
                box-shadow: 0 12px 40px rgba(0,0,0,0.55);
                animation: slide-in 0.22s cubic-bezier(.22,.6,.36,1) both;
                max-width: 300px;
                min-width: 220px;
            }
            @keyframes slide-in {
                from { transform: translateY(110%); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            .icon { font-size: 22px; flex-shrink: 0; line-height: 1; }
            .text { flex: 1; min-width: 0; }
            .text b { display: block; font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px; }
            .text small { font-size: 11px; color: #64748b; }
            .actions { display: flex; gap: 8px; flex-shrink: 0; }
            .btn-open {
                background: #6366f1;
                color: #fff;
                border: none;
                border-radius: 8px;
                padding: 7px 14px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s;
            }
            .btn-open:hover { background: #818cf8; }
            .btn-dismiss {
                background: transparent;
                color: #64748b;
                border: 1px solid rgba(255,255,255,0.10);
                border-radius: 8px;
                padding: 7px 10px;
                font-size: 13px;
                cursor: pointer;
                font-family: inherit;
                transition: color 0.15s, border-color 0.15s;
            }
            .btn-dismiss:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.22); }
        </style>
        <div class="banner">
            <div class="icon">📖</div>
            <div class="text">
                <b>Open in AMR?</b>
                <small>Chapter detected on this page</small>
            </div>
            <div class="actions">
                <button class="btn-open">Open</button>
                <button class="btn-dismiss">✕</button>
            </div>
        </div>
    `

    shadow.querySelector(".btn-open")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "chapter:open-in-reader", url: chapterUrl })
        host.remove()
    })

    shadow.querySelector(".btn-dismiss")?.addEventListener("click", () => {
        host.remove()
    })
}

export default defineBackground(() => {
    browser.runtime.onInstalled.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        void checkExtensionUpdate()
    })

    // Re-arm alarms on browser startup in case they were cleared (profile wipe,
    // browser crash, edge-case alarm storage corruption). onInstalled only fires
    // on install/update, so without this, a lost alarm silently breaks until the
    // next extension update.
    browser.runtime.onStartup.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
    })

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === updateAlarmName) void checkUpdates()
        if (alarm.name === syncAlarmName) void autoPush()
        if (alarm.name === extensionUpdateAlarmName) void checkExtensionUpdate()
    })

    // Filter to source URLs only so the MV3 service worker is not woken up for
    // every tab navigation (YouTube, Google, etc.) — unfiltered onUpdated is the
    // most common cause of excessive SW restarts and subsequent throttling.
    browser.tabs.onUpdated.addListener(
        (tabId, changeInfo, tab) => {
            if (changeInfo.url && !internalTabIds.has(tabId)) {
                void captureChapter(changeInfo.url).catch(error => {
                    console.warn("[AMR] Automatic chapter capture failed", error)
                })
            }
            if (changeInfo.status === "complete" && tab.url) {
                let parsedUrl: URL
                try {
                    parsedUrl = new URL(tab.url)
                } catch {
                    return
                }
                const source = findSource(parsedUrl)
                if (source?.match(parsedUrl) === "chapter") {
                    void browser.scripting
                        .executeScript({ target: { tabId }, func: injectChapterPrompt, args: [tab.url] })
                        .catch(() => {})
                }
            }
        },
        { urls: [...SOURCE_ORIGINS] }
    )

    browser.runtime.onMessage.addListener((message, sender) => {
        return (async () => {
            try {
                const request = runtimeRequestSchema.parse(message)

                switch (request.type) {
                    case "library:list":
                        return success(await db.manga.orderBy("updatedAt").reverse().toArray())
                    case "library:get":
                        return success((await db.manga.get(request.mangaId)) ?? null)
                    case "library:remove":
                        await removeManga(request.mangaId)
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
                    case "library:dismiss": {
                        // Clear the hostname-style sourceId that flags this as a broken import
                        // so it no longer appears in the reconcile panel.
                        const target = await db.manga.get(request.mangaId)
                        if (target && target.sourceId.includes(".")) {
                            await db.manga.update(request.mangaId, {
                                sourceId: "manual",
                                manualTracking: true
                            } as Partial<{ sourceId: string; manualTracking: boolean }>)
                        }
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
                            await db.manga.update(request.mangaId, {
                                manualTracking: undefined
                            } as unknown as Partial<{ manualTracking: boolean }>)
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
                        // Targets: titles with no cover, plus titles whose cover is still a
                        // remote URL (which can fail to render from the extension origin).
                        // data: and bundled /sample-covers/ URLs already render and are skipped.
                        // Already-attempted IDs are excluded so a failed inline doesn't loop forever.
                        const targets = all.filter(
                            m =>
                                !m.id.startsWith("seed-") &&
                                !coverBackfillAttempted.has(m.id) &&
                                (!m.coverUrl || /^https?:\/\//.test(m.coverUrl))
                        )
                        let updated = 0
                        for (const m of targets.slice(0, COVER_BACKFILL_BATCH)) {
                            coverBackfillAttempted.add(m.id)
                            try {
                                const remote =
                                    m.coverUrl && /^https?:\/\//.test(m.coverUrl)
                                        ? m.coverUrl
                                        : await resolveCoverFor(m)
                                if (!remote) continue
                                const inlined = await inlineCover(remote)
                                if (inlined) {
                                    await db.manga.update(m.id, { coverUrl: inlined })
                                    updated += 1
                                } else if (!m.coverUrl) {
                                    await db.manga.update(m.id, { coverUrl: remote })
                                    updated += 1
                                }
                                // Cache the raw blob so the UI can serve it from IndexedDB
                                // without re-fetching. Non-fatal: the URL is already stored.
                                try {
                                    const imgResp = await fetch(remote)
                                    if (imgResp.ok) {
                                        const blob = await imgResp.blob()
                                        if (blob.size > 0) await cacheCover(m.id, blob)
                                    }
                                } catch {
                                    /* non-fatal */
                                }
                            } catch (error) {
                                console.warn("[AMR] Cover backfill failed", { mangaId: m.id, error })
                            }
                        }
                        const remaining = Math.max(0, targets.length - COVER_BACKFILL_BATCH)
                        if (remaining === 0) coverBackfillAttempted.clear()
                        return success({ updated, remaining })
                    }
                    case "stats:get":
                        return success(await getLocalStats())
                    case "history:list": {
                        const events = await db.historyEvents.orderBy("occurredAt").reverse().limit(60).toArray()
                        const ids = [...new Set(events.map(e => e.mangaId))]
                        const mangas = await db.manga.bulkGet(ids)
                        const titleById = new Map(ids.map((id, i) => [id, mangas[i]?.title ?? id]))
                        const chapterIds = [
                            ...new Set(events.map(e => e.chapterId).filter((c): c is string => Boolean(c)))
                        ]
                        const chapters = await db.chapters.bulkGet(chapterIds)
                        const chapterById = new Map(chapterIds.map((id, i) => [id, chapters[i]]))
                        return success(
                            events.map(e => {
                                const chapter = e.chapterId ? chapterById.get(e.chapterId) : undefined
                                return {
                                    mangaId: e.mangaId,
                                    title: titleById.get(e.mangaId) ?? e.mangaId,
                                    type: e.type,
                                    occurredAt: e.occurredAt,
                                    chapterNumber: chapter && Number.isFinite(chapter.sortKey) ? chapter.sortKey : null,
                                    chapterTitle: chapter?.title ?? null
                                }
                            })
                        )
                    }
                    case "chapter:adjacent": {
                        const manga = await db.manga.get(request.mangaId)
                        if (!manga) return success({ current: null, next: null, prev: null })
                        const current = manga.lastReadChapterNumber ?? null
                        try {
                            const chapters = await listChaptersForSource(
                                manga,
                                manga.sourceId,
                                manga.sourceMangaId ?? "",
                                manga.mangaUrl ?? manga.sourceUrl
                            )
                            let next: (typeof chapters)[number] | null = null
                            let prev: (typeof chapters)[number] | null = null
                            if (current === null) {
                                for (const chapter of chapters) {
                                    if (!next || chapter.sortKey < next.sortKey) next = chapter
                                }
                            } else {
                                for (const chapter of chapters) {
                                    if (chapter.sortKey > current && (!next || chapter.sortKey < next.sortKey))
                                        next = chapter
                                    if (chapter.sortKey < current && (!prev || chapter.sortKey > prev.sortKey))
                                        prev = chapter
                                }
                            }
                            return success({
                                current,
                                next: next ? { url: next.url, title: next.title, number: next.sortKey } : null,
                                prev: prev ? { url: prev.url, title: prev.title, number: prev.sortKey } : null
                            })
                        } catch {
                            return success({ current: null, next: null, prev: null })
                        }
                    }
                    case "library:note": {
                        await db.manga.update(request.mangaId, {
                            notes: request.note.trim() || undefined
                        } as Partial<{ notes: string }>)
                        return success(null)
                    }
                    case "activity:get":
                        return success(await getActivityCalendar(request.days ?? 120))
                    case "data:export":
                        return success(await exportDatabase())
                    case "data:import:preview":
                        return success(await previewImport(request.envelope))
                    case "data:import":
                        return success(await importDatabase(request.envelope, request.resolutions))
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
                    case "manga:genres": {
                        const manga = await db.manga.get(request.mangaId)
                        if (!manga) return success([] as string[])
                        return success(
                            await resolveGenresFor({
                                sourceId: manga.sourceId,
                                ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {}),
                                mangaUrl: manga.mangaUrl ?? manga.sourceUrl
                            })
                        )
                    }
                    case "source:permission:check":
                        return success(await checkSourcePermission())
                    case "sources:list":
                        return success(
                            sourceRegistry.list().map(adapter => ({
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
                            sourceRegistry.list().map(async adapter => {
                                const origin =
                                    adapter.manifest.homepage ??
                                    (adapter.manifest.domains[0] ? `https://${adapter.manifest.domains[0]}` : undefined)
                                if (!origin) return { id: adapter.manifest.id, alive: false }
                                const controller = new AbortController()
                                const timer = setTimeout(() => controller.abort(), 10000)
                                try {
                                    // Background fetches are privileged — no CORS restriction for origins
                                    // in host_permissions. Distinguish three states:
                                    //   live  — server answered normally (2xx/3xx)
                                    //   gated — bot-blocked (403/429 from CF or rate-limiting);
                                    //           chapter reads still work via the tab fallback
                                    //   dead  — truly unreachable (timeout, DNS, 5xx)
                                    const res = await fetch(origin, {
                                        method: "HEAD",
                                        signal: controller.signal,
                                        credentials: "omit"
                                    })
                                    const status =
                                        res.status < 400
                                            ? ("live" as const)
                                            : res.status === 403 || res.status === 429
                                              ? ("gated" as const)
                                              : ("dead" as const)
                                    return { id: adapter.manifest.id, alive: status !== "dead", status }
                                } catch {
                                    return { id: adapter.manifest.id, alive: false, status: "dead" as const }
                                } finally {
                                    clearTimeout(timer)
                                }
                            })
                        )
                        await browser.storage.local.set({
                            sourceHealth: Object.fromEntries(
                                checks.map(c => [c.id, { alive: c.alive, at: Date.now() }])
                            )
                        })
                        return success(checks)
                    }
                    case "sources:health": {
                        const stored = await browser.storage.local.get("sourceHealth")
                        return success(stored["sourceHealth"] ?? {})
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
                        let resolved
                        try {
                            resolved = await resolveChapterUrl(request.url)
                        } catch (fetchError) {
                            if (isBotBlocked(fetchError)) {
                                const html = await fetchChapterHtmlViaTab(request.url)
                                resolved = await resolveChapterFromHtml(request.url, html)
                            } else {
                                throw fetchError
                            }
                        }
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
                    case "chapter:open-in-reader": {
                        void captureChapter(request.url).catch(() => {})
                        const readerUrl = browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(request.url)}`)
                        await browser.tabs.create({ url: readerUrl })
                        return success(null)
                    }
                    case "chapter:download:get":
                        return success((await getDownload(request.chapterId)) ?? null)
                    case "chapter:download:remove":
                        await removeDownload(request.chapterId)
                        return success(null)
                    case "downloads:list":
                        return success(await listDownloads())
                    case "bookmark:toggle":
                        return success(
                            await toggleBookmark({
                                mangaId: request.mangaId,
                                chapterId: request.chapterId,
                                pageIndex: request.pageIndex,
                                mangaTitle: request.mangaTitle,
                                chapterTitle: request.chapterTitle,
                                chapterUrl: request.chapterUrl
                            })
                        )
                    case "bookmark:pages":
                        return success(await bookmarkedPagesForChapter(request.chapterId))
                    case "bookmark:list":
                        return success(await listBookmarks())
                    case "bookmark:remove":
                        await removeBookmark(request.id)
                        return success(null)
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
