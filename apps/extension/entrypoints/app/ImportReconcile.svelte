<script lang="ts">
    import type { LibraryManga } from "../../src/database"
    import { sendRuntimeMessage } from "../../src/runtime"

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
        searched: boolean
    }

    const state = $state<Record<string, CardState>>({})

    function cardOf(id: string): CardState {
        if (!state[id]) {
            state[id] = { searching: false, results: [], linking: null, message: "", searched: false }
        }
        return state[id]!
    }

    function normTitle(s: string): string {
        return s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
    }

    async function findSources(manga: LibraryManga) {
        const card = cardOf(manga.id)
        card.searching = true
        card.message = ""
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
            card.message = cause instanceof Error ? cause.message : "Search failed."
        } finally {
            card.searching = false
        }
    }

    async function linkSource(manga: LibraryManga, result: SearchResult) {
        const card = cardOf(manga.id)
        card.linking = result.sourceId
        card.message = ""
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
            card.message = cause instanceof Error ? cause.message : "Link failed."
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
            {#each mangas as manga (manga.id)}
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
                            <button
                                type="button"
                                class="btn-outline btn-sm"
                                disabled={card.searching}
                                onclick={() => findSources(manga)}>
                                {card.searching ? "Searching…" : "Find on other sources"}
                            </button>
                        {/if}
                        {#if card.message}
                            <p class="reconcile-msg muted">{card.message}</p>
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

    .reconcile-msg {
        font-size: 0.82rem;
        margin: 0;
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
</style>
