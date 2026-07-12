<script lang="ts">
    import type { ReadingProgress } from "@amr/contracts"
    import type { ResolvedChapter } from "@amr/source-sdk"
    import { onDestroy, onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"

    type ReadingDirection = "ltr" | "rtl" | "vertical"
    type PageFit = "width" | "height" | "contain" | "original"

    let chapter = $state<ResolvedChapter | undefined>()
    let error = $state("")
    let resolving = $state(false)
    let currentPage = $state(0)
    let mode = $state<"continuous" | "single">("continuous")
    let direction = $state<ReadingDirection>("ltr")
    let pageFit = $state<PageFit>("width")
    let showPageNumber = $state(true)
    let noGapContinuous = $state(false)
    // Per-series "Webtoon view" override: null = no override (inherits the global
    // default), true/false = explicit per-series value saved via library:reading-prefs.
    let noGapOverride = $state<boolean | null>(null)
    let noGapDefault = $state(false)
    let noGapSaved = $state(false)
    let noGapSavedTimer: ReturnType<typeof setTimeout> | undefined
    let preloadPages = $state(3)
    let chapterUrl = $state("")
    let siblings = $state<Array<{ url: string; sortKey: number; title: string }>>([])
    let fitOverride = $state<PageFit | null>(null)
    let isFullscreen = $state(false)
    let chromeHidden = $state(false)
    let mangaId = $state("")
    let showHelp = $state(false)

    // Fallback: when a chapter fails to resolve or its page images won't load,
    // let the user search every source for a working mirror.
    type SearchResult = {
        sourceId: string
        sourceMangaId: string
        title: string
        url: string
        coverUrl?: string
        latestChapter?: string
    }
    let imageErrorCount = $state(0)
    let mirrorOpen = $state(false)
    let mirrorLoading = $state(false)
    let mirrorSearched = $state(false)
    let mirrorResults = $state<SearchResult[]>([])
    let trackMessage = $state("")

    let bookmarkedPages = $state(new Set<number>())
    const isBookmarked = $derived(bookmarkedPages.has(currentPage))
    let bookmarkWorking = $state(false)

    $effect(() => {
        if (!chapter) {
            bookmarkedPages = new Set()
            return
        }
        const chapterId = chapter.chapter.id
        void sendRuntimeMessage<number[]>({ type: "bookmark:pages", chapterId })
            .then(pages => {
                // Ignore stale responses if the chapter changed before this resolved.
                if (chapter?.chapter.id === chapterId) bookmarkedPages = new Set(pages)
            })
            .catch(() => {})
    })

    async function togglePageBookmark() {
        if (!chapter || bookmarkWorking) return
        bookmarkWorking = true
        try {
            const added = await sendRuntimeMessage<boolean>({
                type: "bookmark:toggle",
                mangaId: chapter.manga.manga.id,
                chapterId: chapter.chapter.id,
                pageIndex: currentPage,
                mangaTitle: chapter.manga.manga.title,
                chapterTitle: chapter.chapter.title,
                chapterUrl: chapter.chapter.url
            })
            // Reassign instead of mutating in place — Svelte 5's $state proxy doesn't
            // track plain Set.add/.delete, so isBookmarked wouldn't recompute otherwise.
            const next = new Set(bookmarkedPages)
            if (added) next.add(currentPage)
            else next.delete(currentPage)
            bookmarkedPages = next
        } catch {
            // ignore
        } finally {
            bookmarkWorking = false
        }
    }

    let showCatPanel = $state(false)
    let mangaCategories = $state<string[]>([])
    let catInput = $state("")
    let catSaving = $state(false)

    $effect(() => {
        if (!mangaId) {
            mangaCategories = []
            return
        }
        void sendRuntimeMessage<{ categories?: string[] } | null>({ type: "library:get", mangaId })
            .then(m => {
                mangaCategories = m?.categories ?? []
            })
            .catch(() => {})
    })

    async function saveCategories(next: string[]) {
        if (!mangaId || catSaving) return
        catSaving = true
        try {
            await sendRuntimeMessage({ type: "library:categories", mangaId, categories: next })
            mangaCategories = next
        } catch {
            // ignore
        } finally {
            catSaving = false
        }
    }

    function addCategory() {
        const tag = catInput.trim()
        catInput = ""
        if (!tag || mangaCategories.includes(tag)) return
        void saveCategories([...mangaCategories, tag])
    }

    function removeCategory(tag: string) {
        void saveCategories(mangaCategories.filter(c => c !== tag))
    }

    // Open the chapter on its own site and still record it as read — the no-scrape
    // fallback for sources whose images the in-app reader can't load.
    async function openOnSiteAndTrack() {
        if (!chapterUrl) return
        void browser.tabs.create({ url: chapterUrl })
        try {
            const res = await sendRuntimeMessage<{
                supported: boolean
                tracked?: boolean
                title?: string
                chapterNumber?: number | null
            }>({ type: "chapter:track", url: chapterUrl })
            trackMessage =
                res.supported && res.tracked
                    ? `Marked ${res.title}${res.chapterNumber != null ? ` ch ${res.chapterNumber}` : ""} as read.`
                    : "Opened on the source site."
        } catch {
            trackMessage = "Opened on the source site."
        }
    }

    function slugFromUrl(url: string): string {
        try {
            const segments = new URL(url).pathname.split("/").filter(Boolean)
            const candidate = segments.find(s => /[a-z]/i.test(s) && s !== "manga" && s !== "chapter")
            if (!candidate) return ""
            return decodeURIComponent(candidate).replace(/[-_]+/g, " ").trim()
        } catch {
            return ""
        }
    }

    const mirrorQuery = $derived(chapter?.manga.manga.title ?? slugFromUrl(chapterUrl))
    const sourceUrl = $derived(chapter?.manga.url ?? "")
    const sourceDomain = $derived(sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "")

    // pages.length === 0 means the adapter returned sidebar-only metadata (no reader).
    // imagesBroken is only true when pages exist but they all errored.
    const zeroPages = $derived(Boolean(chapter) && chapter!.pages.length === 0)
    const imagesBroken = $derived(
        Boolean(chapter) && chapter!.pages.length > 0 && imageErrorCount >= chapter!.pages.length
    )

    async function findOnAnotherMirror() {
        mirrorOpen = true
        if (!mirrorQuery) {
            mirrorResults = []
            mirrorSearched = true
            return
        }
        mirrorLoading = true
        mirrorSearched = false
        try {
            const results = await sendRuntimeMessage<SearchResult[]>({ type: "manga:search", query: mirrorQuery })
            const currentSourceId = chapter?.manga.sourceId
            mirrorResults = currentSourceId ? results.filter(r => r.sourceId !== currentSourceId) : results
        } catch {
            mirrorResults = []
        } finally {
            mirrorLoading = false
            mirrorSearched = true
        }
    }

    const mirrorResultsBySource = $derived.by(() => {
        const groups = new Map<string, SearchResult[]>()
        for (const result of mirrorResults) {
            const existing = groups.get(result.sourceId)
            if (existing) existing.push(result)
            else groups.set(result.sourceId, [result])
        }
        return [...groups.entries()]
    })

    function openMirror(result: SearchResult) {
        void browser.tabs.create({ url: result.url })
    }

    // A9: offline downloads. When a chapter has been downloaded, render the
    // stored Blobs via object URLs instead of the remote page URLs.
    let offlinePages = $state<string[]>([])
    let downloaded = $state(false)
    let downloading = $state(false)
    let removingDownload = $state(false)

    function revokeOfflinePages() {
        for (const url of offlinePages) URL.revokeObjectURL(url)
        offlinePages = []
    }

    // The page srcs the reader renders: offline blobs when available, else remote.
    const pageSrcs = $derived.by(() => {
        if (!chapter) return [] as string[]
        if (offlinePages.length === chapter.pages.length && offlinePages.length > 0) return offlinePages
        return chapter.pages.map(p => p.url)
    })

    async function refreshDownloadState(chapterId: string) {
        revokeOfflinePages()
        downloaded = false
        try {
            const record = await sendRuntimeMessage<{ pageBlobs: Blob[]; pageCount: number } | null>({
                type: "chapter:download:get",
                chapterId
            })
            if (record && record.pageBlobs.length > 0) {
                downloaded = true
                offlinePages = record.pageBlobs.map(blob => URL.createObjectURL(blob))
            }
        } catch {
            // offline read is best-effort
        }
    }

    async function downloadChapter() {
        if (!chapter || downloading) return
        downloading = true
        try {
            await sendRuntimeMessage({ type: "chapter:download", url: chapter.chapter.url })
            await refreshDownloadState(chapter.chapter.id)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "The chapter could not be downloaded"
        } finally {
            downloading = false
        }
    }

    async function removeChapterDownload() {
        if (!chapter || removingDownload) return
        removingDownload = true
        try {
            await sendRuntimeMessage({ type: "chapter:download:remove", chapterId: chapter.chapter.id })
            revokeOfflinePages()
            downloaded = false
        } catch {
            // ignore
        } finally {
            removingDownload = false
        }
    }

    // A11: export a downloaded chapter as a real CBZ file on disk. A CBZ is just a
    // ZIP of images, so we hand-roll a minimal STORED-mode (uncompressed) ZIP writer
    // rather than pull in a dependency — images are already compressed, so STORED
    // mode costs nothing and keeps this self-contained for the MV3 page context.
    let exportingCbz = $state(false)
    let exportCbzError = $state("")

    function sanitizeFilenamePart(name: string): string {
        return (
            name
                .replace(/[\\/:*?"<>|]/g, "_")
                .replace(/\s+/g, " ")
                .trim() || "untitled"
        )
    }

    function extFromMime(mime: string): string {
        switch (mime) {
            case "image/png":
                return ".png"
            case "image/webp":
                return ".webp"
            case "image/gif":
                return ".gif"
            case "image/avif":
                return ".avif"
            default:
                return ".jpg"
        }
    }

    let crcTable: Uint32Array | undefined
    function crc32(data: Uint8Array<ArrayBuffer>): number {
        if (!crcTable) {
            const table = new Uint32Array(256)
            for (let n = 0; n < 256; n += 1) {
                let c = n
                for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
                table[n] = c >>> 0
            }
            crcTable = table
        }
        let crc = 0xffffffff
        for (let i = 0; i < data.length; i += 1) {
            crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
        }
        return (crc ^ 0xffffffff) >>> 0
    }

    function dosDateTime(date: Date): { time: number; date: number } {
        const time =
            ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f)
        const dosDate =
            (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
        return { time, date: dosDate }
    }

    // Builds a valid ZIP (local file headers + central directory + EOCD record) using
    // compression method 0 (STORED) so no deflate implementation is needed.
    function buildZip(entries: { name: string; data: Uint8Array<ArrayBuffer> }[]): Blob {
        const encoder = new TextEncoder()
        const { time, date } = dosDateTime(new Date())
        const localParts: Uint8Array<ArrayBuffer>[] = []
        const centralParts: Uint8Array<ArrayBuffer>[] = []
        let offset = 0

        for (const entry of entries) {
            const nameBytes = encoder.encode(entry.name)
            const crc = crc32(entry.data)
            const size = entry.data.length

            const localHeader = new Uint8Array(30 + nameBytes.length)
            const lv = new DataView(localHeader.buffer)
            lv.setUint32(0, 0x04034b50, true)
            lv.setUint16(4, 20, true)
            lv.setUint16(6, 0, true)
            lv.setUint16(8, 0, true)
            lv.setUint16(10, time, true)
            lv.setUint16(12, date, true)
            lv.setUint32(14, crc, true)
            lv.setUint32(18, size, true)
            lv.setUint32(22, size, true)
            lv.setUint16(26, nameBytes.length, true)
            lv.setUint16(28, 0, true)
            localHeader.set(nameBytes, 30)
            localParts.push(localHeader, entry.data)

            const centralHeader = new Uint8Array(46 + nameBytes.length)
            const cv = new DataView(centralHeader.buffer)
            cv.setUint32(0, 0x02014b50, true)
            cv.setUint16(4, 20, true)
            cv.setUint16(6, 20, true)
            cv.setUint16(8, 0, true)
            cv.setUint16(10, 0, true)
            cv.setUint16(12, time, true)
            cv.setUint16(14, date, true)
            cv.setUint32(16, crc, true)
            cv.setUint32(20, size, true)
            cv.setUint32(24, size, true)
            cv.setUint16(28, nameBytes.length, true)
            cv.setUint16(30, 0, true)
            cv.setUint16(32, 0, true)
            cv.setUint16(34, 0, true)
            cv.setUint16(36, 0, true)
            cv.setUint32(38, 0, true)
            cv.setUint32(42, offset, true)
            centralHeader.set(nameBytes, 46)
            centralParts.push(centralHeader)

            offset += localHeader.length + entry.data.length
        }

        const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0)
        const centralDirOffset = offset

        const eocd = new Uint8Array(22)
        const ev = new DataView(eocd.buffer)
        ev.setUint32(0, 0x06054b50, true)
        ev.setUint16(4, 0, true)
        ev.setUint16(6, 0, true)
        ev.setUint16(8, entries.length, true)
        ev.setUint16(10, entries.length, true)
        ev.setUint32(12, centralDirSize, true)
        ev.setUint32(16, centralDirOffset, true)
        ev.setUint16(20, 0, true)

        return new Blob([...localParts, ...centralParts, eocd], { type: "application/vnd.comicbook+zip" })
    }

    async function exportCbz() {
        if (!chapter || exportingCbz) return
        exportingCbz = true
        exportCbzError = ""
        let objectUrl = ""
        try {
            const record = await sendRuntimeMessage<{ pageBlobs: Blob[]; pageCount: number } | null>({
                type: "chapter:download:get",
                chapterId: chapter.chapter.id
            })
            if (!record || record.pageBlobs.length === 0) {
                exportCbzError = "No offline pages to export"
                return
            }
            const digits = String(record.pageBlobs.length).length
            const entries: { name: string; data: Uint8Array<ArrayBuffer> }[] = []
            for (let i = 0; i < record.pageBlobs.length; i += 1) {
                const blob = record.pageBlobs[i]!
                const data = new Uint8Array(await blob.arrayBuffer())
                const name = `page_${String(i + 1).padStart(digits, "0")}${extFromMime(blob.type)}`
                entries.push({ name, data })
            }
            const zipBlob = buildZip(entries)
            const mangaTitle = sanitizeFilenamePart(chapter.manga.manga.title)
            const chapterTitle = sanitizeFilenamePart(chapter.chapter.title)
            objectUrl = URL.createObjectURL(zipBlob)
            await browser.downloads.download({
                url: objectUrl,
                filename: `${mangaTitle} - ${chapterTitle}.cbz`,
                saveAs: false
            })
        } catch (cause) {
            exportCbzError = cause instanceof Error ? cause.message : "CBZ export failed"
        } finally {
            exportingCbz = false
            // The download API reads the blob asynchronously; give it a head start
            // before releasing the object URL.
            if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
        }
    }

    // A10: remember the reading mode (scroll/single) and direction per title.
    async function setMode(next: "continuous" | "single") {
        mode = next
        if (mangaId) await browser.storage.local.set({ [`readerMode:${mangaId}`]: next })
    }

    async function setDirection(next: ReadingDirection) {
        direction = next
        if (mangaId) await browser.storage.local.set({ [`readerDirection:${mangaId}`]: next })
    }

    function cycleDirection() {
        const dirs: ReadingDirection[] = ["ltr", "rtl", "vertical"]
        const next = dirs[(dirs.indexOf(direction) + 1) % dirs.length]!
        void setDirection(next)
    }

    // Per-series "Webtoon view" (no-gap continuous) override — mirrors setDirection's
    // shape, but persists to the library record via library:reading-prefs instead of
    // local storage, since this is a per-manga DB override rather than a device-local one.
    function flashNoGapSaved() {
        noGapSaved = true
        if (noGapSavedTimer) clearTimeout(noGapSavedTimer)
        noGapSavedTimer = setTimeout(() => {
            noGapSaved = false
        }, 1500)
    }

    async function setSeriesNoGap(value: boolean) {
        if (!mangaId) return
        // Optimistic — flip the visual state immediately, don't wait on the round trip.
        noGapOverride = value
        noGapContinuous = value
        try {
            await sendRuntimeMessage({ type: "library:reading-prefs", mangaId, noGapContinuous: value })
            flashNoGapSaved()
        } catch {
            // best-effort; local state already reflects the intended value
        }
    }

    function toggleSeriesNoGap() {
        void setSeriesNoGap(!(noGapOverride ?? noGapContinuous))
    }

    async function resetSeriesNoGap() {
        if (!mangaId) return
        noGapOverride = null
        noGapContinuous = noGapDefault
        try {
            await sendRuntimeMessage({ type: "library:reading-prefs", mangaId, noGapContinuous: null })
            flashNoGapSaved()
        } catch {
            // best-effort; local state already reflects the intended value
        }
    }

    // Vertical (webtoon) direction always scrolls continuously.
    const effectiveMode = $derived(direction === "vertical" ? "continuous" : mode)
    // A5: double-click toggles between the configured fit and original (zoom).
    const effectivePageFit = $derived(fitOverride ?? pageFit)
    const progressPct = $derived(
        chapter && chapter.pages.length > 0 ? Math.round(((currentPage + 1) / chapter.pages.length) * 100) : 0
    )

    function toggleZoom() {
        fitOverride = fitOverride ? null : "original"
    }

    // A6: fullscreen + immersive (auto-hide chrome on scroll-down).
    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) await document.exitFullscreen()
            else await document.documentElement.requestFullscreen()
        } catch {
            // ignore (denied / unsupported)
        }
    }

    let lastScroll = 0
    let scrollCompleteFired = false
    function onScroll() {
        const y = window.scrollY
        chromeHidden = y > 120 && y > lastScroll
        lastScroll = y
        if (!scrollCompleteFired && effectiveMode === "continuous" && chapter) {
            const nearBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 50
            if (nearBottom) {
                scrollCompleteFired = true
                if (chapter.pages.length > 0) recordProgress(chapter.pages.length - 1)
            }
        }
    }

    const currentIndex = $derived(chapter ? siblings.findIndex(s => s.url === chapter!.chapter.url) : -1)
    const prevUrl = $derived(currentIndex > 0 ? siblings[currentIndex - 1]?.url : undefined)
    const nextUrl = $derived(
        currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1]?.url : undefined
    )

    async function loadSiblings(resolved: ResolvedChapter) {
        try {
            siblings = await sendRuntimeMessage<typeof siblings>({
                type: "reader:chapters",
                sourceId: resolved.manga.sourceId,
                sourceMangaId: resolved.manga.sourceMangaId,
                mangaUrl: resolved.manga.url
            })
        } catch {
            siblings = []
        }
    }

    async function loadChapter(url: string) {
        resolving = true
        error = ""
        chapter = undefined
        revokeOfflinePages()
        downloaded = false
        imageErrorCount = 0
        scrollCompleteFired = false
        mirrorOpen = false
        mirrorSearched = false
        mirrorResults = []
        try {
            chapter = await sendRuntimeMessage<ResolvedChapter>({ type: "reader:resolve", url })
            void loadSiblings(chapter)
            void refreshDownloadState(chapter.chapter.id)
            const progress = await sendRuntimeMessage<ReadingProgress | null>({
                type: "reader:progress:get",
                chapterId: chapter.chapter.id
            })
            currentPage = progress?.pageIndex ?? 0
            // A10: load global settings + per-title overrides in parallel so mode is
            // set exactly once — no flicker from a global-default interim state.
            mangaId = chapter.manga.manga.id
            try {
                const modeKey = `readerMode:${mangaId}`
                const dirKey = `readerDirection:${mangaId}`
                const [settings, stored, libraryManga] = await Promise.all([
                    sendRuntimeMessage<{
                        readingMode: "continuous" | "single"
                        readingDirection: ReadingDirection
                        pageFit: PageFit
                        showPageNumber: boolean
                        noGapContinuous: boolean
                        preloadPages: number
                    }>({ type: "settings:get" }),
                    browser.storage.local.get([modeKey, dirKey]).catch(() => ({}) as Record<string, unknown>),
                    sendRuntimeMessage<{
                        readingDirection?: ReadingDirection
                        pageFit?: PageFit
                        noGapContinuous?: boolean
                    } | null>({ type: "library:get", mangaId }).catch(() => null)
                ])
                const modeOverride = stored[modeKey]
                const dirOverride = stored[dirKey]
                mode = modeOverride === "single" || modeOverride === "continuous" ? modeOverride : settings.readingMode
                // Per-series DB override wins, then the local per-title override, then global.
                direction =
                    libraryManga?.readingDirection ??
                    (dirOverride === "ltr" || dirOverride === "rtl" || dirOverride === "vertical"
                        ? dirOverride
                        : settings.readingDirection)
                pageFit = libraryManga?.pageFit ?? settings.pageFit
                showPageNumber = settings.showPageNumber
                noGapDefault = settings.noGapContinuous
                noGapOverride = libraryManga?.noGapContinuous ?? null
                noGapContinuous = libraryManga?.noGapContinuous ?? settings.noGapContinuous
                preloadPages = settings.preloadPages
            } catch {
                // keep defaults
            }
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "The chapter could not be loaded"
        } finally {
            resolving = false
        }
    }

    onMount(async () => {
        const params = new URL(location.href).searchParams
        const url = params.get("url")
        if (!url) {
            error = "No chapter URL was provided"
            return
        }
        chapterUrl = url
        await loadChapter(url)
        const pageParam = params.get("page")
        if (pageParam !== null) {
            const p = parseInt(pageParam)
            if (Number.isFinite(p) && p >= 0 && chapter && p < chapter.pages.length) currentPage = p
        }
    })

    onDestroy(() => {
        revokeOfflinePages()
        if (noGapSavedTimer) clearTimeout(noGapSavedTimer)
    })

    function recordProgress(pageIndex: number) {
        if (!chapter) return
        currentPage = pageIndex
        void sendRuntimeMessage({
            type: "reader:progress",
            mangaId: chapter.manga.manga.id,
            chapterId: chapter.chapter.id,
            pageIndex,
            pageCount: chapter.pages.length,
            completed: pageIndex === chapter.pages.length - 1
        })
    }

    function goToChapter(url: string | undefined) {
        if (!url) return
        chapterUrl = url
        window.scrollTo(0, 0)
        void loadChapter(url)
    }

    // A8: mark the current chapter complete and jump to the next one.
    function markReadAndNext() {
        if (chapter && chapter.pages.length > 0) recordProgress(chapter.pages.length - 1)
        goToChapter(nextUrl)
    }

    function handleImageError(e: Event) {
        const img = e.currentTarget as HTMLImageElement
        console.warn("[AMR reader] Image error:", img.src)
        if (img.dataset.didFallback) return
        const isMangaDex = chapterUrl?.includes("mangadex.org") ?? false
        if (isMangaDex) {
            const match = img.src.match(/\/data\/([a-fA-F0-9]+)\/(.+?)(?:\?.*)?$/)
            if (match && match[1] && match[2]) {
                img.dataset.didFallback = "1"
                img.src = `https://uploads.mangadex.org/data/${match[1]}/${match[2]}`
                return
            }
        }
        console.warn("[AMR reader] Image load failed, no fallback pattern matched:", img.src)
        imageErrorCount += 1
    }

    async function goToApp() {
        const appUrl = browser.runtime.getURL("/app.html")
        try {
            const tab = await browser.tabs.getCurrent()
            if (tab?.id !== undefined) {
                await browser.tabs.update(tab.id, { url: appUrl })
                return
            }
        } catch {
            // fallthrough
        }
        window.location.href = appUrl
    }
