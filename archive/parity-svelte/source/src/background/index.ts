import { extensionApi } from "../core/extension/browser-api"
import type {
    ExtensionMessage,
    HealthPong,
    MirrorsPayload,
    MirrorsDiagnosticsPayload,
    ReleaseReadinessPayload,
    PreferencesPayload,
    SyncStatusPayload,
    SyncRecordsPayload,
    SyncRecordsImportPayload,
    SearchMirrorsPayload,
    SearchResult,
    MirrorSearchStatus,
    MangaReleaseInfo,
    ReleaseCheckPayload,
    ReleaseCheckStatusPayload,
    ShareExportPayload,
    ShareImportPayload,
    ShareableList,
    ShareableManga
} from "../core/extension/messages"
import { getMirrorCatalog, getMirrorCatalogWithDiagnostics } from "../core/mirrors/catalog"
import { evaluateReleaseReadiness } from "../core/release/readiness"
import { defaultPreferences, getPreferences, savePreferences } from "../core/settings/preferences"
import {
    defaultSyncStatus,
    getLocalSyncRecordsSnapshot,
    getSyncStatus,
    replaceLocalSyncRecords,
    runSyncNow,
    saveSyncStatus
} from "../core/sync/status"
import { getMirrorLoader } from "../../../src/mirrors/MirrorLoader"
import { MirrorHelper } from "../../../src/mirrors/MirrorHelper"
import { getNetRulesForMirrors } from "../../../src/mirrors/MirrorNetRequestRules"

type LegacyActionMessage = {
    action: string
    [key: string]: unknown
}

type LegacyChapterDataResponse = {
    isChapter: boolean
    infos: Record<string, unknown> | null
    images: string[]
    title: string
}

type RuntimeMirror = {
    mirrorName: string
    domains: string[]
    home?: string
    mirrorIcon?: string
    activated?: boolean
    disabled?: boolean
    disabledForSearch?: boolean
}

type LegacyOptions = {
    darkreader: number
    prefetch: number
    imgorder: number
    displayFullChapter: number
    readingDirection: number
    displayBook: number
    resizeMode: number
    maxwidth: number
    addauto: number
}

type LegacyMangaInfo = {
    key: string
    read: number
    display: number
    layout: number
    lastchapter: string
    currentChapter: string
    currentScanUrl: string
    webtoon: boolean
    displayName: string
    zoom: number
    mirror?: string
    language?: string
    url?: string
    name?: string
    updatedAt?: number
}

type LegacyBookmarkRecord = {
    key: string
    mirror: string
    url: string
    chapUrl: string
    type: "chapter" | "scan"
    name: string
    chapName: string
    scanUrl?: string
    scanName?: string
    note: string
    updatedAt: number
}

type LegacySnapshotPayload = {
    version: number
    exportedAt: string
    options: LegacyOptions
    kv: Record<string, unknown>
    chapterCache: Record<string, unknown>
    mangas: LegacyMangaInfo[]
    bookmarks: LegacyBookmarkRecord[]
}

const extensionVersion = chrome?.runtime?.getManifest?.().version ?? "0.0.0"

const legacyMirrorHelper = new MirrorHelper({
    deactivateunreadable: 0,
    readlanguages: "en,gb",
    komgaUrl: "http://localhost:8080",
    tachideskUrl: "http://localhost:4567"
})

const legacyMirrorLoader = getMirrorLoader(legacyMirrorHelper)
const activeMirrorTriggers = new Map<number, { url: string; timestamp: number }>()

const LEGACY_OPTIONS_KEY = "amr:rewrite:legacy:options"
const LEGACY_CHAPTERS_KEY = "amr:rewrite:legacy:chapters"
const LEGACY_MANGAS_KEY = "amr:rewrite:legacy:mangas"
const LEGACY_BOOKMARKS_KEY = "amr:rewrite:legacy:bookmarks"
const LEGACY_KV_KEY = "amr:rewrite:legacy:kv"
const RELEASE_CHECK_KEY = "amr:rewrite:release:results"
const RELEASE_ALARM_NAME = "amr:release-check"

let releaseCheckRunning = false
let releaseCheckResults: MangaReleaseInfo[] = []
let releaseCheckLastRun = 0

const defaultLegacyOptions: LegacyOptions = {
    darkreader: 0,
    prefetch: 1,
    imgorder: 0,
    displayFullChapter: 1,
    readingDirection: 0,
    displayBook: 0,
    resizeMode: 0,
    maxwidth: 100,
    addauto: 1
}

async function syncNetRequestRules(): Promise<void> {
    const dnr = (extensionApi as any).declarativeNetRequest
    if (!dnr?.getDynamicRules || !dnr?.updateDynamicRules) {
        return
    }

    try {
        const oldRules = await dnr.getDynamicRules()
        const oldRuleIds = Array.isArray(oldRules) ? oldRules.map((rule: { id: number }) => rule.id) : []
        const newRules = getNetRulesForMirrors()
        await dnr.updateDynamicRules({
            removeRuleIds: oldRuleIds,
            addRules: newRules
        })
    } catch {
        // ignore rule sync failures; mirror fetch fallback still works for some sites
    }
}

const MESSAGE_TYPES = new Set<ExtensionMessage["type"]>([
    "health:ping",
    "preferences:get",
    "preferences:set",
    "mirrors:list",
    "mirrors:diagnostics",
    "release:readiness:get",
    "sync:status:get",
    "sync:status:set",
    "sync:run-now",
    "sync:records:get",
    "sync:records:import",
    "search:mirrors",
    "release:check",
    "release:check:status",
    "share:export",
    "share:import"
])

function normalizeUrl(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        return ""
    }

    try {
        return new URL(value).toString()
    } catch {
        return value
    }
}

function normalizeImageUrl(value: unknown): string {
    const url = stringValue(value).trim()
    if (!url) {
        return ""
    }

    if (url.startsWith("//")) {
        return `https:${url}`
    }

    return url
}

