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
            if (added) bookmarkedPages.add(currentPage)
            else bookmarkedPages.delete(currentPage)
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

    // A failed resolve, a page-count of 0, or images that error out all mean the
    // current source is broken for this chapter.
    const imagesBroken = $derived(
        Boolean(chapter) && (chapter!.pages.length === 0 || imageErrorCount >= chapter!.pages.length)
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

    // A10: remember the reading mode (scroll/single) per title.
    async function setMode(next: "continuous" | "single") {
        mode = next
        if (mangaId) await browser.storage.local.set({ [`readerMode:${mangaId}`]: next })
    }

    // Vertical (webtoon) direction always scrolls continuously.
    const effectiveMode = $derived(direction === "vertical" ? "continuous" : mode)
    // A5: double-click toggles between the configured fit and original (zoom).
    const effectivePageFit = $derived(fitOverride ?? pageFit)
    const progressPct = $derived(chapter ? Math.round(((currentPage + 1) / chapter.pages.length) * 100) : 0)

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
    function onScroll() {
        const y = window.scrollY
        chromeHidden = y > 120 && y > lastScroll
        lastScroll = y
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
            try {
                const settings = await sendRuntimeMessage<{
                    readingMode: "continuous" | "single"
                    readingDirection: ReadingDirection
                    pageFit: PageFit
                    showPageNumber: boolean
                    preloadPages: number
                }>({ type: "settings:get" })
                mode = settings.readingMode
                direction = settings.readingDirection
                pageFit = settings.pageFit
                showPageNumber = settings.showPageNumber
                preloadPages = settings.preloadPages
            } catch {
                // keep defaults
            }
            // Per-title mode override (A10) takes precedence over the global default.
            mangaId = chapter.manga.manga.id
            try {
                const key = `readerMode:${mangaId}`
                const stored = await browser.storage.local.get(key)
                const override = stored[key]
                if (override === "single" || override === "continuous") mode = override
            } catch {
                // ignore
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

    onDestroy(() => revokeOfflinePages())

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
        if (chapter) recordProgress(chapter.pages.length - 1)
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
        {#if chapter && siblings.length > 1}
            <select
                class="chapter-select"
                value={chapter.chapter.url}
                onchange={e => goToChapter((e.currentTarget as HTMLSelectElement).value)}>
                {#each siblings as s (s.url)}
                    <option value={s.url}>{s.title}</option>
                {/each}
            </select>
        {:else if chapter}
            <span>{chapter.chapter.title}</span>
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

<main class:single={effectiveMode === "single"} class="fit-{effectivePageFit} dir-{direction}">
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
    {:else if effectiveMode === "single"}
        <div class="page">
            <img
                src={pageSrcs[currentPage]}
                alt={`Page ${currentPage + 1}`}
                ondblclick={toggleZoom}
                onerror={handleImageError}
                onload={() => recordProgress(currentPage)} />
            {#if showPageNumber}<span class="page-num">{currentPage + 1} / {chapter.pages.length}</span>{/if}
        </div>
    {:else}
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
