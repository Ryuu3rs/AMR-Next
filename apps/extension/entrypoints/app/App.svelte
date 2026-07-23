<script lang="ts">
    import type { ImportConflict, ImportResolution, LibraryManga, PageBookmark } from "../../src/database"
    import type { AppSettings } from "../../src/settings"
    import { onDestroy, onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"
    import { runSettled } from "../../src/bulk"
    import { sourceOrigins, syncOrigins } from "../../src/permissions"
    import { migrateLegacyImport } from "../../src/legacy-import"
    import { getCachedCovers } from "../../src/database"
    import { repairMangahubChapterNumbers } from "../../src/handlers/updates-sources"
    import { formatUpdateFailureLog } from "../../src/updates-failure-log"
    import { subscribeLive } from "../../src/live"
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
        "Bookmarks",
        "Tags",
        "Updates",
        "History",
        "Stats",
        "Sources",
        "Data",
        "Settings"
    ] as const
    let activeSection = $state<(typeof sections)[number]>("Home")
    let library = $state<LibraryManga[]>([])
    let settings = $state<AppSettings | undefined>()
    // Local optimistic mirrors of specific settings controls - driven synchronously by
    // user interaction rather than by the settings:update round trip, so the displayed
    // value never appears to "go blank" or reset on any timing hiccup while it saves.
    let updateIntervalSelection = $state<0 | 6 | 12 | 24>(12)
    let updateIntervalSaved = $state(false)
    let updateIntervalSavedTimer: ReturnType<typeof setTimeout> | undefined
    let noGapSelection = $state(false)
    let noGapSelectionSaved = $state(false)
    let noGapSelectionSavedTimer: ReturnType<typeof setTimeout> | undefined
    let loading = $state(true)
    let query = $state("")
    let librarySort = $state<"recent-read" | "recent-added" | "title" | "latest-chapter">("recent-read")
    let categoryFilter = $state("")
    let genreFilter = $state("")
    let sourceFilter = $state("")
    let ratingFilter = $state(0)
    let updatedSinceFilter = $state(0)
    let showFiltersPanel = $state(false)
    let selectMode = $state(false)
    let selectedIds = $state<Set<string>>(new Set())
    let bulkCategory = $state("")
    let bulkMessage = $state("")
    let bulkWorking = $state(false)
    let bookmarks = $state<PageBookmark[]>([])
    let bookmarksLoaded = $state(false)

    function toggleSelect(id: string) {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        selectedIds = next
    }

    function clearSelection() {
        selectedIds = new Set()
        selectMode = false
        bulkMessage = ""
    }

    // Each id is removed independently - a mid-loop failure (SW restart, transient
    // error, one bad id) must not leave the local library out of sync with what was
    // actually deleted. Only the ids that actually succeeded are dropped from
    // `library` and cleared from the selection; failed ids stay selected so the
    // user can see what didn't go through and retry just those.
    async function bulkRemove() {
        const ids = [...selectedIds]
        bulkMessage = ""
        bulkWorking = true
        let succeeded: string[] = []
        let failed: string[] = []
        try {
            ;({ succeeded, failed } = await runSettled(ids, async id => {
                await sendRuntimeMessage({ type: "library:remove", mangaId: id })
            }))
        } finally {
            bulkWorking = false
        }
        const removedIds = new Set(succeeded)
        library = library.filter(m => !removedIds.has(m.id))
        if (failed.length > 0) {
            selectedIds = new Set([...selectedIds].filter(id => !removedIds.has(id)))
            bulkMessage = `Removed ${removedIds.size} of ${ids.length}. ${failed.length} failed - still selected, try again.`
        } else {
            clearSelection()
        }
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

    // Same per-id success/failure tracking as bulkRemove: only the ids that
    // actually succeeded get their local manualTracking flag flipped and cleared
    // from the selection, so a mid-loop failure can't make the dashboard claim a
    // manga is manual (or not) when the write never landed.
    async function bulkManual(on: boolean) {
        const ids = [...selectedIds]
        bulkMessage = ""
        bulkWorking = true
        let succeeded: string[] = []
        let failed: string[] = []
        try {
            ;({ succeeded, failed } = await runSettled(ids, async id => {
                await sendRuntimeMessage({ type: "library:manual", mangaId: id, manual: on })
            }))
        } finally {
            bulkWorking = false
        }
        const updatedIds = new Set(succeeded)
        library = library.map(m => (updatedIds.has(m.id) ? { ...m, manualTracking: on } : m))
        if (failed.length > 0) {
            selectedIds = new Set([...selectedIds].filter(id => !updatedIds.has(id)))
            bulkMessage = `Updated ${updatedIds.size} of ${ids.length}. ${failed.length} failed - still selected, try again.`
        } else {
            clearSelection()
        }
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

    // Deterministic primary pick, shared by mergeDuplicates and the merge-suggestion UI
    // so the badge shown before confirming always matches who actually wins the merge.
    function primaryOfGroup(group: LibraryManga[]): LibraryManga | undefined {
        return [...group].sort(
            (a, b) => (b.lastReadChapterNumber ?? 0) - (a.lastReadChapterNumber ?? 0) || b.updatedAt - a.updatedAt
        )[0]
    }

    // Merging duplicates is a single backend transaction (library:merge - see
    // mergeMangaRecords in src/database.ts) that re-points progress/historyEvents/
    // downloads/pageBookmarks onto the chosen primary and folds every field-merge
    // rule (numbers, categories, rating, notes, nsfw, etc.) into one atomic write,
    // instead of the multi-message replay this used to do.
    async function mergeDuplicates(group: LibraryManga[]) {
        const primary = primaryOfGroup(group)
        if (!primary) return
        const loserIds = group.filter(m => m.id !== primary.id).map(m => m.id)
        if (loserIds.length === 0) return
        await sendRuntimeMessage({ type: "library:merge", primaryId: primary.id, loserIds })
        clearSelection()
        await refresh()
    }
    let failedCovers = $state<Set<string>>(new Set())
    let coverSrcs = $state<Record<string, string>>({})
    // cachedAt of the covers-table row each entry in coverSrcs was created from -
    // lets loadCachedCovers detect that a blob was re-cached (capture.ts rewrites
    // the cover on every successful capture) and revoke+recreate just that one
    // object URL instead of keeping a stale image forever. Plain object, not
    // $state: only read/written inside loadCachedCovers, never rendered.
    let coverCachedAt: Record<string, number> = {}
    let refreshingCovers = $state(false)
    // Set at the start of each backfillCovers() run once the first batch response
    // establishes a total, cleared at the start of the NEXT run (component-level
    // $state, not module-scope, so it can't leak across separate invocations).
    let coverProgress = $state<{ done: number; total: number } | undefined>()

    let syncStatus = $state<SyncStatus | undefined>()
    let syncToken = $state("")
    let syncGistId = $state("")
    let syncMessage = $state("")
    let syncing = $state(false)
    let restoreBannerDismissed = $state(false)

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
    let importConflicts = $state<ImportConflict[]>([])
    let importEnvelope = $state<unknown>(null)
    let importMigrationMeta = $state<{
        migrated: boolean
        converted: number
        skipped: number
        needsAttention: string[]
    } | null>(null)
    let importResolutions = $state<Record<string, ImportResolution>>({})
    let importWorking = $state(false)
    let importError = $state("")

    // --- Repair auto-tracked entries (library:cleanup:scan / library:cleanup:apply) ---
    type CleanupMatchedBy = "adapter" | "pathname" | "scrape"
    type CleanupCandidateRecord = {
        mangaId: string
        title: string
        sourceUrl: string
        matchedChapterNumbers: number[]
        matchedBy: CleanupMatchedBy
    }
    type CleanupGroup = {
        canonicalId: string
        canonicalTitle: string
        canonicalCoverUrl?: string
        sourceId: string
        sourceMangaId: string
        mangaUrl: string
        representativeChapterUrl: string
        inLibrary: boolean
        selfHeal: boolean
        records: CleanupCandidateRecord[]
        overflowCount?: number
    }
    type CleanupUnresolved = { mangaId: string; title: string; sourceId: string; sourceUrl: string; reason: string }
    type CleanupScanResult = { groups: CleanupGroup[]; unresolved: CleanupUnresolved[]; candidateCount: number }
    type CleanupApplyResponse = {
        merged: number
        groups: number
        enriched: number
        skippedStale: number
        skippedUnverified: number
        failed: Array<{ canonicalId: string; reason: string }>
        backupId: number
    }

    let cleanupScanning = $state(false)
    let cleanupResult = $state<CleanupScanResult | null>(null)
    let cleanupSelected = $state<Record<string, boolean>>({})
    let cleanupExpanded = $state<Record<string, boolean>>({})
    let cleanupApplying = $state(false)
    let cleanupMessage = $state("")
    let cleanupBackupId = $state<number | null>(null)

    const cleanupSelectedGroups = $derived(
        cleanupResult ? cleanupResult.groups.filter(g => cleanupSelected[g.canonicalId] !== false) : []
    )
    const cleanupSelectedEntryCount = $derived(cleanupSelectedGroups.reduce((sum, g) => sum + g.records.length, 0))

    async function runCleanupScan() {
        cleanupScanning = true
        cleanupMessage = ""
        cleanupBackupId = null
        try {
            cleanupResult = await sendRuntimeMessage<CleanupScanResult>({ type: "library:cleanup:scan" })
            cleanupSelected = Object.fromEntries(cleanupResult.groups.map(g => [g.canonicalId, true]))
            cleanupExpanded = {}
        } catch (cause) {
            cleanupMessage = cause instanceof Error ? cause.message : "Scan failed."
        } finally {
            cleanupScanning = false
        }
    }

    function cancelCleanup() {
        cleanupResult = null
        cleanupSelected = {}
        cleanupExpanded = {}
    }

    async function applyCleanup() {
        if (!cleanupResult || cleanupSelectedGroups.length === 0) return
        cleanupApplying = true
        try {
            const payload = cleanupSelectedGroups.map(g => ({
                canonicalId: g.canonicalId,
                sourceId: g.sourceId,
                sourceMangaId: g.sourceMangaId,
                mangaUrl: g.mangaUrl,
                representativeChapterUrl: g.representativeChapterUrl,
                losers: g.records
                    .filter(r => r.mangaId !== g.canonicalId)
                    .map(r => ({ mangaId: r.mangaId, matchedBy: r.matchedBy }))
            }))
            const result = await sendRuntimeMessage<CleanupApplyResponse>({
                type: "library:cleanup:apply",
                groups: payload
            })
            cleanupBackupId = result.backupId
            cleanupMessage =
                `Merged ${result.merged} entries into ${result.groups} titles. ${result.enriched} enriched in place.` +
                ` ${result.skippedStale} skipped (stale). ${result.skippedUnverified} skipped (unverified).`
            cleanupResult = null
            cleanupSelected = {}
            cleanupExpanded = {}
            await load()
            await loadBackups()
        } catch (cause) {
            cleanupMessage = cause instanceof Error ? cause.message : "Cleanup apply failed."
        } finally {
            cleanupApplying = false
        }
    }

    // --- Backups list + restore (Data section) ---
    type BackupSummary = { id: number; createdAt: number; reason: string }
    let backupsList = $state<BackupSummary[]>([])
    let backupsLoaded = $state(false)
    let backupRestoreConfirm = $state<number | null>(null)
    let backupRestoring = $state(false)
    let backupMessage = $state("")

    async function loadBackups() {
        try {
            backupsList = await sendRuntimeMessage<BackupSummary[]>({ type: "data:backup:list" })
        } catch {
            // best-effort
        }
    }

    $effect(() => {
        if (activeSection === "Data" && !backupsLoaded) {
            backupsLoaded = true
            void loadBackups()
        }
    })

    async function restoreBackupById(id: number): Promise<boolean> {
        backupRestoring = true
        try {
            await sendRuntimeMessage({ type: "data:backup:restore", id })
            backupMessage = "Backup restored."
            backupRestoreConfirm = null
            await load()
            await loadBackups()
            // The restored library may no longer match a cleanup preview computed
            // against the pre-restore snapshot - drop it so a stale preview can
            // never survive past a restore. Also clear the cleanup backup id and
            // message so a stale "Merged N entries... Undo" banner from an earlier
            // cleanup can never point at the wrong backup after a manual restore.
            cancelCleanup()
            cleanupBackupId = null
            cleanupMessage = ""
            return true
        } catch (cause) {
            backupMessage = cause instanceof Error ? cause.message : "Restore failed."
            return false
        } finally {
            backupRestoring = false
        }
    }

    async function undoCleanup() {
        if (cleanupBackupId === null) return
        const id = cleanupBackupId
        cleanupBackupId = null
        const restored = await restoreBackupById(id)
        cleanupMessage = restored
            ? "Cleanup undone - backup restored."
            : "Undo failed - the backup could not be restored. See the Backups panel for details."
    }

    const showRestoreBanner = $derived(
        !loading && !restoreBannerDismissed && library.length === 0 && Boolean(syncStatus?.hasToken) && !importWorking
    )

    let clearConfirm = $state<"" | "history" | "all">("")
    let clearWorking = $state(false)
    let downloadsCount = $state(0)
    let reconcileIds = $state<string[]>([])
    let libScanIds = $state<string[]>([])
    const currentVersion = browser.runtime.getManifest().version
    let extensionUpdate = $state<{ available: boolean; latestVersion: string; releaseUrl: string } | null>(null)
    let updateBannerDismissed = $state(false)
    let checkingExtUpdate = $state(false)
    let updateStatus = $state<{
        checked: number
        updated: number
        failed: number
        checkedAt: number
        errors?: Array<{ mangaId: string; title: string; message: string }>
    } | null>(null)
    let updateProgress = $state<{
        running: boolean
        done: number
        total: number
        currentTitle?: string
        sourceId?: string
        startedAt: number
    } | null>(null)
    // Must match STALE_PROGRESS_TIMEOUT_MS in src/handlers/updates-sources.ts - a
    // running=true progress record older than this is treated as a crashed check
    // rather than a real one still in flight.
    const UPDATE_PROGRESS_STALE_MS = 15 * 60 * 1000

    let updateLogCopied = $state(false)
    let updateLogCopyTimer: ReturnType<typeof setTimeout> | undefined
    async function copyUpdateFailureLog() {
        if (!updateStatus?.errors || updateStatus.errors.length === 0) return
        const text = formatUpdateFailureLog(updateStatus.errors, {
            version: browser.runtime.getManifest().version,
            checkedAt: updateStatus.checkedAt,
            checked: updateStatus.checked,
            updated: updateStatus.updated,
            failed: updateStatus.failed
        })
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            return // clipboard access denied/unavailable - nothing more we can do
        }
        updateLogCopied = true
        if (updateLogCopyTimer) clearTimeout(updateLogCopyTimer)
        updateLogCopyTimer = setTimeout(() => {
            updateLogCopied = false
        }, 1500)
    }
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
    let detailManga = $state<LibraryManga | null>(null)
    let detailCommunityStats = $state<{ avgRating: number | null; ratingCount: number; readerCount: number } | null>(
        null
    )
    let relinkUrl = $state("")
    let relinkMessage = $state("")
    let mirrorResults = $state<SearchResult[]>([])
    let mirrorChecking = $state(false)
    let mirrorCheckedFor = $state("")
    // The mirror switch this manga's Switch button set is in flight for, keyed by
    // sourceId - a tab-fallback switch can take up to ~35s, so this both labels the
    // in-flight button and (via disabled={mirrorSwitching !== null} below) blocks a
    // second concurrent switch on the same manga while one is still running.
    let mirrorSwitching = $state<string | null>(null)

    // Re-point detailManga at the freshly-fetched record so an open detail
    // overlay reflects the latest library data (e.g. another tab's edit, a
    // backup restore, or a cleanup merge) - if the manga was deleted in the
    // process, leave the existing (now-dangling) reference alone rather than
    // clearing it out from under the user. Shared by both load() and refresh().
    function reconcileDetailManga() {
        const openDetailId = detailManga?.id
        if (openDetailId) {
            const updated = library.find(m => m.id === openDetailId)
            if (updated) detailManga = updated
        }
    }

    function closeDetail() {
        detailManga = null
        relinkUrl = ""
        relinkMessage = ""
        openSourceError = ""
        mirrorResults = []
        mirrorCheckedFor = ""
    }

    function normTitle(s: string): string {
        return s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
    }

    // sendRuntimeMessage() rejects with whatever message the background dispatcher
    // forwarded verbatim (see src/background/handler-types.ts's failure()) - for
    // network-layer failures (a source timing out, 403ing, etc.) that's raw debug
    // text like "Request failed with status 403 [https://kagane.to/series/…]",
    // never meant for a user to read as-is. Curated SourceError messages have no
    // such bracketed/status-coded suffix and pass through unchanged; only the raw,
    // technical-looking ones get swapped for a friendly fallback. The raw message
    // is still logged for our own debugging.
    const RAW_ERROR_PATTERN = /\[https?:\/\/|\brequest (failed|timed out)\b|\bstatus \d{3}\b/i
    function describeError(cause: unknown, fallback: string): string {
        console.warn("[AMR] mirror action failed:", cause)
        const raw = cause instanceof Error ? cause.message : ""
        if (!raw || RAW_ERROR_PATTERN.test(raw)) return fallback
        return raw
    }

    // Same-source search endpoints can return duplicate/near-duplicate entries for
    // one underlying series - different sourceMangaIds under slightly different
    // title variants or translations (a catalog-data issue on the source's end).
    // Collapse those per-source so the mirror list doesn't show the same series
    // twice; entries from DIFFERENT sources are never merged even when titles
    // match closely, since that's a legitimate multi-mirror scenario. When a pair
    // differs on chapter count, keep whichever result has a real number.
    function dedupeMirrors(results: SearchResult[]): SearchResult[] {
        const kept: SearchResult[] = []
        for (const result of results) {
            const norm = normTitle(result.title)
            const dupIdx = kept.findIndex(k => {
                if (k.sourceId !== result.sourceId) return false
                const kNorm = normTitle(k.title)
                return kNorm === norm || kNorm.includes(norm) || norm.includes(kNorm)
            })
            if (dupIdx === -1) {
                kept.push(result)
                continue
            }
            const existing = kept[dupIdx]!
            const existingHasChapter = !!existing.latestChapter
            const candidateHasChapter = !!result.latestChapter
            if (!existingHasChapter && candidateHasChapter) {
                kept[dupIdx] = result
            } else if (existingHasChapter && candidateHasChapter) {
                const existingNum = parseFloat(existing.latestChapter ?? "0") || 0
                const candidateNum = parseFloat(result.latestChapter ?? "0") || 0
                if (candidateNum > existingNum) kept[dupIdx] = result
            }
        }
        return kept
    }

    async function switchMirror(manga: LibraryManga, result: SearchResult) {
        mirrorCheckedFor = manga.id
        mirrorSwitching = result.sourceId
        try {
            await sendRuntimeMessage({
                type: "library:switch",
                mangaId: manga.id,
                sourceId: result.sourceId,
                sourceMangaId: result.sourceMangaId,
                mangaUrl: result.url,
                allowTabFallback: true
            })
            await load()
            detailManga = library.find(m => m.id === manga.id) ?? null
            relinkMessage = `Switched to ${result.sourceId}. Progress preserved by chapter number.`
        } catch (cause) {
            relinkMessage = describeError(cause, "Switch failed - this source may be temporarily unavailable.")
        } finally {
            mirrorSwitching = null
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
            mirrorResults = dedupeMirrors(
                all.filter(r => {
                    const t = normTitle(r.title)
                    return t === want || t.includes(want) || want.includes(t)
                })
            ).sort((a, b) => (parseFloat(b.latestChapter ?? "0") || 0) - (parseFloat(a.latestChapter ?? "0") || 0))
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
            const result = await sendRuntimeMessage({ type: "library:relink", mangaId: manga.id, url })
            relinkUrl = ""
            await load()
            // After load(), find the updated record by the new mangaId
            const newMangaId = (result as { sourceId: string; mangaId: string })?.mangaId ?? manga.id
            detailManga = library.find(m => m.id === newMangaId) ?? null
            relinkMessage = "Re-linked. Progress preserved by chapter number."
        } catch (cause) {
            relinkMessage = describeError(cause, "Re-link failed - the source may be unavailable.")
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
    let searchTotal = $state(0)
    let searchSettled = $state(0)
    let expandedSourceGroups = $state<Set<string>>(new Set())
    function toggleSourceGroup(sourceId: string) {
        const next = new Set(expandedSourceGroups)
        if (next.has(sourceId)) next.delete(sourceId)
        else next.add(sourceId)
        expandedSourceGroups = next
    }
    let selectedManga = $state<{ title: string } | null>(null)
    let mangaChapters = $state<Array<{ id: string; title: string; chapter?: string; url: string }>>([])
    let chaptersLoading = $state(false)
    // True while the chapter list or global search results are showing on Home - the
    // continue-reading/recently-added shelves aren't relevant then and would otherwise
    // render directly underneath with no separation, reading as a layout glitch.
    const searchActive = $derived(
        Boolean(selectedManga) || (browseQuery.trim().length > 0 && (searchLoading || searchResults.length > 0))
    )
    // If the title being browsed in the chapters panel is already in the library,
    // match it by normalized title so the last-read chapter can be highlighted.
    const selectedMangaLibraryEntry = $derived.by(() => {
        if (!selectedManga) return undefined
        const want = normTitle(selectedManga.title)
        return library.find(m => normTitle(m.title) === want)
    })
    type HistoryEntry = {
        mangaId: string
        title: string
        type: "started" | "completed"
        occurredAt: number
        chapterNumber?: number | null
        chapterTitle?: string | null
        chapterUrl?: string | null
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

    async function loadBookmarks() {
        try {
            bookmarks = await sendRuntimeMessage<PageBookmark[]>({ type: "bookmark:list" })
        } catch {
            bookmarks = []
        } finally {
            bookmarksLoaded = true
        }
    }

    $effect(() => {
        if (activeSection === "Bookmarks") void loadBookmarks()
    })

    async function deleteBookmark(id: string) {
        await sendRuntimeMessage({ type: "bookmark:remove", id })
        bookmarks = bookmarks.filter(b => b.id !== id)
    }

    function bookmarkReaderUrl(b: PageBookmark): string {
        const base = browser.runtime.getURL("/reader.html")
        return `${base}?url=${encodeURIComponent(b.chapterUrl)}&page=${b.pageIndex}`
    }

    $effect(() => {
        document.documentElement.dataset["theme"] = settings?.theme ?? "dark"
    })

    function isSeedData(manga: LibraryManga): boolean {
        return manga.id.startsWith("seed-")
    }

    const DAY_MS = 86_400_000

    function isRecentlyAdded(manga: LibraryManga): boolean {
        return manga.addedAt > Date.now() - DAY_MS
    }

    // A title the user has never opened at all (no read id AND no read number).
    function neverRead(manga: LibraryManga): boolean {
        return manga.lastReadChapterId === undefined && manga.lastReadChapterNumber === undefined
    }

    // True when the title has chapters newer than the last-read position. Prefer a
    // chapter-NUMBER comparison: after an import or migration latestChapterId and
    // lastReadChapterId legitimately differ - the backup's read id points at the old
    // source's chapter, the latest id at the re-fetched one - even when the numbers
    // match, which left a stale "Unread" badge on a fully caught-up title. Only when a
    // number is genuinely unavailable (an unnumbered-only title, or the last chapter
    // read was an unnumbered special) fall back to id inequality - there are no numbers
    // to have desynced there, so the id signal is the correct one. Drives the poster
    // "Unread" badge, which - like before - never fires for a never-read title (that
    // surfaces through the number-based unread filter instead).
    function hasNewerChapters(manga: LibraryManga): boolean {
        if (manga.latestChapterNumber !== undefined && manga.lastReadChapterNumber !== undefined) {
            return manga.latestChapterNumber > manga.lastReadChapterNumber
        }
        return !!(manga.latestChapterId && manga.lastReadChapterId && manga.latestChapterId !== manga.lastReadChapterId)
    }

    // Updates-list / "Updated"-chip membership: newer chapters, OR a never-opened title
    // that has any chapter to read. Kept distinct from hasNewerChapters so the badge and
    // the Updates list can disagree on the never-read case exactly as they did before.
    function hasUpdates(manga: LibraryManga): boolean {
        return (
            hasNewerChapters(manga) ||
            (neverRead(manga) && (manga.latestChapterId !== undefined || manga.latestChapterNumber !== undefined))
        )
    }

    function isRecentlyUpdated(manga: LibraryManga): boolean {
        if (manga.updatedAt <= Date.now() - DAY_MS) return false
        return hasUpdates(manga)
    }

    // When a dashboard tab that's already open regains focus (e.g. the reader's
    // "back to dashboard" refocuses it rather than opening a fresh one), pick up any
    // progress changes from the reading session with a cheap indexed re-query -
    // without re-triggering the cover backfill cascade.
    function onVisibilityChange() {
        if (document.visibilityState === "visible") void refresh()
    }

    let unsubscribeLive: (() => void) | undefined

    onMount(async () => {
        document.addEventListener("visibilitychange", onVisibilityChange)
        unsubscribeLive = subscribeLive(["library", "chapters", "progress", "all"], () => void refresh())
        await load()
        hasPermission = await sendRuntimeMessage<boolean>({ type: "source:permission:check" })
        if (hasPermission) {
            void maybeBackfillCovers()
            // Invisible, one-time maintenance: fixes already-poisoned MangaHub badges
            // (see repairMangahubChapterNumbers) within a normal app session - no UI,
            // no progress bar. The function itself guards against re-running via a
            // persisted storage flag, so this call is safe on every mount.
            void repairMangahubChapterNumbers()
        }
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
        try {
            const stored = (await browser.storage.local.get("updateProgress"))["updateProgress"] as
                | typeof updateProgress
                | undefined
            if (stored) {
                updateProgress = stored
                // A running=true left over from a check that never finished (e.g. the
                // service worker died mid-loop) would otherwise disable "Check all"
                // forever if automatic interval checks are off - mirrors the same
                // STALE_PROGRESS_TIMEOUT_MS threshold the updates:check handler uses to
                // self-heal server-side (src/handlers/updates-sources.ts).
                const isStale = stored.running && Date.now() - stored.startedAt > UPDATE_PROGRESS_STALE_MS
                checkingUpdates = stored.running && !isStale
            }
        } catch {
            // optional
        }
        // An update check (this popup's own, or the background alarm's) writes its
        // live progress to storage as it goes - reflect it here instead of awaiting
        // the `updates:check` message, which is now fire-and-forget (see checkForUpdates).
        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== "local") return
            if (changes["updateProgress"]) {
                const next = (changes["updateProgress"].newValue as typeof updateProgress) ?? null
                const wasRunning = (changes["updateProgress"].oldValue as typeof updateProgress | undefined)?.running
                updateProgress = next
                if (wasRunning && !next?.running) {
                    checkingUpdates = false
                    // The check just finished - the library data it touched (latest
                    // chapter ids/numbers) needs a refresh to show up in the UI.
                    void refresh()
                }
            }
            if (changes["updateStatus"]) {
                updateStatus = (changes["updateStatus"].newValue as typeof updateStatus) ?? null
            }
        })
    })

    onDestroy(() => {
        document.removeEventListener("visibilitychange", onVisibilityChange)
        unsubscribeLive?.()
        // Full revoke-everything sweep so nothing leaks when the tab closes -
        // loadCachedCovers only revokes URLs for ids that drop out of the library
        // between refreshes, not the ones still current when the component unmounts.
        for (const url of Object.values(coverSrcs)) URL.revokeObjectURL(url)
    })

    // Diffs by mangaId instead of rebuilding coverSrcs from scratch: an id that
    // already has an object URL keeps it (no revoke+recreate), a genuinely new id
    // gets a fresh object URL, and an id no longer present (manga removed) gets
    // its URL revoked and dropped. Rebuilding from scratch on every call (the
    // prior behavior) meant a live-triggered refresh() revoked every cover's
    // object URL right as it reassigned coverSrcs, blanking the whole grid for a
    // frame even though nothing about the covers actually changed.
    // Also compares cachedAt per id: capture.ts re-caches a manga's cover blob on
    // every successful chapter capture (not just when uncached), so an unchanged
    // mangaId can still point at stale image bytes. When cachedAt has moved, the
    // existing object URL is revoked and recreated from the fresh blob; ids whose
    // cachedAt is unchanged keep their existing URL untouched, same as before.
    async function loadCachedCovers() {
        const records = await getCachedCovers(library.map(m => m.id))
        const next: Record<string, string> = {}
        const nextCachedAt: Record<string, number> = {}
        // Revoke only after coverSrcs points at the replacement URLs, so no
        // in-between render can hold a revoked URL as an img src.
        const toRevoke: string[] = []
        for (const [mangaId, record] of records) {
            const existing = coverSrcs[mangaId]
            if (existing !== undefined && coverCachedAt[mangaId] === record.cachedAt) {
                next[mangaId] = existing
            } else {
                if (existing !== undefined) toRevoke.push(existing)
                next[mangaId] = URL.createObjectURL(record.blob)
            }
            nextCachedAt[mangaId] = record.cachedAt
        }
        for (const [mangaId, url] of Object.entries(coverSrcs)) {
            if (!(mangaId in next)) toRevoke.push(url)
        }
        coverSrcs = next
        coverCachedAt = nextCachedAt
        for (const url of toRevoke) URL.revokeObjectURL(url)
        // A cached blob now exists for these ids - clear any stale "failed to load"
        // flag so a previously-broken remote cover doesn't stay permanently blanked
        // once a cached blob has been backfilled (or, now, re-cached with a working
        // image after previously failing).
        if (failedCovers.size > 0) {
            const cleared = new Set(failedCovers)
            let changed = false
            for (const mangaId of Object.keys(next)) {
                if (cleared.delete(mangaId)) changed = true
            }
            if (changed) failedCovers = cleared
        }
    }

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

    // Background cover-freshness sweep shouldn't re-run its full network cascade
    // on every single dashboard open - the MV3 service worker is essentially always
    // killed and restarted between reading sessions, so an in-memory dedup set alone
    // doesn't prevent that. Gate the automatic onMount trigger behind this TTL; the
    // manual "Refresh covers" button and post-import call still bypass it below.
    const COVER_BACKFILL_TTL_MS = 8 * 60 * 60 * 1000

    async function maybeBackfillCovers() {
        try {
            const stored = await browser.storage.local.get("lastCoverBackfillAt")
            const last = stored["lastCoverBackfillAt"] as number | undefined
            if (last && Date.now() - last < COVER_BACKFILL_TTL_MS) return
        } catch {
            // storage read failed - fall through and attempt the backfill anyway
        }
        void backfillCovers()
    }

    async function backfillCovers() {
        if (refreshingCovers) return
        refreshingCovers = true
        // Reset at the start of THIS run - must not carry a stale done/total from a
        // previous invocation into a fresh one.
        coverProgress = undefined
        void browser.storage.local.set({ lastCoverBackfillAt: Date.now() }).catch(() => {})
        try {
            let anyUpdated = false
            // `total` reflects the handler's remaining target-set size at the start of
            // that batch, which can shrink between batches as attempted ids drop out of
            // the target set (see library:covers:backfill) - track the largest total
            // seen so the progress bar doesn't appear to shrink mid-run.
            let maxTotal = 0
            for (;;) {
                const res = await sendRuntimeMessage<{ updated: number; remaining: number; total: number }>({
                    type: "library:covers:backfill"
                })
                if (res.updated > 0) anyUpdated = true
                if (typeof res.total === "number") {
                    maxTotal = Math.max(maxTotal, res.total)
                    coverProgress = { done: Math.max(0, maxTotal - res.remaining), total: maxTotal }
                }
                if (res.remaining === 0) break
                // Brief pause between batches so the service worker doesn't timeout
                await new Promise<void>(r => setTimeout(r, 300))
            }
            // Refresh once at the end instead of after every batch - a backfill can span
            // many batches, and reloading the whole library (stats/settings/updates +
            // every cached cover) after each one was the actual bottleneck, not the
            // backfill itself.
            if (anyUpdated) {
                failedCovers = new Set()
                void load()
            }
        } catch {
            // covers are best-effort
        } finally {
            refreshingCovers = false
        }
    }

    // A "Search all"/"Find better sources" reconcile sweep can auto-link dozens of
    // titles in quick succession - each onLinked() call firing a synchronous load()
    // (a full library-list + every cached cover re-read from IndexedDB) would flood
    // the dashboard with ~1 full reload per link, competing with the sweep's own
    // network traffic. Trailing-debounce collapses a burst of onLinked() calls into
    // one load() 1s after the last one. The live-update-bus refresh() subscription
    // (subscribeLive, see onMount) already covers incremental freshness in the
    // meantime, so this doesn't lose reactivity between the last link and the
    // debounced load().
    let scheduledLoadTimer: ReturnType<typeof setTimeout> | undefined
    function scheduleLoad() {
        if (scheduledLoadTimer !== undefined) clearTimeout(scheduledLoadTimer)
        scheduledLoadTimer = setTimeout(() => {
            scheduledLoadTimer = undefined
            void load()
        }, 1000)
    }

    async function load() {
        loading = true
        try {
            ;[library, settings] = await Promise.all([
                sendRuntimeMessage<LibraryManga[]>({ type: "library:list" }),
                sendRuntimeMessage<AppSettings>({ type: "settings:get" })
            ])
            updateIntervalSelection = settings.updateIntervalHours
            noGapSelection = settings.noGapContinuous
            // stats:get scans the whole progress/history tables and isn't needed to paint
            // the library - fetch it in the background instead of blocking the grid on it.
            void sendRuntimeMessage<typeof stats>({ type: "stats:get" }).then(result => {
                stats = result
            })
            void sendRuntimeMessage<typeof updateStatus>({ type: "updates:get" }).then(result => {
                updateStatus = result
            })
            const stored = (await browser.storage.local.get("extensionUpdate"))["extensionUpdate"] as
                | typeof extensionUpdate
                | undefined
            if (stored?.available) extensionUpdate = stored
            // Fire a non-blocking check on every popup open (24h throttle in background).
            // Ensures the banner appears promptly after a release even without a browser restart.
            void sendRuntimeMessage<typeof extensionUpdate>({ type: "extension-update:check" }).then(result => {
                if (result) extensionUpdate = result
            })
            // Persist broken-link panel across page opens. Entries with manualTracking
            // and a hostname-style sourceId (contains ".") were imported from an unknown
            // source. Adapter IDs like "madara"/"mangadex" never contain dots, so this
            // correctly skips titles the user deliberately marked manual.
            const libraryNeedsAttention = library
                .filter(m => m.manualTracking && m.sourceId.includes("."))
                .map(m => m.id)
            if (libraryNeedsAttention.length > 0) {
                reconcileIds = [...new Set([...reconcileIds, ...libraryNeedsAttention])]
            }
        } finally {
            loading = false
        }
        reconcileDetailManga()
        void loadCachedCovers()
    }

    // Same data-fetching as load(), but for a tab that's already showing the
    // library - never flips `loading` (which would blank the whole page behind a
    // spinner), and is generation-guarded against out-of-order responses: a fast
    // refocus-triggered refresh() racing a live-event-triggered one could
    // otherwise let the slower response's stale library data land last and
    // clobber the newer one.
    let refreshGeneration = 0

    async function refresh() {
        refreshGeneration += 1
        const generation = refreshGeneration
        const [nextLibrary, nextSettings] = await Promise.all([
            sendRuntimeMessage<LibraryManga[]>({ type: "library:list" }),
            sendRuntimeMessage<AppSettings>({ type: "settings:get" })
        ])
        // A newer refresh() call started while this one was in flight - let it win.
        if (generation !== refreshGeneration) return

        library = nextLibrary
        settings = nextSettings
        updateIntervalSelection = settings.updateIntervalHours
        noGapSelection = settings.noGapContinuous
        void sendRuntimeMessage<typeof stats>({ type: "stats:get" }).then(result => {
            stats = result
        })
        void sendRuntimeMessage<typeof updateStatus>({ type: "updates:get" }).then(result => {
            updateStatus = result
        })
        const stored = (await browser.storage.local.get("extensionUpdate"))["extensionUpdate"] as
            | typeof extensionUpdate
            | undefined
        if (stored?.available) extensionUpdate = stored
        void sendRuntimeMessage<typeof extensionUpdate>({ type: "extension-update:check" }).then(result => {
            if (result) extensionUpdate = result
        })
        const libraryNeedsAttention = library.filter(m => m.manualTracking && m.sourceId.includes(".")).map(m => m.id)
        if (libraryNeedsAttention.length > 0) {
            reconcileIds = [...new Set([...reconcileIds, ...libraryNeedsAttention])]
        }
        reconcileDetailManga()
        void loadCachedCovers()
    }

    function isValidUrl(value: string | undefined | null): value is string {
        if (!value) return false
        try {
            new URL(value)
            return true
        } catch {
            return false
        }
    }

    // Best-effort link for a manga: the series/detail page is more durable than
    // a last-captured chapter URL, which can 404 once a site reslugs chapters.
    // Falls back to the adapter's homepage/domain if neither stored URL is usable.
    function resolveSourceLink(manga: LibraryManga): string | undefined {
        if (isValidUrl(manga.mangaUrl)) return manga.mangaUrl
        if (isValidUrl(manga.sourceUrl)) return manga.sourceUrl
        const meta = sourceMeta.get(manga.sourceId)
        const homepage = meta?.homepage ?? (meta?.domains[0] ? `https://${meta.domains[0]}` : undefined)
        return isValidUrl(homepage) ? homepage : undefined
    }

    let openSourceError = $state("")

    function openInBrowser(manga: LibraryManga, active = true, opts: { fallback?: boolean } = {}) {
        if (!opts.fallback) {
            void browser.tabs.create({ url: manga.sourceUrl, active })
            return
        }
        openSourceError = ""
        const url = resolveSourceLink(manga)
        if (!url) {
            openSourceError = "Couldn't open - no working link found for this source."
            return
        }
        void browser.tabs.create({ url, active })
    }

    function openSeriesPage(manga: LibraryManga, e?: MouseEvent) {
        // auxclick fires for right-click too - don't hijack the context menu.
        if (e?.button === 2) return
        if (selectMode) {
            toggleSelect(manga.id)
            return
        }
        const url = manga.mangaUrl ?? manga.sourceUrl
        if (!url) return
        void browser.tabs.create({ url, active: e?.button !== 1 })
    }

    function openInReader(manga: LibraryManga) {
        void browser.tabs.create({
            url: browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(manga.sourceUrl)}`)
        })
    }

    // Primary click honors the openChapterIn setting. Ctrl/middle-click always
    // opens the source page directly in a background tab (G11).
    function read(manga: LibraryManga, event?: MouseEvent) {
        // auxclick fires for right-click too - don't hijack the context menu.
        if (event?.button === 2) return
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
            const result = await sendRuntimeMessage<string[]>({ type: "manga:genres", mangaId: manga.id })
            // Guard against a stale response landing after the user already switched
            // to a different title - don't overwrite what's now on screen.
            if (detailManga?.id === manga.id) genreSuggestions = result
        } catch {
            if (detailManga?.id === manga.id) genreSuggestions = []
        } finally {
            if (detailManga?.id === manga.id) genresLoading = false
        }
    }
    $effect(() => {
        const id = detailManga?.id
        if (id && genresForId !== id) {
            genresForId = id
            if (detailManga) void loadGenres(detailManga)
        }
    })

    // Same previous-id-guard pattern as the genres effect above: without it, a
    // live-triggered refresh() reassigning detailManga to a new object reference
    // for the SAME id would re-run this effect (Svelte 5 effects re-run on
    // reference changes even when the id is unchanged), clearing and re-fetching
    // community stats on every refresh and causing a visible flicker.
    let communityStatsForId = $state<string | null>(null)
    $effect(() => {
        const id = detailManga?.id
        const title = detailManga?.title
        if (!id || communityStatsForId === id) return
        communityStatsForId = id
        detailCommunityStats = null
        if (title) {
            void sendRuntimeMessage<{ avgRating: number | null; ratingCount: number; readerCount: number }>({
                type: "community:manga-stats",
                mangaTitle: title
            })
                .then(s => {
                    // Guard against a stale response landing after the user switched titles.
                    if (detailManga?.id === id) detailCommunityStats = s
                })
                .catch(() => {})
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
        const nextRating = next === 0 ? undefined : next
        library = library.map(m => (m.id === manga.id ? { ...m, rating: nextRating } : m))
        if (detailManga && detailManga.id === manga.id) detailManga = { ...detailManga, rating: nextRating }
        if (next > 0) {
            void sendRuntimeMessage({ type: "community:rate", mangaTitle: manga.title, rating: next }).catch(() => {})
        }
    }

    async function setNsfw(manga: LibraryManga, nsfw: boolean) {
        await sendRuntimeMessage({ type: "library:nsfw", mangaId: manga.id, nsfw })
        library = library.map(m => (m.id === manga.id ? { ...m, nsfw } : m))
        if (detailManga && detailManga.id === manga.id) detailManga = { ...detailManga, nsfw }
    }

    async function setManual(manga: LibraryManga, manual: boolean) {
        await sendRuntimeMessage({ type: "library:manual", mangaId: manga.id, manual })
        library = library.map(m => (m.id === manga.id ? { ...m, manualTracking: manual } : m))
        if (detailManga && detailManga.id === manga.id) detailManga = { ...detailManga, manualTracking: manual }
    }

    async function setHold(manga: LibraryManga, onHold: boolean) {
        await sendRuntimeMessage({ type: "library:hold", mangaId: manga.id, onHold })
        library = library.map(m => (m.id === manga.id ? { ...m, onHold } : m))
        if (detailManga && detailManga.id === manga.id) detailManga = { ...detailManga, onHold }
    }

    async function setNumber(manga: LibraryManga, field: "lastReadChapterNumber" | "latestChapterNumber", raw: string) {
        const trimmed = raw.trim()
        const value = trimmed === "" ? null : Math.max(0, Number(trimmed))
        if (value !== null && !Number.isFinite(value)) return
        await sendRuntimeMessage({ type: "library:numbers", mangaId: manga.id, [field]: value })
        const applyNumber = (m: LibraryManga): LibraryManga => {
            const next = { ...m }
            if (value === null) delete next[field]
            else next[field] = value
            return next
        }
        library = library.map(m => (m.id === manga.id ? applyNumber(m) : m))
        if (detailManga && detailManga.id === manga.id) detailManga = applyNumber(detailManga)
    }

    async function setReadingDirection(manga: LibraryManga, raw: string) {
        const value = raw === "" ? null : (raw as "ltr" | "rtl" | "vertical")
        await sendRuntimeMessage({ type: "library:reading-prefs", mangaId: manga.id, readingDirection: value })
        const apply = (m: LibraryManga): LibraryManga => {
            const next = { ...m }
            if (value === null) delete next.readingDirection
            else next.readingDirection = value
            return next
        }
        library = library.map(m => (m.id === manga.id ? apply(m) : m))
        if (detailManga && detailManga.id === manga.id) detailManga = apply(detailManga)
    }

    async function setReadingPageFit(manga: LibraryManga, raw: string) {
        const value = raw === "" ? null : (raw as "width" | "height" | "contain" | "original")
        await sendRuntimeMessage({ type: "library:reading-prefs", mangaId: manga.id, pageFit: value })
        const apply = (m: LibraryManga): LibraryManga => {
            const next = { ...m }
            if (value === null) delete next.pageFit
            else next.pageFit = value
            return next
        }
        library = library.map(m => (m.id === manga.id ? apply(m) : m))
        if (detailManga && detailManga.id === manga.id) detailManga = apply(detailManga)
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
        importConflicts = []
        importEnvelope = null
        importMigrationMeta = null
        importResolutions = {}
        dataMessage = ""
        importError = ""
        importWorking = true
        try {
            const raw: unknown = JSON.parse(await file.text())
            const { envelope, migrated, converted, skipped, needsAttention } = migrateLegacyImport(raw)
            const conflicts = await sendRuntimeMessage<ImportConflict[]>({
                type: "data:import:preview",
                envelope
            })
            importEnvelope = envelope
            importMigrationMeta = { migrated, converted, skipped, needsAttention }
            if (conflicts.length > 0) {
                importConflicts = conflicts
                importResolutions = Object.fromEntries(conflicts.map(c => [c.mangaId, "overwrite" as ImportResolution]))
            } else {
                await applyImport(envelope, {}, { migrated, converted, skipped, needsAttention })
            }
        } catch (cause) {
            dataMessage = cause instanceof Error ? cause.message : "The backup could not be imported."
        } finally {
            importWorking = false
        }
    }

    async function applyImport(
        envelope: unknown,
        resolutions: Record<string, ImportResolution>,
        meta: { migrated: boolean; converted: number; skipped: number; needsAttention: string[] }
    ) {
        const result = await sendRuntimeMessage<{ manga: number; chapters: number }>({
            type: "data:import",
            // envelope/resolutions can be $state proxies (importEnvelope/importResolutions) when
            // called from confirmImport() - extension messaging structurally clones the payload,
            // which throws on a Proxy ("Proxy object could not be cloned"). Snapshot to plain data.
            envelope: $state.snapshot(envelope),
            resolutions: $state.snapshot(resolutions)
        })
        importConflicts = []
        importEnvelope = null
        importMigrationMeta = null
        importResolutions = {}
        await load()
        if (meta.migrated) {
            reconcileIds = meta.needsAttention
            dataMessage =
                `Imported ${meta.converted} manga from old AMR backup.` +
                (meta.skipped > 0 ? ` ${meta.skipped} entries skipped (no title or URL).` : "") +
                (meta.needsAttention.length > 0
                    ? ` ${meta.needsAttention.length} titles need a live source - see below.`
                    : "")
            if (meta.needsAttention.length > 0) activeSection = "Data"
        } else {
            dataMessage = `Imported ${result.manga} manga and ${result.chapters} chapters.`
        }
        void backfillCovers()
    }

    async function confirmImport() {
        if (!importEnvelope || !importMigrationMeta) return
        importWorking = true
        importError = ""
        try {
            await applyImport(importEnvelope, importResolutions, importMigrationMeta)
        } catch (cause) {
            importError = cause instanceof Error ? cause.message : "Import failed."
        } finally {
            importWorking = false
        }
    }

    function cancelImport() {
        importConflicts = []
        importEnvelope = null
        importMigrationMeta = null
        importResolutions = {}
        importError = ""
    }

    function setAllResolutions(resolution: ImportResolution) {
        importResolutions = Object.fromEntries(importConflicts.map(c => [c.mangaId, resolution]))
    }

    async function checkForUpdates(sourceId?: string) {
        checkingUpdates = true
        try {
            // Fire-and-forget: a full library check can run for minutes, longer than an
            // MV3 message channel survives. The background handler starts the check and
            // acks immediately; progress/completion are picked up via the
            // browser.storage.onChanged listener registered in onMount.
            const ack = await sendRuntimeMessage<{ started: boolean; alreadyRunning?: boolean }>({
                type: "updates:check",
                ...(sourceId ? { sourceId } : {})
            })
            if (!ack.started) {
                // A check is already running (this popup's own alarm-triggered check, or
                // one started elsewhere) - leave checkingUpdates on, the storage listener
                // will clear it when that check completes.
                return
            }
        } catch (cause) {
            console.error("[AMR] Update check failed", cause)
            checkingUpdates = false
        }
    }

    const updateProgressPct = $derived(
        updateProgress && updateProgress.total > 0 ? Math.round((updateProgress.done / updateProgress.total) * 100) : 0
    )

    const librarySources = $derived([...new Set(library.filter(m => !isSeedData(m)).map(m => m.sourceId))].sort())

    const sourceTitleCounts = $derived.by(() => {
        const counts = new Map<string, number>()
        for (const m of library) {
            if (isSeedData(m)) continue
            counts.set(m.sourceId, (counts.get(m.sourceId) ?? 0) + 1)
        }
        return counts
    })

    async function checkForExtensionUpdate() {
        checkingExtUpdate = true
        try {
            const result = await sendRuntimeMessage<typeof extensionUpdate>({
                type: "extension-update:check",
                force: true
            })
            extensionUpdate = result
            updateBannerDismissed = false
        } catch (cause) {
            console.error("[AMR] Extension update check failed", cause)
        } finally {
            checkingExtUpdate = false
        }
    }

    async function changeUpdateInterval(value: string) {
        const next = Number(value) as 0 | 6 | 12 | 24
        // Update the local selection synchronously, before the await, so the <select>
        // never appears to reset/go blank while the round trip is in flight.
        updateIntervalSelection = next
        settings = await sendRuntimeMessage<AppSettings>({
            type: "settings:update",
            settings: { updateIntervalHours: next }
        })
        updateIntervalSaved = true
        if (updateIntervalSavedTimer) clearTimeout(updateIntervalSavedTimer)
        updateIntervalSavedTimer = setTimeout(() => {
            updateIntervalSaved = false
        }, 1500)
    }

    async function changeNoGapContinuous(enabled: boolean) {
        noGapSelection = enabled
        settings = await sendRuntimeMessage<AppSettings>({
            type: "settings:update",
            settings: { noGapContinuous: enabled }
        })
        noGapSelectionSaved = true
        if (noGapSelectionSavedTimer) clearTimeout(noGapSelectionSavedTimer)
        noGapSelectionSavedTimer = setTimeout(() => {
            noGapSelectionSaved = false
        }, 1500)
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

    // Only one search-stream port should ever be in flight - a new search (typed or
    // submitted) disconnects whatever the previous one started so rapid typing doesn't
    // pile up concurrent streaming searches.
    let searchPort: ReturnType<typeof browser.runtime.connect> | null = null
    let searchDebounceHandle: ReturnType<typeof setTimeout> | null = null
    const SEARCH_DEBOUNCE_MS = 450
    const SEARCH_MIN_LENGTH = 3

    function doSearch() {
        if (!browseQuery.trim()) return
        if (searchDebounceHandle) {
            clearTimeout(searchDebounceHandle)
            searchDebounceHandle = null
        }
        if (searchPort) {
            searchPort.disconnect()
            searchPort = null
        }
        searchLoading = true
        searchResults = []
        searchTotal = 0
        searchSettled = 0
        expandedSourceGroups = new Set()
        selectedManga = null

        const port = browser.runtime.connect({ name: "search-stream" })
        searchPort = port
        const query = browseQuery.trim()

        port.onMessage.addListener(
            (msg: { type: string; total?: number; results?: SearchResult[]; sourceId?: string }) => {
                if (msg.type === "start") {
                    searchTotal = msg.total ?? 0
                } else if (msg.type === "partial" && msg.results) {
                    searchResults = [...searchResults, ...msg.results]
                    searchSettled++
                } else if (msg.type === "done") {
                    searchLoading = false
                    port.disconnect()
                    if (searchPort === port) searchPort = null
                }
            }
        )

        port.onDisconnect.addListener(() => {
            searchLoading = false
            if (searchPort === port) searchPort = null
        })

        port.postMessage({ type: "manga:search", query })
    }

    // Debounced type-to-search: fires ~450ms after the user stops typing, once the
    // query is at least 3 characters. Enter/submit (doSearch called directly) always
    // fires immediately regardless of this timer or the minimum length.
    function scheduleAutoSearch() {
        if (searchDebounceHandle) clearTimeout(searchDebounceHandle)
        searchDebounceHandle = setTimeout(() => {
            searchDebounceHandle = null
            if (browseQuery.trim().length >= SEARCH_MIN_LENGTH) doSearch()
        }, SEARCH_DEBOUNCE_MS)
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

    // Genres come from the source (backfilled per-title), unlike tags which are user-created.
    const allGenres = $derived([...new Set(library.flatMap(m => m.genres ?? []))].sort((a, b) => a.localeCompare(b)))

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
            // A tag currently used as the active filter no longer matches anything once
            // renamed away - follow the rename so the view doesn't silently go empty.
            if (categoryFilter === oldTag) categoryFilter = newTag
        } finally {
            tagBusy = false
        }
    }
    async function deleteTag(tag: string) {
        tagBusy = true
        try {
            for (const m of library.filter(x => (x.categories ?? []).includes(tag))) await removeTag(m, tag)
            // Same reasoning as renameTag - a deleted tag can't stay the active filter,
            // or the library view is stuck on "no titles match" with no way to clear it
            // (the category dropdown itself disappears once no tags remain).
            if (categoryFilter === tag) categoryFilter = ""
        } finally {
            tagBusy = false
        }
    }
    function filterByTag(tag: string) {
        categoryFilter = tag
        activeSection = "Library"
    }

    type LibraryStatus = "unread" | "reading" | "completed"
    // Reuses the same caught-up signal as the badge (hasNewerChapters) so the library
    // filter, the unread pool, and the poster badge agree. A number-only statusOf could
    // never mark an unnumbered-only title (latestChapterNumber always undefined)
    // "completed", so such a title stayed perpetually "unread" in the filter and the
    // Surprise-Me pool even when the user had read the latest chapter.
    function statusOf(m: LibraryManga): LibraryStatus {
        if (neverRead(m)) return "unread"
        return hasNewerChapters(m) ? "reading" : "completed"
    }
    function matchesFilter(m: LibraryManga): boolean {
        if (sourceFilter && m.sourceId !== sourceFilter) return false
        if (ratingFilter > 0 && (m.rating ?? 0) < ratingFilter) return false
        if (updatedSinceFilter > 0 && m.updatedAt < Date.now() - updatedSinceFilter * 86_400_000) return false
        switch (libraryFilter) {
            case "manual":
                return Boolean(m.manualTracking)
            case "on-hold":
                return Boolean(m.onHold)
            case "reading":
                return statusOf(m) === "reading" && !m.onHold
            case "unread":
            case "completed":
                return statusOf(m) === libraryFilter
            default:
                return true
        }
    }

    const advancedFilterCount = $derived(
        (sourceFilter ? 1 : 0) + (ratingFilter > 0 ? 1 : 0) + (updatedSinceFilter > 0 ? 1 : 0)
    )

    function clearAdvancedFilters() {
        sourceFilter = ""
        ratingFilter = 0
        updatedSinceFilter = 0
        categoryFilter = ""
        genreFilter = ""
    }

    const visibleLibrary = $derived.by(() => {
        const q = query.trim().toLowerCase()
        const filtered = library.filter(
            m =>
                m.normalizedTitle.includes(q) &&
                (!categoryFilter || (m.categories ?? []).includes(categoryFilter)) &&
                (!genreFilter || (m.genres ?? []).includes(genreFilter)) &&
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
        library.filter(m => !isSeedData(m) && ((!coverSrcs[m.id] && !m.coverUrl) || failedCovers.has(m.id))).length
    )

    // Library view: grid (covers) or list (rows), with a user-set page size so
    // large libraries don't render everything at once.
    let libraryView = $state<"grid" | "list">("grid")
    let libraryFilter = $state<"all" | "unread" | "reading" | "completed" | "manual" | "on-hold">("all")
    const LIBRARY_FILTERS = ["all", "unread", "reading", "completed", "manual", "on-hold"] as const
    let libraryPageSize = $state(50)
    let libraryLimit = $state(50)
    const pagedLibrary = $derived(visibleLibrary.slice(0, libraryLimit))
    $effect(() => {
        // Reset paging whenever the filtered view changes.
        void query
        void categoryFilter
        void genreFilter
        void librarySort
        void libraryFilter
        void sourceFilter
        void ratingFilter
        void updatedSinceFilter
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
        await sendRuntimeMessage({
            type: "library:numbers",
            mangaId: manga.id,
            lastReadChapterNumber: latest,
            ...(manga.latestChapterId ? { lastReadChapterId: manga.latestChapterId } : {})
        })
        library = library.map(m =>
            m.id === manga.id
                ? {
                      ...m,
                      lastReadChapterNumber: latest,
                      ...(manga.latestChapterId ? { lastReadChapterId: manga.latestChapterId } : {})
                  }
                : m
        )
    }

    const unreadPool = $derived(library.filter(m => statusOf(m) !== "completed" && !m.onHold))
    function surpriseMe() {
        const pool = unreadPool.length > 0 ? unreadPool : library
        if (pool.length === 0) return
        const pick = pool[Math.floor(Math.random() * pool.length)]
        // Surprise Me is a navigation action, not a card click - it should always
        // open the pick, even if select mode happens to be active.
        if (selectMode) clearSelection()
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
        else {
            // The palette is a navigation shortcut - jumping to a title should always
            // open it, even if select mode happens to be active in the library view.
            if (selectMode) clearSelection()
            read(item.manga)
        }
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

    // Per-manga freeform notes (saved from the detail overlay). $state, not a
    // writable $derived: a writable derived resets on ANY detailManga
    // reassignment, including a same-id reassignment from a live-triggered
    // refresh(), which would clobber in-progress typing. Reset only via the
    // previous-id-guard effect below, mirroring the genresForId pattern.
    let noteDraft = $state("")
    let noteDraftForId = $state<string | null>(null)
    $effect(() => {
        const id = detailManga?.id ?? null
        if (id === noteDraftForId) return
        noteDraftForId = id
        noteDraft = detailManga?.notes ?? ""
    })
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

    // Reading-activity heatmap (Stats tab).
    let activity = $state<Array<{ date: string; count: number }>>([])
    let activityLoaded = $state(false)
    $effect(() => {
        if (activeSection === "Stats" && !activityLoaded) {
            activityLoaded = true
            void sendRuntimeMessage<Array<{ date: string; count: number }>>({ type: "activity:get" })
                .then(d => (activity = d))
                .catch(() => (activity = []))
        }
    })

    type AnalyticsSummary = {
        days: number
        captureOk: number
        captureErrors: number
        readerOpened: number
        onSiteTrack: number
        directResolves: number
        tabResolves: number
        readerRate: number
        errorRate: number
        topSources: Array<{ sourceId: string; count: number }>
        topErrors: Array<{ sourceId: string; count: number }>
        errorTypes: Array<{ type: string; count: number }>
        panelActions: Array<{ action: string; count: number }>
        topGenres: Array<{ genre: string; count: number }>
        topAuthors: Array<{ author: string; count: number }>
        statusBreakdown: Array<{ status: string; count: number }>
    }
    let analyticsSummary = $state<AnalyticsSummary | null>(null)
    let analyticsLoaded = $state(false)
    $effect(() => {
        if (activeSection === "Stats" && !analyticsLoaded) {
            analyticsLoaded = true
            void sendRuntimeMessage<AnalyticsSummary>({ type: "analytics:summary" })
                .then(d => (analyticsSummary = d))
                .catch(() => {})
        }
    })

    type CommunityProfile = {
        enabled: boolean
        username: string
        userId: string
        lastSyncAt: number
        communityRank: number | null
        recommendations: Array<{ title: string; sourceId: string }>
        newAchievements: string[]
        communityStats: {
            leaderboard: Array<{ rank: number; username: string; chaptersWeek: number }>
            trendingManga: Array<{ title: string; sourceId: string; count: number }>
            topGenres: Array<{ genre: string; count: number }>
            totalUsers: number
        } | null
    }
    let communityProfile = $state<CommunityProfile | null>(null)
    let communityLoaded = $state(false)
    let communityUsernameInput = $state("")
    let communityRegisterError = $state("")
    $effect(() => {
        if ((activeSection === "Stats" || activeSection === "Settings") && !communityLoaded) {
            communityLoaded = true
            void sendRuntimeMessage<CommunityProfile>({ type: "community:status" })
                .then(p => (communityProfile = p))
                .catch(() => {})
        }
    })
    async function toggleCommunity(enabled: boolean) {
        communityProfile = await sendRuntimeMessage<CommunityProfile>({ type: "community:toggle", enabled })
    }
    async function executeClear(scope: "history" | "all") {
        clearWorking = true
        try {
            await sendRuntimeMessage({ type: scope === "all" ? "library:clear" : "library:clear-history" })
            if (scope === "all") {
                library = []
            }
            clearConfirm = ""
        } finally {
            clearWorking = false
        }
    }

    async function reloadCommunityProfile() {
        communityProfile = await sendRuntimeMessage<CommunityProfile>({ type: "community:status" }).catch(
            () => communityProfile
        )
    }

    let communitySyncing = $state(false)
    async function syncNow() {
        communitySyncing = true
        try {
            await sendRuntimeMessage({ type: "community:sync" })
            await reloadCommunityProfile()
        } catch {
        } finally {
            communitySyncing = false
        }
    }

    async function registerCommunity() {
        const name = communityUsernameInput.trim()
        if (!name) return
        communityRegisterError = ""
        try {
            communityProfile = await sendRuntimeMessage<CommunityProfile>({
                type: "community:register",
                username: name
            })
            communityUsernameInput = ""
            // Sync fires immediately on registration; re-fetch after a short delay to pick up stats
            setTimeout(() => void reloadCommunityProfile(), 4000)
        } catch (e) {
            communityRegisterError = e instanceof Error ? e.message : "Registration failed"
        }
    }

    const UPDATES_INITIAL = 50
    let updatesLimit = $state(UPDATES_INITIAL)
    const updatedManga = $derived(library.filter(m => !isSeedData(m) && hasUpdates(m)))
    const pagedUpdates = $derived(updatedManga.slice(0, updatesLimit))
    let expandedUpdates = $state(new Set<string>())
    let updatesNewChapters = $state<Record<string, Array<{ id: string; title: string; sortKey: number; url: string }>>>(
        {}
    )

    async function loadNewChapters(mangaId: string) {
        if (updatesNewChapters[mangaId]) return
        try {
            const chapters = await sendRuntimeMessage<
                Array<{ id: string; title: string; sortKey: number; url: string }>
            >({
                type: "updates:new-chapters",
                mangaId
            })
            updatesNewChapters[mangaId] = chapters
        } catch {
            updatesNewChapters[mangaId] = []
        }
    }

    function toggleUpdate(mangaId: string) {
        const next = new Set(expandedUpdates)
        if (next.has(mangaId)) {
            next.delete(mangaId)
            // Clear cached chapters so re-opening always fetches fresh data
            const { [mangaId]: _dropped, ...rest } = updatesNewChapters
            updatesNewChapters = rest
        } else {
            next.add(mangaId)
            void loadNewChapters(mangaId)
        }
        expandedUpdates = next
    }

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

    // Display-only ordering for the Sources page - registration order in
    // packages/sources/src/index.ts stays untouched for anything that depends on it.
    const sourcesListAlpha = $derived([...sourcesList].sort((a, b) => a.name.localeCompare(b.name)))

    let pingState = $state<Map<string, "live" | "gated" | "dead">>(new Map())
    let pinging = $state(false)
    let pingedOnce = $state(false)

    async function pingSources() {
        if (pinging) return
        pinging = true
        try {
            const res = await sendRuntimeMessage<Array<{ id: string; status: "live" | "gated" | "dead" }>>({
                type: "sources:ping"
            })
            pingState = new Map(res.map(r => [r.id, r.status]))
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
                    aria-current={activeSection === section ? "page" : undefined}
                    onclick={() => (activeSection = section)}>
                    {section}
                </button>
            {/each}
        </nav>
        <div class="sidebar-footer">
            <span class="sidebar-version">v{currentVersion}</span>
            <button
                type="button"
                class="discord-btn"
                onclick={() => void browser.tabs.create({ url: "https://discord.gg/23kS4gDtr" })}>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    style="flex-shrink:0"
                    ><path
                        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" /></svg>
                Join Discord
            </button>
            <button
                type="button"
                class="kofi-btn"
                onclick={() => void browser.tabs.create({ url: "https://ko-fi.com/ryuu3rs" })}>
                ☕ Support on Ko-fi
            </button>
        </div>
    </aside>

    <main>
        {#if extensionUpdate?.available && !updateBannerDismissed}
            <div class="update-banner" role="alert">
                <span>AMR <strong>v{extensionUpdate.latestVersion}</strong> is available.</span>
                <button
                    type="button"
                    class="btn-sm"
                    onclick={() => void browser.tabs.create({ url: extensionUpdate!.releaseUrl })}>
                    View release ↗
                </button>
                <button type="button" class="btn-outline btn-sm" onclick={() => (updateBannerDismissed = true)}>
                    Dismiss
                </button>
            </div>
        {/if}

        {#if showRestoreBanner}
            <div class="restore-banner" role="alert">
                <span>
                    <strong>Your library appears empty.</strong> You have a Gist backup configured - restore it now?
                    {#if syncMessage && !syncing}<br /><span class="muted">{syncMessage}</span>{/if}
                </span>
                <button type="button" class="btn-sm" disabled={syncing} onclick={() => void pullSync()}>
                    {syncing ? "Restoring…" : "Restore from Gist"}
                </button>
                <button type="button" class="btn-outline btn-sm" onclick={() => (restoreBannerDismissed = true)}>
                    Dismiss
                </button>
            </div>
        {/if}

        {#if activeSection === "Home"}
            {#if !hasPermission && !onboardingDismissed}
                <div class="onboarding">
                    <h2>Welcome to AMR Next</h2>
                    <p class="muted">
                        Track and read manga from many sources - everything stays local in your browser.
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
                    doSearch()
                }}>
                <input
                    bind:value={browseQuery}
                    oninput={scheduleAutoSearch}
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
                        <p class="muted chapters-count">
                            {mangaChapters.length} chapter{mangaChapters.length === 1 ? "" : "s"}
                            {#if selectedMangaLibraryEntry?.lastReadChapterNumber !== undefined}
                                · last read ch {selectedMangaLibraryEntry.lastReadChapterNumber}
                            {/if}
                        </p>
                        <div class="chapter-list">
                            {#each mangaChapters as ch}
                                {@const isLastRead =
                                    !!selectedMangaLibraryEntry &&
                                    selectedMangaLibraryEntry.lastReadChapterId === ch.id}
                                <div class="chapter-row" class:chapter-row-current={isLastRead}>
                                    <p class="chapter-title">
                                        {ch.title}
                                        {#if isLastRead}<span class="chapter-lastread-badge">Last read</span>{/if}
                                    </p>
                                    <button type="button" onclick={() => void readChapter(ch.url)}>Read</button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else}
                {#if searchLoading && searchResults.length === 0}
                    <p class="muted">
                        Searching…{searchTotal > 0 ? ` (${searchSettled}/${searchTotal} sources)` : ""}
                    </p>
                {/if}
                {#if searchResults.length > 0}
                    {#if searchLoading}
                        <p class="muted search-progress">
                            Searching… {searchSettled}/{searchTotal} sources - {searchResults.length} result{searchResults.length ===
                            1
                                ? ""
                                : "s"} so far
                        </p>
                    {/if}
                    {#each searchBySource as [sourceId, results], i}
                        {@const expanded =
                            expandedSourceGroups.has(sourceId) || (expandedSourceGroups.size === 0 && i === 0)}
                        <div class="source-group">
                            <button
                                type="button"
                                class="source-group-head"
                                aria-expanded={expanded}
                                onclick={() => toggleSourceGroup(sourceId)}>
                                <span class="source-name">{sourceMeta.get(sourceId)?.name ?? sourceId}</span>
                                <span class="muted">{results.length} result{results.length === 1 ? "" : "s"}</span>
                                <span class="source-caret">{expanded ? "▾" : "▸"}</span>
                            </button>
                            {#if expanded}
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
                                                    {#if result.latestChapter}latest ch {result.latestChapter}{:else}-{/if}
                                                </p>
                                            </div>
                                            <button type="button" onclick={() => void openResult(result)}>
                                                {result.sourceId === "mangadex" ? "Chapters" : "Open"}
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                {:else if browseQuery.trim() && !searchLoading}
                    <p class="muted">No results across any source.</p>
                {/if}
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
                {#if !searchActive}
                    {#if continueReading}
                        <div class="home-feature">
                            <div class="home-feature-cover">
                                {#if (coverSrcs[continueReading.id] ?? continueReading.coverUrl) && !failedCovers.has(continueReading.id)}<img
                                        src={coverSrcs[continueReading.id] ?? continueReading.coverUrl}
                                        alt=""
                                        class:nsfw-blur={continueReading.nsfw && (settings?.blurNsfw ?? true)}
                                        onerror={() =>
                                            continueReading && coverFailed(continueReading.id)} />{:else}<span
                                        class="cover-initial">{continueReading.title[0]}</span
                                    >{/if}
                            </div>
                            <div class="home-feature-body">
                                <p class="eyebrow">Continue reading</p>
                                <h2 class="feature-title">{continueReading.title}</h2>
                                <p class="muted">
                                    {#if continueReading.mangaUrl}
                                        <button
                                            class="source-link"
                                            type="button"
                                            title="Open on source site"
                                            onclick={e => {
                                                e.stopPropagation()
                                                void browser.tabs.create({ url: continueReading!.mangaUrl! })
                                            }}>
                                            {sourceMeta.get(continueReading.sourceId)?.name ?? continueReading.sourceId}
                                        </button>
                                    {:else}
                                        {sourceMeta.get(continueReading.sourceId)?.name ?? continueReading.sourceId}
                                    {/if}
                                    {#if continueReading.lastReadChapterNumber !== undefined}
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
                                ? coverProgress
                                    ? `Fetching… ${coverProgress.done}/${coverProgress.total}`
                                    : "Fetching covers…"
                                : `Load ${missingCoverCount} missing cover${missingCoverCount === 1 ? "" : "s"}`}
                        </button>
                    {/if}

                    {#if recentlyAdded.length > 0}
                        <p class="shelf-label">Recently added</p>
                        <div class="poster-grid">
                            {#each recentlyAdded as manga (manga.id)}
                                <article>
                                    <div class="poster-wrap">
                                        <button
                                            type="button"
                                            class="poster"
                                            onclick={e => read(manga, e)}
                                            onauxclick={e => read(manga, e)}>
                                            {#if (coverSrcs[manga.id] ?? manga.coverUrl) && !failedCovers.has(manga.id)}<img
                                                    src={coverSrcs[manga.id] ?? manga.coverUrl}
                                                    alt={manga.title}
                                                    data-source={manga.sourceId}
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
                        <option value="title">Title (A-Z)</option>
                        <option value="latest-chapter">Latest chapter</option>
                    </select>
                    {#if allCategories.length > 0}
                        <select aria-label="Filter by tag" bind:value={categoryFilter}>
                            <option value="">All tags</option>
                            {#each allCategories as cat}
                                <option value={cat}>{cat}</option>
                            {/each}
                        </select>
                    {/if}
                    {#if allGenres.length > 0}
                        <select aria-label="Filter by genre" bind:value={genreFilter}>
                            <option value="">All genres</option>
                            {#each allGenres as genre}
                                <option value={genre}>{genre}</option>
                            {/each}
                        </select>
                    {/if}
                    <button
                        type="button"
                        class="btn-sm"
                        onclick={() => void backfillCovers()}
                        disabled={refreshingCovers || !hasPermission}
                        title={hasPermission ? "Fetch missing covers" : "Grant source access first"}>
                        {refreshingCovers
                            ? coverProgress
                                ? `Fetching… ${coverProgress.done}/${coverProgress.total}`
                                : "Fetching…"
                            : "Refresh covers"}
                    </button>
                    <button
                        type="button"
                        class="btn-sm btn-outline"
                        title="Search all sources for better matches for every manga in your library"
                        onclick={() => {
                            libScanIds = library.filter(m => !m.manualTracking).map(m => m.id)
                            activeSection = "Data"
                        }}>
                        Find better sources
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
                            {f === "all" ? "All" : f === "on-hold" ? "On Hold" : f[0]?.toUpperCase() + f.slice(1)}
                        </button>
                    {/each}
                </div>
                <button
                    type="button"
                    class="btn-sm filter-toggle"
                    class:active={showFiltersPanel || advancedFilterCount > 0}
                    onclick={() => (showFiltersPanel = !showFiltersPanel)}
                    aria-expanded={showFiltersPanel}>
                    Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
                </button>
                <label class="page-size">
                    <span class="muted">Per page</span>
                    <select aria-label="Items per page" bind:value={libraryPageSize}>
                        {#each [10, 15, 20, 50, 100] as n}
                            <option value={n}>{n}</option>
                        {/each}
                    </select>
                </label>
            </div>
            {#if showFiltersPanel}
                <div class="filters-panel">
                    <div class="filters-row">
                        <label class="filters-field">
                            <span class="muted">Source</span>
                            <select aria-label="Filter by source" bind:value={sourceFilter}>
                                <option value="">All sources</option>
                                {#each librarySources as sid}
                                    <option value={sid}>{sid}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="filters-field">
                            <span class="muted">Min rating</span>
                            <select aria-label="Minimum rating" bind:value={ratingFilter}>
                                <option value={0}>Any</option>
                                {#each [1, 2, 3, 4, 5] as r}
                                    <option value={r}>{"★".repeat(r)}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="filters-field">
                            <span class="muted">Updated</span>
                            <select aria-label="Updated since" bind:value={updatedSinceFilter}>
                                <option value={0}>Any time</option>
                                <option value={7}>Last 7 days</option>
                                <option value={30}>Last 30 days</option>
                                <option value={90}>Last 90 days</option>
                            </select>
                        </label>
                        {#if advancedFilterCount > 0}
                            <button type="button" class="btn-sm filters-clear" onclick={clearAdvancedFilters}>
                                Clear filters
                            </button>
                        {/if}
                    </div>
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
            {#if showDuplicates && duplicateGroups.length > 0}
                <div class="dup-panel">
                    <p class="row-label">Possible duplicates</p>
                    {#each duplicateGroups as group}
                        {@const primary = primaryOfGroup(group)}
                        <div class="dup-group">
                            <span class="dup-title">{group[0]?.title}</span>
                            <span class="muted">{group.map(m => m.sourceId).join(", ")}</span>
                            {#if primary}
                                <span
                                    class="list-badge badge-keep"
                                    title="This copy is kept; the rest are merged into it">
                                    Keeps: {primary.sourceId}
                                </span>
                            {/if}
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
                        disabled={selectedIds.size === 0 || !bulkCategory.trim() || bulkWorking}
                        onclick={() => void bulkAddCategory()}>Add tags</button>
                    <button
                        type="button"
                        class="btn-sm"
                        disabled={selectedIds.size === 0 || bulkWorking}
                        onclick={() => void bulkManual(true)}>{bulkWorking ? "Working…" : "Mark manual"}</button>
                    <button
                        type="button"
                        class="btn-sm"
                        disabled={selectedIds.size === 0 || bulkWorking}
                        onclick={() => void bulkManual(false)}>{bulkWorking ? "Working…" : "Unmark manual"}</button>
                    <button
                        type="button"
                        class="btn-sm confirm-remove-btn"
                        disabled={selectedIds.size === 0 || bulkWorking}
                        onclick={() => void bulkRemove()}>{bulkWorking ? "Working…" : "Remove"}</button>
                    {#if bulkMessage}<p class="notice" role="status" aria-live="polite">{bulkMessage}</p>{/if}
                </div>
            {/if}
            {#if visibleLibrary.length === 0}
                <p class="muted" style="margin-top:16px">
                    {query || libraryFilter !== "all" ? "No titles match." : "Your library is empty."}
                </p>
            {:else if libraryView === "grid"}
                <div class="poster-grid">
                    {#each pagedLibrary as manga (manga.id)}
                        <article class:selected={selectMode && selectedIds.has(manga.id)}>
                            <div class="poster-wrap">
                                <button
                                    type="button"
                                    class="poster"
                                    class:sample={isSeedData(manga)}
                                    onclick={e => read(manga, e)}
                                    onauxclick={e => read(manga, e)}>
                                    {#if (coverSrcs[manga.id] ?? manga.coverUrl) && !failedCovers.has(manga.id)}<img
                                            src={coverSrcs[manga.id] ?? manga.coverUrl}
                                            alt={manga.title}
                                            data-source={manga.sourceId}
                                            class:nsfw-blur={manga.nsfw && (settings?.blurNsfw ?? true)}
                                            onerror={() => coverFailed(manga.id)} />{:else}<span class="cover-initial"
                                            >{manga.title[0]}</span
                                        >{/if}
                                    {#if isSeedData(manga)}<span class="sample-chip">Sample</span>{/if}
                                    <div class="poster-badges">
                                        {#if manga.manualTracking}<span class="manual-chip">Manual</span>{/if}
                                        {#if !isSeedData(manga) && hasNewerChapters(manga)}
                                            <span class="new-chip">Unread</span>
                                        {/if}
                                        {#if isRecentlyAdded(manga)}<span class="added-chip">New</span>{/if}
                                        {#if isRecentlyUpdated(manga)}<span class="updated-chip">Updated</span>{/if}
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    class="poster-menu-btn"
                                    aria-label="Options"
                                    onclick={e => {
                                        e.stopPropagation()
                                        detailManga = manga
                                    }}>⋯</button>
                            </div>
                            <p class="poster-title">{manga.title}</p>
                            <p class="poster-sub">
                                {#if manga.mangaUrl}
                                    <button
                                        class="source-link"
                                        type="button"
                                        title="Open on source site"
                                        onclick={e => {
                                            e.stopPropagation()
                                            void browser.tabs.create({ url: manga.mangaUrl! })
                                        }}>
                                        {sourceMeta.get(manga.sourceId)?.name ?? manga.sourceId}
                                    </button>
                                {:else}
                                    {sourceMeta.get(manga.sourceId)?.name ?? manga.sourceId}
                                {/if}
                            </p>
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
                    {#each pagedLibrary as manga (manga.id)}
                        {@const status = statusOf(manga)}
                        <div class="list-row" class:selected={selectMode && selectedIds.has(manga.id)}>
                            <button
                                type="button"
                                class="list-cover"
                                class:sample={isSeedData(manga)}
                                onclick={e => openSeriesPage(manga, e)}
                                onauxclick={e => openSeriesPage(manga, e)}
                                aria-label={`Open ${manga.title}`}>
                                {#if (coverSrcs[manga.id] ?? manga.coverUrl) && !failedCovers.has(manga.id)}<img
                                        src={coverSrcs[manga.id] ?? manga.coverUrl}
                                        alt=""
                                        data-source={manga.sourceId}
                                        class:nsfw-blur={manga.nsfw && (settings?.blurNsfw ?? true)}
                                        onerror={() => coverFailed(manga.id)} />{:else}<span class="cover-initial"
                                        >{manga.title[0]}</span
                                    >{/if}
                            </button>
                            <div class="list-main">
                                <button type="button" class="list-title" onclick={() => openSeriesPage(manga)}
                                    >{manga.title}</button>
                                <p class="muted list-meta">
                                    {#if manga.mangaUrl}
                                        <button
                                            class="source-link"
                                            type="button"
                                            title="Open on source site"
                                            onclick={e => {
                                                e.stopPropagation()
                                                void browser.tabs.create({ url: manga.mangaUrl! })
                                            }}>
                                            {sourceMeta.get(manga.sourceId)?.name ?? manga.sourceId}
                                        </button>
                                    {:else}
                                        {sourceMeta.get(manga.sourceId)?.name ?? manga.sourceId}
                                    {/if}
                                    {#if manga.manualTracking}· manual{/if}
                                    {#if manga.notes}· 📝{/if}
                                </p>
                                {#if (!isSeedData(manga) && hasNewerChapters(manga)) || isRecentlyAdded(manga) || isRecentlyUpdated(manga)}
                                    <div class="list-badges">
                                        {#if !isSeedData(manga) && hasNewerChapters(manga)}
                                            <span class="list-badge badge-unread">Unread</span>
                                        {/if}
                                        {#if isRecentlyAdded(manga)}<span class="list-badge badge-added">New</span>{/if}
                                        {#if isRecentlyUpdated(manga)}<span class="list-badge badge-updated"
                                                >Updated</span
                                            >{/if}
                                    </div>
                                {/if}
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
                                    disabled={manga.latestChapterNumber === undefined ||
                                        statusOf(manga) === "completed"}
                                    title="Mark caught up to the latest chapter"
                                    onclick={() => void markCaughtUp(manga)}>Caught up</button>
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
        {:else if activeSection === "Bookmarks"}
            <h1>Bookmarks</h1>
            <p class="muted search-hint">
                Pages you've saved while reading. Click a bookmark to jump straight to that page.
            </p>
            {#if !bookmarksLoaded}
                <p class="muted">Loading…</p>
            {:else if bookmarks.length === 0}
                <p class="muted">No bookmarks yet. Use the ☆ button in the reader to save a page.</p>
            {:else}
                <ul class="bookmark-list">
                    {#each bookmarks as bm (bm.id)}
                        <li class="bookmark-card">
                            <div class="bookmark-info">
                                <span class="bookmark-manga">{bm.mangaTitle}</span>
                                <span class="bookmark-chapter muted">{bm.chapterTitle} - page {bm.pageIndex + 1}</span>
                                <span class="bookmark-date muted">{new Date(bm.addedAt).toLocaleDateString()}</span>
                            </div>
                            <div class="bookmark-actions">
                                <a
                                    href={bookmarkReaderUrl(bm)}
                                    class="btn-sm btn-outline"
                                    onclick={e => {
                                        e.preventDefault()
                                        void browser.tabs.create({ url: bookmarkReaderUrl(bm) })
                                    }}>Open</a>
                                <button
                                    type="button"
                                    class="btn-sm btn-ghost-danger"
                                    onclick={() => void deleteBookmark(bm.id)}>Remove</button>
                            </div>
                        </li>
                    {/each}
                </ul>
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
                <button
                    type="button"
                    onclick={() => void checkForUpdates()}
                    disabled={checkingUpdates}
                    aria-busy={checkingUpdates}>
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
            {#if updateProgress && (updateProgress.running || updateProgress.done > 0)}
                <div class="update-progress-wrap">
                    <div class="progress-track">
                        <div class="progress-fill" style="width: {updateProgressPct}%"></div>
                    </div>
                    <div class="progress-meta">
                        <span class="progress-count">
                            {updateProgress.done} / {updateProgress.total} checked
                            {#if updateProgress.sourceId}
                                <span class="muted">({updateProgress.sourceId})</span>
                            {/if}
                        </span>
                        {#if updateProgress.running && updateProgress.currentTitle}
                            <span class="progress-current muted"
                                >- currently checking {updateProgress.currentTitle}</span>
                        {:else if !updateProgress.running}
                            <span class="progress-done">Done ✓</span>
                        {/if}
                    </div>
                </div>
            {/if}
            <p class="muted" style="margin-bottom:20px">
                {updateStatus
                    ? `Last checked ${new Date(updateStatus.checkedAt).toLocaleString()} - ${updateStatus.updated} updated, ${updateStatus.failed} failed`
                    : "No update check has run yet. Click Check all to scan for new chapters."}
            </p>
            {#if updateStatus?.errors && updateStatus.errors.length > 0}
                <div class="error-panel">
                    <div class="error-panel-head">
                        <p class="row-label">Titles that failed to update</p>
                        <button type="button" class="btn-sm" onclick={() => void copyUpdateFailureLog()}>
                            {updateLogCopied ? "Copied ✓" : "Copy failure log"}
                        </button>
                    </div>
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
            {:else if updatedManga.length === 0}
                <p class="muted">Everything is up to date.</p>
            {:else}
                <div class="update-groups">
                    {#each pagedUpdates as manga (manga.id)}
                        {@const open = expandedUpdates.has(manga.id)}
                        {@const neverRead = !manga.lastReadChapterId}
                        {@const chapters = updatesNewChapters[manga.id]}
                        <div class="update-group" class:open>
                            <button type="button" class="update-group-head" onclick={() => toggleUpdate(manga.id)}>
                                <div class="update-cover">
                                    {#if coverSrcs[manga.id] ?? manga.coverUrl}
                                        <img src={coverSrcs[manga.id] ?? manga.coverUrl} alt={manga.title} />
                                    {:else}
                                        <span>{manga.title[0]}</span>
                                    {/if}
                                </div>
                                <div class="update-info">
                                    <span class="update-title">{manga.title}</span>
                                    <span class="muted update-when"
                                        >{new Date(manga.updatedAt).toLocaleDateString()}</span>
                                </div>
                                {#if neverRead}
                                    <span class="badge-unread">Unread</span>
                                {:else if manga.latestChapterNumber != null && manga.lastReadChapterNumber != null}
                                    <span class="badge-new">
                                        +{Math.max(
                                            1,
                                            Math.round(manga.latestChapterNumber - manga.lastReadChapterNumber)
                                        )} ch
                                    </span>
                                {:else}
                                    <span class="badge-new">New</span>
                                {/if}
                                <span class="update-caret">{open ? "▾" : "▸"}</span>
                            </button>
                            {#if open}
                                <div class="update-chapters">
                                    {#if !chapters}
                                        <p class="muted update-loading">Loading…</p>
                                    {:else if chapters.length === 0}
                                        <p class="muted update-loading">
                                            No cached chapters - open the manga page to load them.
                                        </p>
                                    {:else}
                                        {#each chapters.slice().reverse() as ch (ch.id)}
                                            <div
                                                class="update-chapter-row clickable"
                                                role="button"
                                                tabindex="0"
                                                onclick={() => void readChapter(ch.url)}
                                                onkeydown={e => e.key === "Enter" && void readChapter(ch.url)}>
                                                <span class="update-ch-title">{ch.title}</span>
                                                <span class="badge-new-sm">Read ›</span>
                                            </div>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
                {#if updatedManga.length > updatesLimit}
                    <div class="load-more">
                        <button type="button" class="btn-sm" onclick={() => (updatesLimit += UPDATES_INITIAL)}>
                            Load more ({updatedManga.length - updatesLimit} left)
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
                                        <div
                                            class="history-row"
                                            class:clickable={!!event.chapterUrl}
                                            role={event.chapterUrl ? "button" : undefined}
                                            tabindex={event.chapterUrl ? 0 : undefined}
                                            onclick={() => event.chapterUrl && void readChapter(event.chapterUrl)}
                                            onkeydown={e =>
                                                e.key === "Enter" &&
                                                event.chapterUrl &&
                                                void readChapter(event.chapterUrl)}>
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
        {:else if activeSection === "Stats"}
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

            {#if analyticsSummary}
                <p class="shelf-label" style="margin-top:32px">
                    Usage insights <span class="muted">(last {analyticsSummary.days} days)</span>
                </p>
                <div class="stat-row">
                    <div class="stat-box">
                        <strong>{analyticsSummary.captureOk}</strong><span>Chapters captured</span>
                    </div>
                    <div class="stat-box">
                        <strong>{analyticsSummary.readerRate}%</strong><span>Opened in reader</span>
                    </div>
                    <div class="stat-box">
                        <strong>{analyticsSummary.onSiteTrack}</strong><span>Marked on-site</span>
                    </div>
                    <div class="stat-box" class:stat-warn={analyticsSummary.errorRate > 10}>
                        <strong>{analyticsSummary.errorRate}%</strong><span>Capture error rate</span>
                    </div>
                </div>
                <div class="stat-row">
                    <div class="stat-box">
                        <strong>{analyticsSummary.directResolves}</strong><span>Direct resolves</span>
                    </div>
                    <div class="stat-box" class:stat-warn={analyticsSummary.tabResolves > 0}>
                        <strong>{analyticsSummary.tabResolves}</strong><span>Tab fallbacks (CF)</span>
                    </div>
                </div>
                {#if analyticsSummary.topSources.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Top sources</p>
                    <div class="insights-list">
                        {#each analyticsSummary.topSources as s}
                            <div class="insights-row">
                                <span class="insights-label">{s.sourceId}</span>
                                <span class="insights-count">{s.count}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.topErrors.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Sources with errors</p>
                    <div class="insights-list">
                        {#each analyticsSummary.topErrors as s}
                            <div class="insights-row insights-row-warn">
                                <span class="insights-label">{s.sourceId}</span>
                                <span class="insights-count">{s.count} errors</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.errorTypes.length > 0}
                    <p class="shelf-label" style="margin-top:12px">Error breakdown</p>
                    <div class="insights-list">
                        {#each analyticsSummary.errorTypes as e}
                            <div class="insights-row insights-row-warn">
                                <span class="insights-label"
                                    >{e.type === "bot-block"
                                        ? "CF / bot block"
                                        : e.type === "not-found"
                                          ? "404 not found"
                                          : e.type === "network"
                                            ? "Network / timeout"
                                            : e.type}</span>
                                <span class="insights-count">{e.count}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.panelActions.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Panel button usage</p>
                    <div class="insights-list">
                        {#each analyticsSummary.panelActions as a}
                            <div class="insights-row">
                                <span class="insights-label">{a.action}</span>
                                <span class="insights-count">{a.count}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.topGenres.length > 0}
                    <p class="shelf-label" style="margin-top:16px">
                        Top genres <span class="muted">(from library titles with fetched genres)</span>
                    </p>
                    <div class="insights-genre-grid">
                        {#each analyticsSummary.topGenres as g}
                            {@const max = analyticsSummary.topGenres[0]?.count ?? 1}
                            <div class="genre-bar-row">
                                <span class="genre-label">{g.genre}</span>
                                <div class="genre-bar-track">
                                    <div class="genre-bar-fill" style="width:{Math.round((g.count / max) * 100)}%">
                                    </div>
                                </div>
                                <span class="genre-count muted">{g.count}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.topAuthors.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Top authors</p>
                    <div class="insights-list">
                        {#each analyticsSummary.topAuthors as a}
                            <div class="insights-row">
                                <span class="insights-label">{a.author}</span>
                                <span class="insights-count">{a.count} titles</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if analyticsSummary.statusBreakdown.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Library by status</p>
                    <div class="insights-list">
                        {#each analyticsSummary.statusBreakdown.sort((a, b) => b.count - a.count) as s}
                            <div class="insights-row">
                                <span class="insights-label" style="text-transform:capitalize">{s.status}</span>
                                <span class="insights-count">{s.count} titles</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            {/if}

            {#if communityProfile?.communityStats}
                <p class="shelf-label" style="margin-top:36px">Community</p>
                {#if communityProfile.communityRank}
                    <div class="stat-row">
                        <div class="stat-box">
                            <strong>#{communityProfile.communityRank}</strong><span>Your rank this week</span>
                        </div>
                        <div class="stat-box">
                            <strong>{communityProfile.communityStats.totalUsers}</strong><span>Total readers</span>
                        </div>
                    </div>
                {:else if communityProfile.userId}
                    <p class="muted">Read more chapters to appear on the leaderboard.</p>
                {:else if communityProfile.enabled}
                    <p class="muted">Set a username in Settings to join the community.</p>
                {/if}
                {#if communityProfile.communityStats.leaderboard.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Weekly leaderboard</p>
                    <div class="insights-list">
                        {#each communityProfile.communityStats.leaderboard.slice(0, 10) as entry}
                            <div
                                class="insights-row"
                                class:insights-row-highlight={entry.username === communityProfile.username}>
                                <span class="insights-label">#{entry.rank} {entry.username}</span>
                                <span class="insights-count">{entry.chaptersWeek} ch</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if communityProfile.communityStats.trendingManga.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Trending this week</p>
                    <div class="insights-list">
                        {#each communityProfile.communityStats.trendingManga.slice(0, 5) as manga}
                            <div class="insights-row">
                                <span class="insights-label">{manga.title}</span>
                                <span class="insights-count">{manga.count} readers</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if communityProfile.recommendations.length > 0}
                    <p class="shelf-label" style="margin-top:16px">Recommended for you</p>
                    <div class="insights-list">
                        {#each communityProfile.recommendations as rec}
                            <div class="insights-row">
                                <span class="insights-label">{rec.title}</span>
                                <span class="insights-count muted">{rec.sourceId}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            {:else if communityProfile?.enabled && communityProfile.userId}
                <p class="shelf-label" style="margin-top:36px">Community</p>
                <p class="muted">Syncing your reading history… stats appear after the first sync completes.</p>
                <button
                    class="btn-outline btn-sm"
                    style="margin-top:8px"
                    disabled={communitySyncing}
                    onclick={() => void syncNow()}>
                    {communitySyncing ? "Syncing…" : "Sync now"}
                </button>
            {:else if !communityProfile?.userId}
                <p class="shelf-label" style="margin-top:36px">Community</p>
                <p class="muted">
                    Set a community username in <button class="link-btn" onclick={() => (activeSection = "Settings")}
                        >Settings</button> to join the leaderboard.
                </p>
            {/if}
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
                    <button
                        type="button"
                        class="btn-sm"
                        onclick={() => void pingSources()}
                        disabled={pinging}
                        aria-busy={pinging}>
                        {pinging ? "Checking…" : "Re-check sites"}
                    </button>
                </div>
                <p class="muted search-hint">
                    Click a site to open it in a new tab. The dot shows reachability: green = live, yellow = bot-gated
                    (chapters still load via tab), red = unreachable, grey = not checked yet.
                </p>
                <div class="adapter-grid">
                    {#each sourcesListAlpha as src}
                        {@const pingStatus = pingState.get(src.id)}
                        {@const count = sourceTitleCounts.get(src.id) ?? 0}
                        <button
                            type="button"
                            class="adapter-chip"
                            onclick={() => openSourceSite(src)}
                            title={`Open ${src.name}`}>
                            <span class="adapter-head">
                                <span
                                    class="status-dot"
                                    class:alive={pingStatus === "live"}
                                    class:gated={pingStatus === "gated"}
                                    class:dead={pingStatus === "dead"}
                                    title={pingStatus === undefined
                                        ? "Not checked"
                                        : pingStatus === "live"
                                          ? "Live"
                                          : pingStatus === "gated"
                                            ? "Bot-gated - Cloudflare or rate-limited. Chapters still load via tab."
                                            : "Unreachable"}></span>
                                <span class="adapter-name">{src.name}</span>
                            </span>
                            <span class="adapter-caps muted">
                                {src.capabilities.join(", ")}{#if src.canSearch}
                                    · search{/if}
                            </span>
                            <span class="adapter-footer">
                                <span class="adapter-open">Open site ↗</span>
                                {#if count > 0}
                                    <span class="adapter-count">{count} title{count !== 1 ? "s" : ""}</span>
                                {/if}
                            </span>
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
                                const input = e.currentTarget
                                const f = input.files?.[0]
                                // Reset so selecting the same file again (e.g. after a
                                // cancelled/failed import) still fires a change event.
                                input.value = ""
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
                        <p class="row-label">Repair auto-tracked entries</p>
                        <p class="muted">
                            Finds library titles that were created as a fallback when a chapter couldn't be matched to a
                            real source page (e.g. during a period a source was broken), and merges the duplicates into
                            one properly-linked title.
                        </p>
                    </div>
                    <button
                        type="button"
                        class="btn-outline"
                        disabled={cleanupScanning}
                        onclick={() => void runCleanupScan()}>
                        {cleanupScanning ? "Scanning…" : "Scan"}
                    </button>
                </div>
                <div class="data-row">
                    <div>
                        <p class="row-label">Offline downloads</p>
                        <p class="muted">
                            Chapters saved for offline reading, stored inside the extension (not a folder on disk).
                            Download from the reader's ⬇ button; they're served automatically when you reopen the
                            chapter. Use the reader's CBZ ⤓ button to export a downloaded chapter to a real CBZ file on
                            disk.
                        </p>
                    </div>
                    <span class="data-count">{downloadsCount} {downloadsCount === 1 ? "chapter" : "chapters"}</span>
                </div>
                <div class="data-row" style="flex-direction:column;align-items:flex-start;gap:10px">
                    <div>
                        <p class="row-label">Backups</p>
                        <p class="muted">
                            Automatic safety-net snapshots taken before imports, syncs, clears, and repairs. Restoring
                            replaces the current library with the snapshot (and itself takes a snapshot first, so a
                            restore is always undoable).
                        </p>
                    </div>
                    {#if backupsList.length === 0}
                        <p class="muted">No backups yet.</p>
                    {:else}
                        <div class="conflict-list" style="width:100%;max-height:none">
                            {#each backupsList as backup (backup.id)}
                                <div
                                    class="conflict-row"
                                    style="grid-template-columns:1fr auto;grid-template-rows:auto">
                                    <span class="conflict-name" style="grid-row:1">{backup.reason}</span>
                                    <span class="conflict-hint muted" style="grid-row:2">
                                        {new Date(backup.createdAt).toLocaleString()}
                                    </span>
                                    <div style="grid-column:2;grid-row:1 / 3;display:flex;gap:6px">
                                        {#if backupRestoreConfirm === backup.id}
                                            <button
                                                type="button"
                                                class="btn-outline"
                                                onclick={() => (backupRestoreConfirm = null)}>Cancel</button>
                                            <button
                                                type="button"
                                                class="btn-danger"
                                                disabled={backupRestoring}
                                                onclick={() => void restoreBackupById(backup.id)}>
                                                {backupRestoring ? "Restoring…" : "Yes, restore"}
                                            </button>
                                        {:else}
                                            <button
                                                type="button"
                                                class="btn-sm"
                                                onclick={() => (backupRestoreConfirm = backup.id)}>Restore</button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                    {#if backupMessage}
                        <p class="notice" role="status" aria-live="polite">{backupMessage}</p>
                    {/if}
                </div>
            </div>
            {#if cleanupResult}
                <div class="conflict-panel">
                    <p class="conflict-title">
                        {cleanupResult.groups.length} title{cleanupResult.groups.length !== 1 ? "s" : ""} found from
                        {cleanupResult.candidateCount} auto-tracked entr{cleanupResult.candidateCount !== 1
                            ? "ies"
                            : "y"}
                        {#if cleanupResult.unresolved.length > 0}
                            · {cleanupResult.unresolved.length} could not be resolved
                        {/if}
                    </p>
                    <div class="conflict-list" style="max-height:360px">
                        {#each cleanupResult.groups as group (group.canonicalId)}
                            <div
                                style="display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:6px;background:var(--surface-raised, rgba(255,255,255,0.03))">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <input
                                        type="checkbox"
                                        checked={cleanupSelected[group.canonicalId] !== false}
                                        onchange={e =>
                                            (cleanupSelected = {
                                                ...cleanupSelected,
                                                [group.canonicalId]: e.currentTarget.checked
                                            })} />
                                    <span class="conflict-name" style="max-width:none">{group.canonicalTitle}</span>
                                    <span class="conflict-hint muted" style="max-width:none">
                                        {group.sourceId} · {group.records.length} entr{group.records.length !== 1
                                            ? "ies"
                                            : "y"}{group.selfHeal ? " · self-heal" : ""}{group.inLibrary
                                            ? " · already in library"
                                            : ""}
                                    </span>
                                    <button
                                        type="button"
                                        class="btn-sm"
                                        style="margin-left:auto"
                                        onclick={() =>
                                            (cleanupExpanded = {
                                                ...cleanupExpanded,
                                                [group.canonicalId]: !cleanupExpanded[group.canonicalId]
                                            })}>
                                        {cleanupExpanded[group.canonicalId] ? "Hide" : "Show"} entries
                                    </button>
                                </div>
                                {#if cleanupExpanded[group.canonicalId]}
                                    <div style="padding-left:26px;display:flex;flex-direction:column;gap:4px">
                                        {#each group.records as record (record.mangaId)}
                                            <p class="muted" style="font-size:12px;margin:0">
                                                {record.title} - {record.sourceUrl} - ch.
                                                {record.matchedChapterNumbers.join(", ") || "?"} ({record.matchedBy})
                                            </p>
                                        {/each}
                                        {#if group.overflowCount}
                                            <p class="muted" style="font-size:12px;margin:0">
                                                …and {group.overflowCount} more (picked up on a later scan)
                                            </p>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    {#if cleanupResult.unresolved.length > 0}
                        <p class="conflict-hint muted" style="margin:0">Unresolved:</p>
                        <div class="conflict-list">
                            {#each cleanupResult.unresolved as u (u.mangaId)}
                                <div class="conflict-row">
                                    <span class="conflict-name">{u.title}</span>
                                    <span class="conflict-hint muted">{u.sourceId} · {u.reason}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                    <div class="conflict-actions">
                        <button type="button" class="btn-outline" onclick={cancelCleanup}>Cancel</button>
                        <button
                            type="button"
                            disabled={cleanupApplying || cleanupSelectedGroups.length === 0}
                            onclick={() => void applyCleanup()}>
                            {cleanupApplying
                                ? "Merging…"
                                : `Merge ${cleanupSelectedEntryCount} entries into ${cleanupSelectedGroups.length} titles`}
                        </button>
                    </div>
                </div>
            {:else if cleanupMessage}
                <p class="notice" role="status" aria-live="polite">
                    {cleanupMessage}
                    {#if cleanupBackupId !== null}
                        <button type="button" class="btn-sm" onclick={() => void undoCleanup()}>Undo</button>
                    {/if}
                </p>
            {/if}
            {#if importWorking && importConflicts.length === 0}
                <p class="notice muted" role="status" aria-live="polite">Working…</p>
            {:else if importConflicts.length > 0}
                <div class="conflict-panel">
                    <p class="conflict-title">
                        {importConflicts.length} conflict{importConflicts.length !== 1 ? "s" : ""} - {importConflicts.length}
                        title{importConflicts.length !== 1 ? "s" : ""} already exist in your library.
                    </p>
                    <div class="conflict-bulk">
                        <span class="muted">Apply to all:</span>
                        <button type="button" class="btn-sm" onclick={() => setAllResolutions("overwrite")}
                            >Overwrite all</button>
                        <button type="button" class="btn-sm" onclick={() => setAllResolutions("merge")}
                            >Merge all</button>
                        <button type="button" class="btn-sm" onclick={() => setAllResolutions("skip")}>Skip all</button>
                    </div>
                    <div class="conflict-list">
                        {#each importConflicts as conflict}
                            <div class="conflict-row">
                                <span class="conflict-name" title={conflict.mangaId}>{conflict.existingTitle}</span>
                                <span class="conflict-hint muted">
                                    {#if conflict.importedTitle !== conflict.existingTitle}
                                        "{conflict.importedTitle}" in backup ·
                                    {/if}
                                    {new Date(conflict.importedUpdatedAt).toLocaleDateString()} in backup
                                </span>
                                <select class="conflict-select" bind:value={importResolutions[conflict.mangaId]}>
                                    <option value="overwrite">Overwrite</option>
                                    <option value="merge">Merge</option>
                                    <option value="skip">Skip</option>
                                </select>
                            </div>
                        {/each}
                    </div>
                    {#if importError}
                        <p class="notice" role="alert" style="color:var(--error,#f87171);margin:0">{importError}</p>
                    {/if}
                    <div class="conflict-actions">
                        <button type="button" class="btn-outline" onclick={cancelImport}>Cancel</button>
                        <button type="button" disabled={importWorking} onclick={() => void confirmImport()}>
                            {importWorking ? "Importing…" : "Import"}
                        </button>
                    </div>
                </div>
            {:else if dataMessage}
                <p class="notice" role="status" aria-live="polite">{dataMessage}</p>
            {/if}

            <ImportReconcile
                mangas={library.filter(m => reconcileIds.includes(m.id))}
                onLinked={id => {
                    reconcileIds = reconcileIds.filter(rid => rid !== id)
                    if (reconcileIds.length === 0 && dataMessage.includes("need a live source")) {
                        dataMessage = dataMessage.replace(/\s*\d+ titles? need a live source[^.]*\.?/i, "").trim()
                    }
                    scheduleLoad()
                }} />

            <ImportReconcile
                mangas={library.filter(m => libScanIds.includes(m.id))}
                heading="Find better sources - {libScanIds.length} {libScanIds.length === 1 ? 'title' : 'titles'}"
                hint="Search all sources for each manga in your library. Use this to find a source with more chapters or better availability."
                isLibraryScan={true}
                onLinked={id => {
                    libScanIds = libScanIds.filter(lid => lid !== id)
                    scheduleLoad()
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
                    <div style="display:flex;gap:8px;align-items:center">
                        <select
                            aria-label="Update schedule"
                            value={updateIntervalSelection}
                            onchange={e => changeUpdateInterval(e.currentTarget.value)}>
                            <option value="0">Manual only</option>
                            <option value="6">Every 6 h</option>
                            <option value="12">Every 12 h</option>
                            <option value="24">Daily</option>
                        </select>
                        {#if updateIntervalSaved}<span class="saved-flash">✓ Saved</span>{/if}
                    </div>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Extension updates</p>
                        <p class="muted">
                            {#if extensionUpdate?.available}
                                v{extensionUpdate.latestVersion} is available.
                            {:else if extensionUpdate}
                                Up to date (v{extensionUpdate.latestVersion}).
                            {:else}
                                Check for a new version of AMR.
                            {/if}
                        </p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        {#if extensionUpdate?.available}
                            <button
                                type="button"
                                class="btn-sm"
                                onclick={() => void browser.tabs.create({ url: extensionUpdate!.releaseUrl })}>
                                Download ↗
                            </button>
                        {/if}
                        <button
                            type="button"
                            class="btn-outline btn-sm"
                            disabled={checkingExtUpdate}
                            onclick={() => void checkForExtensionUpdate()}>
                            {checkingExtUpdate ? "Checking…" : "Check now"}
                        </button>
                    </div>
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
                        <p class="row-label">Remove gaps between pages (continuous mode)</p>
                        <p class="muted">Seamless webtoon-style scroll with no vertical gap between page images.</p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <label class="toggle">
                            <input
                                type="checkbox"
                                checked={noGapSelection}
                                onchange={e => void changeNoGapContinuous(e.currentTarget.checked)} />
                            <span class="track"></span>
                        </label>
                        {#if noGapSelectionSaved}<span class="saved-flash">✓ Saved</span>{/if}
                    </div>
                </div>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Preload pages</p>
                        <p class="muted">How many upcoming pages load eagerly (0-10).</p>
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

                <p class="shelf-label" style="margin-top:28px">Community</p>
                <div class="settings-row">
                    <div>
                        <p class="row-label">Community stats</p>
                        <p class="muted">
                            Share anonymous reading stats - no IP, no identity info collected. Enables the community
                            leaderboard, trending manga, and personalised recommendations in the Stats &amp;
                            achievements tab.
                        </p>
                    </div>
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={communityProfile?.enabled ?? true}
                            onchange={e => void toggleCommunity(e.currentTarget.checked)} />
                        <span class="track"></span>
                    </label>
                </div>
                {#if communityProfile?.enabled}
                    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                        <div>
                            <p class="row-label">Community username</p>
                            <p class="muted">
                                {#if communityProfile.userId}
                                    Registered as <strong>{communityProfile.username}</strong>. Your reading data syncs
                                    hourly.
                                {:else}
                                    Choose a display name for the leaderboard. Letters, numbers, _ and - only.
                                {/if}
                            </p>
                        </div>
                        {#if !communityProfile.userId}
                            <div style="display:flex;gap:8px;align-items:center;width:100%">
                                <input
                                    type="text"
                                    placeholder="your-username"
                                    maxlength="30"
                                    style="flex:1"
                                    bind:value={communityUsernameInput}
                                    onkeydown={e => {
                                        if (e.key === "Enter") void registerCommunity()
                                    }} />
                                <button onclick={() => void registerCommunity()}>Join</button>
                            </div>
                            {#if communityRegisterError}
                                <p class="muted" style="color:var(--color-warn)">{communityRegisterError}</p>
                            {/if}
                        {/if}
                    </div>
                {/if}
                <p class="shelf-label" style="margin-top:28px">Danger zone</p>
                <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px">
                    <div>
                        <p class="row-label">Clear reading history</p>
                        <p class="muted">
                            Removes all history events and reading progress. Library manga and chapters are kept.
                        </p>
                    </div>
                    {#if clearConfirm === "history"}
                        <p class="muted" style="color:var(--color-warn)">
                            This removes all history and progress and cannot be undone.
                        </p>
                        <div style="display:flex;gap:8px">
                            <button class="btn-outline" onclick={() => (clearConfirm = "")}>Cancel</button>
                            <button
                                class="btn-danger"
                                disabled={clearWorking}
                                onclick={() => void executeClear("history")}>
                                {clearWorking ? "Clearing…" : "Yes, clear history"}
                            </button>
                        </div>
                    {:else}
                        <button class="btn-outline" onclick={() => (clearConfirm = "history")}>Clear history</button>
                    {/if}
                </div>
                <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px">
                    <div>
                        <p class="row-label">Clear entire library</p>
                        <p class="muted">
                            Wipes all manga, chapters, history, bookmarks, and covers from local storage. Cannot be
                            undone.
                        </p>
                    </div>
                    {#if clearConfirm === "all"}
                        <p class="muted" style="color:var(--color-warn)">Everything will be deleted permanently.</p>
                        <div style="display:flex;gap:8px">
                            <button class="btn-outline" onclick={() => (clearConfirm = "")}>Cancel</button>
                            <button class="btn-danger" disabled={clearWorking} onclick={() => void executeClear("all")}>
                                {clearWorking ? "Clearing…" : "Yes, wipe everything"}
                            </button>
                        </div>
                    {:else}
                        <button class="btn-danger" onclick={() => (clearConfirm = "all")}>Clear library</button>
                    {/if}
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
        onclick={closeDetail}
        onkeydown={e => {
            if (e.key === "Escape" || e.key === "Enter") closeDetail()
        }}>
        <div
            class="detail-card"
            role="dialog"
            aria-label={detailManga.title}
            tabindex="0"
            onclick={e => e.stopPropagation()}
            onkeydown={() => {}}>
            <div class="detail-cover">
                {#if (coverSrcs[detailManga.id] ?? detailManga.coverUrl) && !failedCovers.has(detailManga.id)}<img
                        src={coverSrcs[detailManga.id] ?? detailManga.coverUrl}
                        alt=""
                        class:nsfw-blur={detailManga.nsfw && (settings?.blurNsfw ?? true)}
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
                            }}>★</button>
                    {/each}
                </div>
                {#if detailCommunityStats && (detailCommunityStats.ratingCount > 0 || detailCommunityStats.readerCount > 0)}
                    <div class="community-stats-row">
                        {#if detailCommunityStats.ratingCount > 0}
                            <span class="community-stat">
                                ★ {detailCommunityStats.avgRating?.toFixed(1)}
                                <span class="muted">({detailCommunityStats.ratingCount} ratings)</span>
                            </span>
                        {/if}
                        {#if detailCommunityStats.readerCount > 0}
                            <span class="community-stat muted">{detailCommunityStats.readerCount} readers</span>
                        {/if}
                    </div>
                {/if}
                <div class="detail-categories detail-section">
                    <span class="muted">Tags</span>
                    {#if (detailManga.categories ?? []).length > 0}
                        <div class="tag-chips">
                            {#each detailManga.categories ?? [] as tag}
                                <span class="tag-chip">
                                    <button
                                        type="button"
                                        class="tag-chip-label"
                                        title={`Filter library by "${tag}"`}
                                        onclick={() => {
                                            filterByTag(tag)
                                            closeDetail()
                                        }}>{tag}</button>
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
                                Suggested from source - click to add:
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
                <div class="detail-section">
                    <div class="detail-options-row">
                        <div class="detail-toggles">
                            <label class="menu-toggle">
                                <input
                                    type="checkbox"
                                    checked={detailManga.manualTracking ?? false}
                                    onchange={e =>
                                        detailManga && void setManual(detailManga, e.currentTarget.checked)} />
                                Manual tracking
                            </label>
                            <label
                                class="menu-toggle"
                                title="Skips update checks and hides from the Reading tab without removing the title">
                                <input
                                    type="checkbox"
                                    checked={detailManga.onHold ?? false}
                                    onchange={e => detailManga && void setHold(detailManga, e.currentTarget.checked)} />
                                On hold
                            </label>
                            <label class="menu-toggle">
                                <input
                                    type="checkbox"
                                    checked={detailManga.nsfw ?? false}
                                    onchange={e => detailManga && void setNsfw(detailManga, e.currentTarget.checked)} />
                                NSFW (blur cover)
                            </label>
                        </div>
                        <div>
                            <div class="detail-ch-row">
                                <label class="menu-num">
                                    Read ch
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={detailManga.lastReadChapterNumber ?? ""}
                                        onchange={e =>
                                            detailManga &&
                                            void setNumber(
                                                detailManga,
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
                                        value={detailManga.latestChapterNumber ?? ""}
                                        onchange={e =>
                                            detailManga &&
                                            void setNumber(
                                                detailManga,
                                                "latestChapterNumber",
                                                e.currentTarget.value
                                            )} />
                                </label>
                            </div>
                            {#if detailManga.latestChapterNumber !== undefined && detailManga.lastReadChapterNumber !== undefined && detailManga.latestChapterNumber > detailManga.lastReadChapterNumber}
                                <p class="detail-next-ch">
                                    Next: Ch {detailManga.lastReadChapterNumber + 1} of {detailManga.latestChapterNumber}
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="detail-categories detail-section">
                    <span class="muted">Reading (this title only)</span>
                    <div class="detail-reading-row">
                        <label class="menu-num">
                            Direction
                            <select
                                value={detailManga.readingDirection ?? ""}
                                onchange={e =>
                                    detailManga && void setReadingDirection(detailManga, e.currentTarget.value)}>
                                <option value="">Global default</option>
                                <option value="ltr">Left → Right</option>
                                <option value="rtl">Right → Left</option>
                                <option value="vertical">Vertical</option>
                            </select>
                        </label>
                        <label class="menu-num">
                            Zoom / fit
                            <select
                                value={detailManga.pageFit ?? ""}
                                onchange={e =>
                                    detailManga && void setReadingPageFit(detailManga, e.currentTarget.value)}>
                                <option value="">Global default</option>
                                <option value="width">Fit width</option>
                                <option value="height">Fit height</option>
                                <option value="contain">Contain</option>
                                <option value="original">Original size</option>
                            </select>
                        </label>
                    </div>
                </div>
                <label class="detail-categories detail-section">
                    <span class="muted">Notes</span>
                    <textarea
                        class="detail-notes"
                        rows="3"
                        placeholder="Private notes about this title…"
                        bind:value={noteDraft}
                        onblur={() => detailManga && void saveNote(detailManga)}></textarea>
                </label>
                <label class="detail-categories detail-section">
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
                                            >{r.latestChapter ? `latest ch ${r.latestChapter}` : "-"}</span>
                                        {#if detailManga && r.sourceId !== detailManga.sourceId}
                                            <button
                                                type="button"
                                                class="btn-sm"
                                                disabled={mirrorSwitching !== null}
                                                onclick={() => detailManga && void switchMirror(detailManga, r)}>
                                                {mirrorSwitching === r.sourceId ? "Switching…" : "Switch"}
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
                    <button
                        type="button"
                        class="btn-outline"
                        onclick={() => detailManga && openInBrowser(detailManga, true, { fallback: true })}>
                        Open source
                    </button>
                    {#if openSourceError}<span class="muted" style="color:var(--color-warn)">{openSourceError}</span
                        >{/if}
                    <div class="detail-actions-spacer"></div>
                    <button
                        type="button"
                        class="btn-danger"
                        onclick={() => {
                            if (detailManga) {
                                void remove(detailManga.id)
                                closeDetail()
                            }
                        }}>Remove</button>
                    <button type="button" class="btn-outline" onclick={closeDetail}>Close</button>
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