function normalizeDomain(domain: string): string {
    return domain
        .replace(/^https?:\/\//i, "")
        .replace(/^\*\./, "")
        .split("/")[0]
        .toLowerCase()
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
    const normalized = normalizeDomain(domain)
    if (!normalized) {
        return false
    }

    return hostname === normalized || hostname.endsWith(`.${normalized}`)
}

function shouldTriggerReader(tabId: number, url: string): boolean {
    const now = Date.now()
    const previous = activeMirrorTriggers.get(tabId)
    if (previous && previous.url === url && now - previous.timestamp < 900) {
        return false
    }

    activeMirrorTriggers.set(tabId, { url, timestamp: now })
    return true
}

function extractTitleFromHtml(htmlDocument: string): string {
    const titleMatch = htmlDocument.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return titleMatch?.[1]?.trim() || "AMR Reader"
}

function extractScriptStringVar(htmlDocument: string, variableName: string): string {
    const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = htmlDocument.match(new RegExp(`var\\s+${escaped}\\s*=\\s*["']([^"']+)["']\\s*;`, "i"))
    return match?.[1]?.trim() ?? ""
}

function normalizeUrlWithBase(value: string, baseUrl: string): string {
    if (!value) {
        return ""
    }

    try {
        return new URL(value, baseUrl).toString()
    } catch {
        return value
    }
}

function deriveSeriesUrlFromChapterUrl(url: string): string {
    try {
        const parsed = new URL(url)
        const parts = parsed.pathname.split("/").filter(Boolean)
        const mangaIndex = parts.findIndex(part => part.toLowerCase() === "manga")
        if (mangaIndex >= 0 && parts.length > mangaIndex + 1) {
            return `${parsed.origin}/manga/${parts[mangaIndex + 1]}/`
        }
    } catch {
        // no-op
    }
    return ""
}

function deriveChapterBaseUrl(url: string): string {
    try {
        const parsed = new URL(url)
        const cleaned = parsed.pathname.replace(/\/1(?:\.html?)?$/i, "").replace(/\/+$/, "")
        return `${parsed.origin}${cleaned}/`
    } catch {
        return url
    }
}

function coerceNumber(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function stringValue(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback
}

function boolValue(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null
    }

    return value as Record<string, unknown>
}

function languageValue(value: unknown): string {
    const language = stringValue(value, "en").trim().toLowerCase()
    return language || "en"
}

function chapterPath(value: string): string {
    try {
        const parsed = new URL(value)
        return `${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`
    } catch {
        return value.split("/").slice(3).join("/")
    }
}

function buildMangaKey(url: unknown, mirror: unknown, language: unknown): string | null {
    const normalizedUrl = normalizeUrl(url)
    const mirrorName = stringValue(mirror).trim().toLowerCase()
    const lang = languageValue(language)

    if (!normalizedUrl || !mirrorName) {
        return null
    }

    return `${mirrorName}::${lang}::${normalizedUrl}`
}

function buildChapterListKey(url: unknown, mirror: unknown, language: unknown): string | null {
    return buildMangaKey(url, mirror, language)
}

function parseMangaKey(key: string): { mirror: string; language: string; url: string } | null {
    const [mirror, language, ...urlParts] = key.split("::")
    const url = urlParts.join("::")
    if (!mirror || !language || !url) {
        return null
    }

    return {
        mirror,
        language,
        url
    }
}

function buildChapterBookmarkKey(mirror: unknown, chapUrl: unknown): string | null {
    const mirrorName = stringValue(mirror).trim().toLowerCase()
    const chapterUrl = normalizeUrl(chapUrl)
    if (!mirrorName || !chapterUrl) {
        return null
    }

    return `${mirrorName}::chapter::${chapterUrl}`
}

function buildScanBookmarkKey(mirror: unknown, chapUrl: unknown, scanUrl: unknown): string | null {
    const chapterKey = buildChapterBookmarkKey(mirror, chapUrl)
    const normalizedScan = normalizeUrl(scanUrl)
    if (!chapterKey || !normalizedScan) {
        return null
    }

    return `${chapterKey}::scan::${normalizedScan}`
}

function normalizeImportedMangaRecord(value: unknown): LegacyMangaInfo | null {
    if (!value || typeof value !== "object") {
        return null
    }

    const source = value as Record<string, unknown>
    const parsed = typeof source.key === "string" ? parseMangaKey(source.key) : null

    const mirror = stringValue(source.mirror, parsed?.mirror ?? "").toLowerCase()
    const language = languageValue(source.language ?? parsed?.language ?? "en")
    const url = normalizeUrl(source.url ?? parsed?.url ?? "")
    const key = stringValue(source.key) || buildMangaKey(url, mirror, language)

    if (!key) {
        return null
    }

    return {
        key,
        read: coerceNumber(source.read, 0),
        display: coerceNumber(source.display, 0),
        layout: coerceNumber(source.layout, 10000),
        lastchapter: stringValue(source.lastchapter),
        currentChapter: stringValue(source.currentChapter),
        currentScanUrl: stringValue(source.currentScanUrl),
        webtoon: boolValue(source.webtoon, false),
        displayName: stringValue(source.displayName),
        zoom: coerceNumber(source.zoom, 100),
        mirror,
        language,
        url,
        name: stringValue(source.name),
        updatedAt: coerceNumber(source.updatedAt, Date.now())
    }
}

function normalizeImportedBookmarkRecord(value: unknown): LegacyBookmarkRecord | null {
    if (!value || typeof value !== "object") {
        return null
    }

    const source = value as Record<string, unknown>
    const mirror = stringValue(source.mirror)
    const chapUrl = normalizeUrl(source.chapUrl)
    const isChapter = stringValue(source.type) !== "scan"
    const scanUrl = normalizeUrl(source.scanUrl)

    const computedKey = isChapter
        ? buildChapterBookmarkKey(mirror, chapUrl)
        : buildScanBookmarkKey(mirror, chapUrl, scanUrl)
    const key = stringValue(source.key) || computedKey

    if (!key || !mirror || !chapUrl) {
        return null
    }

    return {
        key,
        mirror,
        url: normalizeUrl(source.url),
        chapUrl,
        type: isChapter ? "chapter" : "scan",
        name: stringValue(source.name),
        chapName: stringValue(source.chapName),
        scanUrl,
        scanName: stringValue(source.scanName),
        note: stringValue(source.note),
        updatedAt: coerceNumber(source.updatedAt, Date.now())
    }
}

async function readStorageKey<T>(key: string, fallback: T): Promise<T> {
    const payload = (await extensionApi.storage.local.get(key)) as Record<string, unknown>
    if (!payload || typeof payload !== "object") {
        return fallback
    }

    if (!(key in payload)) {
        return fallback
    }

    return payload[key] as T
}

async function writeStorageKey<T>(key: string, value: T): Promise<void> {
    await extensionApi.storage.local.set({ [key]: value })
}

async function getLegacyOptions(): Promise<LegacyOptions> {
    const stored = await readStorageKey<Partial<LegacyOptions>>(LEGACY_OPTIONS_KEY, {})
    return {
        darkreader: coerceNumber(stored.darkreader, defaultLegacyOptions.darkreader),
        prefetch: coerceNumber(stored.prefetch, defaultLegacyOptions.prefetch),
        imgorder: coerceNumber(stored.imgorder, defaultLegacyOptions.imgorder),
        displayFullChapter: coerceNumber(stored.displayFullChapter, defaultLegacyOptions.displayFullChapter),
        readingDirection: coerceNumber(stored.readingDirection, defaultLegacyOptions.readingDirection),
        displayBook: coerceNumber(stored.displayBook, defaultLegacyOptions.displayBook),
        resizeMode: coerceNumber(stored.resizeMode, defaultLegacyOptions.resizeMode),
        maxwidth: coerceNumber(stored.maxwidth, defaultLegacyOptions.maxwidth),
        addauto: coerceNumber(stored.addauto, defaultLegacyOptions.addauto)
    }
}

async function saveLegacyOption(key: string, value: unknown): Promise<LegacyOptions> {
    const options = await getLegacyOptions()

    if (key in options) {
        ;(options as Record<string, unknown>)[key] = typeof value === "number" ? value : Number(value)
    } else {
        ;(options as Record<string, unknown>)[key] = value
    }

    await writeStorageKey(LEGACY_OPTIONS_KEY, options)
    return options
}

async function getLegacyChapterCache(): Promise<Record<string, unknown>> {
    return await readStorageKey<Record<string, unknown>>(LEGACY_CHAPTERS_KEY, {})
}

async function getLegacyMangaMap(): Promise<Record<string, LegacyMangaInfo>> {
    return await readStorageKey<Record<string, LegacyMangaInfo>>(LEGACY_MANGAS_KEY, {})
}

async function getLegacyBookmarkMap(): Promise<Record<string, LegacyBookmarkRecord>> {
    return await readStorageKey<Record<string, LegacyBookmarkRecord>>(LEGACY_BOOKMARKS_KEY, {})
}

async function getLegacyKv(): Promise<Record<string, unknown>> {
    return await readStorageKey<Record<string, unknown>>(LEGACY_KV_KEY, {})
}

async function findMirrorForUrl(url: string): Promise<RuntimeMirror | null> {
    let hostname = ""
    try {
        hostname = new URL(url).hostname.toLowerCase()
    } catch {
        return null
    }

    const mirrors = legacyMirrorLoader.getAll() as RuntimeMirror[]
    for (const mirror of mirrors) {
        if (mirror.disabled || !Array.isArray(mirror.domains)) {
            continue
        }

        if (mirror.domains.some(domain => hostMatchesDomain(hostname, domain))) {
            return {
                mirrorName: mirror.mirrorName,
                domains: mirror.domains
            }
        }
    }

    return null
}

async function postMirrorPayloadToTab(tabId: number, mirror: RuntimeMirror): Promise<void> {
    await extensionApi.scripting.executeScript({
        target: { tabId },
        func: (mirrorPayload: RuntimeMirror) => {
            const w = globalThis as {
                amrLoadMirror?: (payload: RuntimeMirror) => Promise<void>
                __amrReaderPendingMirrors?: RuntimeMirror[]
            }

            if (typeof w.amrLoadMirror === "function") {
                void w.amrLoadMirror(mirrorPayload)
                return
            }

            if (!Array.isArray(w.__amrReaderPendingMirrors)) {
                w.__amrReaderPendingMirrors = []
            }

            w.__amrReaderPendingMirrors.push(mirrorPayload)
        },
        args: [mirror]
    })
}

async function maybeTriggerReaderForUrl(tabId: number, url: string): Promise<void> {
    if (!url || !shouldTriggerReader(tabId, url)) {
        return
    }

    const mirror = await findMirrorForUrl(url)
    if (!mirror) {
        return
    }

    await postMirrorPayloadToTab(tabId, mirror)
}

async function handleSearchMirrors(query: string, mirrorFilter?: string[]): Promise<SearchMirrorsPayload> {
    const startTime = Date.now()
    const allMirrors = legacyMirrorLoader.getAll() as RuntimeMirror[]

    // Determine which mirrors to search
    const searchableMirrors = allMirrors.filter(m => {
        if (m.disabled || m.disabledForSearch) return false
        if (mirrorFilter && mirrorFilter.length > 0) {
            return mirrorFilter.includes(m.mirrorName)
        }
        return true
    })

    const results: SearchResult[] = []
    const mirrorStatuses: MirrorSearchStatus[] = searchableMirrors.map(m => ({
        mirror: m.mirrorName,
        status: "pending" as const,
        count: 0
    }))

    // Fan out searches concurrently across all selected mirrors
    const searchPromises = searchableMirrors.map(async (mirror, index) => {
        const mirrorStart = Date.now()
        try {
            const impl = await legacyMirrorLoader.getImpl(mirror.mirrorName)
            if (!impl) {
                mirrorStatuses[index] = {
                    mirror: mirror.mirrorName,
                    status: "error",
                    count: 0,
                    error: "Mirror implementation not found",
                    errorCode: "NOT_FOUND",
                    errorDetail: `No implementation loaded for mirror "${mirror.mirrorName}". It may have been removed or renamed.`,
                    durationMs: Date.now() - mirrorStart
                }
                return
            }

            const rawResults = await Promise.race([
                impl.getMangaList(query),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))
            ])

            const mirrorResults: SearchResult[] = (Array.isArray(rawResults) ? rawResults : [])
                .filter((item: unknown) => Array.isArray(item) && item.length >= 2)
                .map((item: unknown[]) => ({
                    name: String(item[0]),
                    url: String(item[1]),
                    mirror: mirror.mirrorName
                }))

            results.push(...mirrorResults)
            mirrorStatuses[index] = {
                mirror: mirror.mirrorName,
                status: "done",
                count: mirrorResults.length,
                durationMs: Date.now() - mirrorStart
            }
        } catch (err) {
            const elapsed = Date.now() - mirrorStart
            const raw = err instanceof Error ? err.message : String(err)
            const stack = err instanceof Error ? err.stack : undefined

            let errorCode: "OFFLINE" | "BLOCKED" | "NETWORK" | "TIMEOUT" | "PARSE" | "HTTP" | "CHANGED" | "UNKNOWN" =
                "UNKNOWN"
            let errorShort = raw
            if (raw === "timeout" || raw.includes("timeout") || raw.includes("Timeout")) {
                errorCode = "TIMEOUT"
                errorShort = `Timed out after ${Math.round(elapsed / 1000)}s — site may be slow or unresponsive`
            } else if (
                raw.includes("403") ||
                raw.includes("Forbidden") ||
                raw.includes("Cloudflare") ||
                raw.includes("cf-") ||
                raw.includes("captcha") ||
                raw.includes("Access Denied")
            ) {
                errorCode = "BLOCKED"
                errorShort = "Blocked — site is using Cloudflare or access protection"
            } else if (
                raw.includes("ERR_NAME_NOT_RESOLVED") ||
                raw.includes("ENOTFOUND") ||
                raw.includes("ERR_CONNECTION_REFUSED") ||
                (raw.includes("NetworkError") && elapsed < 200)
            ) {
                errorCode = "OFFLINE"
                errorShort = "Offline — site appears to be down or domain no longer exists"
            } else if (
                raw.includes("NetworkError") ||
                raw.includes("fetch") ||
                raw.includes("CORS") ||
                raw.includes("net::ERR")
            ) {
                errorCode = "NETWORK"
                errorShort = "Network error — connection failed"
            } else if (raw.includes("Failed to load manga list from url")) {
                errorCode = "HTTP"
                const urlMatch = raw.match(/url\s+(https?:\/\/\S+)/)
                const statusMatch = raw.match(/(\d{3})/)
                if (statusMatch && (statusMatch[1] === "403" || statusMatch[1] === "503")) {
                    errorCode = "BLOCKED"
                    errorShort = `Blocked (HTTP ${statusMatch[1]}) — site may require browser verification`
                } else {
                    errorShort = urlMatch ? `HTTP error fetching: ${urlMatch[1]}` : raw
                }
            } else if (raw.includes("JSON") || raw.includes("parse") || raw.includes("Unexpected token")) {
                errorCode = "CHANGED"
                errorShort = "Site changed — response format no longer matches expected structure"
            } else if (
                raw.includes("Cannot read") ||
                raw.includes("undefined") ||
                raw.includes("null") ||
                raw.includes("is not a function")
            ) {
                errorCode = "CHANGED"
                errorShort = "Site changed — scraper needs updating for new page structure"
            }

            mirrorStatuses[index] = {
                mirror: mirror.mirrorName,
                status: "error",
                count: 0,
                error: errorShort,
                errorCode,
                errorDetail: stack ?? raw,
                durationMs: elapsed
            }
        }
    })

    await Promise.allSettled(searchPromises)

    return {
        ok: true,
        query,
        results,
        mirrorStatuses,
        durationMs: Date.now() - startTime
    }
}

