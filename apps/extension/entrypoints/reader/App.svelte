<script lang="ts">
    import type { ReadingProgress } from "@amr/contracts"
    import type { ResolvedChapter } from "@amr/source-sdk"
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"

    let chapter = $state<ResolvedChapter | undefined>()
    let error = $state("")
    let resolving = $state(false)
    let currentPage = $state(0)
    let mode = $state<"continuous" | "single">("continuous")
    let chapterUrl = $state("")

    const progressPct = $derived(chapter ? Math.round(((currentPage + 1) / chapter.pages.length) * 100) : 0)

    async function loadChapter(url: string) {
        resolving = true
        error = ""
        chapter = undefined
        try {
            chapter = await sendRuntimeMessage<ResolvedChapter>({ type: "reader:resolve", url })
            const progress = await sendRuntimeMessage<ReadingProgress | null>({
                type: "reader:progress:get",
                chapterId: chapter.chapter.id
            })
            currentPage = progress?.pageIndex ?? 0
            try {
                const settings = await sendRuntimeMessage<{ readingMode: "continuous" | "single" }>({
                    type: "settings:get"
                })
                mode = settings.readingMode
            } catch {
                // keep default
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
        if (mode !== "single" || !chapter) return
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "j") {
            recordProgress(Math.min(currentPage + 1, chapter.pages.length - 1))
        }
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "k") {
            recordProgress(Math.max(currentPage - 1, 0))
        }
    }} />

<header>
    <div class="header-left">
        <button type="button" class="btn-back" onclick={() => void goToApp()}>← Dashboard</button>
    </div>
    <div class="header-title">
        <strong>{chapter?.manga.manga.title ?? (resolving ? "Loading…" : "Reader")}</strong>
        {#if chapter}<span>{chapter.chapter.title}</span>{/if}
    </div>
    <div class="header-right">
        {#if chapter}
            <span class="page-count">{currentPage + 1} / {chapter.pages.length}</span>
            <button
                type="button"
                class="btn-sm"
                onclick={() => (mode = mode === "continuous" ? "single" : "continuous")}>
                {mode === "continuous" ? "Single" : "Scroll"}
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

<main class:single={mode === "single"}>
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
    {:else if mode === "single"}
        <img
            src={chapter.pages[currentPage]?.url}
            alt={`Page ${currentPage + 1}`}
            onerror={handleImageError}
            onload={() => recordProgress(currentPage)} />
    {:else}
        {#each chapter.pages as page, index}
            <img
                src={page.url}
                alt={`Page ${index + 1}`}
                loading={index < 3 ? "eager" : "lazy"}
                onerror={handleImageError}
                onload={() => recordProgress(index)} />
        {/each}
    {/if}
</main>
