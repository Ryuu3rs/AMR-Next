<script lang="ts">
    import type { LibraryManga } from "../../src/database"
    import type { AppSettings } from "../../src/settings"
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"
    import { sourceOrigins } from "../../src/permissions"

    const sections = ["Home", "Library", "Updates", "Achievements", "Sources", "Data", "Settings"] as const
    let activeSection = $state<(typeof sections)[number]>("Home")
    let library = $state<LibraryManga[]>([])
    let settings = $state<AppSettings | undefined>()
    let loading = $state(true)
    let query = $state("")
    let librarySort = $state<"recent-read" | "recent-added" | "title" | "latest-chapter">("recent-read")
    let addUrl = $state("")
    let addMessage = $state("")
    let adding = $state(false)
    let stats = $state<{
        mangaCount: number
        completedChapters: number
        readingDays: number
        achievements: Array<{
            id: string
            title: string
            description: string
            unlocked: boolean
            progress: number
            target: number
        }>
    }>()
    let dataMessage = $state("")
    let updateStatus = $state<{
        checked: number
        updated: number
        failed: number
        checkedAt: number
    } | null>(null)
    let checkingUpdates = $state(false)
    let confirmingRemove = $state<string | null>(null)
    let hasPermission = $state(false)
    let browseQuery = $state("")
    let searchResults = $state<Array<{ id: string; title: string; coverUrl?: string; status: string }>>([])
    let searchLoading = $state(false)
    let selectedManga = $state<{ id: string; title: string; coverUrl?: string } | null>(null)
    let mangaChapters = $state<Array<{ id: string; title: string; chapter?: string; url: string }>>([])
    let chaptersLoading = $state(false)

    function isSeedData(manga: LibraryManga): boolean {
        return manga.id.startsWith("seed-")
    }

    onMount(async () => {
        await load()
        hasPermission = await sendRuntimeMessage<boolean>({ type: "source:permission:check" })
    })

    async function load() {
        loading = true
        try {
            ;[library, settings, stats, updateStatus] = await Promise.all([
                sendRuntimeMessage<LibraryManga[]>({ type: "library:list" }),
                sendRuntimeMessage<AppSettings>({ type: "settings:get" }),
                sendRuntimeMessage<typeof stats>({ type: "stats:get" }),
                sendRuntimeMessage<typeof updateStatus>({ type: "updates:get" })
            ])
        } finally {
            loading = false
        }
    }

    function openInBrowser(manga: LibraryManga, active = true) {
        void browser.tabs.create({ url: manga.sourceUrl, active })
    }

    function openInReader(manga: LibraryManga) {
        void browser.tabs.create({
            url: browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(manga.sourceUrl)}`)
        })
    }

    // Primary click honors the openChapterIn setting. Ctrl/middle-click always
    // opens the source page directly in a background tab (G11).
    function read(manga: LibraryManga, event?: MouseEvent) {
        if (event && (event.ctrlKey || event.metaKey || event.button === 1)) {
            openInBrowser(manga, false)
            return
        }
        if (settings?.openChapterIn === "browser") openInBrowser(manga)
        else openInReader(manga)
    }

    async function remove(mangaId: string) {
        await sendRuntimeMessage({ type: "library:remove", mangaId })
        library = library.filter(m => m.id !== mangaId)
    }

    async function rate(manga: LibraryManga, value: number) {
        const next = manga.rating === value ? 0 : value
        await sendRuntimeMessage({ type: "library:rate", mangaId: manga.id, rating: next })
        library = library.map(m =>
            m.id === manga.id ? { ...m, ...(next === 0 ? { rating: undefined } : { rating: next }) } : m
        )
    }

    async function changeAutoAdd(enabled: boolean) {
        settings = await sendRuntimeMessage<AppSettings>({
            type: "settings:update",
            settings: { autoAdd: enabled }
        })
    }

    async function updateSetting(patch: Partial<AppSettings>) {
        settings = await sendRuntimeMessage<AppSettings>({ type: "settings:update", settings: patch })
    }

    async function addByUrl() {
        adding = true
        addMessage = ""
        try {
            const parsed = new URL(addUrl)
            const granted = await browser.permissions.request({ origins: sourceOrigins() })
            if (!granted) {
                addMessage = "Site access was not granted."
                return
            }
            const result = await sendRuntimeMessage<{ supported: boolean; added?: boolean }>({
                type: "page:capture",
                url: parsed.toString()
            })
            if (!result.supported) {
                addMessage = "This URL is not a supported chapter."
                return
            }
            addMessage = result.added ? "Added to your library." : "Automatic adding is disabled."
            addUrl = ""
            await load()
        } catch (cause) {
            addMessage = cause instanceof Error ? cause.message : "The URL could not be added."
        } finally {
            adding = false
        }
    }

    async function exportData() {
        const envelope = await sendRuntimeMessage<unknown>({ type: "data:export" })
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `amr-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        dataMessage = "Backup exported."
    }

    async function importData(file: File) {
        try {
            const envelope: unknown = JSON.parse(await file.text())
            const result = await sendRuntimeMessage<{ manga: number; chapters: number }>({
                type: "data:import",
                envelope
            })
            dataMessage = `Imported ${result.manga} manga and ${result.chapters} chapters.`
            await load()
        } catch (cause) {
            dataMessage = cause instanceof Error ? cause.message : "The backup could not be imported."
        }
    }

    async function checkForUpdates() {
        checkingUpdates = true
        try {
            updateStatus = await sendRuntimeMessage<NonNullable<typeof updateStatus>>({
                type: "updates:check"
            })
            await load()
        } finally {
            checkingUpdates = false
        }
    }

    async function changeUpdateInterval(value: string) {
        settings = await sendRuntimeMessage<AppSettings>({
            type: "settings:update",
            settings: { updateIntervalHours: Number(value) as 0 | 6 | 12 | 24 }
        })
    }

    async function seedData() {
        try {
            await sendRuntimeMessage({ type: "data:seed" })
            await load()
            dataMessage = "Sample data loaded."
        } catch (cause) {
            dataMessage = cause instanceof Error ? cause.message : "Failed to load samples."
        }
    }

    async function checkPermission() {
        hasPermission = await sendRuntimeMessage<boolean>({ type: "source:permission:check" })
    }

    async function grantPermission() {
        hasPermission = await browser.permissions.request({ origins: sourceOrigins() })
    }

    async function doSearch() {
        if (!browseQuery.trim()) return
        searchLoading = true
        searchResults = []
        selectedManga = null
        try {
            searchResults = await sendRuntimeMessage<typeof searchResults>({
                type: "manga:search",
                query: browseQuery.trim()
            })
        } catch {
            searchResults = []
        } finally {
            searchLoading = false
        }
    }

    async function browseChapters(manga: { id: string; title: string; coverUrl?: string }) {
        selectedManga = manga
        chaptersLoading = true
        mangaChapters = []
        try {
            mangaChapters = await sendRuntimeMessage<typeof mangaChapters>({
                type: "manga:chapters",
                mangaId: manga.id
            })
        } catch {
            mangaChapters = []
        } finally {
            chaptersLoading = false
        }
    }

    async function readChapter(chapterUrl: string) {
        void browser.tabs.create({
            url: browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(chapterUrl)}`)
        })
    }

    const visibleLibrary = $derived.by(() => {
        const filtered = library.filter(m => m.title.toLowerCase().includes(query.trim().toLowerCase()))
        const sorted = [...filtered]
        switch (librarySort) {
            case "recent-read":
                sorted.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || b.updatedAt - a.updatedAt)
                break
            case "recent-added":
                sorted.sort((a, b) => b.addedAt - a.addedAt)
                break
            case "title":
                sorted.sort((a, b) => a.title.localeCompare(b.title))
                break
            case "latest-chapter":
                sorted.sort((a, b) => (b.latestChapterNumber ?? 0) - (a.latestChapterNumber ?? 0))
                break
        }
        return sorted
    })
</script>

<div class="shell">
    <aside>
        <div class="brand">
            <img src="/icons/icon_48.png" alt="" />
            <span>AMR <strong>Next</strong></span>
        </div>
        <nav aria-label="Main navigation">
            {#each sections as section}
                <button
                    type="button"
                    class:active={activeSection === section}
                    onclick={() => (activeSection = section)}>
                    {section}
                </button>
            {/each}
        </nav>
    </aside>

    <main>
        {#if activeSection === "Home"}
            <h1>Home</h1>
            {#if loading}
                <p class="muted">Loading...</p>
            {:else if library.length === 0}
                <div class="empty-state">
                    <div class="empty-icon">📖</div>
                    <h2>Your shelf is empty</h2>
                    <p>Open a MangaDex chapter and click "Read in AMR", or paste a chapter URL below.</p>
                    <form
                        class="url-form"
                        onsubmit={e => {
                            e.preventDefault()
                            void addByUrl()
                        }}>
                        <input bind:value={addUrl} type="url" required placeholder="https://mangadex.org/chapter/..." />
                        <button type="submit" disabled={adding}>{adding ? "Adding..." : "Add chapter"}</button>
                    </form>
                    {#if addMessage}<p class="notice">{addMessage}</p>{/if}
                </div>
            {:else}
                <div class="home-feature">
                    <div class="home-feature-cover">
                        {#if library[0]?.coverUrl}<img src={library[0].coverUrl} alt="" />{:else}<span
                                class="cover-initial">{library[0]?.title[0]}</span
                            >{/if}
                    </div>
                    <div class="home-feature-body">
                        <p class="eyebrow">Continue reading</p>
                        <h2 class="feature-title">{library[0]?.title}</h2>
                        <p class="muted">{library[0]?.sourceId}</p>
                        <button type="button" onclick={() => library[0] && read(library[0])}>Open reader</button>
                    </div>
                </div>

                {#if library.length > 1}
                    <p class="shelf-label">Recently added</p>
                    <div class="poster-grid">
                        {#each library.slice(1, 7) as manga}
                            <article>
                                <div class="poster-wrap">
                                    <button
                                        type="button"
                                        class="poster"
                                        onclick={e => read(manga, e)}
                                        onauxclick={e => read(manga, e)}>
                                        {#if manga.coverUrl}<img src={manga.coverUrl} alt={manga.title} />{:else}<span
                                                class="cover-initial">{manga.title[0]}</span
                                            >{/if}
                                    </button>
                                    <div class="poster-hover"><span>Continue</span></div>
                                </div>
                                <p class="poster-title">{manga.title}</p>
                            </article>
                        {/each}
                    </div>
                {/if}

                <form
                    class="url-form"
                    onsubmit={e => {
                        e.preventDefault()
                        void addByUrl()
                    }}>
                    <input bind:value={addUrl} type="url" required placeholder="Add chapter by URL..." />
                    <button type="submit" disabled={adding}>{adding ? "Adding..." : "Add"}</button>
                </form>
                {#if addMessage}<p class="notice">{addMessage}</p>{/if}
            {/if}
        {:else if activeSection === "Library"}
            <div class="page-head">
                <h1>Library</h1>
                <div class="library-controls">
                    <select aria-label="Sort library" bind:value={librarySort}>
                        <option value="recent-read">Recently read</option>
                        <option value="recent-added">Recently added</option>
                        <option value="title">Title (A–Z)</option>
                        <option value="latest-chapter">Latest chapter</option>
                    </select>
                    <input bind:value={query} aria-label="Search library" placeholder="Search titles..." />
                </div>
            </div>
            <form
                class="url-form"
                onsubmit={e => {
                    e.preventDefault()
                    void addByUrl()
                }}>
                <input bind:value={addUrl} type="url" required placeholder="Add chapter by URL..." />
                <button type="submit" disabled={adding}>{adding ? "Adding..." : "Add"}</button>
            </form>
            {#if addMessage}<p class="notice">{addMessage}</p>{/if}
            {#if visibleLibrary.length === 0}
                <p class="muted" style="margin-top:16px">{query ? "No titles match." : "Your library is empty."}</p>
            {:else}
                <div class="poster-grid">
                    {#each visibleLibrary as manga}
                        <article>
                            <div class="poster-wrap">
                                <button
                                    type="button"
                                    class="poster"
                                    class:sample={isSeedData(manga)}
                                    onclick={e => read(manga, e)}
                                    onauxclick={e => read(manga, e)}>
                                    {#if manga.coverUrl}<img src={manga.coverUrl} alt={manga.title} />{:else}<span
                                            class="cover-initial">{manga.title[0]}</span
                                        >{/if}
                                    {#if isSeedData(manga)}<span class="sample-chip">Sample</span>{/if}
                                    {#if !isSeedData(manga) && manga.latestChapterId && manga.lastReadChapterId && manga.latestChapterId !== manga.lastReadChapterId}
                                        <span class="new-chip">New</span>
                                    {/if}
                                </button>
                                <button
                                    type="button"
                                    class="poster-menu-btn"
                                    aria-label="Options"
                                    onclick={e => {
                                        e.stopPropagation()
                                        confirmingRemove = confirmingRemove === manga.id ? null : manga.id
                                    }}>⋯</button>
                                {#if confirmingRemove === manga.id}
                                    <div class="poster-confirm">
                                        <p>Remove from library?</p>
                                        <div class="poster-confirm-actions">
                                            <button
                                                type="button"
                                                class="confirm-remove-btn"
                                                onclick={() => {
                                                    void remove(manga.id)
                                                    confirmingRemove = null
                                                }}>Remove</button>
                                            <button
                                                type="button"
                                                class="confirm-cancel-btn"
                                                onclick={() => (confirmingRemove = null)}>Cancel</button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                            <p class="poster-title">{manga.title}</p>
                            <p class="poster-sub">{manga.sourceId}</p>
                            {#if manga.lastReadChapterNumber !== undefined || manga.latestChapterNumber !== undefined}
                                <p class="poster-chapter">
                                    {manga.lastReadChapterNumber !== undefined
                                        ? `Ch ${manga.lastReadChapterNumber}`
                                        : "Unread"}{#if manga.latestChapterNumber !== undefined}<span class="muted">
                                            / {manga.latestChapterNumber}</span
                                        >{/if}
                                </p>
                            {/if}
                            <div class="poster-rating" role="group" aria-label={`Rate ${manga.title}`}>
                                {#each [1, 2, 3, 4, 5] as star}
                                    <button
                                        type="button"
                                        class="star"
                                        class:filled={(manga.rating ?? 0) >= star}
                                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                                        aria-pressed={(manga.rating ?? 0) >= star}
                                        onclick={() => void rate(manga, star)}>★</button>
                                {/each}
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        {:else if activeSection === "Updates"}
            <div class="page-head">
                <h1>Updates</h1>
                <button type="button" onclick={checkForUpdates} disabled={checkingUpdates}>
                    {checkingUpdates ? "Checking..." : "Check now"}
                </button>
            </div>
            <p class="muted" style="margin-bottom:20px">
                {updateStatus
                    ? `Last checked ${new Date(updateStatus.checkedAt).toLocaleString()} — ${updateStatus.updated} updated, ${updateStatus.failed} failed`
                    : "No update check has run yet. Click Check now to scan for new chapters."}
            </p>
            {#if library.length === 0}
                <p class="muted">No manga in library to check.</p>
            {:else}
                <div class="update-list">
                    {#each library as manga}
                        {@const hasNew = Boolean(
                            manga.latestChapterId &&
                            manga.lastReadChapterId &&
                            manga.latestChapterId !== manga.lastReadChapterId
                        )}
                        {@const neverRead = Boolean(manga.latestChapterId && !manga.lastReadChapterId)}
                        <div class="update-row">
                            <div class="update-cover">
                                {#if manga.coverUrl}<img src={manga.coverUrl} alt={manga.title} />{:else}<span
                                        >{manga.title[0]}</span
                                    >{/if}
                            </div>
                            <div class="update-info">
                                <p class="update-title">{manga.title}</p>
                                <p class="muted">{new Date(manga.updatedAt).toLocaleDateString()}</p>
                            </div>
                            {#if hasNew}
                                <span class="badge-new">New chapter</span>
                            {:else if neverRead}
                                <span class="badge-unread">Unread</span>
                            {:else}
                                <span class="badge-ok-sm">Up to date</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        {:else if activeSection === "Achievements"}
            <h1>Achievements</h1>
            <div class="stat-row">
                <div class="stat-box"><strong>{stats?.completedChapters ?? 0}</strong><span>Completed</span></div>
                <div class="stat-box"><strong>{stats?.mangaCount ?? 0}</strong><span>Saved</span></div>
                <div class="stat-box"><strong>{stats?.readingDays ?? 0}</strong><span>Active days</span></div>
            </div>
            <div class="achievement-list">
                {#each stats?.achievements ?? [] as a}
                    <div class="achievement" class:unlocked={a.unlocked}>
                        <span class="ach-icon">{a.unlocked ? "★" : "☆"}</span>
                        <div class="ach-body">
                            <p class="ach-title">{a.title}</p>
                            <p class="muted">{a.description}</p>
                            {#if !a.unlocked}
                                <div class="progress-track">
                                    <div class="progress-fill" style="width:{(a.progress / a.target) * 100}%"></div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {:else if activeSection === "Sources"}
            <h1>Sources</h1>

            {#if !hasPermission}
                <div class="permission-banner">
                    <div>
                        <p class="row-label">Site access required</p>
                        <p class="muted">
                            Grant permissions to browse MangaDex and read chapters from all supported sites.
                        </p>
                    </div>
                    <button type="button" onclick={grantPermission}>Grant access</button>
                </div>
            {/if}

            <div class="source-list">
                <div class="source-item">
                    <div class="source-identity">
                        <p class="source-name">MangaDex</p>
                        <span class="badge-active">Browse + Read</span>
                    </div>
                    <p class="muted">Search manga, browse chapters, read directly. Full support.</p>
                    {#if hasPermission}
                        <form
                            class="search-bar"
                            onsubmit={e => {
                                e.preventDefault()
                                void doSearch()
                            }}>
                            <input
                                bind:value={browseQuery}
                                placeholder="Search manga titles..."
                                aria-label="Search manga" />
                            <button type="submit" disabled={searchLoading}>
                                {searchLoading ? "Searching..." : "Search"}
                            </button>
                        </form>
                    {/if}
                </div>
                <div class="source-item">
                    <div class="source-identity">
                        <p class="source-name">MangaRead.org</p>
                        <span class="badge-active">Read</span>
                    </div>
                    <p class="muted">Paste a chapter URL to read. Supports Madara-theme manga sites.</p>
                </div>
                <div class="source-item">
                    <div class="source-identity">
                        <p class="source-name">Mgeko.cc</p>
                        <span class="badge-active">Read</span>
                    </div>
                    <p class="muted">Paste a chapter URL to read from Mgeko.</p>
                </div>
            </div>

            {#if selectedManga}
                <div class="chapters-panel">
                    <button
                        type="button"
                        class="btn-back"
                        onclick={() => {
                            selectedManga = null
                            mangaChapters = []
                        }}>← Back to search</button>
                    <h2 class="chapters-title">{selectedManga.title}</h2>
                    {#if chaptersLoading}
                        <p class="muted">Loading chapters...</p>
                    {:else if mangaChapters.length === 0}
                        <p class="muted">No English chapters found.</p>
                    {:else}
                        <div class="chapter-list">
                            {#each mangaChapters as ch}
                                <div class="chapter-row">
                                    <p class="chapter-title">{ch.title}</p>
                                    <button type="button" onclick={() => void readChapter(ch.url)}>Read</button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else if searchResults.length > 0}
                <div class="search-results">
                    {#each searchResults as result}
                        <div class="search-result">
                            <div class="result-cover">
                                {#if result.coverUrl}<img src={result.coverUrl} alt={result.title} />{:else}<span
                                        >{result.title[0]}</span
                                    >{/if}
                            </div>
                            <div class="result-info">
                                <p class="result-title">{result.title}</p>
                                <p class="muted">{result.status}</p>
                            </div>
                            <button type="button" onclick={() => void browseChapters(result)}>Chapters</button>
                        </div>
                    {/each}
                </div>
            {/if}
        {:else if activeSection === "Data"}
            <h1>Import & Export</h1>
            <div class="data-list">
                <div class="data-row">
                    <div>
                        <p class="row-label">Backup library</p>
                        <p class="muted">Export manga, chapters, progress, and history as JSON.</p>
                    </div>
                    <button type="button" onclick={exportData}>Export</button>
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Restore backup</p>
                        <p class="muted">Import a previously exported AMR backup file.</p>
                    </div>
                    <label class="file-label">
                        Import
                        <input
                            type="file"
                            accept="application/json,.json"
                            onchange={e => {
                                const f = e.currentTarget.files?.[0]
                                if (f) void importData(f)
                            }} />
                    </label>
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Sample data</p>
                        <p class="muted">
                            Load test chapters from MangaDex, MangaRead, and Mgeko to explore the reader.
                        </p>
                    </div>
                    <button type="button" class="btn-outline" onclick={seedData}>Load samples</button>
                </div>
            </div>
            {#if dataMessage}<p class="notice">{dataMessage}</p>{/if}
        {:else}
            <h1>Settings</h1>
            <div class="settings-list">
                <div class="settings-row">
                    <div>
                        <p class="row-label">Auto-add manga</p>
                        <p class="muted">Save titles automatically when a supported chapter is opened.</p>
                    </div>
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={settings?.autoAdd ?? true}
                            onchange={e => changeAutoAdd(e.currentTarget.checked)} />
                        <span class="track"></span>
                    </label>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Update schedule</p>
                        <p class="muted">How often background checks run for new chapters.</p>
                    </div>
                    <select
                        aria-label="Update schedule"
                        value={settings?.updateIntervalHours ?? 12}
                        onchange={e => changeUpdateInterval(e.currentTarget.value)}>
                        <option value="0">Manual only</option>
                        <option value="6">Every 6 h</option>
                        <option value="12">Every 12 h</option>
                        <option value="24">Daily</option>
                    </select>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Reading direction</p>
                        <p class="muted">Left-to-right, right-to-left (manga), or vertical (webtoon).</p>
                    </div>
                    <select
                        aria-label="Reading direction"
                        value={settings?.readingDirection ?? "ltr"}
                        onchange={e =>
                            void updateSetting({
                                readingDirection: e.currentTarget.value as "ltr" | "rtl" | "vertical"
                            })}>
                        <option value="ltr">Left to right</option>
                        <option value="rtl">Right to left</option>
                        <option value="vertical">Vertical</option>
                    </select>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Page fit</p>
                        <p class="muted">How pages are scaled to the viewport.</p>
                    </div>
                    <select
                        aria-label="Page fit"
                        value={settings?.pageFit ?? "width"}
                        onchange={e =>
                            void updateSetting({
                                pageFit: e.currentTarget.value as "width" | "height" | "contain" | "original"
                            })}>
                        <option value="width">Fit width</option>
                        <option value="height">Fit height</option>
                        <option value="contain">Fit screen</option>
                        <option value="original">Original size</option>
                    </select>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Show page number</p>
                        <p class="muted">Overlay the current page number while reading.</p>
                    </div>
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={settings?.showPageNumber ?? true}
                            onchange={e => void updateSetting({ showPageNumber: e.currentTarget.checked })} />
                        <span class="track"></span>
                    </label>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Preload pages</p>
                        <p class="muted">How many upcoming pages load eagerly (0–10).</p>
                    </div>
                    <input
                        type="number"
                        min="0"
                        max="10"
                        aria-label="Preload pages"
                        value={settings?.preloadPages ?? 3}
                        onchange={e =>
                            void updateSetting({
                                preloadPages: Math.max(0, Math.min(10, Number(e.currentTarget.value) || 0))
                            })} />
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Open chapters in</p>
                        <p class="muted">
                            The built-in reader, or the source site in your browser. (Ctrl/middle-click always opens the
                            source.)
                        </p>
                    </div>
                    <select
                        aria-label="Open chapters in"
                        value={settings?.openChapterIn ?? "reader"}
                        onchange={e =>
                            void updateSetting({ openChapterIn: e.currentTarget.value as "reader" | "browser" })}>
                        <option value="reader">Built-in reader</option>
                        <option value="browser">Source site</option>
                    </select>
                </div>
            </div>
        {/if}
    </main>
</div>