// --- Release Check ---

async function loadPersistedReleaseResults(): Promise<void> {
    const stored = await readStorageKey<{ results: MangaReleaseInfo[]; checkedAt: number }>(RELEASE_CHECK_KEY, {
        results: [],
        checkedAt: 0
    })
    releaseCheckResults = stored.results ?? []
    releaseCheckLastRun = stored.checkedAt ?? 0
}

async function persistReleaseResults(): Promise<void> {
    await writeStorageKey(RELEASE_CHECK_KEY, { results: releaseCheckResults, checkedAt: releaseCheckLastRun })
}

async function handleReleaseCheck(): Promise<ReleaseCheckPayload> {
    if (releaseCheckRunning) {
        return {
            ok: true,
            results: releaseCheckResults,
            checkedAt: releaseCheckLastRun,
            durationMs: 0,
            isRunning: true
        }
    }

    releaseCheckRunning = true
    const startTime = Date.now()
    const newResults: MangaReleaseInfo[] = []

    try {
        const mangaMap = await getLegacyMangaMap()
        const mangas = Object.values(mangaMap)
        const chapterCache = await getLegacyChapterCache()

        // Check each manga for new chapters (3 concurrent at a time to avoid overloading)
        const batchSize = 3
        for (let i = 0; i < mangas.length; i += batchSize) {
            const batch = mangas.slice(i, i + batchSize)
            const batchPromises = batch.map(async manga => {
                const parsed = parseMangaKey(manga.key)
                if (!parsed) return

                const mirrorName = stringValue(manga.mirror, parsed.mirror)
                const url = normalizeUrl(manga.url ?? parsed.url)
                if (!mirrorName || !url) return

                const info: MangaReleaseInfo = {
                    key: manga.key,
                    name: manga.displayName || manga.name || parsed.url,
                    mirror: mirrorName,
                    url,
                    previousChapterUrl: manga.lastchapter || "",
                    latestChapterUrl: "",
                    latestChapterName: "",
                    hasNew: false,
                    checkedAt: Date.now()
                }

                try {
                    const impl = await legacyMirrorLoader.getImpl(mirrorName)
                    if (!impl) {
                        info.error = "Mirror not available"
                        newResults.push(info)
                        return
                    }

                    const chapters = await Promise.race([
                        impl.getListChaps(url),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000))
                    ])

                    if (Array.isArray(chapters) && chapters.length > 0) {
                        const latest = chapters[0]
                        const latestUrl = Array.isArray(latest) ? String(latest[1]) : ""
                        const latestName = Array.isArray(latest) ? String(latest[0]) : ""
                        info.latestChapterUrl = latestUrl
                        info.latestChapterName = latestName

                        // Compare: has new if latest chapter URL differs from the stored last chapter
                        const cacheKey = buildChapterListKey(url, mirrorName, manga.language ?? "en")
                        const cachedChapters = cacheKey ? chapterCache[cacheKey] : null

                        if (manga.lastchapter && latestUrl && latestUrl !== manga.lastchapter) {
                            info.hasNew = true
                        } else if (
                            Array.isArray(cachedChapters) &&
                            chapters.length > (cachedChapters as unknown[]).length
                        ) {
                            info.hasNew = true
                        }

                        // Update cache with fresh chapter list
                        if (cacheKey) {
                            chapterCache[cacheKey] = chapters
                        }
                    }
                } catch (err) {
                    info.error = err instanceof Error ? err.message : "Check failed"
                }

                newResults.push(info)
            })

            await Promise.allSettled(batchPromises)
        }

        // Persist updated chapter cache
        await writeStorageKey(LEGACY_CHAPTERS_KEY, chapterCache)

        releaseCheckResults = newResults
        releaseCheckLastRun = Date.now()
        await persistReleaseResults()

        // Fire notifications for manga with new chapters
        await fireNewChapterNotifications(newResults.filter(r => r.hasNew))
    } finally {
        releaseCheckRunning = false
    }

    return {
        ok: true,
        results: releaseCheckResults,
        checkedAt: releaseCheckLastRun,
        durationMs: Date.now() - startTime,
        isRunning: false
    }
}

