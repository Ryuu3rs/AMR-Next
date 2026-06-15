<script lang="ts">
    import type { ReadingProgress } from "@amr/contracts"
    import type { ResolvedChapter } from "@amr/source-sdk"
    import { onMount } from "svelte"
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
        try {
            chapter = await sendRuntimeMessage<ResolvedChapter>({ type: "reader:resolve", url })
            void loadSiblings(chapter)
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
        const url = new URL(location.href).searchParams.get("url")
        if (!url) {
            error = "No chapter URL was provided"
            return
        }
        chapterUrl = url
        await loadChapter(url)
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
        if (chapter) recordProgress(chapter.pages.length - 1)
        goToChapter(nextUrl)
    }

    function handleImageError(e: Event) {
        const img = e.currentTarget as HTMLImageElement
        console.warn("[AMR reader] Image error:", img.src)
        if (img.dataset.didFallback) return
        const match = img.src.match(/\/data\/([a-fA-F0-9]+)\/(.+?)(?:\?.*)?$/)
        if (match && match[1] && match[2]) {
            img.dataset.didFallback = "1"
            img.src = `https://uploads.mangadex.org/data/${match[1]}/${match[2]}`
        } else {
            console.warn("[AMR reader] Image load failed, no fallback pattern matched:", img.src)
        }
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
        {#if chapter}<span>{chapter.chapter.title}</span>{/if}
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
        {/if}
        <button
            type="button"
            class="btn-sm"
            disabled={resolving || !chapterUrl}
            onclick={() => void loadChapter(chapterUrl)}>
            {resolving ? "…" : "↺"}
        </button>
    </div>
</header>

{#if chapter}
    <div class="progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div class="progress-fill" style="width:{progressPct}%"></div>
    </div>
{/if}

<main class:single={effectiveMode === "single"} class="fit-{effectivePageFit} dir-{direction}">
    {#if error}
        <section class="message">
            <h1>Chapter could not be loaded</h1>
            <p>{error}</p>
            {#if chapterUrl}
                <button type="button" onclick={() => void loadChapter(chapterUrl)}>Try again</button>
            {/if}
        </section>
    {:else if resolving}
        <section class="message"><p>Loading chapter…</p></section>
    {:else if !chapter}
        <section class="message"><p>No chapter loaded.</p></section>
    {:else if effectiveMode === "single"}
        <div class="page">
            <img
                src={chapter.pages[currentPage]?.url}
                alt={`Page ${currentPage + 1}`}
                ondblclick={toggleZoom}
                onerror={handleImageError}
                onload={() => recordProgress(currentPage)} />
            {#if showPageNumber}<span class="page-num">{currentPage + 1} / {chapter.pages.length}</span>{/if}
        </div>
    {:else}
        {#each chapter.pages as page, index}
            <div class="page">
                <img
                    src={page.url}
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
        {#if nextUrl}
            <button type="button" class="nav-primary" onclick={() => markReadAndNext()}>
                Mark read &amp; next ›
            </button>
        {:else}
            <span class="muted">You're on the latest chapter.</span>
        {/if}
    </footer>
{/if}
