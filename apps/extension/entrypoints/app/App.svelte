<script lang="ts">
    import type { LibraryManga } from "../../src/database"
    import type { AppSettings } from "../../src/settings"
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"

    const sections = ["Home", "Library", "Updates", "Achievements", "Sources", "Data", "Settings"] as const
    let activeSection = $state<(typeof sections)[number]>("Home")
    let library = $state<LibraryManga[]>([])
    let settings = $state<AppSettings | undefined>()
    let loading = $state(true)
    let query = $state("")
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

    onMount(load)

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

    function read(manga: LibraryManga) {
        void browser.tabs.create({
            url: browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(manga.sourceUrl)}`)
        })
    }

    async function remove(mangaId: string) {
        await sendRuntimeMessage({ type: "library:remove", mangaId })
        library = library.filter(manga => manga.id !== mangaId)
    }

    async function changeAutoAdd(enabled: boolean) {
        settings = await sendRuntimeMessage<AppSettings>({
            type: "settings:update",
            settings: { autoAdd: enabled }
        })
    }

    async function addByUrl() {
        adding = true
        addMessage = ""
        try {
            const parsed = new URL(addUrl)
            const granted = await browser.permissions.request({
                origins: ["https://mangadex.org/*", "https://api.mangadex.org/*", "https://uploads.mangadex.org/*"]
            })
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
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `amr-backup-${new Date().toISOString().slice(0, 10)}.json`
        anchor.click()
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

    async function seedData() {
        await sendRuntimeMessage({ type: "data:seed" })
        await load()
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

    const visibleLibrary = $derived(
        library.filter(manga => manga.title.toLowerCase().includes(query.trim().toLowerCase()))
    )
</script>

<div class="shell">
    <aside>
        <div class="brand">
            <img src="/icons/icon_48.png" alt="" />
            <div><strong>AMR Next</strong><span>Local-first manga</span></div>
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
            <p class="eyebrow">Your reading shelf</p>
            <h1>Home</h1>
            {#if loading}
                <p>Loading your library...</p>
            {:else if library.length === 0}
                <section class="empty">
                    <h2>Your reading shelf is empty</h2>
                    <p>Open a MangaDex chapter and choose Read in AMR to begin.</p>
                </section>
            {:else}
                <section class="hero">
                    <div>
                        <span>Continue reading</span>
                        <h2>{library[0]?.title}</h2>
                    </div>
                    <button type="button" onclick={() => library[0] && read(library[0])}>Continue</button>
                </section>
                <section class="library recent-grid">
                    {#each library.slice(0, 6) as manga}
                        <article onclick={() => read(manga)}>
                            <div class="cover">
                                {#if manga.coverUrl}<img src={manga.coverUrl} alt="" />{:else}<span
                                        >{manga.title[0]}</span
                                    >{/if}
                            </div>
                            <div class="manga-title">{manga.title}</div>
                            <div class="manga-overlay">
                                <button
                                    type="button"
                                    onclick={e => {
                                        e.stopPropagation()
                                        read(manga)
                                    }}>Continue</button>
                                <button
                                    class="quiet"
                                    type="button"
                                    onclick={e => {
                                        e.stopPropagation()
                                        void remove(manga.id)
                                    }}>Remove</button>
                            </div>
                        </article>
                    {/each}
                </section>
            {/if}
            <section class="add-url">
                <div>
                    <h2>Add by URL</h2>
                    <p>Paste a supported chapter URL to resolve and save it locally.</p>
                </div>
                <form
                    onsubmit={event => {
                        event.preventDefault()
                        void addByUrl()
                    }}>
                    <input bind:value={addUrl} type="url" required placeholder="https://mangadex.org/chapter/..." />
                    <button type="submit" disabled={adding}>{adding ? "Detecting..." : "Add"}</button>
                </form>
                {#if addMessage}<p>{addMessage}</p>{/if}
            </section>
        {:else if activeSection === "Library"}
            <p class="eyebrow">Saved locally</p>
            <div class="title-row">
                <h1>Library</h1>
                <input bind:value={query} aria-label="Search library" placeholder="Search title" />
            </div>
            <section class="library">
                {#each visibleLibrary as manga}
                    <article onclick={() => read(manga)}>
                        <div class="cover">
                            {#if manga.coverUrl}<img src={manga.coverUrl} alt="" />{:else}<span>{manga.title[0]}</span
                                >{/if}
                        </div>
                        <div class="manga-title">{manga.title}</div>
                        <div class="manga-overlay">
                            <button
                                type="button"
                                onclick={e => {
                                    e.stopPropagation()
                                    read(manga)
                                }}>Continue</button>
                            <button
                                class="quiet"
                                type="button"
                                onclick={e => {
                                    e.stopPropagation()
                                    void remove(manga.id)
                                }}>Remove</button>
                        </div>
                    </article>
                {:else}
                    <p>No titles match this search.</p>
                {/each}
            </section>
        {:else if activeSection === "Updates"}
            <p class="eyebrow">Background chapter checks</p>
            <div class="title-row">
                <h1>Updates</h1>
                <button type="button" onclick={checkForUpdates} disabled={checkingUpdates}>
                    {checkingUpdates ? "Checking..." : "Check now"}
                </button>
            </div>
            <section class="stat-grid">
                <article><strong>{updateStatus?.updated ?? 0}</strong><span>Titles updated</span></article>
                <article><strong>{updateStatus?.checked ?? 0}</strong><span>Titles checked</span></article>
                <article><strong>{updateStatus?.failed ?? 0}</strong><span>Checks needing attention</span></article>
            </section>
            <section class="panel update-summary">
                <h2>Latest run</h2>
                <p>
                    {updateStatus
                        ? `Checked ${new Date(updateStatus.checkedAt).toLocaleString()}`
                        : "No update check has run yet."}
                </p>
            </section>
        {:else if activeSection === "Achievements"}
            <p class="eyebrow">Stored on this device</p>
            <h1>Achievements</h1>
            <section class="stat-grid">
                <article><strong>{stats?.completedChapters ?? 0}</strong><span>Chapters completed</span></article>
                <article><strong>{stats?.mangaCount ?? 0}</strong><span>Manga saved</span></article>
                <article><strong>{stats?.readingDays ?? 0}</strong><span>Active days</span></article>
            </section>
            <section class="achievements">
                {#each stats?.achievements ?? [] as achievement}
                    <article class:unlocked={achievement.unlocked}>
                        <span
                            >{achievement.unlocked
                                ? "Unlocked"
                                : `${achievement.progress} / ${achievement.target}`}</span>
                        <h2>{achievement.title}</h2>
                        <p>{achievement.description}</p>
                    </article>
                {/each}
            </section>
        {:else if activeSection === "Sources"}
            <p class="eyebrow">Site access</p>
            <h1>Sources</h1>
            <section class="panel">
                <h2>MangaDex</h2>
                <p>API source for manga metadata, chapters, and reader pages.</p>
                <span class="status">Available</span>
            </section>
        {:else if activeSection === "Data"}
            <p class="eyebrow">Portable local data</p>
            <h1>Import and Export</h1>
            <section class="panel data-actions">
                <div>
                    <h2>Backup your library</h2>
                    <p>Export manga, chapters, progress, and history as a versioned JSON file.</p>
                </div>
                <button type="button" onclick={exportData}>Export backup</button>
                <label class="import-button">
                    Import backup
                    <input
                        type="file"
                        accept="application/json,.json"
                        onchange={event => {
                            const file = event.currentTarget.files?.[0]
                            if (file) void importData(file)
                        }} />
                </label>
                {#if library.length === 0}
                    <button type="button" onclick={seedData}>Load sample data</button>
                {/if}
                {#if dataMessage}<p>{dataMessage}</p>{/if}
            </section>
        {:else}
            <p class="eyebrow">Preferences</p>
            <h1>Settings</h1>
            <section class="panel setting">
                <div>
                    <h2>Automatically add manga</h2>
                    <p>Add a title to the local library when a supported chapter is opened.</p>
                </div>
                <input
                    type="checkbox"
                    aria-label="Automatically add manga"
                    checked={settings?.autoAdd ?? true}
                    onchange={event => changeAutoAdd(event.currentTarget.checked)} />
            </section>
            <section class="panel setting">
                <div>
                    <h2>Chapter update schedule</h2>
                    <p>Browser alarms run periodic checks without keeping a background loop alive.</p>
                </div>
                <select
                    aria-label="Chapter update schedule"
                    value={settings?.updateIntervalHours ?? 12}
                    onchange={event => changeUpdateInterval(event.currentTarget.value)}>
                    <option value="0">Manual only</option>
                    <option value="6">Every 6 hours</option>
                    <option value="12">Every 12 hours</option>
                    <option value="24">Daily</option>
                </select>
            </section>
        {/if}
    </main>
</div>