function handleReleaseCheckStatus(): ReleaseCheckStatusPayload {
    return {
        ok: true,
        lastCheckAt: releaseCheckLastRun,
        isRunning: releaseCheckRunning,
        results: releaseCheckResults
    }
}

// --- Notifications ---

async function fireNewChapterNotifications(newReleases: MangaReleaseInfo[]): Promise<void> {
    if (newReleases.length === 0) return

    const prefs = await getPreferences()
    if (!prefs.showNotifications) return

    try {
        const hasPermission = await extensionApi.permissions.contains({ permissions: ["notifications"] })
        if (!hasPermission) return
    } catch {
        return
    }

    for (const release of newReleases) {
        try {
            const notifId = `amr-release-${release.key}-${release.checkedAt}`
            await extensionApi.notifications.create(notifId, {
                type: "basic",
                iconUrl: extensionApi.runtime.getURL("public/icons/icon-48.png"),
                title: `New Chapter: ${release.name}`,
                message: release.latestChapterName
                    ? `${release.latestChapterName} on ${release.mirror}`
                    : `New chapter available on ${release.mirror}`
            })
        } catch {
            // Notification creation can fail silently
        }
    }
}

// --- Sharing ---

async function handleShareExport(keys?: string[]): Promise<ShareExportPayload> {
    const mangaMap = await getLegacyMangaMap()
    const allMangas = Object.values(mangaMap)

    const selected = keys && keys.length > 0 ? allMangas.filter(m => keys.includes(m.key)) : allMangas

    const shareable: ShareableManga[] = selected
        .map(m => {
            const parsed = parseMangaKey(m.key)
            return {
                name: m.displayName || m.name || "",
                url: normalizeUrl(m.url ?? parsed?.url ?? ""),
                mirror: stringValue(m.mirror, parsed?.mirror ?? ""),
                language: languageValue(m.language ?? parsed?.language ?? "en")
            }
        })
        .filter(m => m.url && m.mirror)

    const data: ShareableList = {
        version: 1,
        name: `AMR Library Export`,
        exportedAt: new Date().toISOString(),
        manga: shareable
    }

    return { ok: true, data }
}

async function handleShareImport(data: ShareableList): Promise<ShareImportPayload> {
    let imported = 0
    let skipped = 0
    let errors = 0

    const mangaMap = await getLegacyMangaMap()

    for (const item of data.manga) {
        try {
            const key = buildMangaKey(item.url, item.mirror, item.language)
            if (!key) {
                errors++
                continue
            }

            if (key in mangaMap) {
                skipped++
                continue
            }

            mangaMap[key] = {
                key,
                read: 0,
                display: 0,
                layout: 10000,
                lastchapter: "",
                currentChapter: "",
                currentScanUrl: "",
                webtoon: false,
                displayName: item.name,
                zoom: 100,
                mirror: item.mirror,
                language: item.language,
                url: item.url,
                name: item.name,
                updatedAt: Date.now()
            }
            imported++
        } catch {
            errors++
        }
    }

    await writeStorageKey(LEGACY_MANGAS_KEY, mangaMap)
    return { ok: true, imported, skipped, errors }
}

