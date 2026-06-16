<script lang="ts">
    import type { LibraryManga } from "../../src/database"
    import type { AppSettings } from "../../src/settings"
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"
    import { sourceOrigins, syncOrigins } from "../../src/permissions"
    import { migrateLegacyImport } from "../../src/legacy-import"
    import ActivityHeatmap from "./ActivityHeatmap.svelte"
    import ImportReconcile from "./ImportReconcile.svelte"

    type SyncStatus = {
        hasToken: boolean
        gistId?: string
        autoSync: boolean
        lastPushedAt?: number
        lastPulledAt?: number
    }

    const sections = [
        "Home",
        "Library",
        "Tags",
        "Updates",
        "History",
        "Achievements",
        "Sources",
        "Data",
        "Settings"
    ] as const
    let activeSection = $state<(typeof sections)[number]>("Home")
    let library = $state<LibraryManga[]>([])
    let settings = $state<AppSettings | undefined>()
    let loading = $state(true)
    let query = $state("")
    let librarySort = $state<"recent-read" | "recent-added" | "title" | "latest-chapter">("recent-read")
    let categoryFilter = $state("")
    let selectMode = $state(false)
    let selectedIds = $state<Set<string>>(new Set())
    let bulkCategory = $state("")

    function toggleSelect(id: string) {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        selectedIds = next
    }

    function clearSelection() {
        selectedIds = new Set()
        selectMode = false
    }

    async function bulkRemove() {
        const ids = [...selectedIds]
        for (const id of ids) await sendRuntimeMessage({ type: "library:remove", mangaId: id })
        library = library.filter(m => !selectedIds.has(m.id))
        clearSelection()
    }

    async function bulkAddCategory() {
        const tags = bulkCategory
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        if (tags.length === 0) return
        for (const id of [...selectedIds]) {
            const m = library.find(x => x.id === id)
            if (!m) continue
            const categories = [...new Set([...(m.categories ?? []), ...tags])]
            await sendRuntimeMessage({ type: "library:categories", mangaId: id, categories })
            library = library.map(x => applyCategories(x, id, categories))
        }
        bulkCategory = ""
        clearSelection()
    }

    async function bulkManual(on: boolean) {
        for (const id of [...selectedIds]) await sendRuntimeMessage({ type: "library:manual", mangaId: id, manual: on })
        library = library.map(m => (selectedIds.has(m.id) ? { ...m, manualTracking: on } : m))
        clearSelection()
    }

    let showDuplicates = $state(false)

    const duplicateGroups = $derived.by(() => {
        const byKey = new Map<string, LibraryManga[]>()
        for (const m of library) {
            if (isSeedData(m)) continue
            const key = (m.normalizedTitle || m.title).trim().toLowerCase()
            const arr = byKey.get(key) ?? []
            arr.push(m)
            byKey.set(key, arr)
        }
        return [...byKey.values()].filter(group => group.length > 1)
    })

    async function mergeDuplicates(group: LibraryManga[]) {
        // Keep the entry with the most progress (then most recent) as primary.
        const primary = [...group].sort(
            (a, b) => (b.lastReadChapterNumber ?? 0) - (a.lastReadChapterNumber ?? 0) || b.updatedAt - a.updatedAt
        )[0]
        if (!primary) return
        const maxRead = Math.max(...group.map(m => m.lastReadChapterNumber ?? 0))
        const maxLatest = Math.max(...group.map(m => m.latestChapterNumber ?? 0))
        const categories = [...new Set(group.flatMap(m => m.categories ?? []))]
        if (maxRead > 0 || maxLatest > 0) {
            await sendRuntimeMessage({
                type: "library:numbers",
                mangaId: primary.id,
                lastReadChapterNumber: maxRead > 0 ? maxRead : null,
                latestChapterNumber: maxLatest > 0 ? maxLatest : null
            })
        }
        if (categories.length > 0) {
            await sendRuntimeMessage({ type: "library:categories", mangaId: primary.id, categories })
        }
        for (const m of group) {
            if (m.id !== primary.id) await sendRuntimeMessage({ type: "library:remove", mangaId: m.id })
        }
        await load()
    }
    let failedCovers = $state<Set<string>>(new Set())
    let refreshingCovers = $state(false)
    let syncStatus = $state<SyncStatus | undefined>()
    let syncToken = $state("")
    let syncGistId = $state("")
    let syncMessage = $state("")
    let syncing = $state(false)

    function coverFailed(id: string) {
        const next = new Set(failedCovers)
        next.add(id)
        failedCovers = next
    }
    let addUrl = $state("")
    let addMessage = $state("")
    let adding = $state(false)
    let stats = $state<{
        mangaCount: number
        completedChapters: number
        readingDays: number
        currentStreak: number
        longestStreak: number
        chaptersThisWeek: number
        chaptersToday: number
        ratedCount?: number
        categoriesCount?: number
        downloadedChapters?: number
        sourcesUsed?: number
        completedSeries?: number
        estimatedMinutes?: number
        minutesThisWeek?: number
        achievements: Array<{
            id: string
            title: string
            description: string
            unlocked: boolean
            progress: number
            target: number
            category?: string
        }>
    }>()
    let dataMessage = $state("")
    let downloadsCount = $state(0)
    let reconcileIds = $state<string[]>([])
    let updateStatus = $state<{
        checked: number
        updated: number
        failed: number
        checkedAt: number
        errors?: Array<{ mangaId: string; title: string; message: string }>
    } | null>(null)
    let sourcesList = $state<
        Array<{
            id: string
            name: string
            domains: string[]
            capabilities: string[]
            canSearch: boolean
            homepage?: string
        }>
    >([])
    let checkingUpdates = $state(false)
    let confirmingRemove = $state<string | null>(null)
    let detailManga = $state<LibraryManga | null>(null)
    let relinkUrl = $state("")
    let relinkMessage = $state("")
    let mirrorResults = $state<SearchResult[]>([])
    let mirrorChecking = $state(false)
    let mirrorCheckedFor = $state("")

    function normTitle(s: string): string {
        return s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
    }

    async function switchMirror(manga: LibraryManga, result: SearchResult) {
        mirrorCheckedFor = manga.id
        try {
            await sendRuntimeMessage({
                type: "library:switch",
                mangaId: manga.id,
                sourceId: result.sourceId,
                sourceMangaId: result.sourceMangaId,
                mangaUrl: result.url
            })
            await load()
            detailManga = library.find(m => m.id === manga.id) ?? null
            relinkMessage = `Switched to ${result.sourceId}. Progress preserved by chapter number.`
        } catch (cause) {
            relinkMessage = cause instanceof Error ? cause.message : "Switch failed."
        }
    }

    // Search every supported source for this title and show which mirrors carry
    // it, sorted by the latest hosted chapter so the freshest mirror is on top.
    async function checkMirrors(manga: LibraryManga) {
        mirrorChecking = true
        mirrorResults = []
        mirrorCheckedFor = manga.id
        try {
            const all = await sendRuntimeMessage<SearchResult[]>({ type: "manga:search", query: manga.title })
            const want = normTitle(manga.title)
            mirrorResults = all
                .filter(r => {
                    const t = normTitle(r.title)
                    return t === want || t.includes(want) || want.includes(t)
                })
                .sort((a, b) => (parseFloat(b.latestChapter ?? "0") || 0) - (parseFloat(a.latestChapter ?? "0") || 0))
        } catch {
            mirrorResults = []
        } finally {
            mirrorChecking = false
        }
    }

    async function relink(manga: LibraryManga) {
        const url = relinkUrl.trim()
        if (!url) return
        relinkMessage = "Re-linking…"
        try {
            await sendRuntimeMessage({ type: "library:relink", mangaId: manga.id, url })
            relinkUrl = ""
            await load()
            detailManga = library.find(m => m.id === manga.id) ?? null
            relinkMessage = "Re-linked. Progress preserved by chapter number."
        } catch (cause) {
            relinkMessage = cause instanceof Error ? cause.message : "Re-link failed."
        }
    }
    let hasPermission = $state(false)
    let onboardingDismissed = $state(true)
    let browseQuery = $state("")

    async function dismissOnboarding() {
        onboardingDismissed = true
        await browser.storage.local.set({ onboardingDismissed: true })
    }

    async function onboardGrant() {
        await grantPermission()
        if (hasPermission) void backfillCovers()
    }
    type SearchResult = {
        sourceId: string
        sourceMangaId: string
        title: string
        url: string
        coverUrl?: string
        latestChapter?: string
    }
    let searchResults = $state<SearchResult[]>([])
    let searchLoading = $state(false)
    let selectedManga = $state<{ title: string } | null>(null)
    let mangaChapters = $state<Array<{ id: string; title: string; chapter?: string; url: string }>>([])
    let chaptersLoading = $state(false)
    type HistoryEntry = {
        mangaId: string
        title: string
        type: "started" | "completed"
        occurredAt: number
        chapterNumber?: number | null
        chapterTitle?: string | null
    }
    let history = $state<HistoryEntry[]>([])
    let historyLoaded = $state(false)
    let expandedHistory = $state<Set<string>>(new Set())

    function toggleHistoryGroup(mangaId: string) {
        const next = new Set(expandedHistory)
        if (next.has(mangaId)) next.delete(mangaId)
        else next.add(mangaId)
        expandedHistory = next
    }

    // Group history events by manga, newest activity first; each group keeps its
    // events sorted newest-first for the expandable chapter list.
    const historyGroups = $derived.by(() => {
        const byManga = new Map<string, { mangaId: string; title: string; events: HistoryEntry[]; latest: number }>()
        for (const event of history) {
            const group = byManga.get(event.mangaId) ?? {
                mangaId: event.mangaId,
                title: event.title,
                events: [],
                latest: 0
            }
            group.events.push(event)
            group.latest = Math.max(group.latest, event.occurredAt)
            byManga.set(event.mangaId, group)
        }
        const groups = [...byManga.values()]
        for (const g of groups) g.events.sort((a, b) => b.occurredAt - a.occurredAt)
        return groups.sort((a, b) => b.latest - a.latest)
    })

    async function loadHistory() {
        try {
            history = await sendRuntimeMessage<HistoryEntry[]>({ type: "history:list" })
        } catch {
            history = []
        } finally {
            historyLoaded = true
        }
    }

    // Auto-refresh history every time the tab is opened.
    $effect(() => {
        if (activeSection === "History") void loadHistory()
    })

    $effect(() => {
        document.documentElement.dataset["theme"] = settings?.theme ?? "dark"
    })

    function isSeedData(manga: LibraryManga): boolean {
        return manga.id.startsWith("seed-")
    }

    onMount(async () => {
        await load()
        hasPermission = await sendRuntimeMessage<boolean>({ type: "source:permission:check" })
        if (hasPermission) void backfillCovers()
        try {
            const stored = await browser.storage.local.get("onboardingDismissed")
            onboardingDismissed = Boolean(stored["onboardingDismissed"])
        } catch {
            onboardingDismissed = false
        }
        await loadSyncStatus()
        try {
            sourcesList = await sendRuntimeMessage<typeof sourcesList>({ type: "sources:list" })
        } catch {
            // optional
        }
        try {
            const downloads = await sendRuntimeMessage<Array<{ chapterId: string }>>({ type: "downloads:list" })
            downloadsCount = downloads.length
        } catch {
            // optional
        }
    })

    async function loadSyncStatus() {
        try {
            syncStatus = await sendRuntimeMessage<SyncStatus>({ type: "sync:status" })
            syncGistId = syncStatus.gistId ?? ""
        } catch {
            // sync optional
        }
    }

    async function saveSyncToken() {
        const token = syncToken.trim()
        if (!token) return
        const granted = await browser.permissions.request({ origins: syncOrigins() })
        if (!granted) {
            syncMessage = "GitHub access was not granted."
            return
        }
        syncStatus = await sendRuntimeMessage<SyncStatus>({ type: "sync:config", config: { token } })
        syncToken = ""
        syncMessage = "Token saved."
    }

    async function saveGistId() {
        syncStatus = await sendRuntimeMessage<SyncStatus>({
            type: "sync:config",
            config: { gistId: syncGistId.trim() }
        })
    }

    async function toggleAutoSync(on: boolean) {
        syncStatus = await sendRuntimeMessage<SyncStatus>({ type: "sync:config", config: { autoSync: on } })
    }

    async function pushSync() {
        syncing = true
        syncMessage = ""
        try {
            const res = await sendRuntimeMessage<{ gistId: string }>({ type: "sync:push" })
            syncMessage = `Pushed to gist ${res.gistId}.`
            await loadSyncStatus()
        } catch (cause) {
            syncMessage = cause instanceof Error ? cause.message : "Push failed."
        } finally {
            syncing = false
        }
    }

    async function pullSync() {
        syncing = true
        syncMessage = ""
        try {
            const res = await sendRuntimeMessage<{ manga: number; chapters: number }>({ type: "sync:pull" })
            syncMessage = `Pulled ${res.manga} manga and ${res.chapters} chapters.`
            failedCovers = new Set()
            await load()
            await loadSyncStatus()
        } catch (cause) {
            syncMessage = cause instanceof Error ? cause.message : "Pull failed."
        } finally {
            syncing = false
        }
    }

    async function backfillCovers() {
        if (refreshingCovers) return
        refreshingCovers = true
        try {
            const res = await sendRuntimeMessage<{ updated: number; remaining: number }>({
                type: "library:covers:backfill"
            })
            if (res.updated > 0) {
                failedCovers = new Set()
                await load()
            }
        } catch {
            // covers are best-effort
        } finally {
            refreshingCovers = false
        }
    }

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
        if (selectMode) {
            toggleSelect(manga.id)
            return
        }
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

    function applyCategories<T extends { id: string; categories?: string[] }>(item: T, id: string, next?: string[]): T {
        if (item.id !== id) return item
        const copy = { ...item }
        if (next && next.length > 0) copy.categories = next
        else delete copy.categories
        return copy
    }

    async function commitCategories(manga: LibraryManga, categories: string[]) {
        const deduped = [...new Set(categories.map(c => c.trim()).filter(Boolean))]
        await sendRuntimeMessage({ type: "library:categories", mangaId: manga.id, categories: deduped })
        const next = deduped.length > 0 ? deduped : undefined
        library = library.map(m => applyCategories(m, manga.id, next))
        if (detailManga && detailManga.id === manga.id) detailManga = applyCategories(detailManga, manga.id, next)
    }

    // Tags == categories. Add/remove individual tags and bulk-add comma lists.
    function tagsOf(manga: LibraryManga): string[] {
        return manga.categories ?? []
    }
    async function addTags(manga: LibraryManga, incoming: string[]) {
        await commitCategories(manga, [...tagsOf(manga), ...incoming])
    }
    async function removeTag(manga: LibraryManga, tag: string) {
        await commitCategories(
            manga,
            tagsOf(manga).filter(t => t !== tag)
        )
    }

    let tagDraft = $state("")
    async function addTagDraft(manga: LibraryManga) {
        const parts = tagDraft
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        if (parts.length === 0) return
        await addTags(manga, parts)
        tagDraft = ""
    }

    // Suggested tags pulled from the source's genre list (best-effort).
    let genreSuggestions = $state<string[]>([])
    let genresLoading = $state(false)
    let genresForId = $state<string | null>(null)
    async function loadGenres(manga: LibraryManga) {
        genresForId = manga.id
        genresLoading = true
        genreSuggestions = []
        try {
            genreSuggestions = await sendRuntimeMessage<string[]>({ type: "manga:genres", mangaId: manga.id })
        } catch {
            genreSuggestions = []
        } finally {
            genresLoading = false
        }
    }
    $effect(() => {
        const id = detailManga?.id
        if (id && genresForId !== id) {
            genresForId = id
            if (detailManga) void loadGenres(detailManga)
        }
    })
    // Genre suggestions not already applied as tags.
    const suggestedTags = $derived.by(() => {
        const dm = detailManga
        if (!dm) return []
        const existing = tagsOf(dm)
        return genreSuggestions.filter(g => !existing.includes(g))
    })

    async function rate(manga: LibraryManga, value: number) {
        const next = manga.rating === value ? 0 : value
        await sendRuntimeMessage({ type: "library:rate", mangaId: manga.id, rating: next })
        library = library.map(m =>
            m.id === manga.id ? { ...m, ...(next === 0 ? { rating: undefined } : { rating: next }) } : m
        )
    }

    async function setNsfw(manga: LibraryManga, nsfw: boolean) {
        await sendRuntimeMessage({ type: "library:nsfw", mangaId: manga.id, nsfw })
        library = library.map(m => (m.id === manga.id ? { ...m, nsfw } : m))
        if (detailManga && detailManga.id === manga.id) detailManga = { ...detailManga, nsfw }
    }

    async function setManual(manga: LibraryManga, manual: boolean) {
        await sendRuntimeMessage({ type: "library:manual", mangaId: manga.id, manual })
        library = library.map(m => (m.id === manga.id ? { ...m, manualTracking: manual } : m))
    }

    async function setNumber(manga: LibraryManga, field: "lastReadChapterNumber" | "latestChapterNumber", raw: string) {
        const trimmed = raw.trim()
        const value = trimmed === "" ? null : Math.max(0, Number(trimmed))
        if (value !== null && !Number.isFinite(value)) return
        await sendRuntimeMessage({ type: "library:numbers", mangaId: manga.id, [field]: value })
        library = library.map(m => {
            if (m.id !== manga.id) return m
            const next = { ...m }
            if (value === null) delete next[field]
            else next[field] = value
            return next
        })
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
            const raw: unknown = JSON.parse(await file.text())
            const { envelope, migrated, converted, skipped, needsAttention } = migrateLegacyImport(raw)
            const result = await sendRuntimeMessage<{ manga: number; chapters: number }>({
                type: "data:import",
                envelope
            })
            await load()
            if (migrated) {
                reconcileIds = needsAttention
                dataMessage =
                    `Imported ${converted} manga from old AMR backup.` +
                    (skipped > 0 ? ` ${skipped} entries skipped (no title or URL).` : "") +
                    (needsAttention.length > 0
                        ? ` ${needsAttention.length} titles need a live source — see below.`
                        : "")
                if (needsAttention.length > 0) activeSection = "Data"
            } else {
                dataMessage = `Imported ${result.manga} manga and ${result.chapters} chapters.`
            }
        } catch (cause) {
            dataMessage = cause instanceof Error ? cause.message : "The backup could not be imported."
        }
    }

    async function checkForUpdates(sourceId?: string) {
        checkingUpdates = true
        try {
            updateStatus = await sendRuntimeMessage<NonNullable<typeof updateStatus>>({
                type: "updates:check",
                ...(sourceId ? { sourceId } : {})
            })
            await load()
        } finally {
            checkingUpdates = false
        }
    }

    const librarySources = $derived([...new Set(library.filter(m => !isSeedData(m)).map(m => m.sourceId))].sort())

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

    // MangaDex can list chapters; other sources open the manga page directly.
    async function openResult(result: SearchResult) {
        if (result.sourceId !== "mangadex") {
            void browser.tabs.create({ url: result.url })
            return
        }
        selectedManga = { title: result.title }
        chaptersLoading = true
        mangaChapters = []
        try {
            mangaChapters = await sendRuntimeMessage<typeof mangaChapters>({
                type: "manga:chapters",
                mangaId: result.sourceMangaId
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

    const allCategories = $derived(
        [...new Set(library.flatMap(m => m.categories ?? []))].sort((a, b) => a.localeCompare(b))
    )

    // Tag organisation: counts per tag, plus rename/delete across the whole library.
    const tagCounts = $derived.by(() => {
        const counts = new Map<string, number>()
        for (const m of library) for (const tag of m.categories ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    })
    let tagBusy = $state(false)
    async function renameTag(oldTag: string, rawNew: string) {
        const newTag = rawNew.trim()
        if (!newTag || newTag === oldTag) return
        tagBusy = true
        try {
            for (const m of library.filter(x => (x.categories ?? []).includes(oldTag))) {
                await commitCategories(
                    m,
                    (m.categories ?? []).map(t => (t === oldTag ? newTag : t))
                )
            }
        } finally {
            tagBusy = false
        }
    }
    async function deleteTag(tag: string) {
        tagBusy = true
        try {
            for (const m of library.filter(x => (x.categories ?? []).includes(tag))) await removeTag(m, tag)
        } finally {
            tagBusy = false
        }
    }
    function filterByTag(tag: string) {
        categoryFilter = tag
        activeSection = "Library"
    }

    type LibraryStatus = "unread" | "reading" | "completed"
    function statusOf(m: LibraryManga): LibraryStatus {
        const read = m.lastReadChapterNumber
        const latest = m.latestChapterNumber
        if (read === undefined) return "unread"
        if (latest !== undefined && read >= latest) return "completed"
        return "reading"
    }
    function matchesFilter(m: LibraryManga): boolean {
        switch (libraryFilter) {
            case "manual":
                return Boolean(m.manualTracking)
            case "unread":
            case "reading":
            case "completed":
                return statusOf(m) === libraryFilter
            default:
                return true
        }
    }

    const visibleLibrary = $derived.by(() => {
        const filtered = library.filter(
            m =>
                m.title.toLowerCase().includes(query.trim().toLowerCase()) &&
                (!categoryFilter || (m.categories ?? []).includes(categoryFilter)) &&
                matchesFilter(m)
        )
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

    // Home: continue-reading = most recently read; recently-added by addedAt.
    const continueReading = $derived.by(() => {
        const read = library.filter(m => m.lastReadAt).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
        return read[0] ?? library[0]
    })
    const recentlyAdded = $derived([...library].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12))
    const missingCoverCount = $derived(
        library.filter(m => !isSeedData(m) && (!m.coverUrl || failedCovers.has(m.id))).length
    )

    // Library view: grid (covers) or list (rows), with a user-set page size so
    // large libraries don't render everything at once.
    let libraryView = $state<"grid" | "list">("grid")
    let libraryFilter = $state<"all" | "unread" | "reading" | "completed" | "manual">("all")
    const LIBRARY_FILTERS = ["all", "unread", "reading", "completed", "manual"] as const
    let libraryPageSize = $state(50)
    let libraryLimit = $state(50)
    const pagedLibrary = $derived(visibleLibrary.slice(0, libraryLimit))
    $effect(() => {
        // Reset paging whenever the filtered view changes.
        void query
        void categoryFilter
        void librarySort
        void libraryFilter
        libraryLimit = libraryPageSize
    })

    // Per-row chapter navigation (resolved on demand from the source).
    let rowBusy = $state<string | null>(null)
    let rowMessage = $state<{ id: string; text: string } | null>(null)

    async function openAdjacent(manga: LibraryManga, which: "next" | "prev") {
        rowBusy = manga.id
        rowMessage = null
        try {
            const adj = await sendRuntimeMessage<{
                current: number | null
                next: { url: string; title: string; number: number } | null
                prev: { url: string; title: string; number: number } | null
            }>({ type: "chapter:adjacent", mangaId: manga.id })
            const target = which === "next" ? adj.next : adj.prev
            if (!target) {
                rowMessage = {
                    id: manga.id,
                    text: which === "next" ? "No next chapter found." : "No previous chapter."
                }
                return
            }
            if (settings?.openChapterIn === "browser") void browser.tabs.create({ url: target.url })
            else
                void browser.tabs.create({
                    url: browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(target.url)}`)
                })
        } catch {
            rowMessage = { id: manga.id, text: "Could not resolve chapters." }
        } finally {
            rowBusy = null
        }
    }

    async function markCaughtUp(manga: LibraryManga) {
        const latest = manga.latestChapterNumber
        if (latest === undefined) return
        await sendRuntimeMessage({ type: "library:numbers", mangaId: manga.id, lastReadChapterNumber: latest })
        library = library.map(m => (m.id === manga.id ? { ...m, lastReadChapterNumber: latest } : m))
    }

    const unreadPool = $derived(library.filter(m => statusOf(m) !== "completed"))
    function surpriseMe() {
        const pool = unreadPool.length > 0 ? unreadPool : library
        if (pool.length === 0) return
        const pick = pool[Math.floor(Math.random() * pool.length)]
        if (pick) read(pick)
    }

    // Command palette (Ctrl/Cmd-K): jump to a tab or a library title.
    type PaletteItem =
        | { kind: "tab"; label: string; section: (typeof sections)[number] }
        | { kind: "manga"; label: string; manga: LibraryManga }
    let paletteOpen = $state(false)
    let paletteQuery = $state("")
    const paletteResults = $derived.by<PaletteItem[]>(() => {
        const q = paletteQuery.trim().toLowerCase()
        const tabs: PaletteItem[] = sections
            .filter(s => !q || s.toLowerCase().includes(q))
            .map(s => ({ kind: "tab", label: s, section: s }))
        if (!q) return tabs
        const titles: PaletteItem[] = library
            .filter(m => m.title.toLowerCase().includes(q))
            .slice(0, 8)
            .map(m => ({ kind: "manga", label: m.title, manga: m }))
        return [...tabs, ...titles]
    })
    function runPalette(item: PaletteItem) {
        if (item.kind === "tab") activeSection = item.section
        else read(item.manga)
        paletteOpen = false
    }
    function onGlobalKey(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault()
            paletteOpen = !paletteOpen
            paletteQuery = ""
        } else if (e.key === "Escape" && paletteOpen) {
            paletteOpen = false
        }
    }
    function autofocus(node: HTMLInputElement) {
        node.focus()
    }

    // Per-manga freeform notes (saved from the detail overlay). Writable derived:
    // resets when the open title changes, but accepts edits in between.
    let noteDraft = $derived(detailManga?.notes ?? "")
    function applyNote<T extends { id: string; notes?: string }>(item: T, id: string, note: string): T {
        if (item.id !== id) return item
        const copy = { ...item }
        if (note) copy.notes = note
        else delete copy.notes
        return copy
    }

    async function saveNote(manga: LibraryManga) {
        const note = noteDraft.trim()
        await sendRuntimeMessage({ type: "library:note", mangaId: manga.id, note })
        library = library.map(m => applyNote(m, manga.id, note))
        if (detailManga && detailManga.id === manga.id) detailManga = applyNote(detailManga, manga.id, note)
    }

    // Reading-activity heatmap (Achievements tab).
    let activity = $state<Array<{ date: string; count: number }>>([])
    let activityLoaded = $state(false)
    $effect(() => {
        if (activeSection === "Achievements" && !activityLoaded) {
            activityLoaded = true
            void sendRuntimeMessage<Array<{ date: string; count: number }>>({ type: "activity:get" })
                .then(d => (activity = d))
                .catch(() => (activity = []))
        }
    })

    const UPDATES_INITIAL = 50
    let updatesLimit = $state(UPDATES_INITIAL)
    const pagedUpdates = $derived(library.slice(0, updatesLimit))

    // Search results grouped by source, with display name + homepage from the registry.
    const sourceMeta = $derived(new Map(sourcesList.map(s => [s.id, s])))
    const searchBySource = $derived.by(() => {
        const groups = new Map<string, SearchResult[]>()
        for (const r of searchResults) {
            const arr = groups.get(r.sourceId) ?? []
            arr.push(r)
            groups.set(r.sourceId, arr)
        }
        return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
    })
    const achievementsByCategory = $derived.by(() => {
        const groups = new Map<string, NonNullable<typeof stats>["achievements"]>()
        for (const a of stats?.achievements ?? []) {
            const key = a.category ?? "General"
            const arr = groups.get(key) ?? []
            arr.push(a)
            groups.set(key, arr)
        }
        return [...groups.entries()]
    })

    function openSourceSite(src: { homepage?: string; domains: string[] }) {
        const url = src.homepage ?? (src.domains[0] ? `https://${src.domains[0]}` : undefined)
        if (url) void browser.tabs.create({ url })
    }

    let pingState = $state<Map<string, boolean>>(new Map())
    let pinging = $state(false)
    let pingedOnce = $state(false)

    async function pingSources() {
        if (pinging) return
        pinging = true
        try {
            const res = await sendRuntimeMessage<Array<{ id: string; alive: boolean }>>({ type: "sources:ping" })
            pingState = new Map(res.map(r => [r.id, r.alive]))
            pingedOnce = true
        } catch {
            // reachability is best-effort
        } finally {
            pinging = false
        }
    }

    $effect(() => {
        if (activeSection === "Sources" && !pingedOnce && sourcesList.length > 0) void pingSources()
    })
</script>

<svelte:window onkeydown={onGlobalKey} />

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
        <div class="sidebar-footer">
            <button
                type="button"
                class="kofi-btn"
                onclick={() => void browser.tabs.create({ url: "https://ko-fi.com/ryuu3rs" })}>
                ☕ Support on Ko-fi
            </button>
        </div>
    </aside>

    <main>
        {#if activeSection === "Home"}
            {#if !hasPermission && !onboardingDismissed}
                <div class="onboarding">
                    <h2>Welcome to AMR Next</h2>
                    <p class="muted">
                        Track and read manga from many sources — everything stays local in your browser.
                    </p>
                    <ol class="onboarding-steps">
                        <li>Grant access to the manga sites you use.</li>
                        <li>Open a chapter and click “Read in AMR”, or paste a chapter URL below.</li>
                        <li>Search across every source, or set up Gist sync under Data.</li>
                    </ol>
                    <div class="onboarding-actions">
                        <button type="button" onclick={() => void onboardGrant()}>Grant source access</button>
                        <button type="button" class="btn-outline" onclick={() => void dismissOnboarding()}>
                            Maybe later
                        </button>
                    </div>
                </div>
            {/if}

            <form
                class="search-bar global-search home-search"
                onsubmit={e => {
                    e.preventDefault()
                    void doSearch()
                }}>
                <input
                    bind:value={browseQuery}
                    placeholder="Search every source for a title…"
                    aria-label="Search all sources" />
                <button type="submit" disabled={searchLoading || !browseQuery.trim()}>
                    {searchLoading ? "Searching…" : "Search"}
                </button>
            </form>
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
            {:else if searchLoading}
                <p class="muted">Searching all sources…</p>
            {:else if searchResults.length > 0}
                {#each searchBySource as [sourceId, results]}
                    <div class="source-group">
                        <div class="source-group-head">
                            <span class="source-name">{sourceMeta.get(sourceId)?.name ?? sourceId}</span>
                            <span class="muted">{results.length} result{results.length === 1 ? "" : "s"}</span>
                        </div>
                        <div class="search-results">
                            {#each results as result}
                                <div class="search-result">
                                    <div class="result-cover">
                                        {#if result.coverUrl}<img
                                                src={result.coverUrl}
                                                alt={result.title} />{:else}<span>{result.title[0]}</span>{/if}
                                    </div>
                                    <div class="result-info">
                                        <p class="result-title">{result.title}</p>
                                        <p class="muted">
                                            {#if result.latestChapter}latest ch {result.latestChapter}{:else}—{/if}
                                        </p>
                                    </div>
                                    <button type="button" onclick={() => void openResult(result)}>
                                        {result.sourceId === "mangadex" ? "Chapters" : "Open"}
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            {:else if browseQuery.trim() && !searchLoading}
                <p class="muted">No results across any source.</p>
            {/if}

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
                {#if continueReading}
                    <div class="home-feature">
                        <div class="home-feature-cover">
                            {#if continueReading.coverUrl && !failedCovers.has(continueReading.id)}<img
                                    src={continueReading.coverUrl}
                                    alt=""
                                    class:nsfw-blur={continueReading.nsfw && (settings?.blurNsfw ?? true)}
                                    onerror={() => continueReading && coverFailed(continueReading.id)} />{:else}<span
                                    class="cover-initial">{continueReading.title[0]}</span
                                >{/if}
                        </div>
                        <div class="home-feature-body">
                            <p class="eyebrow">Continue reading</p>
                            <h2 class="feature-title">{continueReading.title}</h2>
                            <p class="muted">
                                {continueReading.sourceId}{#if continueReading.lastReadChapterNumber !== undefined}
                                    · ch {continueReading.lastReadChapterNumber}{/if}
                            </p>
                            <button type="button" onclick={() => continueReading && read(continueReading)}
                                >Open reader</button>
                        </div>
                    </div>
                {/if}

                {#if missingCoverCount > 0 && hasPermission}
                    <button
                        type="button"
                        class="cover-hint"
                        onclick={() => void backfillCovers()}
                        disabled={refreshingCovers}>
                        {refreshingCovers
                            ? "Fetching covers…"
                            : `Load ${missingCoverCount} missing cover${missingCoverCount === 1 ? "" : "s"}`}
                    </button>
                {/if}

                {#if recentlyAdded.length > 0}
                    <p class="shelf-label">Recently added</p>
                    <div class="poster-grid">
                        {#each recentlyAdded as manga}
                            <article>
                                <div class="poster-wrap">
                                    <button
                                        type="button"
                                        class="poster"
                                        onclick={e => read(manga, e)}
                                        onauxclick={e => read(manga, e)}>
                                        {#if manga.coverUrl && !failedCovers.has(manga.id)}<img
                                                src={manga.coverUrl}
                                                alt={manga.title}
                                                class:nsfw-blur={manga.nsfw && (settings?.blurNsfw ?? true)}
                                                onerror={() => coverFailed(manga.id)} />{:else}<span
                                                class="cover-initial">{manga.title[0]}</span
                                            >{/if}
                                    </button>
                                    <div class="poster-hover"><span>Open</span></div>
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

                <div class="support-card">
                    <p class="row-label">Enjoying AMR Next?</p>
                    <p class="muted">
                        If you like the work, please consider donating. Request features and report issues in the AMR
                        Discord.
                    </p>
                    <button
                        type="button"
                        class="kofi-btn"
                        onclick={() => void browser.tabs.create({ url: "https://ko-fi.com/ryuu3rs" })}>
                        ☕ Support on Ko-fi
                    </button>
                </div>
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
                    {#if allCategories.length > 0}
                        <select aria-label="Filter by category" bind:value={categoryFilter}>
                            <option value="">All categories</option>
                            {#each allCategories as cat}
                                <option value={cat}>{cat}</option>
                            {/each}
                        </select>
                    {/if}
                    <button
                        type="button"
                        class="btn-sm"
                        onclick={() => void backfillCovers()}
                        disabled={refreshingCovers || !hasPermission}
                        title={hasPermission ? "Fetch missing covers" : "Grant source access first"}>
                        {refreshingCovers ? "Fetching…" : "Refresh covers"}
                    </button>
                    <button
                        type="button"
                        class="btn-sm"
                        onclick={() => (selectMode ? clearSelection() : (selectMode = true))}>
                        {selectMode ? "Cancel" : "Select"}
                    </button>
                    {#if duplicateGroups.length > 0}
                        <button type="button" class="btn-sm" onclick={() => (showDuplicates = !showDuplicates)}>
                            Duplicates ({duplicateGroups.length})
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="btn-sm"
                        title="Open a random unread title"
                        disabled={library.length === 0}
                        onclick={surpriseMe}>🎲 Surprise me</button>
                    <div class="view-toggle">
                        <button
                            type="button"
                            class="btn-sm"
                            class:active={libraryView === "grid"}
                            onclick={() => (libraryView = "grid")}>Grid</button>
                        <button
                            type="button"
                            class="btn-sm"
                            class:active={libraryView === "list"}
                            onclick={() => (libraryView = "list")}>List</button>
                    </div>
                    <input bind:value={query} aria-label="Search library" placeholder="Search titles..." />
                </div>
            </div>
            <div class="filter-bar">
                <div class="filter-chips">
                    {#each LIBRARY_FILTERS as f}
                        <button
                            type="button"
                            class="chip"
                            class:active={libraryFilter === f}
                            onclick={() => (libraryFilter = f)}>
                            {f === "all" ? "All" : f[0]?.toUpperCase() + f.slice(1)}
                        </button>
                    {/each}
                </div>
                <label class="page-size">
                    <span class="muted">Per page</span>
                    <select aria-label="Items per page" bind:value={libraryPageSize}>
                        {#each [10, 15, 20, 50, 100] as n}
                            <option value={n}>{n}</option>
                        {/each}
                    </select>
                </label>
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
            {#if showDuplicates && duplicateGroups.length > 0}
                <div class="dup-panel">
                    <p class="row-label">Possible duplicates</p>
                    {#each duplicateGroups as group}
                        <div class="dup-group">
                            <span class="dup-title">{group[0]?.title}</span>
                            <span class="muted">{group.map(m => m.sourceId).join(", ")}</span>
                            <button type="button" class="btn-sm" onclick={() => void mergeDuplicates(group)}>
                                Merge {group.length}
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if selectMode}
                <div class="bulk-bar">
                    <span>{selectedIds.size} selected</span>
                    <input bind:value={bulkCategory} placeholder="Tags (comma-separated)…" aria-label="Bulk tags" />
                    <button
                        type="button"
                        class="btn-sm"
                        disabled={selectedIds.size === 0 || !bulkCategory.trim()}
                        onclick={() => void bulkAddCategory()}>Add tags</button>
                    <button
                        type="button"
                        class="btn-sm"
                        disabled={selectedIds.size === 0}
                        onclick={() => void bulkManual(true)}>Mark manual</button>
                    <button
                        type="button"
                        class="btn-sm confirm-remove-btn"
                        disabled={selectedIds.size === 0}
                        onclick={() => void bulkRemove()}>Remove</button>
                </div>
            {/if}
            {#if visibleLibrary.length === 0}
                <p class="muted" style="margin-top:16px">
                    {query || libraryFilter !== "all" ? "No titles match." : "Your library is empty."}
                </p>
            {:else if libraryView === "grid"}
                <div class="poster-grid">
                    {#each pagedLibrary as manga}
                        <article class:selected={selectMode && selectedIds.has(manga.id)}>
                            <div class="poster-wrap">
                                <button
                                    type="button"
                                    class="poster"
                                    class:sample={isSeedData(manga)}
                                    onclick={e => read(manga, e)}
                                    onauxclick={e => read(manga, e)}>
                                    {#if manga.coverUrl && !failedCovers.has(manga.id)}<img
                                            src={manga.coverUrl}
                                            alt={manga.title}
                                            onerror={() => coverFailed(manga.id)} />{:else}<span class="cover-initial"
                                            >{manga.title[0]}</span
                                        >{/if}
                                    {#if isSeedData(manga)}<span class="sample-chip">Sample</span>{/if}
                                    {#if manga.manualTracking}<span class="manual-chip">Manual</span>{/if}
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
                                        <label class="menu-toggle">
                                            <input
                                                type="checkbox"
                                                checked={manga.manualTracking ?? false}
                                                onchange={e => void setManual(manga, e.currentTarget.checked)} />
                                            Manual tracking (skip auto-scan)
                                        </label>
                                        <label class="menu-num">
                                            Read ch
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={manga.lastReadChapterNumber ?? ""}
                                                onchange={e =>
                                                    void setNumber(
                                                        manga,
                                                        "lastReadChapterNumber",
                                                        e.currentTarget.value
                                                    )} />
                                        </label>
                                        <label class="menu-num">
                                            Latest ch
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={manga.latestChapterNumber ?? ""}
                                                onchange={e =>
                                                    void setNumber(
                                                        manga,
                                                        "latestChapterNumber",
                                                        e.currentTarget.value
                                                    )} />
                                        </label>
                                        <div class="poster-confirm-actions">
                                            <button
                                                type="button"
                                                class="confirm-cancel-btn"
                                                onclick={() => {
                                                    detailManga = manga
                                                    confirmingRemove = null
                                                }}>Details</button>
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
                                                onclick={() => (confirmingRemove = null)}>Close</button>
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
            {:else}
                <div class="list-view">
                    {#each pagedLibrary as manga}
                        {@const status = statusOf(manga)}
                        <div class="list-row" class:selected={selectMode && selectedIds.has(manga.id)}>
                            <button
                                type="button"
                                class="list-cover"
                                class:sample={isSeedData(manga)}
                                onclick={e => read(manga, e)}
                                onauxclick={e => read(manga, e)}
                                aria-label={`Open ${manga.title}`}>
                                {#if manga.coverUrl && !failedCovers.has(manga.id)}<img
                                        src={manga.coverUrl}
                                        alt=""
                                        onerror={() => coverFailed(manga.id)} />{:else}<span class="cover-initial"
                                        >{manga.title[0]}</span
                                    >{/if}
                            </button>
                            <div class="list-main">
                                <p class="list-title">{manga.title}</p>
                                <p class="muted list-meta">
                                    {manga.sourceId}
                                    {#if manga.manualTracking}· manual{/if}
                                    {#if manga.notes}· 📝{/if}
                                </p>
                                {#if rowMessage && rowMessage.id === manga.id}
                                    <p class="muted list-rowmsg">{rowMessage.text}</p>
                                {/if}
                            </div>
                            <span class="list-status status-{status}">{status}</span>
                            <span class="list-progress">
                                {manga.lastReadChapterNumber !== undefined
                                    ? `Ch ${manga.lastReadChapterNumber}`
                                    : "Unread"}{#if manga.latestChapterNumber !== undefined}<span class="muted">
                                        / {manga.latestChapterNumber}</span
                                    >{/if}
                            </span>
                            <div class="list-actions">
                                <button
                                    type="button"
                                    class="btn-sm"
                                    disabled={rowBusy === manga.id}
                                    title="Previous chapter"
                                    onclick={() => void openAdjacent(manga, "prev")}>‹ Prev</button>
                                <button
                                    type="button"
                                    class="btn-sm"
                                    disabled={rowBusy === manga.id}
                                    title="Next chapter"
                                    onclick={() => void openAdjacent(manga, "next")}>
                                    {rowBusy === manga.id ? "…" : "Next ›"}
                                </button>
                                <button
                                    type="button"
                                    class="btn-sm"
                                    disabled={manga.latestChapterNumber === undefined}
                                    title="Mark read up to the latest chapter"
                                    onclick={() => void markCaughtUp(manga)}>Mark read</button>
                                <button type="button" class="btn-sm" onclick={() => (detailManga = manga)}>⋯</button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if visibleLibrary.length > libraryLimit}
                <div class="load-more">
                    <button type="button" class="btn-sm" onclick={() => (libraryLimit += libraryPageSize)}>
                        Load more ({visibleLibrary.length - libraryLimit} left)
                    </button>
                </div>
            {/if}
        {:else if activeSection === "Tags"}
            <h1>Tags</h1>
            <p class="muted search-hint">
                Organise your library with tags. Add tags per title from the ⋯ details panel (with one-click suggestions
                pulled from the source). Rename or delete a tag here to update every title at once.
            </p>
            {#if tagCounts.length === 0}
                <p class="muted">No tags yet. Open a title's details to add some.</p>
            {:else}
                <div class="tag-table">
                    {#each tagCounts as [tag, count] (tag)}
                        <div class="tag-row">
                            <button
                                type="button"
                                class="tag-name"
                                onclick={() => filterByTag(tag)}
                                title="Filter library">{tag}</button>
                            <span class="tag-count muted">{count} title{count === 1 ? "" : "s"}</span>
                            <input
                                class="tag-rename"
                                value={tag}
                                disabled={tagBusy}
                                aria-label={`Rename ${tag}`}
                                onchange={e => void renameTag(tag, e.currentTarget.value)} />
                            <button
                                type="button"
                                class="btn-sm confirm-remove-btn"
                                disabled={tagBusy}
                                onclick={() => void deleteTag(tag)}>Delete</button>
                        </div>
                    {/each}
                </div>
            {/if}
        {:else if activeSection === "Updates"}
            <div class="page-head">
                <h1>Updates</h1>
                <button type="button" onclick={() => void checkForUpdates()} disabled={checkingUpdates}>
                    {checkingUpdates ? "Checking..." : "Check all"}
                </button>
            </div>
            {#if librarySources.length > 1}
                <div class="source-refresh">
                    <span class="muted">Refresh one source:</span>
                    {#each librarySources as src}
                        <button
                            type="button"
                            class="btn-sm"
                            disabled={checkingUpdates}
                            onclick={() => void checkForUpdates(src)}>
                            {src}
                        </button>
                    {/each}
                </div>
            {/if}
            <p class="muted" style="margin-bottom:20px">
                {updateStatus
                    ? `Last checked ${new Date(updateStatus.checkedAt).toLocaleString()} — ${updateStatus.updated} updated, ${updateStatus.failed} failed`
                    : "No update check has run yet. Click Check all to scan for new chapters."}
            </p>
            {#if updateStatus?.errors && updateStatus.errors.length > 0}
                <div class="error-panel">
                    <p class="row-label">Titles that failed to update</p>
                    {#each updateStatus.errors as err}
                        <div class="error-row">
                            <span class="error-title">{err.title}</span>
                            <span class="muted">{err.message}</span>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if library.length === 0}
                <p class="muted">No manga in library to check.</p>
            {:else}
                <div class="update-list">
                    {#each pagedUpdates as manga}
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
                {#if library.length > updatesLimit}
                    <div class="load-more">
                        <button type="button" class="btn-sm" onclick={() => (updatesLimit += UPDATES_INITIAL)}>
                            Load more ({library.length - updatesLimit} left)
                        </button>
                    </div>
                {/if}
            {/if}
        {:else if activeSection === "History"}
            <div class="page-head">
                <h1>Reading history</h1>
                <button type="button" class="btn-sm" onclick={() => void loadHistory()}>Refresh</button>
            </div>
            {#if !historyLoaded}
                <p class="muted">Loading…</p>
            {:else if historyGroups.length === 0}
                <p class="muted">No reading activity yet. Open a chapter to start tracking.</p>
            {:else}
                <div class="history-groups">
                    {#each historyGroups as group (group.mangaId)}
                        {@const open = expandedHistory.has(group.mangaId)}
                        {@const last = group.events[0]}
                        <div class="history-group" class:open>
                            <button
                                type="button"
                                class="history-group-head"
                                onclick={() => toggleHistoryGroup(group.mangaId)}>
                                <span class="history-caret">{open ? "▾" : "▸"}</span>
                                <span class="history-title">{group.title}</span>
                                <span class="muted history-count">{group.events.length}</span>
                                <span class="muted history-when">
                                    {last
                                        ? `${last.type === "completed" ? "read" : "started"} ${last.chapterNumber != null ? `ch ${last.chapterNumber} · ` : ""}${new Date(group.latest).toLocaleDateString()}`
                                        : ""}
                                </span>
                            </button>
                            {#if open}
                                <div class="history-events">
                                    {#each group.events as event}
                                        <div class="history-row">
                                            <span class="history-dot" class:done={event.type === "completed"}></span>
                                            <span class="history-ev-title">
                                                {event.chapterNumber != null
                                                    ? `Chapter ${event.chapterNumber}`
                                                    : (event.chapterTitle ?? "Chapter")}
                                            </span>
                                            <span class="muted">
                                                {event.type === "completed" ? "Completed" : "Started"}
                                            </span>
                                            <span class="muted history-when">
                                                {new Date(event.occurredAt).toLocaleString()}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        {:else if activeSection === "Achievements"}
            <h1>Stats &amp; achievements</h1>
            <div class="stat-row">
                <div class="stat-box"><strong>{stats?.completedChapters ?? 0}</strong><span>Completed</span></div>
                <div class="stat-box"><strong>{stats?.mangaCount ?? 0}</strong><span>Saved</span></div>
                <div class="stat-box"><strong>{stats?.readingDays ?? 0}</strong><span>Active days</span></div>
            </div>
            <div class="stat-row">
                <div class="stat-box"><strong>{stats?.currentStreak ?? 0}</strong><span>Day streak</span></div>
                <div class="stat-box"><strong>{stats?.longestStreak ?? 0}</strong><span>Longest streak</span></div>
                <div class="stat-box"><strong>{stats?.chaptersThisWeek ?? 0}</strong><span>This week</span></div>
            </div>
            <div class="stat-row">
                <div class="stat-box"><strong>{stats?.completedSeries ?? 0}</strong><span>Series done</span></div>
                <div class="stat-box"><strong>{stats?.sourcesUsed ?? 0}</strong><span>Sources</span></div>
                <div class="stat-box"><strong>{stats?.downloadedChapters ?? 0}</strong><span>Offline</span></div>
                <div class="stat-box"><strong>{stats?.ratedCount ?? 0}</strong><span>Rated</span></div>
            </div>
            <div class="stat-row">
                <div class="stat-box">
                    <strong>
                        {#if (stats?.estimatedMinutes ?? 0) >= 60}
                            {Math.round((stats?.estimatedMinutes ?? 0) / 60)}h
                        {:else}
                            {stats?.estimatedMinutes ?? 0}m
                        {/if}
                    </strong>
                    <span>Time read</span>
                </div>
                <div class="stat-box"><strong>{stats?.minutesThisWeek ?? 0}m</strong><span>This week</span></div>
            </div>
            {#if settings && settings.dailyGoal > 0}
                {@const today = stats?.chaptersToday ?? 0}
                {@const pct = Math.min(100, Math.round((today / settings.dailyGoal) * 100))}
                <div class="goal-card">
                    <div class="goal-head">
                        <span class="row-label">Today's goal</span>
                        <span class="muted"
                            >{today} / {settings.dailyGoal} chapters{today >= settings.dailyGoal ? " ✓" : ""}</span>
                    </div>
                    <div class="goal-bar"><div class="goal-fill" style="width:{pct}%"></div></div>
                </div>
            {/if}
            <p class="shelf-label" style="margin-top:24px">Reading activity</p>
            <ActivityHeatmap data={activity} />

            <p class="muted" style="margin-top:24px">
                {stats?.achievements.filter(a => a.unlocked).length ?? 0} / {stats?.achievements.length ?? 0} unlocked
            </p>
            {#each achievementsByCategory as [category, items]}
                <p class="shelf-label ach-category">
                    {category}
                    <span class="muted">{items.filter(a => a.unlocked).length}/{items.length}</span>
                </p>
                <div class="achievement-list">
                    {#each items as a}
                        <div class="achievement" class:unlocked={a.unlocked}>
                            <span class="ach-icon">{a.unlocked ? "★" : "☆"}</span>
                            <div class="ach-body">
                                <p class="ach-title">{a.title}</p>
                                <p class="muted">{a.description}</p>
                                {#if !a.unlocked}
                                    <div class="progress-track">
                                        <div
                                            class="progress-fill"
                                            style="width:{a.target > 0
                                                ? Math.min(100, (a.progress / a.target) * 100)
                                                : 0}%">
                                        </div>
                                    </div>
                                    <span class="ach-progress muted">{a.progress} / {a.target}</span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/each}
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

            <p class="muted search-hint">
                Use the search box on the Home tab to look up a title across every source. Below are all sites you can
                browse directly.
            </p>

            {#if sourcesList.length > 0}
                <div class="page-head">
                    <p class="shelf-label" style="margin-bottom:0">Browse a source ({sourcesList.length})</p>
                    <button type="button" class="btn-sm" onclick={() => void pingSources()} disabled={pinging}>
                        {pinging ? "Checking…" : "Re-check sites"}
                    </button>
                </div>
                <p class="muted search-hint">
                    Click a site to open it in a new tab. The dot shows whether the site answered a reachability check
                    (green = live, red = unreachable, grey = not checked).
                </p>
                <div class="adapter-grid">
                    {#each sourcesList as src}
                        {@const alive = pingState.get(src.id)}
                        <button
                            type="button"
                            class="adapter-chip"
                            onclick={() => openSourceSite(src)}
                            title={`Open ${src.name}`}>
                            <span class="adapter-head">
                                <span
                                    class="status-dot"
                                    class:alive={alive === true}
                                    class:dead={alive === false}
                                    title={alive === undefined ? "Not checked" : alive ? "Live" : "Unreachable"}></span>
                                <span class="adapter-name">{src.name}</span>
                            </span>
                            <span class="adapter-caps muted">
                                {src.capabilities.join(", ")}{#if src.canSearch}
                                    · search{/if}
                            </span>
                            <span class="adapter-open">Open site ↗</span>
                        </button>
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
                <div class="data-row">
                    <div>
                        <p class="row-label">Offline downloads</p>
                        <p class="muted">
                            Chapters saved for offline reading. Download from the reader's ⬇ button; they're served
                            automatically when you reopen the chapter.
                        </p>
                    </div>
                    <span class="data-count">{downloadsCount} {downloadsCount === 1 ? "chapter" : "chapters"}</span>
                </div>
            </div>
            {#if dataMessage}<p class="notice">{dataMessage}</p>{/if}

            <ImportReconcile
                mangas={library.filter(m => reconcileIds.includes(m.id))}
                onLinked={id => {
                    reconcileIds = reconcileIds.filter(rid => rid !== id)
                    void load()
                }} />

            <h1 style="margin-top:32px">GitHub Gist sync</h1>
            <div class="data-list">
                <div class="data-row">
                    <div>
                        <p class="row-label">Personal access token</p>
                        <p class="muted">
                            A token with the <code>gist</code> scope. Stored locally on this device only.
                            {syncStatus?.hasToken ? " A token is saved." : ""}
                        </p>
                    </div>
                    <div class="sync-token">
                        <input
                            type="password"
                            placeholder={syncStatus?.hasToken ? "••••••• (saved)" : "ghp_…"}
                            bind:value={syncToken} />
                        <button type="button" onclick={saveSyncToken} disabled={!syncToken.trim()}>Save</button>
                    </div>
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Gist ID</p>
                        <p class="muted">Leave blank to create a new private gist on first push.</p>
                    </div>
                    <input class="sync-gist" placeholder="(auto)" bind:value={syncGistId} onchange={saveGistId} />
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Auto-sync</p>
                        <p class="muted">Push the backup to the gist hourly when enabled.</p>
                    </div>
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={syncStatus?.autoSync ?? false}
                            disabled={!syncStatus?.hasToken}
                            onchange={e => void toggleAutoSync(e.currentTarget.checked)} />
                        <span class="track"></span>
                    </label>
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Sync now</p>
                        <p class="muted">
                            {syncStatus?.lastPushedAt
                                ? `Last pushed ${new Date(syncStatus.lastPushedAt).toLocaleString()}.`
                                : "Not pushed yet."}
                        </p>
                    </div>
                    <div class="sync-actions">
                        <button type="button" onclick={pushSync} disabled={!syncStatus?.hasToken || syncing}>
                            Push
                        </button>
                        <button
                            type="button"
                            class="btn-outline"
                            onclick={pullSync}
                            disabled={!syncStatus?.hasToken || !syncStatus?.gistId || syncing}>
                            Pull
                        </button>
                    </div>
                </div>
            </div>
            {#if syncMessage}<p class="notice">{syncMessage}</p>{/if}
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
                <div class="settings-row">
                    <div>
                        <p class="row-label">Theme</p>
                        <p class="muted">Dark, light, or follow your system setting.</p>
                    </div>
                    <select
                        aria-label="Theme"
                        value={settings?.theme ?? "dark"}
                        onchange={e =>
                            void updateSetting({ theme: e.currentTarget.value as "dark" | "light" | "system" })}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                        <option value="system">System</option>
                    </select>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Chapter language</p>
                        <p class="muted">Preferred translation language for MangaDex chapter listings.</p>
                    </div>
                    <select
                        aria-label="Chapter language"
                        value={settings?.language ?? "en"}
                        onchange={e => void updateSetting({ language: e.currentTarget.value })}>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="es-la">Spanish (Latin America)</option>
                        <option value="fr">French</option>
                        <option value="pt-br">Portuguese (Brazil)</option>
                        <option value="de">German</option>
                        <option value="ru">Russian</option>
                        <option value="id">Indonesian</option>
                        <option value="it">Italian</option>
                        <option value="pl">Polish</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                        <option value="zh-hk">Chinese (Hong Kong)</option>
                        <option value="ar">Arabic</option>
                        <option value="vi">Vietnamese</option>
                    </select>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Daily reading goal</p>
                        <p class="muted">Chapters per day to aim for (0 disables). Shown on the Stats tab.</p>
                    </div>
                    <input
                        type="number"
                        min="0"
                        max="50"
                        aria-label="Daily reading goal"
                        value={settings?.dailyGoal ?? 0}
                        onchange={e =>
                            void updateSetting({
                                dailyGoal: Math.max(0, Math.min(50, Number(e.currentTarget.value) || 0))
                            })} />
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Blur NSFW covers</p>
                        <p class="muted">Blur covers of titles you've marked NSFW (from the detail view).</p>
                    </div>
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={settings?.blurNsfw ?? true}
                            onchange={e => void updateSetting({ blurNsfw: e.currentTarget.checked })} />
                        <span class="track"></span>
                    </label>
                </div>
            </div>
        {/if}
    </main>
</div>

{#if detailManga}
    <div
        class="detail-overlay"
        role="button"
        tabindex="0"
        onclick={() => (detailManga = null)}
        onkeydown={e => {
            if (e.key === "Escape" || e.key === "Enter") detailManga = null
        }}>
        <div
            class="detail-card"
            role="dialog"
            aria-label={detailManga.title}
            tabindex="0"
            onclick={e => e.stopPropagation()}
            onkeydown={() => {}}>
            <div class="detail-cover">
                {#if detailManga.coverUrl && !failedCovers.has(detailManga.id)}<img
                        src={detailManga.coverUrl}
                        alt=""
                        onerror={() => detailManga && coverFailed(detailManga.id)} />{:else}<span class="cover-initial"
                        >{detailManga.title[0]}</span
                    >{/if}
            </div>
            <div class="detail-body">
                <h2>{detailManga.title}</h2>
                <p class="muted">{detailManga.sourceId} · {detailManga.status}</p>
                <p class="detail-meta">
                    {detailManga.lastReadChapterNumber !== undefined
                        ? `Read ch ${detailManga.lastReadChapterNumber}`
                        : "Unread"}{#if detailManga.latestChapterNumber !== undefined}
                        · latest ch {detailManga.latestChapterNumber}{/if}
                    {#if detailManga.manualTracking}
                        · manual{/if}
                </p>
                <div class="poster-rating" role="group" aria-label="Rate">
                    {#each [1, 2, 3, 4, 5] as star}
                        <button
                            type="button"
                            class="star"
                            class:filled={(detailManga.rating ?? 0) >= star}
                            aria-label={`${star} star`}
                            onclick={() => {
                                if (detailManga) void rate(detailManga, star)
                                if (detailManga)
                                    detailManga = {
                                        ...detailManga,
                                        rating: detailManga.rating === star ? undefined : star
                                    }
                            }}>★</button>
                    {/each}
                </div>
                <div class="detail-categories">
                    <span class="muted">Tags</span>
                    {#if (detailManga.categories ?? []).length > 0}
                        <div class="tag-chips">
                            {#each detailManga.categories ?? [] as tag}
                                <span class="tag-chip">
                                    {tag}
                                    <button
                                        type="button"
                                        class="tag-x"
                                        aria-label={`Remove ${tag}`}
                                        onclick={() => detailManga && void removeTag(detailManga, tag)}>×</button>
                                </span>
                            {/each}
                        </div>
                    {:else}
                        <p class="muted" style="font-size:12px">No tags yet.</p>
                    {/if}

                    <div class="tag-add">
                        <input
                            type="text"
                            placeholder="Add tags (comma-separated)…"
                            bind:value={tagDraft}
                            onkeydown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault()
                                    if (detailManga) void addTagDraft(detailManga)
                                }
                            }} />
                        <button
                            type="button"
                            class="btn-sm"
                            disabled={!tagDraft.trim()}
                            onclick={() => detailManga && void addTagDraft(detailManga)}>Add</button>
                    </div>

                    <div class="tag-suggested">
                        <span class="muted suggested-label">
                            {#if genresLoading}
                                Loading suggested tags…
                            {:else if suggestedTags.length > 0}
                                Suggested from source — click to add:
                            {:else}
                                Sorry, we couldn't find recommended tags for this title.
                            {/if}
                        </span>
                        {#if suggestedTags.length > 0}
                            <div class="tag-chips">
                                {#each suggestedTags as g}
                                    <button
                                        type="button"
                                        class="tag-chip add"
                                        onclick={() => detailManga && void addTags(detailManga, [g])}>+ {g}</button>
                                {/each}
                                <button
                                    type="button"
                                    class="btn-sm"
                                    onclick={() => detailManga && void addTags(detailManga, suggestedTags)}
                                    >Add all</button>
                            </div>
                        {/if}
                    </div>
                </div>
                <label class="menu-toggle">
                    <input
                        type="checkbox"
                        checked={detailManga.nsfw ?? false}
                        onchange={e => detailManga && void setNsfw(detailManga, e.currentTarget.checked)} />
                    Mark as NSFW (blurs the cover)
                </label>
                <label class="detail-categories">
                    <span class="muted">Notes</span>
                    <textarea
                        class="detail-notes"
                        rows="3"
                        placeholder="Private notes about this title…"
                        bind:value={noteDraft}
                        onblur={() => detailManga && void saveNote(detailManga)}></textarea>
                </label>
                <label class="detail-categories">
                    <span class="muted">Re-link source (paste a chapter URL from a new mirror)</span>
                    <div class="sync-token">
                        <input
                            type="url"
                            placeholder="https://newmirror.example/manga/…/chapter-…/"
                            bind:value={relinkUrl} />
                        <button
                            type="button"
                            onclick={() => detailManga && void relink(detailManga)}
                            disabled={!relinkUrl.trim()}>
                            Re-link
                        </button>
                    </div>
                    {#if relinkMessage}<span class="muted">{relinkMessage}</span>{/if}
                </label>
                <div class="detail-mirrors">
                    <button
                        type="button"
                        class="btn-sm"
                        disabled={mirrorChecking || !hasPermission}
                        title={hasPermission
                            ? "Search every supported source for this title"
                            : "Grant source access first"}
                        onclick={() => detailManga && void checkMirrors(detailManga)}>
                        {mirrorChecking ? "Checking mirrors…" : "Check mirrors"}
                    </button>
                    {#if !mirrorChecking && mirrorCheckedFor === detailManga.id}
                        {#if mirrorResults.length === 0}
                            <span class="muted">No other supported mirror found.</span>
                        {:else}
                            <div class="mirror-list">
                                {#each mirrorResults as r}
                                    <div class="mirror-row">
                                        <span class="mirror-source">{r.sourceId}</span>
                                        <span class="muted"
                                            >{r.latestChapter ? `latest ch ${r.latestChapter}` : "—"}</span>
                                        {#if detailManga && r.sourceId !== detailManga.sourceId}
                                            <button
                                                type="button"
                                                class="btn-sm"
                                                onclick={() => detailManga && void switchMirror(detailManga, r)}>
                                                Switch
                                            </button>
                                        {:else}
                                            <span class="muted">current</span>
                                        {/if}
                                        <button
                                            type="button"
                                            class="btn-sm"
                                            onclick={() => void browser.tabs.create({ url: r.url })}>Open</button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    {/if}
                </div>
                <div class="detail-actions">
                    <button type="button" onclick={() => detailManga && openInReader(detailManga)}>Open reader</button>
                    <button type="button" class="btn-outline" onclick={() => detailManga && openInBrowser(detailManga)}>
                        Open source
                    </button>
                    <button type="button" class="btn-outline" onclick={() => (detailManga = null)}>Close</button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if paletteOpen}
    <div
        class="palette-overlay"
        role="button"
        tabindex="0"
        onclick={() => (paletteOpen = false)}
        onkeydown={e => {
            if (e.key === "Escape") paletteOpen = false
        }}>
        <div
            class="palette"
            role="dialog"
            aria-label="Command palette"
            tabindex="-1"
            onclick={e => e.stopPropagation()}
            onkeydown={() => {}}>
            <input
                use:autofocus
                class="palette-input"
                placeholder="Jump to a tab or title…"
                bind:value={paletteQuery}
                onkeydown={e => {
                    if (e.key === "Enter" && paletteResults[0]) runPalette(paletteResults[0])
                }} />
            <div class="palette-list">
                {#each paletteResults.slice(0, 12) as item}
                    <button type="button" class="palette-item" onclick={() => runPalette(item)}>
                        <span class="palette-kind">{item.kind === "tab" ? "Tab" : "Title"}</span>
                        <span class="palette-label">{item.label}</span>
                    </button>
                {/each}
                {#if paletteResults.length === 0}
                    <p class="muted" style="padding:10px 12px">No matches.</p>
                {/if}
            </div>
            <p class="muted palette-hint">Ctrl/⌘-K to toggle · Enter opens the first result · Esc closes</p>
        </div>
    </div>
{/if}