</script>

<svelte:window
    onkeydown={event => {
        if (!chapter) return
        // E2: keyboard-shortcut help overlay.
        if (event.key === "?") {
            showHelp = !showHelp
            return
        }
        if (event.key === "Escape" && showHelp) {
            showHelp = false
            return
        }
        // Chapter navigation works in any mode.
        if (event.key === "[") {
            goToChapter(prevUrl)
            return
        }
        if (event.key === "]") {
            goToChapter(nextUrl)
            return
        }
        if (effectiveMode !== "single") return
        const lastIndex = chapter.pages.length - 1
        const next = () => recordProgress(Math.min(currentPage + 1, lastIndex))
        const prev = () => recordProgress(Math.max(currentPage - 1, 0))
        const key = event.key.toLowerCase()
        if (key === "j") next()
        else if (key === "k") prev()
        else if (event.key === "ArrowRight") (direction === "rtl" ? prev : next)()
        else if (event.key === "ArrowLeft") (direction === "rtl" ? next : prev)()
    }}
    onscroll={onScroll} />

<svelte:document onfullscreenchange={() => (isFullscreen = Boolean(document.fullscreenElement))} />

<header class:chrome-hidden={chromeHidden}>
    <div class="header-left">
        <button type="button" class="btn-back" onclick={() => void goToApp()}>← Dashboard</button>
    </div>
    <div class="header-title">
        <strong>{chapter?.manga.manga.title ?? (resolving ? "Loading…" : "Reader")}</strong>
        {#if chapter}
            {#if siblings.length > 1}
                <select
                    class="chapter-select"
                    value={chapter.chapter.url}
                    onchange={e => goToChapter((e.currentTarget as HTMLSelectElement).value)}>
                    {#each siblings as s (s.url)}
                        <option value={s.url}>{s.title}</option>
                    {/each}
                </select>
                {#if currentIndex >= 0}
                    <span>Chapter {currentIndex + 1} of {siblings.length}</span>
                {/if}
            {:else}
                <span>{chapter.chapter.title}</span>
            {/if}
            {#if sourceDomain}
                <button
                    class="source-link"
                    type="button"
                    title="Open manga page on source site"
                    onclick={() => void browser.tabs.create({ url: sourceUrl })}>
                    {sourceDomain}
                </button>
            {/if}
        {/if}
    </div>
    <div class="header-right">
        {#if chapter}
            {#if siblings.length > 1}
                <button
                    type="button"
                    class="btn-sm"
                    disabled={!prevUrl}
                    title="Previous chapter"
                    onclick={() => goToChapter(prevUrl)}>‹ Prev</button>
                <button
                    type="button"
                    class="btn-sm"
                    disabled={!nextUrl}
                    title="Next chapter"
                    onclick={() => goToChapter(nextUrl)}>Next ›</button>
            {/if}
            <span class="page-count">{currentPage + 1} / {chapter.pages.length}</span>
            <button
                type="button"
                class="btn-sm"
                disabled={direction === "vertical"}
                title={direction === "vertical" ? "Vertical mode always scrolls" : "Toggle reading mode"}
                onclick={() => void setMode(mode === "continuous" ? "single" : "continuous")}>
                {effectiveMode === "continuous" ? "Single" : "Scroll"}
            </button>
            <button
                type="button"
                class="btn-sm"
                title="Cycle reading direction (LTR → RTL → Vertical)"
                onclick={cycleDirection}>
                {direction === "ltr" ? "→" : direction === "rtl" ? "←" : "↓"}
            </button>
            {#if effectiveMode === "continuous"}
                <button
                    type="button"
                    class="btn-sm"
                    class:active={noGapOverride === true}
                    class:off-override={noGapOverride === false}
                    title={noGapOverride === null
                        ? "Webtoon view (no gaps) — using the global default, click to set for this series"
                        : noGapOverride
                          ? "Webtoon view is ON for this series — click to turn off"
                          : "Webtoon view is OFF for this series — click to turn on"}
                    onclick={toggleSeriesNoGap}>
                    Webtoon view
                </button>
                {#if noGapOverride !== null}
                    <button
                        type="button"
                        class="reset-link"
                        title="Reset Webtoon view to the global default for this series"
                        aria-label="Reset Webtoon view to default"
                        onclick={resetSeriesNoGap}>×</button>
                {/if}
                {#if noGapSaved}<span class="saved-flash">✓ Saved</span>{/if}
            {/if}
        {/if}
        {#if chapter}
            <button
                type="button"
                class="btn-sm"
                class:active={fitOverride === "original"}
                title="Toggle zoom (or double-click a page)"
                onclick={toggleZoom}>⛶±</button>
            <button type="button" class="btn-sm" title="Fullscreen" onclick={() => void toggleFullscreen()}>
                {isFullscreen ? "⤢" : "⛶"}
            </button>
            {#if downloaded}
                <button
                    type="button"
                    class="btn-sm active"
                    disabled={removingDownload}
                    title="Available offline — click to remove"
                    onclick={() => void removeChapterDownload()}>
                    {removingDownload ? "…" : "✓ Offline"}
                </button>
            {:else}
                <button
                    type="button"
                    class="btn-sm"
                    disabled={downloading}
                    title="Download chapter for offline reading"
                    onclick={() => void downloadChapter()}>
                    {downloading ? "…" : "⬇"}
                </button>
            {/if}
            {#if downloaded}
                <button
                    type="button"
                    class="btn-sm"
                    disabled={exportingCbz}
                    title={exportCbzError || "Save this chapter as a CBZ file"}
                    onclick={() => void exportCbz()}>
                    {exportingCbz ? "…" : "CBZ ⤓"}
                </button>
                {#if exportCbzError}<span class="page-count">{exportCbzError}</span>{/if}
            {/if}
            <button
                type="button"
                class="btn-sm"
                class:active={showHelp}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                onclick={() => (showHelp = !showHelp)}>?</button>
            <button
                type="button"
                class="btn-sm"
                class:active={isBookmarked}
                title={isBookmarked ? "Remove bookmark for this page" : "Bookmark this page"}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark page"}
                disabled={bookmarkWorking}
                onclick={() => void togglePageBookmark()}>
                {isBookmarked ? "★" : "☆"}
            </button>
            <button
                type="button"
                class="btn-sm"
                class:active={showCatPanel}
                title="Manage tags for this title"
                onclick={() => (showCatPanel = !showCatPanel)}>Tag</button>
        {/if}
        <button
            type="button"
            class="btn-sm"
            disabled={resolving || !chapterUrl}
            onclick={() => void loadChapter(chapterUrl)}>
            {resolving ? "…" : "↺"}
        </button>
    </div>
    {#if showCatPanel && chapter}
        <div class="cat-panel">
            <div class="cat-tags">
                {#each mangaCategories as tag}
                    <span class="cat-tag">
                        {tag}
                        <button
                            type="button"
                            class="cat-remove"
                            aria-label="Remove tag {tag}"
                            onclick={() => removeCategory(tag)}>×</button>
                    </span>
                {/each}
                {#if mangaCategories.length === 0}
                    <span class="cat-empty">No tags yet</span>
                {/if}
            </div>
            <form
                class="cat-form"
                onsubmit={e => {
                    e.preventDefault()
                    addCategory()
                }}>
                <input bind:value={catInput} placeholder="Add tag…" class="cat-input" aria-label="New tag name" />
                <button type="submit" class="btn-sm" disabled={catSaving || !catInput.trim()}>Add</button>
            </form>
        </div>
    {/if}
</header>

{#if chapter}
    <div class="progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div class="progress-fill" style="width:{progressPct}%"></div>
    </div>
{/if}

<main
    class:single={effectiveMode === "single"}
    class:no-gap={effectiveMode === "continuous" && noGapContinuous}
    class="fit-{effectivePageFit} dir-{direction}">
    {#if chapter && !error && !resolving && zeroPages}
        <div class="mirror-banner">
            <span>No reader pages available — open on site and use the AMR sidebar to navigate.</span>
            <button type="button" class="btn-mirror" onclick={() => void openOnSiteAndTrack()}>
                Open on site &amp; mark read
            </button>
            <button type="button" class="btn-mirror" onclick={() => void findOnAnotherMirror()}>
                Find another source
            </button>
            {#if trackMessage}<span class="track-note">{trackMessage}</span>{/if}
        </div>
    {/if}
    {#if chapter && !error && !resolving && imagesBroken}
        <div class="mirror-banner">
            <span>Images not loading on this source?</span>
            <button type="button" class="btn-mirror" onclick={() => void openOnSiteAndTrack()}>
                Read on the site &amp; mark read
            </button>
            <button type="button" class="btn-mirror" onclick={() => void findOnAnotherMirror()}>
                Find another source
            </button>
            {#if trackMessage}<span class="track-note">{trackMessage}</span>{/if}
        </div>
    {/if}
    {#if error}
        <section class="message">
            {#if error.includes("not supported")}
                <h1>Site not supported in reader view</h1>
                <p>{error}</p>
                <p class="muted">
                    AMR doesn't have a reader adapter for this site yet, but the
                    <strong>AMR sidebar</strong> may still work — open the chapter normally and the sidebar lets you track
                    progress and navigate chapters while you read on the site.
                </p>
                {#if chapterUrl}
                    <button type="button" class="btn-mirror" onclick={() => void openOnSiteAndTrack()}>
                        Open on site (sidebar still works)
                    </button>
                {/if}
                <button type="button" class="btn-mirror" onclick={() => void findOnAnotherMirror()}>
                    Find this on a supported source
                </button>
                <p class="track-note">
                    Want this site added? Report it on
                    <a href="https://discord.gg/23kS4gDtr" target="_blank" rel="noopener">Discord</a>
                    or
                    <a href="https://github.com/Ryuu3rs/AMR-Next/issues" target="_blank" rel="noopener">GitHub</a>.
                </p>
            {:else}
                <h1>Chapter could not be loaded</h1>
                <p>{error}</p>
                <p class="muted">
                    The site may be temporarily down or blocking requests. Try again in a moment, or read directly on
                    the site — the <strong>AMR sidebar</strong> will still let you track your progress and navigate chapters.
                </p>
                {#if chapterUrl}
                    <button type="button" onclick={() => void loadChapter(chapterUrl)}>Try again</button>
                    <button type="button" class="btn-mirror" onclick={() => void openOnSiteAndTrack()}>
                        Open on site (sidebar still works)
                    </button>
                {/if}
                <button type="button" class="btn-mirror" onclick={() => void findOnAnotherMirror()}>
                    Find this on another source
                </button>
                <p class="track-note">
                    Still broken? Report it on
                    <a href="https://discord.gg/23kS4gDtr" target="_blank" rel="noopener">Discord</a>
                    or
                    <a href="https://github.com/Ryuu3rs/AMR-Next/issues" target="_blank" rel="noopener">GitHub</a>.
                </p>
            {/if}
            {#if trackMessage}<p class="track-note">{trackMessage}</p>{/if}
        </section>
    {:else if resolving}
        <section class="message"><p>Loading chapter…</p></section>
    {:else if !chapter}
        <section class="message"><p>No chapter loaded.</p></section>
    {:else if effectiveMode === "single" && !imagesBroken}
        <div class="page">
            <img
                src={pageSrcs[currentPage]}
                alt={`Page ${currentPage + 1}`}
                ondblclick={toggleZoom}
                onerror={handleImageError}
                onload={e => {
                    delete (e.currentTarget as HTMLImageElement).dataset.didFallback
                    recordProgress(currentPage)
                }} />
            {#if showPageNumber}<span class="page-num">{currentPage + 1} / {chapter.pages.length}</span>{/if}
        </div>
    {:else if !imagesBroken}
        {#each pageSrcs as src, index}
            <div class="page">
                <img
                    {src}
                    alt={`Page ${index + 1}`}
                    loading={index < preloadPages ? "eager" : "lazy"}
                    ondblclick={toggleZoom}
                    onerror={handleImageError}
                    onload={() => recordProgress(index)} />
                {#if showPageNumber}<span class="page-num">{index + 1} / {chapter.pages.length}</span>{/if}
            </div>
        {/each}
    {/if}
</main>

{#if chapter && !error && !resolving && (nextUrl || prevUrl)}
    <footer class="chapter-nav">
        <button type="button" class="btn-sm" disabled={!prevUrl} onclick={() => goToChapter(prevUrl)}>
            ‹ Previous chapter
        </button>
        <button type="button" class="nav-primary" disabled={!nextUrl} onclick={() => markReadAndNext()}>
            {nextUrl ? "Mark read & next ›" : "Next chapter ›"}
        </button>
    </footer>
{/if}

{#if showHelp}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="help-backdrop" onclick={() => (showHelp = false)}>
        <div
            class="help-card"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            tabindex="-1"
            onclick={event => event.stopPropagation()}>
            <div class="help-head">
                <h2>Keyboard shortcuts</h2>
                <button type="button" class="help-close" aria-label="Close" onclick={() => (showHelp = false)}
                    >×</button>
            </div>
            <div class="help-list">
                <div class="shortcut-row">
                    <span class="keys"><kbd>j</kbd> / <kbd>k</kbd></span>
                    <span class="label">Next / previous page</span>
                </div>
                <div class="shortcut-row">
                    <span class="keys"><kbd>←</kbd> / <kbd>→</kbd></span>
                    <span class="label">Previous / next page (direction-aware, respects RTL)</span>
                </div>
                <div class="shortcut-row">
                    <span class="keys"><kbd>[</kbd> / <kbd>]</kbd></span>
                    <span class="label">Previous / next chapter</span>
                </div>
                <div class="shortcut-row">
                    <span class="keys"><kbd>?</kbd></span>
                    <span class="label">Toggle this help</span>
                </div>
                <div class="shortcut-row">
                    <span class="keys"><kbd>Esc</kbd></span>
                    <span class="label">Close help</span>
                </div>
                <div class="shortcut-row">
                    <span class="keys">Double-click</span>
                    <span class="label">Toggle zoom on a page (fit ↔ original)</span>
                </div>
            </div>
            <p class="help-note">
                Page keys (<kbd>j</kbd>/<kbd>k</kbd>, arrows) apply in single-page mode. Chapter keys work in any mode.
            </p>
            <button type="button" class="help-got-it" onclick={() => (showHelp = false)}>Got it</button>
        </div>
    </div>
{/if}

{#if mirrorOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="help-backdrop" onclick={() => (mirrorOpen = false)}>
        <div
            class="help-card mirror-card"
            role="dialog"
            aria-modal="true"
            aria-label="Find another source"
            tabindex="-1"
            onclick={event => event.stopPropagation()}>
            <div class="help-head">
                <h2>Find another source</h2>
                <button type="button" class="help-close" aria-label="Close" onclick={() => (mirrorOpen = false)}
                    >×</button>
            </div>
            {#if mirrorLoading}
                <p class="muted">Searching other sources…</p>
            {:else if mirrorSearched && mirrorResults.length === 0}
                <p class="muted">
                    {mirrorQuery ? "No other mirror found for this title." : "Couldn't work out a title to search for."}
                </p>
            {:else if mirrorResults.length > 0}
                <p class="help-note">Results for “{mirrorQuery}” from other sources:</p>
                <div class="mirror-groups">
                    {#each mirrorResultsBySource as [sourceId, results] (sourceId)}
                        <div class="mirror-group">
                            <h3 class="mirror-source">{sourceId}</h3>
                            {#each results as result (result.url)}
                                <div class="mirror-result">
                                    <div class="mirror-meta">
                                        <span class="mirror-title">{result.title}</span>
                                        {#if result.latestChapter}
                                            <span class="muted">Latest: {result.latestChapter}</span>
                                        {/if}
                                    </div>
                                    <button type="button" class="btn-sm" onclick={() => openMirror(result)}>
                                        Open
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .btn-mirror {
        margin-top: 16px;
        background: #f59e0b;
        border: 1px solid #d97706;
        color: #1a1a1a;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
    }

    .track-note {
        margin-top: 10px;
        font-size: 13px;
        opacity: 0.85;
    }

    .mirror-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        margin: 16px auto;
        padding: 12px 16px;
        max-width: 560px;
        border: 1px solid #d97706;
        border-radius: 8px;
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
    }

    .mirror-banner .btn-mirror {
        margin-top: 0;
    }

    .mirror-card {
        text-align: left;
    }

    .mirror-groups {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 12px;
        max-height: 50vh;
        overflow-y: auto;
    }

    .mirror-source {
        margin: 0 0 6px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.7;
    }

    .mirror-result {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .mirror-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .mirror-title {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