async function handleLegacyGetChapterData(message: LegacyActionMessage): Promise<LegacyChapterDataResponse> {
    const messageUrl = stringValue(message.url)
    const mirrorName = stringValue(message.mirrorName)
    const html = stringValue(message.htmlContent)
    const htmlDocument = html || (await fetch(messageUrl).then(response => response.text()))

    const impl = await legacyMirrorLoader.getImpl(mirrorName)
    if (!impl) {
        return {
            isChapter: false,
            infos: null,
            images: [],
            title: extractTitleFromHtml(htmlDocument)
        }
    }

    let isChapter = Boolean(impl.isCurrentPageAChapterPage(htmlDocument, messageUrl))
    if (!isChapter) {
        const hasChapterMarkers =
            /var\s+chapterid\s*=/i.test(htmlDocument) && /var\s+imagecount\s*=/i.test(htmlDocument)
        if (hasChapterMarkers) {
            isChapter = true
        }
    }
    let infos: Record<string, unknown> | null = null
    let images: string[] = []

    if (isChapter) {
        try {
            infos = toRecord(await impl.getCurrentPageInfo(htmlDocument, messageUrl))
        } catch {
            infos = null
        }

        const fallbackMangaUrl = deriveSeriesUrlFromChapterUrl(messageUrl)
        const fallbackChapterUrl = deriveChapterBaseUrl(messageUrl)
        if (!infos) {
            infos = {}
        }

        const currentMangaURL =
            normalizeUrlWithBase(stringValue(infos.currentMangaURL), messageUrl) ||
            fallbackMangaUrl ||
            fallbackChapterUrl
        const currentChapterURL =
            normalizeUrlWithBase(stringValue(infos.currentChapterURL), messageUrl) ||
            fallbackChapterUrl ||
            normalizeUrlWithBase(messageUrl, messageUrl)
        const previousChapterURL = normalizeUrlWithBase(
            extractScriptStringVar(htmlDocument, "prechapterurl"),
            messageUrl
        )
        const nextChapterURL = normalizeUrlWithBase(extractScriptStringVar(htmlDocument, "nextchapterurl"), messageUrl)

        infos = {
            ...infos,
            currentMangaURL,
            currentChapterURL,
            prechapterurl: previousChapterURL,
            nextchapterurl: nextChapterURL
        }

        try {
            const rawImages = await impl.getListImages(htmlDocument, messageUrl, {} as any)
            images = Array.isArray(rawImages)
                ? rawImages.map(value => normalizeImageUrl(value)).filter((value): value is string => Boolean(value))
                : []
        } catch {
            images = []
        }
    }

    let title = extractTitleFromHtml(htmlDocument)
    if (typeof impl.getChapterTitle === "function") {
        try {
            title = await impl.getChapterTitle(htmlDocument, messageUrl)
        } catch {
            // keep default title
        }
    }

    return {
        isChapter,
        infos,
        images,
        title
    }
}

async function handleLegacyGetImageUrl(message: LegacyActionMessage): Promise<string | null> {
    const mirrorName = stringValue(message.mirror)
    const pageUrl = stringValue(message.url)
    if (!mirrorName || !pageUrl) {
        return null
    }

    const impl = await legacyMirrorLoader.getImpl(mirrorName)
    if (!impl) {
        return null
    }

    const timeoutPromise = new Promise<null>(resolve => {
        setTimeout(() => resolve(null), 25000)
    })

    const resolvePromise = impl
        .getImageUrlFromPage(pageUrl)
        .then(value => {
            if (typeof value !== "string" || !value.length || value === "error") {
                return null
            }
            const normalized = normalizeImageUrl(value)
            return normalized || null
        })
        .catch(() => null)

    return await Promise.race([resolvePromise, timeoutPromise])
}

async function handleLegacyLoadListChaps(message: LegacyActionMessage): Promise<unknown> {
    const mirrorName = stringValue(message.mirror)
    const mangaUrl = stringValue(message.url)
    if (!mirrorName || !mangaUrl) {
        return []
    }

    const impl = await legacyMirrorLoader.getImpl(mirrorName)
    if (!impl) {
        return []
    }

    const htmlContent = stringValue(message.htmlContent)

    try {
        return await impl.getListChaps(mangaUrl, htmlContent || undefined)
    } catch {
        return []
    }
}

async function handleLegacyGetListChaps(message: LegacyActionMessage): Promise<unknown> {
    const key = buildChapterListKey(message.url, message.mirror, message.language)
    if (!key) {
        return false
    }

    const cache = await getLegacyChapterCache()
    if (!(key in cache)) {
        return false
    }

    return cache[key]
}

async function handleLegacyStoreListChaps(message: LegacyActionMessage): Promise<boolean> {
    const key = buildChapterListKey(message.url, message.mirror, message.language)
    if (!key) {
        return false
    }

    const cache = await getLegacyChapterCache()
    cache[key] = message.listChaps
    await writeStorageKey(LEGACY_CHAPTERS_KEY, cache)
    return true
}

async function upsertLegacyManga(message: LegacyActionMessage): Promise<LegacyMangaInfo | null> {
    const key = buildMangaKey(message.url, message.mirror, message.language)
    if (!key) {
        return null
    }

    const parsed = parseMangaKey(key)
    const mirror = stringValue(message.mirror, parsed?.mirror ?? "")
    const language = languageValue(message.language ?? parsed?.language ?? "en")
    const url = normalizeUrl(message.url ?? parsed?.url ?? "")

    const map = await getLegacyMangaMap()
    const current = map[key] ?? {
        key,
        read: 0,
        display: 0,
        layout: 10000,
        lastchapter: "",
        currentChapter: "",
        currentScanUrl: "",
        webtoon: false,
        displayName: "",
        zoom: 100,
        mirror,
        language,
        url,
        name: "",
        updatedAt: 0
    }

    const next: LegacyMangaInfo = {
        key,
        read: coerceNumber(message.read, current.read),
        display: coerceNumber(message.display, current.display),
        layout: coerceNumber(message.layout, current.layout),
        lastchapter: stringValue(message.lastChapterReadURL, current.lastchapter),
        currentChapter: stringValue(message.lastChapterReadName, current.currentChapter),
        currentScanUrl: stringValue(message.currentScanUrl, current.currentScanUrl),
        webtoon: boolValue(message.webtoon, current.webtoon),
        displayName: stringValue(message.displayName, current.displayName || stringValue(message.name)),
        zoom: coerceNumber(message.zoom, current.zoom),
        mirror: mirror || current.mirror,
        language,
        url: url || current.url,
        name: stringValue(message.name, current.name || current.displayName),
        updatedAt: Date.now()
    }

    map[key] = next
    await writeStorageKey(LEGACY_MANGAS_KEY, map)
    return next
}

async function handleLegacyMangaInfos(message: LegacyActionMessage): Promise<LegacyMangaInfo | null> {
    const key = buildMangaKey(message.url, message.mirror, message.language)
    if (!key) {
        return null
    }

    const map = await getLegacyMangaMap()
    return map[key] ?? null
}

async function handleLegacyMarkMangaReadTop(message: LegacyActionMessage): Promise<LegacyMangaInfo | null> {
    const updated = await upsertLegacyManga(message)
    if (!updated) {
        return null
    }

    const map = await getLegacyMangaMap()
    map[updated.key] = {
        ...updated,
        read: coerceNumber(message.read, updated.read)
    }
    await writeStorageKey(LEGACY_MANGAS_KEY, map)
    return map[updated.key]
}

