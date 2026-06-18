<script lang="ts">
    import type { LibraryManga } from "../../src/database"
    import { sendRuntimeMessage } from "../../src/runtime"
    import { untrack } from "svelte"

    type SearchResult = {
        title: string
        url: string
        sourceId: string
        sourceMangaId: string
        latestChapter?: string
        coverUrl?: string
    }

    type Props = {
        mangas: LibraryManga[]
        onLinked: (mangaId: string) => void
    }

    let { mangas, onLinked }: Props = $props()

    type CardState = {
        searching: boolean
        results: SearchResult[]
        linking: string | null
        message: string
        error: boolean
        searched: boolean
    }

    const cards: Record<string, CardState> = $state({})

    const PAGE_SIZE = 20
    let visibleCount = $state(PAGE_SIZE)
    const visible = $derived(mangas.slice(0, visibleCount))
    const hasMore = $derived(visibleCount < mangas.length)

    function cardOf(id: string): CardState {
        if (!cards[id]) {
            // untrack: lazily initialising a $state property is fine as a side-effect,
            // but Svelte 5 forbids mutations inside derived/template expressions without it.
            untrack(() => {
                cards[id] = { searching: false, results: [], linking: null, message: "", error: false, searched: false }
            })
        }
        return cards[id]!
    }

    function normTitle(s: string): string {
        return s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
    }

    async function dismissManual(manga: LibraryManga) {
        const card = cardOf(manga.id)
        card.searching = true
        card.error = false
        card.message = ""
        try {
            await sendRuntimeMessage({ type: "library:dismiss", mangaId: manga.id })
            onLinked(manga.id)
        } catch (cause) {
            card.error = true
            card.message = cause instanceof Error ? cause.message : "Failed to dismiss."
        } finally {
            card.searching = false
        }
    }

    async function findSources(manga: LibraryManga) {
        const card = cardOf(manga.id)
        card.searching = true
        card.message = ""
        card.error = false
        try {
            const all = await sendRuntimeMessage<SearchResult[]>({ type: "manga:search", query: manga.title })
            const want = normTitle(manga.title)
            card.results = all
                .filter(r => {
                    const t = normTitle(r.title)
                    return t === want || t.includes(want) || want.includes(t)
                })
                .sort((a, b) => (parseFloat(b.latestChapter ?? "0") || 0) - (parseFloat(a.latestChapter ?? "0") || 0))
            card.searched = true
            if (card.results.length === 0) card.message = "No live source found for this title."
        } catch (cause) {
            card.error = true
            card.message = cause instanceof Error ? cause.message : "Search failed."
        } finally {
            card.searching = false
        }
    }

    async function linkSource(manga: LibraryManga, result: SearchResult) {
        const card = cardOf(manga.id)
        card.linking = result.sourceId
        card.message = ""
        card.error = false
        try {
            await sendRuntimeMessage({
                type: "library:switch",
                mangaId: manga.id,
                sourceId: result.sourceId,
                sourceMangaId: result.sourceMangaId,
                mangaUrl: result.url
            })
            await sendRuntimeMessage({ type: "library:covers:backfill" })
            onLinked(manga.id)
        } catch (cause) {
            card.error = true
            card.message = cause instanceof Error ? cause.message : "Link failed — the source may be unreachable."
            card.linking = null
        }
    }

    function sourceDomain(manga: LibraryManga): string {
        try {
            return new URL(manga.mangaUrl ?? manga.sourceUrl).hostname.replace(/^www\./, "")
        } catch {
            return manga.sourceId
        }
    }
</script>

