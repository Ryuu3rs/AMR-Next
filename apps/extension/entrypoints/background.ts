import type { ReadingProgress } from "@amr/contracts"
import { SourceError, SourceRequestError } from "@amr/source-sdk"
import { sourceRegistry } from "@amr/sources"
import {
    db,
    cacheCover,
    exportDatabase,
    getActivityCalendar,
    getAnalyticsSummary,
    getDownload,
    getLocalStats,
    importDatabase,
    previewImport,
    listDownloads,
    recordAnalyticsEvent,
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
    removeBookmark,
    type AnalyticsEvent,
    type LibraryManga
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

let updateCheckRunning = false
let genreBackfillRunning = false

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
    if (updateCheckRunning) return
    updateCheckRunning = true
    try {
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
    } finally {
        updateCheckRunning = false
    }
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

function classifyError(error: unknown): string {
    if (error instanceof SourceRequestError) {
        const s = error.status
        if (s === 403 || s === 502 || s === 503) return "bot-block"
        if (s === 404) return "not-found"
        if (s === undefined) return "network"
        return `http-${s}`
    }
    return "unknown"
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
        void recordAnalyticsEvent({
            event: "capture_error",
            sourceId: source.manifest.id,
            detail: JSON.stringify({ errorType: classifyError(error) }),
            ts: Date.now()
        })
        let tracked
        try {
            tracked = await trackExternalChapter({ url, sourceId: source.manifest.id, completed: false })
        } catch (trackError) {
            console.warn("[AMR] Failed to track external chapter", { url, trackError })
            return { supported: true as const, added: false as const }
        }
        console.debug("[AMR] Captured chapter without scraping", { url, error })
        await flashAddedBadge()
        return { supported: true as const, added: true as const, external: true as const, title: tracked.title }
    }

    void recordAnalyticsEvent({ event: "capture_ok", sourceId: source.manifest.id, ts: Date.now() })

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
        const CHUNK = 65536
        let binary = ""
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
        }
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

    // Auto-detect light background and switch to dark for comfortable reading.
    function parseLuminance(css: string): number {
        const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!m) return -1
        const r = parseInt(m[1]) / 255,
            g = parseInt(m[2]) / 255,
            b = parseInt(m[3]) / 255
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const bgCss =
        getComputedStyle(document.documentElement).backgroundColor || getComputedStyle(document.body).backgroundColor
    const isLight = parseLuminance(bgCss) > 0.5

    let darkModeActive = false
    let darkStyleEl: HTMLStyleElement | null = null

    function applyDark() {
        if (darkStyleEl) return
        darkStyleEl = document.createElement("style")
        darkStyleEl.id = "__amr-dark-mode__"
        darkStyleEl.textContent =
            "html,body{background-color:#111!important;color:#e2e8f0!important}" +
            ".chapter-container,.reading-content,.page-break,.wp-manga-chapter-img," +
            "div[class*='chapter'],div[class*='page']{background:#111!important}"
        document.head.appendChild(darkStyleEl)
        darkModeActive = true
    }
    function removeDark() {
        darkStyleEl?.remove()
        darkStyleEl = null
        darkModeActive = false
    }

    if (isLight) applyDark()

    const host = document.createElement("div")
    host.id = BANNER_ID
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: "open" })
    const darkBtnActive = isLight ? " dark-active" : ""
    shadow.innerHTML = `
        <style>
            .panel {
                position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
                background: #16213e; border: 1px solid rgba(255,255,255,0.12);
                border-radius: 14px; padding: 0;
                display: flex; flex-direction: column;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 13px; color: #e2e8f0;
                box-shadow: 0 12px 40px rgba(0,0,0,0.6);
                animation: slide-in 0.22s cubic-bezier(.22,.6,.36,1) both; width: 220px;
                overflow: hidden;
            }
            @keyframes slide-in {
                from { transform: translateY(110%); opacity: 0; }
                to   { transform: translateY(0); opacity: 1; }
            }
            .prog-track {
                height: 3px; background: rgba(255,255,255,0.06); width: 100%; flex-shrink: 0;
            }
            .prog-fill {
                height: 100%; background: #6366f1; width: 0%; transition: width 0.1s linear;
            }
            .inner { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
            .hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
            .ttl { font-weight: 700; font-size: 13px; color: #fff; }
            .sub { font-size: 11px; color: #64748b; margin-top: 1px;
                   overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
            .x { background: none; border: none; color: #64748b; cursor: pointer;
                 font-size: 16px; line-height: 1; padding: 0 2px; font-family: inherit; flex-shrink: 0; }
            .x:hover { color: #e2e8f0; }
            .sep { height: 1px; background: rgba(255,255,255,0.08); }
            .row { display: flex; gap: 6px; }
            .btn {
                flex: 1; background: rgba(255,255,255,0.08); color: #e2e8f0;
                border: 1px solid rgba(255,255,255,0.10); border-radius: 8px;
                padding: 7px 10px; font-size: 12px; font-weight: 600; cursor: pointer;
                font-family: inherit; transition: background 0.15s, opacity 0.15s;
                text-align: center; white-space: nowrap;
            }
            .btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
            .btn:disabled { opacity: 0.28; cursor: default; }
            .btn-p { background: #6366f1; border-color: transparent; }
            .btn-p:hover:not(:disabled) { background: #818cf8; }
            .btn-moon { font-size: 14px; padding: 7px 8px; flex: 0 0 auto; }
            .dark-active { background: #1e3a8a; border-color: #3b82f6; }
        </style>
        <div class="panel">
            <div class="prog-track"><div class="prog-fill" id="prog"></div></div>
            <div class="inner">
                <div class="hd">
                    <div>
                        <div class="ttl">📖 AMR</div>
                        <div class="sub" id="sub">Chapter detected</div>
                    </div>
                    <button class="x" id="xbtn" aria-label="Dismiss">✕</button>
                </div>
                <div class="sep"></div>
                <div class="row">
                    <button class="btn" id="bprev" disabled>‹ Prev</button>
                    <button class="btn" id="bnext" disabled>Next ›</button>
                </div>
                <div class="row">
                    <button class="btn btn-p" id="bopen">Open in AMR</button>
                    <button class="btn btn-moon${darkBtnActive}" id="bdark" title="Toggle dark background">🌙</button>
                </div>
                <button class="btn" id="btrack">Mark read</button>
            </div>
        </div>
    `

    // Scroll progress bar — updates on every scroll event via rAF.
    const progEl = shadow.getElementById("prog") as HTMLElement | null
    function updateProgress() {
        if (!progEl) return
        const el = document.documentElement
        const scrollable = el.scrollHeight - el.clientHeight
        const pct = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 0
        progEl.style.width = `${pct}%`
    }
    let rafPending = false
    function onScroll() {
        if (rafPending) return
        rafPending = true
        requestAnimationFrame(() => {
            updateProgress()
            rafPending = false
        })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    updateProgress()

    function track(action: string) {
        chrome.runtime.sendMessage({
            type: "analytics:record",
            event: "panel_action",
            detail: JSON.stringify({ action })
        })
    }

    let prevUrl: string | null = null
    let nextUrl: string | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chrome.runtime.sendMessage({ type: "chapter:siblings", url: chapterUrl }, (resp: any) => {
        if (!resp?.ok || !resp.data) return
        const d = resp.data as {
            prevUrl: string | null
            nextUrl: string | null
            mangaTitle: string | null
            chapterTitle: string | null
        }
        prevUrl = d.prevUrl
        nextUrl = d.nextUrl
        const sub = shadow.getElementById("sub")
        if (sub && (d.chapterTitle || d.mangaTitle)) sub.textContent = d.chapterTitle ?? d.mangaTitle
        const bprevSib = shadow.getElementById("bprev") as HTMLButtonElement | null
        const bnextSib = shadow.getElementById("bnext") as HTMLButtonElement | null
        if (bprevSib) bprevSib.disabled = !prevUrl
        if (bnextSib) bnextSib.disabled = !nextUrl
    })

    shadow.getElementById("xbtn")?.addEventListener("click", () => {
        track("dismiss")
        window.removeEventListener("scroll", onScroll)
        host.remove()
    })

    shadow.getElementById("bopen")?.addEventListener("click", () => {
        track("open-in-reader")
        chrome.runtime.sendMessage({ type: "chapter:open-in-reader", url: chapterUrl })
        window.removeEventListener("scroll", onScroll)
        host.remove()
    })

    shadow.getElementById("btrack")?.addEventListener("click", () => {
        track("mark-read")
        chrome.runtime.sendMessage({ type: "chapter:track", url: chapterUrl })
        const btn = shadow.getElementById("btrack") as HTMLButtonElement | null
        if (btn) {
            btn.textContent = "Marked ✓"
            btn.disabled = true
        }
    })

    shadow.getElementById("bdark")?.addEventListener("click", () => {
        const btn = shadow.getElementById("bdark")
        if (darkModeActive) {
            track("dark-off")
            removeDark()
            btn?.classList.remove("dark-active")
        } else {
            track("dark-on")
            applyDark()
            btn?.classList.add("dark-active")
        }
    })

    shadow.getElementById("bprev")?.addEventListener("click", () => {
        if (prevUrl) {
            track("prev")
            const bp = shadow.getElementById("bprev") as HTMLButtonElement | null
            const bn = shadow.getElementById("bnext") as HTMLButtonElement | null
            if (bp) {
                bp.textContent = "← Going…"
                bp.disabled = true
            }
            if (bn) bn.disabled = true
            window.removeEventListener("scroll", onScroll)
            window.location.href = prevUrl
        }
    })
    shadow.getElementById("bnext")?.addEventListener("click", () => {
        if (nextUrl) {
            track("next")
            const bp = shadow.getElementById("bprev") as HTMLButtonElement | null
            const bn = shadow.getElementById("bnext") as HTMLButtonElement | null
            if (bp) bp.disabled = true
            if (bn) {
                bn.textContent = "Going… →"
                bn.disabled = true
            }
            window.removeEventListener("scroll", onScroll)
            window.location.href = nextUrl
        }
    })
}