async function handleLegacyMangaExists(message: LegacyActionMessage): Promise<boolean> {
    const key = buildMangaKey(message.url, message.mirror, message.language)
    if (!key) {
        return false
    }

    const map = await getLegacyMangaMap()
    return key in map
}

async function handleLegacyDeleteManga(message: LegacyActionMessage): Promise<boolean> {
    const key = stringValue(message.key) || buildMangaKey(message.url, message.mirror, message.language)
    if (!key) {
        return false
    }

    const map = await getLegacyMangaMap()
    if (!(key in map)) {
        return false
    }

    delete map[key]
    await writeStorageKey(LEGACY_MANGAS_KEY, map)
    return true
}

async function handleLegacyMirrorInfos(message: LegacyActionMessage): Promise<unknown> {
    const mirrorName = stringValue(message.name)
    const mirror = (legacyMirrorLoader.getAll() as RuntimeMirror[]).find(item => item.mirrorName === mirrorName)
    if (!mirror) {
        return null
    }

    return {
        activated: mirror.activated ?? true,
        domains: mirror.domains,
        home: mirror.home,
        mirrorIcon: mirror.mirrorIcon,
        mirrorName: mirror.mirrorName
    }
}

async function handleLegacyMatchMirrorForUrl(message: LegacyActionMessage): Promise<RuntimeMirror | null> {
    const url = stringValue(message.url)
    if (!url) {
        return null
    }

    return await findMirrorForUrl(url)
}

async function handleLegacyGetStorage(message: LegacyActionMessage): Promise<unknown> {
    const key = stringValue(message.key)
    if (!key) {
        return null
    }

    const kv = await getLegacyKv()
    return key in kv ? kv[key] : null
}

async function handleLegacySetStorage(message: LegacyActionMessage): Promise<boolean> {
    const key = stringValue(message.key)
    if (!key) {
        return false
    }

    const kv = await getLegacyKv()
    kv[key] = message.value
    await writeStorageKey(LEGACY_KV_KEY, kv)
    return true
}

async function handleLegacyBarAction(message: LegacyActionMessage): Promise<unknown> {
    const kv = await getLegacyKv()
    const current = coerceNumber(kv.isBarVisible, 1)

    switch (message.action) {
        case "barState":
            return { barVis: current }
        case "setBarState":
            kv.isBarVisible = coerceNumber(message.barstate, current)
            await writeStorageKey(LEGACY_KV_KEY, kv)
            return {}
        case "hideBar":
            kv.isBarVisible = (current + 1) % 2
            await writeStorageKey(LEGACY_KV_KEY, kv)
            return { res: kv.isBarVisible }
        case "showBar":
            kv.isBarVisible = 1
            await writeStorageKey(LEGACY_KV_KEY, kv)
            return {}
        default:
            return null
    }
}

async function handleLegacyAddOrUpdateBookmark(message: LegacyActionMessage): Promise<boolean> {
    const isChapter = stringValue(message.type) !== "scan"
    const bookmarkKey = isChapter
        ? buildChapterBookmarkKey(message.mirror, message.chapUrl)
        : buildScanBookmarkKey(message.mirror, message.chapUrl, message.scanUrl)

    if (!bookmarkKey) {
        return false
    }

    const map = await getLegacyBookmarkMap()
    map[bookmarkKey] = {
        key: bookmarkKey,
        mirror: stringValue(message.mirror),
        url: normalizeUrl(message.url),
        chapUrl: normalizeUrl(message.chapUrl),
        type: isChapter ? "chapter" : "scan",
        name: stringValue(message.name),
        chapName: stringValue(message.chapName),
        scanUrl: normalizeUrl(message.scanUrl),
        scanName: stringValue(message.scanName),
        note: stringValue(message.note),
        updatedAt: Date.now()
    }

    await writeStorageKey(LEGACY_BOOKMARKS_KEY, map)
    return true
}

async function handleLegacyDeleteBookmark(message: LegacyActionMessage): Promise<boolean> {
    const isChapter = stringValue(message.type) !== "scan"
    const bookmarkKey = isChapter
        ? buildChapterBookmarkKey(message.mirror, message.chapUrl)
        : buildScanBookmarkKey(message.mirror, message.chapUrl, message.scanUrl)

    if (!bookmarkKey) {
        return false
    }

    const map = await getLegacyBookmarkMap()
    if (!(bookmarkKey in map)) {
        return false
    }

    delete map[bookmarkKey]
    await writeStorageKey(LEGACY_BOOKMARKS_KEY, map)
    return true
}

async function handleLegacyGetBookmarkNote(message: LegacyActionMessage): Promise<unknown> {
    const isChapter = stringValue(message.type) !== "scan"
    const bookmarkKey = isChapter
        ? buildChapterBookmarkKey(message.mirror, message.chapUrl)
        : buildScanBookmarkKey(message.mirror, message.chapUrl, message.scanUrl)

    if (!bookmarkKey) {
        return {
            isBooked: false,
            note: "",
            scanSrc: ""
        }
    }

    const map = await getLegacyBookmarkMap()
    const bookmark = map[bookmarkKey]

    if (!bookmark) {
        return {
            isBooked: false,
            note: "",
            scanSrc: stringValue(message.scanUrl)
        }
    }

    return {
        isBooked: true,
        note: bookmark.note,
        scanSrc: bookmark.scanUrl ?? stringValue(message.scanUrl)
    }
}

async function handleLegacyGetBookmarksForChapter(message: LegacyActionMessage): Promise<unknown> {
    const map = await getLegacyBookmarkMap()
    const chapterKey = buildChapterBookmarkKey(message.mirror, message.chapUrl)

    const chapterBookmark = chapterKey ? map[chapterKey] : undefined
    const response: {
        chapter: { isBooked: boolean; note: string }
        scans: Record<string, { isBooked: boolean; note: string }>
    } = {
        chapter: {
            isBooked: Boolean(chapterBookmark),
            note: chapterBookmark?.note ?? ""
        },
        scans: {}
    }

    const scanUrls = Array.isArray(message.scanUrls)
        ? message.scanUrls.filter((scan): scan is string => typeof scan === "string")
        : []

    for (const scanUrl of scanUrls) {
        const scanKey = buildScanBookmarkKey(message.mirror, message.chapUrl, scanUrl)
        const bookmark = scanKey ? map[scanKey] : undefined
        response.scans[scanUrl] = {
            isBooked: Boolean(bookmark),
            note: bookmark?.note ?? ""
        }
    }

    return response
}

async function handleLegacyListMangas(): Promise<LegacyMangaInfo[]> {
    const map = await getLegacyMangaMap()
    const list: LegacyMangaInfo[] = []
    for (const entry of Object.values(map)) {
        const parsed = parseMangaKey(entry.key)
        const mirror = stringValue(entry.mirror, parsed?.mirror ?? "")
        const language = languageValue(entry.language ?? parsed?.language ?? "en")
        const url = normalizeUrl(entry.url ?? parsed?.url ?? "")
        if (!mirror || !url) {
            continue
        }

        list.push({
            ...entry,
            mirror,
            language,
            url,
            name: stringValue(entry.name, entry.displayName),
            updatedAt: coerceNumber(entry.updatedAt, 0)
        })
    }

    list.sort((left, right) => coerceNumber(right.updatedAt, 0) - coerceNumber(left.updatedAt, 0))
    return list
}