{#if mangas.length > 0}
    <section class="reconcile-section">
        <h2 class="reconcile-heading">
            Source issues — {mangas.length}
            {mangas.length === 1 ? "title needs" : "titles need"} a live source
        </h2>
        <p class="reconcile-hint muted">
            These titles were imported but their original source couldn't be matched. Find them on a live source and
            link to preserve your progress.
        </p>
        <ul class="reconcile-list">
            {#each visible as manga (manga.id)}
                {@const card = cardOf(manga.id)}
                <li class="reconcile-card">
                    <div class="reconcile-meta">
                        <span class="reconcile-title">{manga.title}</span>
                        <span class="reconcile-source muted">
                            Could not find: {sourceDomain(manga)}
                            {#if manga.lastReadChapterNumber != null}
                                · read ch {manga.lastReadChapterNumber}
                            {/if}
                        </span>
                    </div>
                    <div class="reconcile-actions">
                        {#if !card.searched}
                            <div class="reconcile-btns">
                                <button
                                    type="button"
                                    class="btn-outline btn-sm"
                                    disabled={card.searching}
                                    onclick={() => findSources(manga)}>
                                    {card.searching ? "Searching…" : "Find on other sources"}
                                </button>
                                <button
                                    type="button"
                                    class="btn-ghost btn-sm"
                                    disabled={card.searching}
                                    onclick={() => dismissManual(manga)}>
                                    Mark as manual
                                </button>
                            </div>
                        {/if}
                        {#if card.message}
                            <p class="reconcile-msg" class:reconcile-error={card.error}>{card.message}</p>
                        {/if}
                        {#if card.results.length > 0}
                            <ul class="mirror-results">
                                {#each card.results as result}
                                    <li class="mirror-result">
                                        {#if result.coverUrl}
                                            <img
                                                class="mirror-cover"
                                                src={result.coverUrl}
                                                alt={result.title}
                                                loading="lazy" />
                                        {/if}
                                        <div class="mirror-info">
                                            <span class="mirror-source">{result.sourceId}</span>
                                            <span class="mirror-title muted">{result.title}</span>
                                            {#if result.latestChapter}
                                                <span class="mirror-ch muted">ch {result.latestChapter}</span>
                                            {/if}
                                        </div>
                                        <button
                                            type="button"
                                            class="btn-sm"
                                            disabled={card.linking !== null}
                                            onclick={() => linkSource(manga, result)}>
                                            {card.linking === result.sourceId ? "Linking…" : "Link"}
                                        </button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
        {#if hasMore}
            <button type="button" class="btn-outline show-more" onclick={() => (visibleCount += PAGE_SIZE)}>
                Show more ({mangas.length - visibleCount} remaining)
            </button>
        {/if}
    </section>
{/if}

<style>
    .reconcile-section {
        margin-top: 24px;
        border-top: 1px solid var(--border);
        padding-top: 20px;
    }

    .reconcile-heading {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 4px;
        color: var(--warning, #f59e0b);
    }

    .reconcile-hint {
        margin: 0 0 16px;
        font-size: 0.85rem;
    }

    .reconcile-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .reconcile-card {
        background: var(--surface-2, var(--surface));
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .reconcile-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .reconcile-title {
        font-weight: 500;
        font-size: 0.95rem;
    }

    .reconcile-source {
        font-size: 0.8rem;
    }

    .reconcile-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .reconcile-btns {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    .btn-ghost {
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
    }

    .btn-ghost:hover:not(:disabled) {
        color: var(--text, inherit);
    }

    .reconcile-msg {
        font-size: 0.82rem;
        margin: 0;
        color: var(--text-muted, #888);
    }

    .reconcile-error {
        color: var(--error, #ef4444);
        font-weight: 500;
    }

    .mirror-results {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .mirror-result {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 8px 10px;
    }

    .mirror-cover {
        width: 36px;
        height: 50px;
        object-fit: cover;
        border-radius: 3px;
        flex-shrink: 0;
    }

    .mirror-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .mirror-source {
        font-weight: 500;
        font-size: 0.85rem;
    }

    .mirror-title {
        font-size: 0.78rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .mirror-ch {
        font-size: 0.78rem;
    }

    .btn-sm {
        padding: 4px 10px;
        font-size: 0.82rem;
    }

    .show-more {
        margin-top: 12px;
        width: 100%;
    }
</style>