async function backfillMangaGenres(): Promise<void> {
    if (genreBackfillRunning) return
    genreBackfillRunning = true
    try {
        // Only process titles with a manga URL or source ID — sourceUrl is a chapter URL
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
                // Skip — source may not support genres or fetch failed transiently
            }
            // Respect the source rate limit (3 req/s) between requests.
            await new Promise<void>(r => setTimeout(r, 350))
        }
    } finally {
        genreBackfillRunning = false
    }
}

export default defineBackground(() => {
    browser.runtime.onInstalled.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        void checkExtensionUpdate()
        void backfillMangaGenres()
    })

    // Re-arm alarms on browser startup in case they were cleared (profile wipe,
    // browser crash, edge-case alarm storage corruption). onInstalled only fires
    // on install/update, so without this, a lost alarm silently breaks until the
    // next extension update.
    browser.runtime.onStartup.addListener(() => {
        void configureUpdateAlarm()
        void configureSyncAlarm()
        void browser.alarms.create(extensionUpdateAlarmName, {
            periodInMinutes: EXTENSION_UPDATE_INTERVAL_HOURS * 60
        })
        void backfillMangaGenres()
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
                        // Return cached genres immediately if available, skip the network call.
                        if (manga.genres && manga.genres.length > 0) return success(manga.genres)
                        const genres = await resolveGenresFor({
                            sourceId: manga.sourceId,
                            ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {}),
                            ...(manga.mangaUrl ? { mangaUrl: manga.mangaUrl } : {})
                        })
                        if (genres.length > 0) {
                            void db.manga.update(request.mangaId, { genres } as Partial<LibraryManga>)
                        }
                        return success(genres)
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
                            void recordAnalyticsEvent({
                                event: "resolve_direct",
                                sourceId: findSource(new URL(request.url))?.manifest.id,
                                ts: Date.now()
                            })
                        } catch (fetchError) {
                            if (isBotBlocked(fetchError)) {
                                const srcId = findSource(new URL(request.url))?.manifest.id
                                void recordAnalyticsEvent({ event: "resolve_tab", sourceId: srcId, ts: Date.now() })
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
                    case "chapter:siblings": {
                        // Look up cached chapters from DB — no network call needed.
                        // auto-capture already stored chapters when the user first visited.
                        const chRecord = await db.chapters.filter(c => c.url === request.url).first()
                        if (!chRecord)
                            return success({ prevUrl: null, nextUrl: null, mangaTitle: null, chapterTitle: null })
                        const manga = await db.manga.get(chRecord.mangaId)
                        if (!manga)
                            return success({ prevUrl: null, nextUrl: null, mangaTitle: null, chapterTitle: null })
                        const siblings = await db.chapters.where("mangaId").equals(chRecord.mangaId).sortBy("sortKey")
                        const idx = siblings.findIndex(c => c.url === request.url)
                        const prev = idx > 0 ? siblings[idx - 1] : null
                        const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
                        return success({
                            prevUrl: prev?.url ?? null,
                            nextUrl: next?.url ?? null,
                            mangaTitle: manga.title,
                            chapterTitle: chRecord.title ?? null
                        })
                    }
                    case "analytics:record": {
                        void recordAnalyticsEvent({
                            event: request.event as AnalyticsEvent["event"],
                            ...(request.sourceId ? { sourceId: request.sourceId } : {}),
                            ...(request.detail ? { detail: request.detail } : {}),
                            ts: Date.now()
                        })
                        return success(null)
                    }
                    case "analytics:summary":
                        return success(await getAnalyticsSummary(request.days))
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
                        void recordAnalyticsEvent({
                            event: "on_site_track",
                            sourceId: source.manifest.id,
                            ts: Date.now()
                        })
                        const tracked = await trackExternalChapter({
                            url: request.url,
                            sourceId: source.manifest.id
                        })
                        return success({ supported: true as const, ...tracked })
                    }
                    case "chapter:open-in-reader": {
                        const srcId = findSource(new URL(request.url))?.manifest.id
                        void recordAnalyticsEvent({ event: "reader_opened", sourceId: srcId, ts: Date.now() })
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
