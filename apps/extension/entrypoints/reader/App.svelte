<script lang="ts">
    import type { ReadingProgress } from "@amr/contracts"
    import type { ResolvedChapter } from "@amr/source-sdk"
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"

    let chapter = $state<ResolvedChapter | undefined>()
    let error = $state("")
    let currentPage = $state(0)
    let mode = $state<"continuous" | "single">("continuous")

    onMount(async () => {
        const url = new URL(location.href).searchParams.get("url")
        if (!url) {
            error = "No chapter URL was provided"
            return
        }

        try {
            chapter = await sendRuntimeMessage<ResolvedChapter>({ type: "reader:resolve", url })
            const progress = await sendRuntimeMessage<ReadingProgress | null>({
                type: "reader:progress:get",
                chapterId: chapter.chapter.id
            })
            currentPage = progress?.pageIndex ?? 0
        } catch (cause) {
            error = cause instanceof Error ? cause.message : "The chapter could not be loaded"
        }
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

    async function closeTab() {
        try {
            const tab = await browser.tabs.getCurrent()
            if (tab?.id !== undefined) {
                await browser.tabs.remove(tab.id)
                return
            }
        } catch {
            // fallthrough
        }
        window.close()
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
    <button type="button" onclick={() => void closeTab()} aria-label="Close reader">Close</button>
    <div>
        <strong>{chapter?.manga.manga.title ?? "Loading chapter"}</strong>
        <span>{chapter?.chapter.title ?? ""}</span>
    </div>
    <div class="controls">
        <span>{chapter ? `${currentPage + 1} / ${chapter.pages.length}` : ""}</span>
        <button type="button" onclick={() => (mode = mode === "continuous" ? "single" : "continuous")}>
            {mode === "continuous" ? "Single page" : "Continuous"}
        </button>
    </div>
</header>

<main class:single={mode === "single"}>
    {#if error}
        <section class="message">
            <h1>Chapter could not be loaded</h1>
            <p>{error}</p>
            <p class="hint">If this is sample data, paste a real MangaDex chapter URL in the Home tab instead.</p>
        </section>
    {:else if !chapter}
        <section class="message"><p>Resolving chapter pages...</p></section>
    {:else if mode === "single"}
        <img
            src={chapter.pages[currentPage]?.url}
            alt={`Page ${currentPage + 1}`}
            onload={() => recordProgress(currentPage)} />
    {:else}
        {#each chapter.pages as page, index}
            <img
                src={page.url}
                alt={`Page ${index + 1}`}
                loading={index < 3 ? "eager" : "lazy"}
                onload={() => recordProgress(index)} />
        {/each}
    {/if}
</main>