async function handleLegacyListBookmarks(): Promise<LegacyBookmarkRecord[]> {
    const map = await getLegacyBookmarkMap()
    return Object.values(map).sort((left, right) => right.updatedAt - left.updatedAt)
}

async function handleLegacyGetSnapshot(): Promise<LegacySnapshotPayload> {
    const [options, kv, chapterCache, mangas, bookmarks] = await Promise.all([
        getLegacyOptions(),
        getLegacyKv(),
        getLegacyChapterCache(),
        handleLegacyListMangas(),
        handleLegacyListBookmarks()
    ])

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        options,
        kv,
        chapterCache,
        mangas,
        bookmarks
    }
}

async function handleLegacyImportSnapshot(message: LegacyActionMessage): Promise<{
    ok: boolean
    importedMangas: number
    rejectedMangas: number
    importedBookmarks: number
    rejectedBookmarks: number
}> {
    const payload =
        message.snapshot && typeof message.snapshot === "object"
            ? (message.snapshot as Record<string, unknown>)
            : message.payload && typeof message.payload === "object"
            ? (message.payload as Record<string, unknown>)
            : null

    if (!payload) {
        return {
            ok: false,
            importedMangas: 0,
            rejectedMangas: 0,
            importedBookmarks: 0,
            rejectedBookmarks: 0
        }
    }

    const mangasInput = Array.isArray(payload.mangas) ? payload.mangas : []
    const bookmarksInput = Array.isArray(payload.bookmarks) ? payload.bookmarks : []

    const mangaMap: Record<string, LegacyMangaInfo> = {}
    let rejectedMangas = 0
    for (const item of mangasInput) {
        const normalized = normalizeImportedMangaRecord(item)
        if (!normalized) {
            rejectedMangas += 1
            continue
        }
        mangaMap[normalized.key] = normalized
    }

    const bookmarkMap: Record<string, LegacyBookmarkRecord> = {}
    let rejectedBookmarks = 0
    for (const item of bookmarksInput) {
        const normalized = normalizeImportedBookmarkRecord(item)
        if (!normalized) {
            rejectedBookmarks += 1
            continue
        }
        bookmarkMap[normalized.key] = normalized
    }

    const optionsSource = payload.options && typeof payload.options === "object" ? payload.options : {}
    const options = {
        darkreader: coerceNumber(
            (optionsSource as Record<string, unknown>).darkreader,
            defaultLegacyOptions.darkreader
        ),
        prefetch: coerceNumber((optionsSource as Record<string, unknown>).prefetch, defaultLegacyOptions.prefetch),
        imgorder: coerceNumber((optionsSource as Record<string, unknown>).imgorder, defaultLegacyOptions.imgorder),
        displayFullChapter: coerceNumber(
            (optionsSource as Record<string, unknown>).displayFullChapter,
            defaultLegacyOptions.displayFullChapter
        ),
        readingDirection: coerceNumber(
            (optionsSource as Record<string, unknown>).readingDirection,
            defaultLegacyOptions.readingDirection
        ),
        displayBook: coerceNumber(
            (optionsSource as Record<string, unknown>).displayBook,
            defaultLegacyOptions.displayBook
        ),
        resizeMode: coerceNumber(
            (optionsSource as Record<string, unknown>).resizeMode,
            defaultLegacyOptions.resizeMode
        ),
        maxwidth: coerceNumber((optionsSource as Record<string, unknown>).maxwidth, defaultLegacyOptions.maxwidth),
        addauto: coerceNumber((optionsSource as Record<string, unknown>).addauto, defaultLegacyOptions.addauto)
    }

    const kv = payload.kv && typeof payload.kv === "object" ? (payload.kv as Record<string, unknown>) : {}
    const chapterCache =
        payload.chapterCache && typeof payload.chapterCache === "object"
            ? (payload.chapterCache as Record<string, unknown>)
            : {}

    await Promise.all([
        writeStorageKey(LEGACY_OPTIONS_KEY, options),
        writeStorageKey(LEGACY_KV_KEY, kv),
        writeStorageKey(LEGACY_CHAPTERS_KEY, chapterCache),
        writeStorageKey(LEGACY_MANGAS_KEY, mangaMap),
        writeStorageKey(LEGACY_BOOKMARKS_KEY, bookmarkMap)
    ])

    return {
        ok: true,
        importedMangas: Object.keys(mangaMap).length,
        rejectedMangas,
        importedBookmarks: Object.keys(bookmarkMap).length,
        rejectedBookmarks
    }
}

async function handleLegacyResetData(): Promise<boolean> {
    await extensionApi.storage.local.remove([
        LEGACY_OPTIONS_KEY,
        LEGACY_CHAPTERS_KEY,
        LEGACY_MANGAS_KEY,
        LEGACY_BOOKMARKS_KEY,
        LEGACY_KV_KEY
    ])
    await getLegacyOptions()
    return true
}

async function handleLegacyOpenDashboard(message: LegacyActionMessage): Promise<boolean> {
    const dashboardUrl = extensionApi.runtime.getURL("pages/dashboard.html")
    const readerUrl = stringValue(message.reader)
    const mirrorName = stringValue(message.mirror)

    let targetUrl = dashboardUrl
    if (readerUrl && mirrorName) {
        const params = new URLSearchParams({
            reader: readerUrl,
            mirror: mirrorName
        })
        targetUrl = `${dashboardUrl}?${params.toString()}`
    }

    await extensionApi.tabs.create({ url: targetUrl })
    return true
}

function isExtensionMessage(message: unknown): message is ExtensionMessage {
    if (!message || typeof message !== "object") {
        return false
    }

    const type = (message as { type?: unknown }).type
    return typeof type === "string" && MESSAGE_TYPES.has(type as ExtensionMessage["type"])
}

function isLegacyActionMessage(message: unknown): message is LegacyActionMessage {
    if (!message || typeof message !== "object") {
        return false
    }

    return typeof (message as { action?: unknown }).action === "string"
}

async function handleLegacyAction(message: LegacyActionMessage): Promise<unknown> {
    switch (message.action) {
        case "getChapterData":
            return await handleLegacyGetChapterData(message)

        case "getImageUrlFromPageUrl":
            return await handleLegacyGetImageUrl(message)

        case "loadListChaps":
            return await handleLegacyLoadListChaps(message)

        case "getListChaps":
            return await handleLegacyGetListChaps(message)

        case "storeListChaps":
            return await handleLegacyStoreListChaps(message)

        case "readManga":
        case "setMangaChapter":
            return await upsertLegacyManga(message)

        case "mangaInfos":
            return await handleLegacyMangaInfos(message)

        case "markMangaReadTop":
            return await handleLegacyMarkMangaReadTop(message)

        case "mangaExists":
            return await handleLegacyMangaExists(message)

        case "deleteManga":
            return await handleLegacyDeleteManga(message)

        case "addUpdateBookmark":
            return await handleLegacyAddOrUpdateBookmark(message)

        case "deleteBookmark":
            return await handleLegacyDeleteBookmark(message)

        case "getBookmarkNote":
            return await handleLegacyGetBookmarkNote(message)

        case "getBookmarksForChapter":
            return await handleLegacyGetBookmarksForChapter(message)

        case "mirrorInfos":
            return await handleLegacyMirrorInfos(message)

        case "matchMirrorForUrl":
            return await handleLegacyMatchMirrorForUrl(message)

        case "get_storage":
            return await handleLegacyGetStorage(message)

        case "set_storage":
            return await handleLegacySetStorage(message)

        case "setBarState":
        case "hideBar":
        case "showBar":
        case "barState":
            return await handleLegacyBarAction(message)

        case "getoptions":
            return await getLegacyOptions()

        case "save_option":
            return await saveLegacyOption(stringValue(message.key), message.value)

        case "listMangas":
            return await handleLegacyListMangas()

        case "listBookmarks":
            return await handleLegacyListBookmarks()

        case "getLegacySnapshot":
            return await handleLegacyGetSnapshot()

        case "importLegacySnapshot":
            return await handleLegacyImportSnapshot(message)

        case "resetLegacyData":
            return await handleLegacyResetData()

        case "openDashboard":
            return await handleLegacyOpenDashboard(message)

        case "exportReadStatus":
            return true

        default:
            return null
    }
}

