import App from "./App.svelte"

type MirrorPayload = {
    mirrorName: string
    domains?: string[]
}

type ChapterDataPayload = {
    isChapter?: boolean
    infos?: Record<string, unknown>
    images?: string[] | null
    title?: string
}

type ReaderImageState = {
    pageUrl: string
    imageUrl: string | null
    status: "pending" | "loaded" | "error"
    error?: string
}

type ReaderChapter = {
    title: string
    url: string
}

type ReaderTheme = "dark" | "light"

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
}

type ReaderWindow = Window &
    typeof globalThis & {
        __amrRewriteReader?: boolean
        __AMR_IS_LOADING_CHAPTER__?: boolean
        __amrReaderPendingMirrors?: MirrorPayload[]
        amrLoadMirror?: (mirror: MirrorPayload) => Promise<void>
        onPushState?: () => void
    }

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

const readerWindow = globalThis as ReaderWindow

let app: any = null
let currentMirror: MirrorPayload | null = null
let bootToken = 0
let isNavigatingChapter = false

let chapterTitle = "Loading chapter..."
let readerStatus = "Initializing reader runtime..."
let loading = true
let progress = 0
let loadedPages = 0
let totalPages = 0
let images: ReaderImageState[] = []

let chapters: ReaderChapter[] = []
let selectedChapterUrl: string | null = null
let currentChapterUrl = ""
let currentMangaUrl = ""
let currentMangaName = ""
let currentLanguage = "en"
let fallbackPreviousChapterUrl = ""
let fallbackNextChapterUrl = ""

let fullChapter = true
let currentPageIndex = 0
let imageWidth = 100
let theme: ReaderTheme = "dark"
let chapterBookmarked = false

async function sendLegacyMessage<T>(payload: Record<string, unknown>): Promise<T> {
    return (await chrome.runtime.sendMessage(payload)) as T
}

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