async function handleMessage(
    message: ExtensionMessage
): Promise<
    | HealthPong
    | PreferencesPayload
    | MirrorsPayload
    | MirrorsDiagnosticsPayload
    | ReleaseReadinessPayload
    | SyncStatusPayload
    | SyncRecordsPayload
    | SyncRecordsImportPayload
    | undefined
> {
    switch (message.type) {
        case "health:ping": {
            return {
                ok: true,
                source: "background",
                timestamp: Date.now(),
                version: extensionVersion
            }
        }

        case "preferences:get": {
            return {
                ok: true,
                preferences: await getPreferences()
            }
        }

        case "preferences:set": {
            return {
                ok: true,
                preferences: await savePreferences(message.payload)
            }
        }

        case "mirrors:list": {
            return {
                ok: true,
                mirrors: await getMirrorCatalog()
            }
        }

        case "mirrors:diagnostics": {
            const result = await getMirrorCatalogWithDiagnostics()
            return {
                ok: true,
                mirrors: result.mirrors,
                diagnostics: result.diagnostics
            }
        }

        case "release:readiness:get": {
            const [mirrorResult, syncStatus] = await Promise.all([getMirrorCatalogWithDiagnostics(), getSyncStatus()])

            return {
                ok: true,
                readiness: evaluateReleaseReadiness({
                    mirrorDiagnostics: mirrorResult.diagnostics,
                    syncStatus
                })
            }
        }

        case "sync:status:get": {
            return {
                ok: true,
                syncStatus: await getSyncStatus()
            }
        }

        case "sync:status:set": {
            return {
                ok: true,
                syncStatus: await saveSyncStatus({
                    ...message.payload,
                    lastError: null
                })
            }
        }

        case "sync:run-now": {
            return {
                ok: true,
                syncStatus: await runSyncNow()
            }
        }

        case "sync:records:get": {
            return {
                ok: true,
                records: await getLocalSyncRecordsSnapshot()
            }
        }

        case "sync:records:import": {
            const result = await replaceLocalSyncRecords(message.payload.records)
            return {
                ok: true,
                result,
                records: await getLocalSyncRecordsSnapshot()
            }
        }

        case "search:mirrors": {
            return handleSearchMirrors(message.payload.query, message.payload.mirrors)
        }

        case "release:check": {
            return handleReleaseCheck()
        }

        case "release:check:status": {
            return handleReleaseCheckStatus()
        }

        case "share:export": {
            return handleShareExport(message.payload.keys)
        }

        case "share:import": {
            return handleShareImport(message.payload.data)
        }

        default:
            return undefined
    }
}

extensionApi.runtime.onInstalled.addListener(async () => {
    await savePreferences(defaultPreferences)
    await saveSyncStatus(defaultSyncStatus)
    await getLegacyOptions()
    await loadPersistedReleaseResults()

    // Set up periodic release check alarm
    const prefs = await getPreferences()
    await extensionApi.alarms.create(RELEASE_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: prefs.releaseCheckIntervalMinutes
    })
})

// Handle periodic alarm for release checking
extensionApi.alarms.onAlarm.addListener((alarm: { name: string }) => {
    if (alarm.name === RELEASE_ALARM_NAME) {
        void handleReleaseCheck()
    }
})

// Handle notification clicks — open the chapter URL in a new tab
try {
    extensionApi.notifications.onClicked.addListener(async (notifId: string) => {
        if (!notifId.startsWith("amr-release-")) return

        // Extract the manga key from the notification ID: amr-release-{key}-{timestamp}
        const parts = notifId.replace("amr-release-", "")
        const lastDash = parts.lastIndexOf("-")
        const mangaKey = lastDash > 0 ? parts.substring(0, lastDash) : parts

        // Find the release info for this manga
        const releaseInfo = releaseCheckResults.find(r => r.key === mangaKey)
        if (releaseInfo?.latestChapterUrl) {
            await extensionApi.tabs.create({ url: releaseInfo.latestChapterUrl })
        } else if (releaseInfo?.url) {
            await extensionApi.tabs.create({ url: releaseInfo.url })
        }

        // Dismiss the notification
        try {
            await extensionApi.notifications.clear(notifId)
        } catch {
            // no-op
        }
    })
} catch {
    // notifications API may not be available
}

extensionApi.action.onClicked.addListener(async () => {
    const dashboardUrl = extensionApi.runtime.getURL("pages/dashboard.html")
    const tabs = await extensionApi.tabs.query({ url: dashboardUrl })

    if (tabs.length > 0) {
        await extensionApi.tabs.update(tabs[0].id, { active: true })
        await extensionApi.windows.update(tabs[0].windowId, { focused: true })
        return
    }

    await extensionApi.tabs.create({ url: dashboardUrl })
})

extensionApi.webNavigation.onCommitted.addListener(
    (details: { tabId: number; url: string; transitionType?: string }) => {
        if (details.transitionType === "auto_subframe") {
            return
        }

        void maybeTriggerReaderForUrl(details.tabId, details.url)
    }
)

extensionApi.webNavigation.onHistoryStateUpdated.addListener(
    (details: { tabId: number; url: string; transitionType?: string }) => {
        if (details.transitionType === "auto_subframe") {
            return
        }

        void maybeTriggerReaderForUrl(details.tabId, details.url)
    }
)

if (extensionApi.runtime?.onInstalled?.addListener) {
    extensionApi.runtime.onInstalled.addListener(() => {
        void syncNetRequestRules()
    })
}

extensionApi.runtime.onConnect.addListener((port: any) => {
    if (!port?.name?.startsWith("imageRequest_")) {
        return
    }

    const onMessage = async (message: any) => {
        if (!message || message.type !== "getImageUrlFromPageUrl" || !message.requestId) {
            return
        }

        const result = await handleLegacyGetImageUrl({
            action: "getImageUrlFromPageUrl",
            url: message.url,
            mirror: message.mirror
        })

        try {
            port.postMessage({
                type: "imageResponse",
                requestId: message.requestId,
                result
            })
        } catch {
            // ignore port delivery failures
        }
    }

    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(() => {
        try {
            port.onMessage.removeListener(onMessage)
        } catch {
            // no-op
        }
    })
})

extensionApi.runtime.onMessage.addListener((message: unknown) => {
    if (isExtensionMessage(message)) {
        return handleMessage(message)
    }

    if (isLegacyActionMessage(message)) {
        return handleLegacyAction(message)
    }

    return undefined
})

// Load persisted release results on service worker startup
void loadPersistedReleaseResults()
void syncNetRequestRules()