function normalizeUrlWithBase(value: unknown, baseUrl: string): string {
    if (typeof value !== "string" || !value.trim()) {
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

function chapterPath(value: string): string {
    try {
        const parsed = new URL(value, location.href)
        let path = parsed.pathname.replace(/\/+$/, "")
        // Normalize common "page 1" suffix so chapter list URLs and page URLs match.
        path = path.replace(/\/1(?:\.html?)?$/i, "")
        if (!path) {
            path = "/"
        }
        return `${parsed.origin}${path}`.toLowerCase()
    } catch {
        return value
            .split(/[?#]/, 1)[0]
            .replace(/\/+$/, "")
            .replace(/\/1(?:\.html?)?$/i, "")
            .toLowerCase()
    }
}

function chapterUrlsMatch(left: string, right: string): boolean {
    return chapterPath(left) === chapterPath(right)
}

function isProbablyImageUrl(url: string): boolean {
    return (
        /\.(png|jpg|jpeg|webp|gif|avif)(\?|#|$)/i.test(url) || url.startsWith("data:image/") || url.startsWith("blob:")
    )
}

function normalizeResolvedImageUrl(url: string): string {
    return url.startsWith("//") ? `https:${url}` : url
}

function getSanitizedCurrentHtml(): string | null {
    if (!document.documentElement) {
        return null
    }

    const raw = document.documentElement.outerHTML
    return raw
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "")
}

function getStringValue(obj: Record<string, unknown> | undefined, key: string): string {
    if (!obj) {
        return ""
    }
    const value = obj[key]
    return typeof value === "string" ? value : ""
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min
    }
    return Math.max(min, Math.min(max, value))
}

function normalizeChapterList(raw: unknown, preferredLanguage = "en"): ReaderChapter[] {
    const toChapter = (entry: unknown): ReaderChapter | null => {
        if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string" && typeof entry[1] === "string") {
            return {
                title: entry[0],
                url: entry[1]
            }
        }

        if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>
            if (typeof record.url === "string") {
                return {
                    title: typeof record.title === "string" ? record.title : record.url,
                    url: record.url
                }
            }
        }

        return null
    }

    if (Array.isArray(raw)) {
        return raw.map(toChapter).filter((item): item is ReaderChapter => item !== null)
    }

    if (raw && typeof raw === "object") {
        const byLang = raw as Record<string, unknown>
        const preferred = byLang[preferredLanguage]
        if (Array.isArray(preferred) && preferred.length > 0) {
            return preferred.map(toChapter).filter((item): item is ReaderChapter => item !== null)
        }

        for (const key of Object.keys(byLang)) {
            const candidate = byLang[key]
            if (Array.isArray(candidate) && candidate.length > 0) {
                return candidate.map(toChapter).filter((item): item is ReaderChapter => item !== null)
            }
        }
    }

    return []
}

function getSelectedChapterIndex(): number {
    if (chapters.length === 0) {
        return -1
    }

    const candidates = [selectedChapterUrl, currentChapterUrl, location.href].filter(
        (value): value is string => typeof value === "string" && value.length > 0
    )

    for (const candidate of candidates) {
        const index = chapters.findIndex(chapter => chapterUrlsMatch(chapter.url, candidate))
        if (index !== -1) {
            return index
        }
    }

    return -1
}

function canGoPreviousChapter(): boolean {
    const index = getSelectedChapterIndex()
    return index >= 0 && index < chapters.length - 1
}

function canGoNextChapter(): boolean {
    const index = getSelectedChapterIndex()
    return index > 0
}

function renderState(): void {
    if (!app) {
        return
    }

    app.$set({
        mirrorName: currentMirror?.mirrorName ?? "",
        chapterTitle,
        status: readerStatus,
        loading,
        progress,
        loadedPages,
        totalPages,
        images,
        chapters,
        selectedChapterUrl,
        canGoPreviousChapter: canGoPreviousChapter(),
        canGoNextChapter: canGoNextChapter(),
        fullChapter,
        currentPageIndex,
        imageWidth,
        theme,
        chapterBookmarked
    })
}

function ensureMountContainer(): HTMLElement {
    if (!document.body) {
        const body = document.createElement("body")
        document.documentElement.appendChild(body)
    }

    document.body.innerHTML = ""
    document.body.style.margin = "0"
    document.body.style.padding = "0"
    document.body.style.maxWidth = "none"
    document.body.style.minWidth = "auto"

    const root = document.createElement("div")
    root.id = "amr-rewrite-reader"
    document.body.appendChild(root)
    return root
}

function ensureAppMounted(): void {
    if (app) {
        return
    }

    const target = ensureMountContainer()
    app = new App({
        target,
        props: {
            mirrorName: "",
            chapterTitle,
            status: readerStatus,
            loading,
            progress,
            loadedPages,
            totalPages,
            images,
            chapters,
            selectedChapterUrl,
            canGoPreviousChapter: false,
            canGoNextChapter: false,
            fullChapter,
            currentPageIndex,
            imageWidth,
            theme,
            chapterBookmarked
        }
    })

    app.$on("reload", () => {
        if (currentMirror) {
            void bootReader(currentMirror, location.href, { useCurrentHtml: true })
        }
    })

    app.$on("restore", () => {
        location.reload()
    })

    app.$on("goPreviousChapter", () => {
        void navigateRelativeChapter(1)
    })

    app.$on("goNextChapter", () => {
        void navigateRelativeChapter(-1)
    })

    app.$on("selectChapter", (event: CustomEvent<string>) => {
        void navigateToChapter(event.detail)
    })

    app.$on("toggleFullChapter", () => {
        fullChapter = !fullChapter
        void persistReaderOption("displayFullChapter", fullChapter ? 1 : 0)
        renderState()
    })

    app.$on("goPreviousPage", () => {
        if (currentPageIndex > 0) {
            currentPageIndex -= 1
            renderState()
        }
    })

    app.$on("goNextPage", () => {
        if (currentPageIndex < totalPages - 1) {
            currentPageIndex += 1
            renderState()
            return
        }

        void navigateRelativeChapter(-1)
    })

    app.$on("setImageWidth", (event: CustomEvent<number>) => {
        imageWidth = clamp(event.detail, 35, 100)
        void persistReaderOption("maxwidth", imageWidth)
        renderState()
    })

    app.$on("toggleTheme", () => {
        theme = theme === "dark" ? "light" : "dark"
        void persistReaderOption("darkreader", theme === "dark" ? 1 : 0)
        renderState()
    })

    app.$on("toggleChapterBookmark", () => {
        void toggleBookmark()
    })

    app.$on("openDashboard", () => {
        const target = currentChapterUrl || location.href
        void openDashboardTab(target)
    })
}

async function persistReaderOption(key: string, value: unknown): Promise<void> {
    try {
        await sendLegacyMessage<Record<string, unknown>>({
            action: "save_option",
            key,
            value
        })
    } catch {
        // ignore preference persistence failures
    }
}

async function loadReaderOptions(): Promise<void> {
    try {
        const options = await sendLegacyMessage<Partial<LegacyOptions>>({ action: "getoptions" })
        const merged = { ...defaultLegacyOptions, ...options }
        fullChapter = merged.displayFullChapter === 1
        imageWidth = clamp(Number(merged.maxwidth), 35, 100)
        theme = merged.darkreader === 1 ? "dark" : "light"
    } catch {
        fullChapter = true
        imageWidth = 100
        theme = "dark"
    }
}

async function refreshBookmarkState(): Promise<void> {
    if (!currentMirror || !currentMangaUrl || !currentChapterUrl) {
        chapterBookmarked = false
        renderState()
        return
    }

    try {
        const response = await sendLegacyMessage<{
            chapter?: { isBooked?: boolean; note?: string }
        }>({
            action: "getBookmarksForChapter",
            mirror: currentMirror.mirrorName,
            url: currentMangaUrl,
            chapUrl: currentChapterUrl,
            scanUrls: []
        })

        chapterBookmarked = Boolean(response?.chapter?.isBooked)
    } catch {
        chapterBookmarked = false
    }

    renderState()
}

async function toggleBookmark(): Promise<void> {
    if (!currentMirror || !currentMangaUrl || !currentChapterUrl) {
        return
    }

    if (chapterBookmarked) {
        await sendLegacyMessage({
            action: "deleteBookmark",
            mirror: currentMirror.mirrorName,
            url: currentMangaUrl,
            chapUrl: currentChapterUrl,
            type: "chapter"
        })
    } else {
        await sendLegacyMessage({
            action: "addUpdateBookmark",
            mirror: currentMirror.mirrorName,
            url: currentMangaUrl,
            chapUrl: currentChapterUrl,
            type: "chapter",
            name: currentMangaName,
            chapName: chapterTitle,
            note: ""
        })
    }

    await refreshBookmarkState()
}

async function ensureMangaTracked(): Promise<void> {
    if (!currentMirror || !currentMangaUrl) {
        return
    }

    try {
        const exists = await sendLegacyMessage<boolean>({
            action: "mangaExists",
            url: currentMangaUrl,
            mirror: currentMirror.mirrorName,
            language: currentLanguage
        })

        if (!exists) {
            await sendLegacyMessage({
                action: "readManga",
                url: currentMangaUrl,
                mirror: currentMirror.mirrorName,
                language: currentLanguage,
                name: currentMangaName || currentMangaUrl
            })
        }
    } catch {
        // ignore tracking failures
    }
}

async function getChapterData(url: string, mirrorName: string, useCurrentHtml: boolean): Promise<ChapterDataPayload> {
    const payload: Record<string, unknown> = {
        action: "getChapterData",
        url,
        mirrorName
    }

    if (useCurrentHtml) {
        payload.htmlContent = getSanitizedCurrentHtml()
    }

    const result = await sendLegacyMessage<ChapterDataPayload | null>(payload)
    return result ?? {}
}

async function getImageUrlFromPort(pageUrl: string, mirrorName: string): Promise<string | null> {
    return await new Promise<string | null>(resolve => {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const port = chrome.runtime.connect({ name: `imageRequest_${requestId}` })
        let settled = false

        const finish = (value: string | null): void => {
            if (settled) {
                return
            }

            settled = true
            clearTimeout(timeoutId)
            try {
                port.disconnect()
            } catch {
                // noop
            }
            resolve(value)
        }

        const timeoutId = setTimeout(() => {
            finish(null)
        }, 30000)

        port.onMessage.addListener((msg: any) => {
            if (!msg || msg.type !== "imageResponse" || msg.requestId !== requestId) {
                return
            }

            if (typeof msg.result === "string" && msg.result.length > 0 && msg.result !== "error") {
                finish(msg.result)
            } else {
                finish(null)
            }
        })

        port.onDisconnect.addListener(() => {
            if (chrome.runtime?.lastError) {
                finish(null)
            }
        })

        try {
            port.postMessage({
                type: "getImageUrlFromPageUrl",
                requestId,
                url: pageUrl,
                mirror: mirrorName,
                language: currentLanguage
            })
        } catch {
            finish(null)
        }
    })
}

async function getImageUrlFromMessage(pageUrl: string, mirrorName: string): Promise<string | null> {
    try {
        const value = await sendLegacyMessage<string | null>({
            action: "getImageUrlFromPageUrl",
            url: pageUrl,
            mirror: mirrorName,
            language: currentLanguage
        })

        if (typeof value !== "string" || !value || value === "error") {
            return null
        }

        return value
    } catch {
        return null
    }
}

async function resolveImageUrl(pageUrl: string, mirrorName: string): Promise<string | null> {
    const viaPort = await getImageUrlFromPort(pageUrl, mirrorName)
    if (viaPort) {
        return normalizeResolvedImageUrl(viaPort)
    }

    const viaMessage = await getImageUrlFromMessage(pageUrl, mirrorName)
    if (viaMessage) {
        return normalizeResolvedImageUrl(viaMessage)
    }

    if (isProbablyImageUrl(pageUrl)) {
        return normalizeResolvedImageUrl(pageUrl)
    }

    return null
}

async function runWithConcurrency(
    total: number,
    limit: number,
    worker: (index: number) => Promise<void>
): Promise<void> {
    let next = 0

    const run = async (): Promise<void> => {
        while (true) {
            const index = next++
            if (index >= total) {
                return
            }
            await worker(index)
        }
    }

    const threads = Math.max(1, Math.min(limit, total))
    await Promise.all(Array.from({ length: threads }, async () => run()))
}

async function loadChapterList(useCurrentHtml: boolean): Promise<void> {
    if (!currentMirror || !currentMangaUrl) {
        chapters = []
        selectedChapterUrl = null
        return
    }

    let raw = await sendLegacyMessage<unknown>({
        action: "getListChaps",
        url: currentMangaUrl,
        mirror: currentMirror.mirrorName,
        language: currentLanguage
    })

    let normalized = normalizeChapterList(raw, currentLanguage)
    if (normalized.length === 0) {
        const payload: Record<string, unknown> = {
            action: "loadListChaps",
            mirror: currentMirror.mirrorName,
            url: currentMangaUrl,
            language: currentLanguage
        }

        if (useCurrentHtml) {
            payload.htmlContent = getSanitizedCurrentHtml()
        }

        raw = await sendLegacyMessage<unknown>(payload)
        normalized = normalizeChapterList(raw, currentLanguage)

        if (normalized.length > 0 && Array.isArray(raw)) {
            await sendLegacyMessage({
                action: "storeListChaps",
                url: currentMangaUrl,
                mirror: currentMirror.mirrorName,
                language: currentLanguage,
                listChaps: raw
            })
        }
    }

    chapters = normalized

    if (chapters.length === 0 && currentChapterUrl) {
        const fallbackList: ReaderChapter[] = []
        if (fallbackNextChapterUrl) {
            fallbackList.push({ title: "Next Chapter", url: fallbackNextChapterUrl })
        }
        fallbackList.push({ title: chapterTitle || "Current Chapter", url: currentChapterUrl })
        if (fallbackPreviousChapterUrl) {
            fallbackList.push({ title: "Previous Chapter", url: fallbackPreviousChapterUrl })
        }
        chapters = fallbackList
    }

    if (!currentChapterUrl && chapters.length > 0) {
        currentChapterUrl = chapters[0].url
    }

    const matched = chapters.find(chapter => chapterUrlsMatch(chapter.url, currentChapterUrl || location.href))
    selectedChapterUrl = matched ? matched.url : chapters[0]?.url ?? null
    if (selectedChapterUrl) {
        currentChapterUrl = selectedChapterUrl
    }
}

async function saveReadingProgress(): Promise<void> {
    if (!currentMirror || !currentMangaUrl || !currentChapterUrl) {
        return
    }

    await sendLegacyMessage({
        action: "readManga",
        url: currentMangaUrl,
        mirror: currentMirror.mirrorName,
        language: currentLanguage,
        lastChapterReadName: chapterTitle,
        lastChapterReadURL: currentChapterUrl,
        name: currentMangaName
    })
}

async function loadMangaInfo(): Promise<void> {
    if (!currentMirror || !currentMangaUrl) {
        return
    }

    const info = await sendLegacyMessage<LegacyMangaInfo | null>({
        action: "mangaInfos",
        url: currentMangaUrl,
        mirror: currentMirror.mirrorName,
        language: currentLanguage
    })

    if (!info) {
        return
    }

    if (Number.isFinite(info.zoom)) {
        imageWidth = clamp(info.zoom, 35, 100)
    }
}

function ensureFloatingIndicator(): HTMLElement {
    const existingId = "amr-rewrite-floating"
    let el = document.getElementById(existingId)
    if (el) {
        return el
    }

    el = document.createElement("div")
    el.id = existingId
    el.style.cssText =
        "position:fixed;bottom:18px;right:18px;z-index:2147483647;" +
        "background:#1e293b;color:#e2e8f0;border:1px solid #334155;" +
        "border-radius:14px;padding:14px 18px;font-family:system-ui,sans-serif;" +
        "font-size:13px;box-shadow:0 8px 28px rgba(0,0,0,0.45);max-width:420px;"

    document.body.appendChild(el)
    return el
}

function removeFloatingIndicator(): void {
    const el = document.getElementById("amr-rewrite-floating")
    if (el) {
        el.remove()
    }
}

async function openDashboardTab(targetUrl?: string): Promise<void> {
    try {
        await sendLegacyMessage<boolean>({
            action: "openDashboard",
            reader: targetUrl ?? "",
            mirror: currentMirror?.mirrorName ?? ""
        })
        return
    } catch {
        // fallback below
    }

    try {
        const base = chrome.runtime.getURL("pages/dashboard.html")
        window.open(base, "_blank")
    } catch {
        window.open("about:debugging#/runtime/this-firefox", "_blank")
    }
}

function showNonChapterIndicator(mirror: MirrorPayload, chapterList: ReaderChapter[]): void {
    const el = ensureFloatingIndicator()

    let html =
        `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">` +
        `<strong style="color:#93c5fd;font-size:14px;">AMR Reader</strong>` +
        `<span style="color:#94a3b8;font-size:12px;">${mirror.mirrorName}</span>` +
        `<button id="amr-float-close" style="margin-left:auto;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;padding:0 6px;">✕</button>` +
        `</div>`

    if (chapterList.length > 0) {
        html += `<p style="margin:0 0 8px;color:#cbd5e1;font-size:13px;">This page is not a chapter. Pick one below to start reading:</p>`
        html += `<select id="amr-float-chapter" style="width:100%;padding:8px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;">`
        for (const ch of chapterList.slice(0, 200)) {
            html += `<option value="${ch.url}">${ch.title}</option>`
        }
        html += `</select>`
        html +=
            `<div style="display:flex;gap:8px;">` +
            `<button id="amr-float-read" style="flex:1;padding:10px;border-radius:10px;border:none;background:#3b82f6;color:#fff;font-weight:800;cursor:pointer;font-size:13px;">Start Reading</button>` +
            `<button id="amr-float-dashboard" style="padding:10px 12px;border-radius:10px;border:1px solid #3b82f6;background:transparent;color:#93c5fd;font-weight:700;cursor:pointer;font-size:12px;">Open Dashboard</button>` +
            `</div>`
    } else {
        html += `<p style="margin:0 0 8px;color:#94a3b8;font-size:12px;">Not a chapter page. No chapter list found.</p>`
        html += `<button id="amr-float-dashboard" style="padding:9px 12px;border-radius:10px;border:1px solid #3b82f6;background:transparent;color:#93c5fd;font-weight:700;cursor:pointer;font-size:12px;">Open Dashboard</button>`
    }

    el.innerHTML = html

    const closeBtn = document.getElementById("amr-float-close")
    if (closeBtn) {
        closeBtn.addEventListener("click", removeFloatingIndicator)
    }

    const readBtn = document.getElementById("amr-float-read")
    const selectEl = document.getElementById("amr-float-chapter") as HTMLSelectElement | null
    if (readBtn && selectEl) {
        readBtn.addEventListener("click", () => {
            const url = selectEl.value
            if (url) {
                removeFloatingIndicator()
                window.location.href = url
            }
        })
    }

    const dashBtn = document.getElementById("amr-float-dashboard")
    if (dashBtn) {
        dashBtn.addEventListener("click", () => {
            const target = selectEl?.value
            void openDashboardTab(target)
        })
    }
}

async function bootReader(
    mirror: MirrorPayload,
    targetUrl: string,
    options: { useCurrentHtml: boolean }
): Promise<void> {
    const token = ++bootToken
    currentMirror = mirror
    fallbackPreviousChapterUrl = ""
    fallbackNextChapterUrl = ""

    await loadReaderOptions()

    // Fetch chapter data BEFORE mounting the app — don't wipe the page unless it's a real chapter
    const chapter = await getChapterData(targetUrl, mirror.mirrorName, options.useCurrentHtml)
    if (token !== bootToken) {
        return
    }

    const info = chapter.infos && typeof chapter.infos === "object" ? chapter.infos : undefined

    currentMangaUrl =
        normalizeUrlWithBase(getStringValue(info, "currentMangaURL"), targetUrl) ||
        deriveSeriesUrlFromChapterUrl(targetUrl) ||
        normalizeUrl(targetUrl)
    currentChapterUrl = normalizeUrl(getStringValue(info, "currentChapterURL")) || normalizeUrl(targetUrl)
    currentMangaName = getStringValue(info, "name") || chapter.title || document.title
    currentLanguage = getStringValue(info, "language") || "en"
    chapterTitle = chapter.title || getStringValue(info, "currentChapter") || document.title
    fallbackPreviousChapterUrl = normalizeUrlWithBase(getStringValue(info, "prechapterurl"), targetUrl)
    fallbackNextChapterUrl = normalizeUrlWithBase(getStringValue(info, "nextchapterurl"), targetUrl)

    await ensureMangaTracked()

    const pageUrls = Array.isArray(chapter.images)
        ? chapter.images.filter((value): value is string => typeof value === "string")
        : []

    // If this is NOT a chapter page, don't take over — show a floating indicator instead
    if (!chapter.isChapter || pageUrls.length === 0) {
        // Try to load chapter list for the floating panel
        await loadChapterList(options.useCurrentHtml)
        showNonChapterIndicator(mirror, chapters)
        return
    }

    // It IS a chapter page — now we can safely mount the reader and take over
    ensureAppMounted()
    removeFloatingIndicator()

    chapterTitle = chapter.title || getStringValue(info, "currentChapter") || document.title
    readerStatus = "Loading chapter data..."
    loading = true
    progress = 0
    loadedPages = 0
    totalPages = 0
    images = []
    chapterBookmarked = false
    currentPageIndex = 0
    renderState()

    await loadChapterList(options.useCurrentHtml)
    if (token !== bootToken) {
        return
    }

    await loadMangaInfo()
    renderState()

    document.title = chapterTitle

    images = pageUrls.map(pageUrl => ({
        pageUrl,
        imageUrl: null,
        status: "pending"
    }))

    totalPages = images.length
    loadedPages = 0
    progress = 0
    readerStatus = "Resolving page image URLs..."
    loading = true
    renderState()

    await runWithConcurrency(images.length, 4, async index => {
        const resolved = await resolveImageUrl(images[index].pageUrl, mirror.mirrorName)
        if (token !== bootToken) {
            return
        }

        if (resolved) {
            images[index] = {
                ...images[index],
                imageUrl: resolved,
                status: "loaded"
            }
        } else {
            images[index] = {
                ...images[index],
                status: "error",
                error: "Failed to resolve direct image URL"
            }
        }

        loadedPages += 1
        progress = Math.floor((loadedPages / images.length) * 100)
        readerStatus = `Resolved ${loadedPages}/${images.length} pages`
        loading = loadedPages < images.length

        renderState()
    })

    if (token !== bootToken) {
        return
    }

    loading = false
    readerStatus = "Chapter loaded"
    renderState()

    await saveReadingProgress()
    await refreshBookmarkState()
}

async function navigateToChapter(url: string): Promise<void> {
    if (!currentMirror || !url || isNavigatingChapter) {
        return
    }

    const reference = selectedChapterUrl || currentChapterUrl || location.href
    if (reference && chapterUrlsMatch(reference, url)) {
        return
    }

    isNavigatingChapter = true
    try {
        selectedChapterUrl = url
        currentChapterUrl = url
        renderState()
        readerWindow.__AMR_IS_LOADING_CHAPTER__ = true
        history.pushState({ title: chapterTitle }, chapterTitle, url)
        await bootReader(currentMirror, url, { useCurrentHtml: false })
    } finally {
        isNavigatingChapter = false
    }
}

async function navigateRelativeChapter(delta: number): Promise<void> {
    const index = getSelectedChapterIndex()
    if (index < 0) {
        return
    }

    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= chapters.length) {
        return
    }

    await navigateToChapter(chapters[nextIndex].url)
}

function onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
        if (fullChapter) {
            void navigateRelativeChapter(1)
        } else if (currentPageIndex > 0) {
            currentPageIndex -= 1
            renderState()
        } else {
            void navigateRelativeChapter(1)
        }
    }

    if (event.key === "ArrowRight") {
        if (fullChapter) {
            void navigateRelativeChapter(-1)
        } else if (currentPageIndex < totalPages - 1) {
            currentPageIndex += 1
            renderState()
        } else {
            void navigateRelativeChapter(-1)
        }
    }
}

function flushPendingMirrorPayloads(): void {
    const queue = readerWindow.__amrReaderPendingMirrors
    if (!Array.isArray(queue) || queue.length === 0) {
        return
    }

    const pending = [...queue]
    queue.length = 0
    const selected = pending[pending.length - 1]
    void bootReader(selected, location.href, { useCurrentHtml: true })
}

if (!readerWindow.__amrRewriteReader) {
    readerWindow.__amrRewriteReader = true

    document.addEventListener("keydown", onDocumentKeyDown)

    readerWindow.amrLoadMirror = async (mirror: MirrorPayload) => {
        await bootReader(mirror, location.href, { useCurrentHtml: true })
    }

    readerWindow.onPushState = () => {
        if (readerWindow.__AMR_IS_LOADING_CHAPTER__) {
            delete readerWindow.__AMR_IS_LOADING_CHAPTER__
            return
        }

        if (currentMirror) {
            void bootReader(currentMirror, location.href, { useCurrentHtml: true })
        }
    }
}

flushPendingMirrorPayloads()
