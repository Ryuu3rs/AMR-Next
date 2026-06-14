<script lang="ts">
  import { onMount } from "svelte"
  import { extensionApi, sendRuntimeMessage } from "../../core/extension/browser-api"
  import type { MirrorCapability } from "../../core/mirrors/catalog"
  import type { SearchResult, MirrorSearchStatus, MangaReleaseInfo, ShareableList } from "../../core/extension/messages"
  import type { RewritePreferences } from "../../core/settings/preferences"
  import ReaderPage from "./ReaderPage.svelte"

  type PageId = "dashboard" | "search" | "reader" | "library" | "bookmarks" | "updates" | "sharing" | "importexport" | "settings" | "lab" | "permissions"

  type LegacyManga = {
    key: string
    mirror?: string
    language?: string
    url?: string
    name?: string
    displayName: string
    currentChapter: string
    lastchapter: string
    read: number
    updatedAt?: number
  }

  type LegacyBookmark = {
    key: string
    mirror: string
    url: string
    chapUrl: string
    type: "chapter" | "scan"
    name: string
    chapName: string
    scanUrl?: string
    scanName?: string
    note: string
    updatedAt: number
  }

  type LegacySnapshot = {
    version: number
    exportedAt: string
    options: Record<string, unknown>
    kv: Record<string, unknown>
    chapterCache: Record<string, unknown>
    mangas: LegacyManga[]
    bookmarks: LegacyBookmark[]
  }

  let page: PageId = ((document.body.dataset.amrPage as PageId) || "dashboard")

  const navItems: Array<{ id: PageId; label: string; icon: string; group: string }> = [
    { id: "dashboard", label: "Dashboard", icon: "📊", group: "main" },
    { id: "search", label: "Search", icon: "🔍", group: "main" },
    { id: "reader", label: "Reader", icon: "📖", group: "main" },
    { id: "library", label: "Library", icon: "📚", group: "main" },
    { id: "bookmarks", label: "Bookmarks", icon: "🔖", group: "main" },
    { id: "updates", label: "Updates", icon: "🔔", group: "main" },
    { id: "sharing", label: "Sharing", icon: "📤", group: "main" },
    { id: "importexport", label: "Import / Export", icon: "💾", group: "tools" },
    { id: "settings", label: "Settings", icon: "⚙️", group: "tools" },
    { id: "lab", label: "Lab", icon: "🧪", group: "tools" },
    { id: "permissions", label: "Permissions", icon: "🔐", group: "tools" },
  ]
  $: mainNavItems = navItems.filter((item) => item.group === "main" && (enableDashboardReader || item.id !== "reader"))
  $: toolNavItems = navItems.filter((item) => item.group === "tools" && (diagnosticsMode || (item.id !== "lab" && item.id !== "permissions")))
  $: if (!enableDashboardReader && page === "reader") {
    page = "dashboard"
  }
  $: if (!diagnosticsMode && (page === "lab" || page === "permissions")) {
    page = "settings"
  }

  let connected = false
  let version = "-"
  let mirrorSource = "-"
  let mirrorSummary = "-"
  let mirrors: MirrorCapability[] = []
  let releaseReady = false
  let blockers = "none"
  let notes = "none"
  let syncStatus = "not loaded"
  let syncError = ""
  let globalStatus = ""
  let bgErrorLog = ""
  let bgLastPingAt = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let readerStart: { url: string; mirror: string } | null = null

  let mangas: LegacyManga[] = []
  let mangaFilter = ""

  let bookmarks: LegacyBookmark[] = []
  let bookmarkTextFilter = ""
  let bookmarkTypeFilter: "all" | "chapter" | "scan" = "all"
  let bookmarkMirrorFilter = "all"
  let bookmarkNoteDrafts: Record<string, string> = {}

  let searchQuery = ""
  let searchResults: SearchResult[] = []
  let searchMirrorStatuses: MirrorSearchStatus[] = []
  let searchDuration = 0
  let searchLoading = false
  let searchError = ""
  let searchMirrorFilter: string[] = []
  let searchResultFilter = ""
  let addedUrls = new Set<string>()
  let expandedGroups = new Set<string>()

  let snapshotJson = ""
  let importStatus = ""

  let releaseResults: MangaReleaseInfo[] = []
  let releaseCheckRunning = false
  let releaseLastCheckAt = 0
  let releaseCheckError = ""

  let shareExportJson = ""
  let shareImportJson = ""
  let shareStatus = ""

  let labSummary = "-"
  let diagnosticsMode = false

  let hasHostPermissions = false
  let hasNotificationsPermission = false
  let permissionStatus = ""
  let preferences: RewritePreferences = {
    compactMode: false,
    openLinksInNewTab: true,
    theme: "system",
    showNotifications: true,
    releaseCheckIntervalMinutes: 30,
    enableDashboardReader: true
  }
  let enableDashboardReader = true
  let settingsStatus = ""

  $: filteredMangas = mangas.filter((manga) => {
    const needle = mangaFilter.trim().toLowerCase()
    if (!needle) {
      return true
    }

    const haystack = `${manga.displayName} ${manga.name ?? ""} ${manga.mirror ?? ""} ${manga.currentChapter ?? ""} ${manga.lastchapter ?? ""}`.toLowerCase()
    return haystack.includes(needle)
  })

  // Fuzzy relevance filter: keep results that reasonably match the search query
  // Handles typos like "ranmar" matching "Ranma", partial queries, etc.
  function wordsMatch(query: string, title: string): boolean {
    const qWords = query.split(/\s+/).filter(Boolean)
    const tWords = title.split(/\s+/).filter(Boolean)

    // For each query word, check if it fuzzy-matches ANY title word
    return qWords.some((qw) => {
      // Direct: title contains the query word
      if (title.includes(qw)) return true
      // Reverse: query word contains a title word (e.g. "ranmar" contains "ranma")
      if (tWords.some((tw) => tw.length >= 3 && qw.includes(tw))) return true
      // Prefix overlap: share a common prefix of at least 3 chars
      if (tWords.some((tw) => {
        const minLen = Math.min(qw.length, tw.length)
        if (minLen < 3) return false
        let shared = 0
        while (shared < minLen && qw[shared] === tw[shared]) shared++
        return shared >= 3 && shared >= minLen * 0.6
      })) return true
      return false
    })
  }

  $: relevantSearchResults = (() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return searchResults
    return searchResults.filter((result) => {
      const title = result.name.trim().toLowerCase()
      return wordsMatch(q, title)
    })
  })()

  $: filteredSearchResults = relevantSearchResults.filter((result) => {
    const needle = searchResultFilter.trim().toLowerCase()
    if (!needle) return true
    return `${result.name} ${result.mirror}`.toLowerCase().includes(needle)
  })

  type GroupedResult = { name: string; sources: SearchResult[] }

  $: groupedSearchResults = (() => {
    const q = searchQuery.trim().toLowerCase()
    const groups = new Map<string, SearchResult[]>()
    for (const result of filteredSearchResults) {
      const key = result.name.trim().toLowerCase()
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(result)
    }
    const out: GroupedResult[] = []
    for (const [, sources] of groups) {
      out.push({ name: sources[0].name, sources })
    }
    // Sort: exact matches first, then starts-with, then contains
    if (q) {
      out.sort((a, b) => {
        const aLow = a.name.trim().toLowerCase()
        const bLow = b.name.trim().toLowerCase()
        const aExact = aLow === q ? 0 : aLow.startsWith(q) ? 1 : 2
        const bExact = bLow === q ? 0 : bLow.startsWith(q) ? 1 : 2
        if (aExact !== bExact) return aExact - bExact
        // Secondary: more sources = higher rank
        if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
        return aLow.localeCompare(bLow)
      })
    }
    return out
  })()

  $: searchableMirrors = mirrors.filter((m) => m.supportsSearch).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))

  $: releaseMap = new Map(releaseResults.map((r) => [r.key, r]))
  $: newReleaseCount = releaseResults.filter((r) => r.hasNew).length
  $: readMangaCount = mangas.filter((manga) => manga.read === 1).length
  $: trackedMirrorCount = new Set(mangas.map((manga) => manga.mirror).filter(Boolean)).size
  $: chapterBookmarkCount = bookmarks.filter((bookmark) => bookmark.type === "chapter").length
  $: scanBookmarkCount = bookmarks.filter((bookmark) => bookmark.type === "scan").length
  $: unreadMangaCount = Math.max(mangas.length - readMangaCount, 0)

  $: bookmarkMirrors = Array.from(new Set(bookmarks.map((bookmark) => bookmark.mirror).filter(Boolean))).sort()

  $: filteredBookmarks = bookmarks.filter((bookmark) => {
    if (bookmarkTypeFilter !== "all" && bookmark.type !== bookmarkTypeFilter) {
      return false
    }

    if (bookmarkMirrorFilter !== "all" && bookmark.mirror !== bookmarkMirrorFilter) {
      return false
    }

    const needle = bookmarkTextFilter.trim().toLowerCase()
    if (!needle) {
      return true
    }

    const haystack = `${bookmark.name} ${bookmark.chapName} ${bookmark.note} ${bookmark.mirror}`.toLowerCase()
    return haystack.includes(needle)
  })

  async function sendLegacyAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    return (await extensionApi.runtime.sendMessage({ action, ...payload })) as T
  }

  async function openUrl(url: string | undefined): Promise<void> {
    if (!url) {
      return
    }

    try {
      await extensionApi.tabs.create({ url })
    } catch {
      window.open(url, "_blank")
    }
  }

  function openReaderHere(url: string | undefined, mirror: string | undefined): void {
    if (!url) {
      return
    }
    if (!enableDashboardReader) {
      void openUrl(url)
      globalStatus = "Dashboard reader is disabled; opened chapter on source site."
      return
    }
    if (!mirror) {
      return
    }
    readerStart = { url, mirror }
    page = "reader"
  }

  function displayMangaName(manga: LegacyManga): string {
    return manga.displayName || manga.name || manga.url || "Untitled manga"
  }

  function formatTimestamp(ts: number | undefined): string {
    if (!ts || !Number.isFinite(ts)) {
      return "-"
    }
    return new Date(ts).toLocaleString()
  }

  async function refreshRuntime(): Promise<void> {
    try {
      const [health, diagnostics, readiness, sync, prefs] = await Promise.all([
        sendRuntimeMessage({ type: "health:ping" }),
        sendRuntimeMessage({ type: "mirrors:diagnostics" }),
        sendRuntimeMessage({ type: "release:readiness:get" }),
        sendRuntimeMessage({ type: "sync:status:get" }),
        sendRuntimeMessage({ type: "preferences:get" })
      ])

      connected = health.ok
      version = health.version
      mirrors = diagnostics.mirrors
      mirrorSource = diagnostics.diagnostics.source
      mirrorSummary = `total:${diagnostics.diagnostics.total} searchable:${diagnostics.diagnostics.searchable} latest:${diagnostics.diagnostics.latest} disabled:${diagnostics.diagnostics.disabled}`
      releaseReady = readiness.readiness.ready
      blockers = readiness.readiness.blockers.length ? readiness.readiness.blockers.join(" | ") : "none"
      notes = readiness.readiness.notes.length ? readiness.readiness.notes.join(" | ") : "none"
      syncStatus = `enabled:${sync.syncStatus.enabled} provider:${sync.syncStatus.provider} autoSync:${sync.syncStatus.autoSync}`
      syncError = sync.syncStatus.lastError ?? ""
      preferences = prefs.preferences
      enableDashboardReader = prefs.preferences.enableDashboardReader
      bgErrorLog = ""
      bgLastPingAt = Date.now()
    } catch (err) {
      connected = false
      const msg = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      bgErrorLog = `[${new Date().toISOString()}] Background script unreachable\nError: ${msg}${stack ? `\nStack: ${stack}` : ""}\n\nThis usually means the background script has crashed or failed to load. Try:\n1. Reload the extension in about:debugging\n2. Check the Browser Console (Ctrl+Shift+J) for errors\n3. Re-install the extension`
      globalStatus = "Background unreachable"
    }
  }

  async function refreshMangas(): Promise<void> {
    mangas = await sendLegacyAction<LegacyManga[]>("listMangas")
  }

  async function refreshBookmarks(): Promise<void> {
    bookmarks = await sendLegacyAction<LegacyBookmark[]>("listBookmarks")
    bookmarkNoteDrafts = Object.fromEntries(bookmarks.map((bookmark) => [bookmark.key, bookmark.note]))
  }

  async function refreshLabSummary(): Promise<void> {
    const snapshot = await sendLegacyAction<LegacySnapshot>("getLegacySnapshot")
    labSummary = `mangas:${snapshot.mangas.length} bookmarks:${snapshot.bookmarks.length} chapter-cache-keys:${Object.keys(snapshot.chapterCache ?? {}).length}`
  }

  async function refreshPermissions(): Promise<void> {
    if (!extensionApi.permissions) {
      permissionStatus = "permissions API unavailable in this environment"
      return
    }

    hasHostPermissions = await extensionApi.permissions.contains({
      origins: ["https://*/*", "http://*/*"]
    })
    hasNotificationsPermission = await extensionApi.permissions.contains({
      permissions: ["notifications"]
    })
  }

  async function refreshPageData(): Promise<void> {
    if (page === "dashboard" || page === "library" || page === "updates") {
      await Promise.all([refreshMangas(), loadReleaseStatus()])
      return
    }

    if (page === "bookmarks") {
      await refreshBookmarks()
      return
    }

    if (page === "importexport") {
      importStatus = "Ready"
      return
    }

    if (page === "lab") {
      await refreshLabSummary()
      return
    }

    if (page === "permissions") {
      await refreshPermissions()
    }
  }

  async function refreshAll(): Promise<void> {
    console.log("[AMR] refreshAll called, page:", page, "connected:", connected)
    globalStatus = "Refreshing..."
    try {
      await Promise.all([refreshRuntime(), refreshPageData()])
      globalStatus = "Ready"
      console.log("[AMR] refreshAll done, connected:", connected, "mangas:", mangas.length)
    } catch (error) {
      globalStatus = error instanceof Error ? `Refresh failed: ${error.message}` : "Refresh failed"
      console.error("[AMR] refreshAll error:", error)
    }
  }

  async function runSyncNow(): Promise<void> {
    await sendRuntimeMessage({ type: "sync:run-now" })
    await refreshRuntime()
  }

  async function deleteManga(manga: LegacyManga): Promise<void> {
    await sendLegacyAction<boolean>("deleteManga", {
      key: manga.key,
      url: manga.url,
      mirror: manga.mirror,
      language: manga.language
    })
    await refreshMangas()
  }

  async function setMangaReadState(manga: LegacyManga, read: number): Promise<void> {
    await sendLegacyAction("markMangaReadTop", {
      url: manga.url,
      mirror: manga.mirror,
      language: manga.language,
      name: displayMangaName(manga),
      read
    })
    await refreshMangas()
  }

  async function executeSearch(): Promise<void> {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    searchLoading = true
    searchError = ""
    searchResults = []
    searchMirrorStatuses = []
    searchDuration = 0
    addedUrls = new Set<string>()

    try {
      const response = await sendRuntimeMessage({
        type: "search:mirrors",
        payload: {
          query: trimmed,
          mirrors: searchMirrorFilter.length > 0 ? searchMirrorFilter : undefined
        }
      })

      searchResults = response.results
      searchMirrorStatuses = response.mirrorStatuses
      searchDuration = response.durationMs
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed"
    } finally {
      searchLoading = false
    }
  }

  function clearSearch(): void {
    searchQuery = ""
    searchResults = []
    searchMirrorStatuses = []
    searchDuration = 0
    searchError = ""
    searchResultFilter = ""
    addedUrls = new Set<string>()
    expandedGroups = new Set<string>()
  }

  function toggleGroup(name: string): void {
    const key = name.trim().toLowerCase()
    if (expandedGroups.has(key)) {
      expandedGroups.delete(key)
    } else {
      expandedGroups.add(key)
    }
    expandedGroups = new Set(expandedGroups)
  }

  function getMirrorIcon(mirrorName: string): string | undefined {
    const m = mirrors.find((mir) => mir.name === mirrorName)
    return m?.mirrorIcon
  }

  function toggleMirrorFilter(mirrorName: string): void {
    if (searchMirrorFilter.includes(mirrorName)) {
      searchMirrorFilter = searchMirrorFilter.filter((m) => m !== mirrorName)
    } else {
      searchMirrorFilter = [...searchMirrorFilter, mirrorName]
    }
  }

  async function addToLibrary(result: SearchResult): Promise<void> {
    try {
      await sendLegacyAction("readManga", {
        url: result.url,
        mirror: result.mirror,
        name: result.name,
        language: "en"
      })
      addedUrls = new Set([...addedUrls, result.url])
      await refreshMangas()
    } catch (err) {
      console.error("[AMR] addToLibrary failed:", err)
    }
  }

  async function checkForUpdates(): Promise<void> {
    releaseCheckRunning = true
    releaseCheckError = ""
    try {
      const response = await sendRuntimeMessage({ type: "release:check" })
      releaseResults = response.results
      releaseLastCheckAt = response.checkedAt
    } catch (err) {
      releaseCheckError = err instanceof Error ? err.message : "Check failed"
    } finally {
      releaseCheckRunning = false
    }
  }

  async function loadReleaseStatus(): Promise<void> {
    try {
      const response = await sendRuntimeMessage({ type: "release:check:status" })
      releaseResults = response.results
      releaseLastCheckAt = response.lastCheckAt
      releaseCheckRunning = response.isRunning
    } catch {
      // no persisted results yet
    }
  }

  async function exportLibrary(): Promise<void> {
    shareStatus = ""
    try {
      const response = await sendRuntimeMessage({ type: "share:export", payload: { keys: [] } })
      shareExportJson = JSON.stringify(response.data, null, 2)
      shareStatus = `Exported ${response.data.manga.length} manga`
    } catch (err) {
      shareStatus = `Export failed: ${err instanceof Error ? err.message : "unknown error"}`
    }
  }

  async function importSharedList(): Promise<void> {
    shareStatus = ""
    try {
      const parsed = JSON.parse(shareImportJson) as ShareableList
      if (!parsed.version || !Array.isArray(parsed.manga)) {
        shareStatus = "Invalid share format — expected { version, manga: [...] }"
        return
      }
      const response = await sendRuntimeMessage({ type: "share:import", payload: { data: parsed } })
      shareStatus = `Imported: ${response.imported}, Skipped: ${response.skipped}, Errors: ${response.errors}`
      shareImportJson = ""
      await refreshMangas()
    } catch (err) {
      shareStatus = `Import failed: ${err instanceof Error ? err.message : "invalid JSON"}`
    }
  }

  function copyToClipboard(text: string, feedback?: string): void {
    navigator.clipboard.writeText(text).then(
      () => { shareStatus = feedback ?? "Copied to clipboard" },
      () => { shareStatus = "Copy failed" }
    )
  }

  function errorLabel(code: string | undefined): string {
    switch (code) {
      case "OFFLINE": return "🔴 Offline"
      case "BLOCKED": return "🚫 Blocked"
      case "TIMEOUT": return "⏱ Timeout"
      case "CHANGED": return "⚠️ Site Changed"
      case "NETWORK": return "🌐 Network Error"
      case "HTTP": return "❌ HTTP Error"
      case "PARSE": return "⚠️ Parse Error"
      case "NOT_FOUND": return "❓ Not Found"
      default: return "❓ Unknown"
    }
  }

  function errorSuggestion(code: string | undefined): string {
    switch (code) {
      case "OFFLINE": return "Site may be permanently down. Consider removing from mirror list."
      case "BLOCKED": return "Site uses Cloudflare/captcha. Try visiting the site in browser first."
      case "TIMEOUT": return "Site is very slow. May recover later — try again."
      case "CHANGED": return "Site has been restructured. Mirror scraper needs updating or removal."
      case "NETWORK": return "Connection failed. Could be temporary — try again later."
      case "HTTP": return "Server returned an error. May be temporary."
      default: return "Unexpected error occurred."
    }
  }

  function copyErrorReport(): void {
    const errorMirrors = searchMirrorStatuses.filter((s) => s.status === "error")
    const lines = errorMirrors.map((s) =>
      `[${s.errorCode ?? "UNKNOWN"}] ${s.mirror}\n  Status: ${errorLabel(s.errorCode)}\n  Error: ${s.error}\n  Suggestion: ${errorSuggestion(s.errorCode)}\n  Detail: ${s.errorDetail ?? "—"}\n  Duration: ${s.durationMs ?? "—"}ms`
    )
    const report = `AMR Search Error Report\nQuery: "${searchQuery}"\nTime: ${new Date().toISOString()}\nTotal mirrors: ${searchMirrorStatuses.length}\nErrors: ${errorMirrors.length}\n\n${lines.join("\n\n")}`
    navigator.clipboard.writeText(report)
  }

  function copySingleMirrorReport(ms: MirrorSearchStatus): void {
    const report = `AMR Mirror Error Report\nMirror: ${ms.mirror}\nStatus: ${errorLabel(ms.errorCode)}\nError: ${ms.error}\nSuggestion: ${errorSuggestion(ms.errorCode)}\nDetail: ${ms.errorDetail ?? "—"}\nDuration: ${ms.durationMs ?? "—"}ms\nQuery: "${searchQuery}"\nTime: ${new Date().toISOString()}`
    navigator.clipboard.writeText(report)
  }

  function navigateTo(target: PageId): void {
    console.log("[AMR] navigateTo called:", target, "current page:", page)
    if (target === "reader" && !enableDashboardReader) {
      globalStatus = "Dashboard reader is disabled in Settings."
      return
    }
    if ((target === "lab" || target === "permissions") && !diagnosticsMode) {
      page = "settings"
      settingsStatus = "Enable diagnostics mode in Settings before opening lab or permissions pages."
      return
    }
    page = target
    console.log("[AMR] page set to:", page)
    void refreshPageData()
  }

  let expandedErrors = new Set<string>()

  async function deleteBookmark(bookmark: LegacyBookmark): Promise<void> {
    await sendLegacyAction<boolean>("deleteBookmark", {
      type: bookmark.type,
      mirror: bookmark.mirror,
      chapUrl: bookmark.chapUrl,
      scanUrl: bookmark.scanUrl
    })
    await refreshBookmarks()
  }

  async function saveBookmarkNote(bookmark: LegacyBookmark): Promise<void> {
    const note = bookmarkNoteDrafts[bookmark.key] ?? ""
    await sendLegacyAction<boolean>("addUpdateBookmark", {
      type: bookmark.type,
      mirror: bookmark.mirror,
      url: bookmark.url,
      chapUrl: bookmark.chapUrl,
      name: bookmark.name,
      chapName: bookmark.chapName,
      scanUrl: bookmark.scanUrl,
      scanName: bookmark.scanName,
      note
    })
    await refreshBookmarks()
  }

  async function exportSnapshot(): Promise<void> {
    const snapshot = await sendLegacyAction<LegacySnapshot>("getLegacySnapshot")
    snapshotJson = JSON.stringify(snapshot, null, 2)
    importStatus = `Exported snapshot with ${snapshot.mangas.length} mangas and ${snapshot.bookmarks.length} bookmarks`
  }

  async function downloadSnapshot(): Promise<void> {
    if (!snapshotJson.trim()) {
      await exportSnapshot()
    }

    const blob = new Blob([snapshotJson], { type: "application/json" })
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = `amr-rewrite-snapshot-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(href)
  }

  async function importSnapshotFromJson(): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(snapshotJson)
    } catch (error) {
      importStatus = error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON"
      return
    }

    const result = await sendLegacyAction<{
      ok: boolean
      importedMangas: number
      rejectedMangas: number
      importedBookmarks: number
      rejectedBookmarks: number
    }>("importLegacySnapshot", {
      snapshot: parsed
    })

    importStatus = `Imported mangas:${result.importedMangas} (rejected:${result.rejectedMangas}) bookmarks:${result.importedBookmarks} (rejected:${result.rejectedBookmarks})`
    await refreshPageData()
  }

  async function resetLegacyData(): Promise<void> {
    const confirmReset = window.confirm("This will delete rewrite local manga/bookmark/options storage. Continue?")
    if (!confirmReset) {
      return
    }

    await sendLegacyAction<boolean>("resetLegacyData")
    await refreshAll()
  }

  async function requestHostPermissions(): Promise<void> {
    if (!extensionApi.permissions) {
      return
    }

    const granted = await extensionApi.permissions.request({
      origins: ["https://*/*", "http://*/*"]
    })
    permissionStatus = granted ? "Host permissions granted" : "Host permission request denied"
    await refreshPermissions()
  }

  async function requestNotificationsPermission(): Promise<void> {
    if (!extensionApi.permissions) {
      return
    }

    const granted = await extensionApi.permissions.request({
      permissions: ["notifications"]
    })
    permissionStatus = granted ? "Notifications permission granted" : "Notifications permission request denied"
    await refreshPermissions()
  }

  async function saveSettings(): Promise<void> {
    settingsStatus = ""
    try {
      const response = await sendRuntimeMessage({
        type: "preferences:set",
        payload: {
          ...preferences,
          enableDashboardReader
        }
      })
      preferences = response.preferences
      enableDashboardReader = response.preferences.enableDashboardReader
      settingsStatus = "Settings saved"
      if (!enableDashboardReader && page === "reader") {
        page = "dashboard"
      }
    } catch (error) {
      settingsStatus = error instanceof Error ? `Failed to save settings: ${error.message}` : "Failed to save settings"
    }
  }

  function toggleDiagnosticsMode(event: Event): void {
    diagnosticsMode = (event.currentTarget as HTMLInputElement).checked
    if (!diagnosticsMode && (page === "lab" || page === "permissions")) {
      page = "settings"
    }
    settingsStatus = diagnosticsMode
      ? "Diagnostics mode enabled"
      : "Diagnostics mode hidden from navigation"
  }

  async function openDiagnosticsPage(target: "lab" | "permissions"): Promise<void> {
    if (!diagnosticsMode) {
      diagnosticsMode = true
    }
    page = target
    await refreshPageData()
  }

  function copyErrorLog(): void {
    if (bgErrorLog) {
      void navigator.clipboard.writeText(bgErrorLog)
    }
  }

  onMount(async () => {
    await refreshAll()

    const params = new URLSearchParams(window.location.search)
    const readerUrl = params.get("reader")
    const readerMirror = params.get("mirror")
    if (readerUrl && readerMirror) {
      if (enableDashboardReader) {
        readerStart = { url: readerUrl, mirror: readerMirror }
        page = "reader"
      } else {
        void openUrl(readerUrl)
      }
    }

    // Heartbeat: ping background every 30s to detect crashes
    heartbeatTimer = setInterval(async () => {
      try {
        const health = await sendRuntimeMessage({ type: "health:ping" })
        connected = health.ok
        bgLastPingAt = Date.now()
        if (connected) bgErrorLog = ""
      } catch (err) {
        connected = false
        const msg = err instanceof Error ? err.message : String(err)
        bgErrorLog = `[${new Date().toISOString()}] Heartbeat failed\nError: ${msg}\n\nBackground script may have crashed. Try reloading the extension.`
      }
    }, 30_000)

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    }
  })
</script>

<div class="shell">
  <!-- ===== SIDEBAR ===== -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-icon">📖</span>
      <span class="brand-text">AMR</span>
    </div>

    <nav class="sidebar-nav">
      {#each mainNavItems as item}
        <button
          class="nav-item" class:nav-active={page === item.id}
          on:click={() => navigateTo(item.id)}
        >
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-label">{item.label}</span>
          {#if item.id === "updates" && newReleaseCount > 0}
            <span class="nav-badge">{newReleaseCount}</span>
          {/if}
        </button>
      {/each}

      <div class="nav-divider"></div>

      {#each toolNavItems as item}
        <button
          class="nav-item" class:nav-active={page === item.id}
          on:click={() => navigateTo(item.id)}
        >
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-label">{item.label}</span>
        </button>
      {/each}
    </nav>

    <div class="sidebar-footer">
      <div class="footer-status-row">
        <span class="status-dot" class:status-ok={connected}></span>
        <span class="sidebar-status">{connected ? "Connected" : "Offline"}</span>
        {#if !connected}
          <button class="footer-btn" title="Retry connection" on:click={() => void refreshAll()}>🔄</button>
          {#if bgErrorLog}
            <button class="footer-btn" title="Copy error log" on:click={copyErrorLog}>📋</button>
          {/if}
        {/if}
      </div>
      {#if !connected && bgErrorLog}
        <pre class="footer-error-log">{bgErrorLog}</pre>
      {/if}
    </div>
  </aside>

  <!-- ===== MAIN CONTENT ===== -->
  <main class="content" class:content-reader={page === "reader"}>
    <!-- ===== DASHBOARD ===== -->
    {#if page === "dashboard"}
      <header class="page-header">
        <h1>Dashboard</h1>
        <p class="page-sub">Operator overview for the active Svelte extension track</p>
      </header>

      <section class="hero-band">
        <article class="hero-panel hero-panel-main">
          <p class="hero-kicker">Rewrite Track</p>
          <h2>Control-room status for library, mirrors, and reader runtime</h2>
          <p class="hero-copy">
            This shell is the active extension surface. Use it to monitor runtime health, launch the reader, and verify cutover readiness against the stable reference.
          </p>
        </article>
        <article class="hero-panel hero-panel-side">
          <p class="hero-kicker">Runtime</p>
          <div class="hero-stats">
            <span class="hero-chip" class:hero-chip-ok={connected}>{connected ? "Connected" : "Offline"}</span>
            <span class="hero-chip">Version {version}</span>
            <span class="hero-chip">Mirrors {mirrors.length}</span>
            <span class="hero-chip">Ready {releaseReady ? "Yes" : "No"}</span>
          </div>
          <div class="row">
            <button class="primary" on:click={refreshAll}>Refresh runtime</button>
            <button on:click={runSyncNow}>Run sync</button>
          </div>
        </article>
      </section>

      <div class="stat-grid">
        <article class="stat-card">
          <div class="stat-value">{mangas.length}</div>
          <div class="stat-label">Library</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{newReleaseCount}</div>
          <div class="stat-label">New Chapters</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{bookmarks.length}</div>
          <div class="stat-label">Bookmarks</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{mirrors.length}</div>
          <div class="stat-label">Mirrors</div>
        </article>
      </div>

      <div class="card-grid">
        <article class="card card-feature">
          <h3>Runtime</h3>
          <p class="muted">Version: {version}</p>
          <p class="muted">Status: {globalStatus}</p>
          <p class="muted">Mirrors: {mirrorSource} · {mirrorSummary}</p>
          <div class="actions-inline">
            <button on:click={refreshAll}>Refresh</button>
            <button on:click={() => navigateTo("settings")}>Settings</button>
          </div>
        </article>
        <article class="card card-feature">
          <h3>Sync</h3>
          <p class="muted">{syncStatus}</p>
          {#if syncError}<p class="error">{syncError}</p>{/if}
          <div class="actions-inline">
            <button on:click={runSyncNow}>Run Sync Now</button>
            <button on:click={() => navigateTo("sharing")}>Sharing</button>
          </div>
        </article>
        <article class="card card-feature">
          <h3>Readiness</h3>
          <p class="muted">Ready: {releaseReady ? "✅ Yes" : "❌ No"}</p>
          <p class="muted">Blockers: {blockers}</p>
          <p class="muted">Notes: {notes}</p>
          <div class="actions-inline">
            <button class="primary" on:click={() => navigateTo("updates")}>Open Updates</button>
            <button on:click={() => navigateTo("search")}>Search Mirrors</button>
          </div>
        </article>
        <article class="card card-feature">
          <h3>Reader Queue</h3>
          <p class="muted">Unread library entries: {unreadMangaCount}</p>
          <p class="muted">Bookmarked chapter markers: {chapterBookmarkCount}</p>
          <p class="muted">Dashboard reader: {enableDashboardReader ? "Enabled" : "Disabled"}</p>
          <div class="actions-inline">
            <button class="primary" on:click={() => navigateTo("library")}>Open Library</button>
            <button on:click={() => navigateTo("bookmarks")}>Open Bookmarks</button>
          </div>
        </article>
      </div>
    {/if}

    <!-- ===== SEARCH ===== -->
    {#if page === "search"}
      <header class="page-header">
        <h1>Search Mirrors</h1>
        <p class="page-sub">Search manga across {searchableMirrors.length} mirrors</p>
      </header>

      <div class="panel tone-panel search-command-panel">
        <div class="panel-lead">
          <div>
            <p class="panel-kicker">Search Control</p>
            <h3>Scan mirrors and route results straight into library or reader</h3>
          </div>
          <div class="meta-strip">
            <span class="meta-chip-inline">Mirrors {searchableMirrors.length}</span>
            <span class="meta-chip-inline">Filters {searchMirrorFilter.length || "All"}</span>
          </div>
        </div>
        <div class="row">
          <input
            class="grow"
            type="text"
            placeholder="Search manga across mirrors..."
            bind:value={searchQuery}
            on:keydown={(e) => e.key === "Enter" && executeSearch()}
          />
          <button class="primary" on:click={executeSearch} disabled={searchLoading || !searchQuery.trim()}>
            {searchLoading ? "Searching..." : "Search"}
          </button>
          {#if searchResults.length > 0 || searchError}
            <button on:click={clearSearch}>Clear</button>
          {/if}
        </div>

        {#if searchableMirrors.length > 0}
          <details class="mirror-filter-details">
            <summary class="muted">
              Mirror filter: {searchMirrorFilter.length === 0 ? "All mirrors" : `${searchMirrorFilter.length} selected`}
            </summary>
            <div class="mirror-chips">
              {#each searchableMirrors as m}
                <label class="chip" class:chip-active={searchMirrorFilter.includes(m.name)}>
                  <input type="checkbox" checked={searchMirrorFilter.includes(m.name)} on:change={() => toggleMirrorFilter(m.name)} />
                  {#if m.mirrorIcon}
                    <img class="chip-icon" src={m.mirrorIcon} alt="" width="16" height="16" />
                  {/if}
                  {m.name}
                </label>
              {/each}
            </div>
          </details>
        {/if}

        {#if searchError}
          <p class="error">{searchError}</p>
        {/if}
      </div>

      {#if !searchLoading && searchMirrorStatuses.length === 0 && !searchError}
        <div class="panel empty-panel">
          <p class="panel-kicker">Search Idle</p>
          <h3>Start with a title, author fragment, or series keyword</h3>
          <p class="muted">Search uses the active mirror catalog and keeps failures visible so you can see which sources are healthy.</p>
        </div>
      {/if}

      {#if searchMirrorStatuses.length > 0}
        {@const doneCount = searchMirrorStatuses.filter((s) => s.status === "done").length}
        {@const errorMirrors = searchMirrorStatuses.filter((s) => s.status === "error")}
        {@const errorCount = errorMirrors.length}
        {@const offlineCount = errorMirrors.filter((s) => s.errorCode === "OFFLINE").length}
        {@const blockedCount = errorMirrors.filter((s) => s.errorCode === "BLOCKED").length}
        {@const changedCount = errorMirrors.filter((s) => s.errorCode === "CHANGED").length}
        {@const timeoutCount = errorMirrors.filter((s) => s.errorCode === "TIMEOUT").length}
        <div class="section-metrics">
          <article class="metric-card">
            <span class="metric-label">Relevant</span>
            <strong class="metric-value">{relevantSearchResults.length}</strong>
            <span class="metric-note">{filteredSearchResults.length} visible results</span>
          </article>
          <article class="metric-card">
            <span class="metric-label">Responded Mirrors</span>
            <strong class="metric-value">{doneCount}</strong>
            <span class="metric-note">{searchableMirrors.length} searchable configured</span>
          </article>
          <article class="metric-card">
            <span class="metric-label">Runtime</span>
            <strong class="metric-value">{searchDuration}ms</strong>
            <span class="metric-note">{errorCount} mirrors with issues</span>
          </article>
        </div>

        <div class="panel">
          <div class="row">
            <h3>Results</h3>
            <span class="muted">
              {relevantSearchResults.length} relevant from {doneCount} mirrors in {searchDuration}ms
              {#if searchResults.length !== relevantSearchResults.length}
                ({searchResults.length - relevantSearchResults.length} irrelevant hidden)
              {/if}
            </span>
          </div>

          {#if errorCount > 0}
            <div class="error-summary">
              <div class="error-summary-header">
                <span class="error-summary-title">⚠️ {errorCount} mirror{errorCount > 1 ? "s" : ""} had issues</span>
                <div class="error-summary-badges">
                  {#if offlineCount > 0}<span class="err-badge err-offline">🔴 {offlineCount} offline</span>{/if}
                  {#if blockedCount > 0}<span class="err-badge err-blocked">🚫 {blockedCount} blocked</span>{/if}
                  {#if changedCount > 0}<span class="err-badge err-changed">⚠️ {changedCount} changed</span>{/if}
                  {#if timeoutCount > 0}<span class="err-badge err-timeout">⏱ {timeoutCount} timeout</span>{/if}
                  {#if errorCount - offlineCount - blockedCount - changedCount - timeoutCount > 0}
                    <span class="err-badge err-other">❓ {errorCount - offlineCount - blockedCount - changedCount - timeoutCount} other</span>
                  {/if}
                </div>
                <button class="btn-sm" on:click={copyErrorReport}>📋 Copy All Errors</button>
              </div>

              <div class="error-mirror-list">
                {#each errorMirrors as ms}
                  <div class="error-mirror-row">
                    <span class="error-mirror-badge">{errorLabel(ms.errorCode)}</span>
                    <span class="error-mirror-name">{ms.mirror}</span>
                    <span class="error-mirror-msg">{ms.error}</span>
                    <div class="error-mirror-actions">
                      <button class="btn-xs" on:click={() => copySingleMirrorReport(ms)} title="Copy error report for this mirror">📋</button>
                      <button class="btn-xs" on:click={() => { expandedErrors = expandedErrors.has(ms.mirror) ? new Set([...expandedErrors].filter(e => e !== ms.mirror)) : new Set([...expandedErrors, ms.mirror]) }}>
                        {expandedErrors.has(ms.mirror) ? "▾" : "▸"}
                      </button>
                    </div>
                    {#if expandedErrors.has(ms.mirror)}
                      <div class="error-mirror-detail">
                        <p class="error-suggestion">💡 {errorSuggestion(ms.errorCode)}</p>
                        {#if ms.errorDetail}
                          <pre class="error-detail">{ms.errorDetail}</pre>
                        {/if}
                        <span class="muted">Duration: {ms.durationMs ?? "—"}ms</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        {#if searchResults.length > 0}
          <div class="panel">
            <div class="row">
              <input class="grow" type="text" placeholder="Filter results..." bind:value={searchResultFilter} />
              <span class="muted">{groupedSearchResults.length} titles ({filteredSearchResults.length} results)</span>
            </div>
            <div class="search-grid">
              {#each groupedSearchResults as group}
                {@const primarySource = group.sources[0]}
                <article class="search-card">
                  <div class="search-card-body">
                    <div>
                      <p class="search-card-title">{group.name}</p>
                      <div class="search-card-pills">
                        <span class="search-pill">{group.sources.length} mirror{group.sources.length > 1 ? "s" : ""}</span>
                        <span class="search-pill search-pill-subtle">Primary: {primarySource.mirror}</span>
                      </div>
                    </div>
                    <div class="search-card-meta">
                      <button
                        class="expand-chevron"
                        on:click={() => toggleGroup(group.name)}
                        title={expandedGroups.has(group.name.trim().toLowerCase()) ? "Collapse mirrors" : "Show mirrors"}
                      >
                        <span class="chevron-icon" class:expanded={expandedGroups.has(group.name.trim().toLowerCase())}>&#x25B8;</span>
                      </button>
                    </div>
                  </div>

                  {#if !expandedGroups.has(group.name.trim().toLowerCase())}
                    <div class="mirror-icon-row">
                      {#each group.sources as source}
                        {@const icon = getMirrorIcon(source.mirror)}
                        <button
                          class="mirror-icon-btn"
                          on:click={() => openUrl(source.url)}
                          title="{source.mirror} — click to open"
                        >
                          {#if icon}
                            <img class="mirror-icon-img" src={icon} alt={source.mirror} />
                          {:else}
                            <span class="mirror-icon-fallback">{source.mirror.charAt(0)}</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <div class="search-card-actions">
                      <button class="btn-sm" on:click={() => openUrl(primarySource.url)}>Open Primary</button>
                      <button class="btn-sm primary-action" on:click={() => openReaderHere(primarySource.url, primarySource.mirror)}>Read Here</button>
                      {#if addedUrls.has(primarySource.url)}
                        <span class="muted">✓ Library tracked</span>
                      {:else}
                        <button class="btn-sm" on:click={() => addToLibrary(primarySource)}>+ Library</button>
                      {/if}
                    </div>
                  {:else}
                    <div class="mirror-expanded-list">
                      {#each group.sources as source}
                        {@const icon = getMirrorIcon(source.mirror)}
                        <div class="mirror-row">
                          <div class="mirror-row-left">
                            {#if icon}
                              <img class="mirror-icon-img" src={icon} alt={source.mirror} />
                            {:else}
                              <span class="mirror-icon-fallback">{source.mirror.charAt(0)}</span>
                            {/if}
                            <span class="mirror-row-name">{source.mirror}</span>
                          </div>
                          <div class="mirror-row-actions">
                            <button class="btn-sm" on:click={() => openUrl(source.url)}>Open</button>
                            <button class="btn-sm" on:click={() => openReaderHere(source.url, source.mirror)}>Read Here</button>
                            {#if addedUrls.has(source.url)}
                              <span class="muted">✓ Added</span>
                            {:else}
                              <button class="btn-sm" on:click={() => addToLibrary(source)}>+ Library</button>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    {/if}

    <!-- ===== READER ===== -->
    {#if page === "reader"}
      <ReaderPage {mirrors} startRequest={readerStart} on:close={() => { readerStart = null; navigateTo("dashboard") }} />
    {/if}

    <!-- ===== LIBRARY ===== -->
    {#if page === "library"}
      <header class="page-header">
        <h1>Library</h1>
        <p class="page-sub">{mangas.length} manga in your collection</p>
      </header>

      <div class="section-metrics">
        <article class="metric-card">
          <span class="metric-label">Tracked Titles</span>
          <strong class="metric-value">{mangas.length}</strong>
          <span class="metric-note">{filteredMangas.length} matching current filter</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Read State</span>
          <strong class="metric-value">{readMangaCount}</strong>
          <span class="metric-note">{unreadMangaCount} unread</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Mirrors</span>
          <strong class="metric-value">{trackedMirrorCount}</strong>
          <span class="metric-note">{newReleaseCount} titles with new chapters</span>
        </article>
      </div>

      <div class="panel">
        <div class="panel-lead">
          <div>
            <p class="panel-kicker">Collection</p>
            <h3>Filter tracked series and jump to the next useful action</h3>
          </div>
          <div class="actions-inline">
            <button on:click={() => navigateTo("search")}>Add titles</button>
            <button class="primary" on:click={() => navigateTo("updates")}>Review updates</button>
          </div>
        </div>
        <div class="row">
          <input class="grow" type="text" placeholder="Filter mangas by name, mirror, chapter..." bind:value={mangaFilter} />
        </div>
        <p class="muted">Showing {filteredMangas.length} of {mangas.length}</p>
        <div class="list">
          {#if filteredMangas.length === 0}
            <p class="muted">No manga records yet. Use <button class="btn-link" on:click={() => navigateTo("search")}>Search</button> to find and add manga.</p>
          {:else}
            {#each filteredMangas as manga}
              {@const release = releaseMap.get(manga.key)}
              <article class="item" class:item-has-new={release?.hasNew}>
                <div class="item-main">
                  <p class="item-title">
                    {displayMangaName(manga)}
                    {#if release?.hasNew}<span class="badge-new">NEW</span>{/if}
                  </p>
                  <div class="meta-strip">
                    <span class="meta-chip-inline">Mirror {manga.mirror ?? "-"}</span>
                    <span class="meta-chip-inline">Lang {manga.language ?? "-"}</span>
                    <span class="meta-chip-inline">{manga.read === 1 ? "Read" : "Unread"}</span>
                  </div>
                  <p class="muted">Current chapter: {manga.currentChapter || "-"}</p>
                  {#if release?.hasNew && release.latestChapterName}
                    <p class="new-chapter-info">⬆ New: {release.latestChapterName}</p>
                  {/if}
                  <p class="muted">Updated: {formatTimestamp(manga.updatedAt)}</p>
                </div>
                <div class="actions">
                  <button on:click={() => openUrl(manga.url)}>Open</button>
                  {#if release?.hasNew && release.latestChapterUrl}
                    <button class="primary" on:click={() => openReaderHere(release.latestChapterUrl, manga.mirror)} disabled={!manga.mirror}>Read New</button>
                  {:else}
                    <button on:click={() => openReaderHere(manga.lastchapter || manga.url, manga.mirror)} disabled={!manga.mirror}>Last Chapter</button>
                  {/if}
                  <button on:click={() => setMangaReadState(manga, 1)}>Read</button>
                  <button on:click={() => setMangaReadState(manga, 0)}>Unread</button>
                  <button class="danger" on:click={() => deleteManga(manga)}>Delete</button>
                </div>
              </article>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- ===== BOOKMARKS ===== -->
    {#if page === "bookmarks"}
      <header class="page-header">
        <h1>Bookmarks</h1>
        <p class="page-sub">{bookmarks.length} chapter and scan markers</p>
      </header>

      <div class="section-metrics">
        <article class="metric-card">
          <span class="metric-label">All Bookmarks</span>
          <strong class="metric-value">{bookmarks.length}</strong>
          <span class="metric-note">{filteredBookmarks.length} matching current filter</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Chapter Marks</span>
          <strong class="metric-value">{chapterBookmarkCount}</strong>
          <span class="metric-note">Primary reading resume points</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Scan Marks</span>
          <strong class="metric-value">{scanBookmarkCount}</strong>
          <span class="metric-note">Image-specific saved points</span>
        </article>
      </div>

      <div class="panel">
        <div class="row">
          <input class="grow" type="text" placeholder="Search bookmarks..." bind:value={bookmarkTextFilter} />
          <label class="inline-label">
            Type
            <select bind:value={bookmarkTypeFilter}>
              <option value="all">All</option>
              <option value="chapter">Chapter</option>
              <option value="scan">Scan</option>
            </select>
          </label>
          <label class="inline-label">
            Mirror
            <select bind:value={bookmarkMirrorFilter}>
              <option value="all">All</option>
              {#each bookmarkMirrors as mirror}
                <option value={mirror}>{mirror}</option>
              {/each}
            </select>
          </label>
        </div>
        <p class="muted">Showing {filteredBookmarks.length} of {bookmarks.length}</p>
        <div class="list">
          {#if filteredBookmarks.length === 0}
            <p class="muted">No bookmarks found.</p>
          {:else}
            {#each filteredBookmarks as bookmark}
              <article class="item">
                <div class="item-main">
                  <p class="item-title">{bookmark.name || bookmark.chapName || bookmark.chapUrl}</p>
                  <div class="meta-strip">
                    <span class="meta-chip-inline">{bookmark.type}</span>
                    <span class="meta-chip-inline">{bookmark.mirror}</span>
                    <span class="meta-chip-inline">Updated {formatTimestamp(bookmark.updatedAt)}</span>
                  </div>
                  <p class="muted">Chapter: {bookmark.chapName || "-"}</p>
                  {#if bookmark.type === "scan"}
                    <p class="muted">Scan URL: {bookmark.scanUrl || "-"}</p>
                  {/if}
                  <label class="note-label">
                    Note
                    <textarea rows="2" bind:value={bookmarkNoteDrafts[bookmark.key]}></textarea>
                  </label>
                </div>
                <div class="actions">
                  <button on:click={() => openUrl(bookmark.chapUrl)}>Open Chapter</button>
                  {#if bookmark.scanUrl}
                    <button on:click={() => openUrl(bookmark.scanUrl)}>Open Scan</button>
                  {/if}
                  <button on:click={() => saveBookmarkNote(bookmark)}>Save Note</button>
                  <button class="danger" on:click={() => deleteBookmark(bookmark)}>Delete</button>
                </div>
              </article>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- ===== UPDATES ===== -->
    {#if page === "updates"}
      <header class="page-header">
        <h1>Updates</h1>
        <p class="page-sub">Track new chapters for your library manga</p>
      </header>

      <div class="section-metrics">
        <article class="metric-card">
          <span class="metric-label">Release Watch</span>
          <strong class="metric-value">{releaseResults.length}</strong>
          <span class="metric-note">Titles checked in current dataset</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">New Chapters</span>
          <strong class="metric-value">{newReleaseCount}</strong>
          <span class="metric-note">Immediate reading queue</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Last Sweep</span>
          <strong class="metric-value metric-value-small">{releaseLastCheckAt > 0 ? formatTimestamp(releaseLastCheckAt) : "Never"}</strong>
          <span class="metric-note">{releaseCheckRunning ? "Check in progress" : "Manual check available"}</span>
        </article>
      </div>

      <div class="panel">
        <div class="row">
          <button class="primary" on:click={checkForUpdates} disabled={releaseCheckRunning}>
            {releaseCheckRunning ? "⏳ Checking..." : "🔄 Check for Updates"}
          </button>
          {#if releaseLastCheckAt > 0}
            <span class="muted">Last check: {formatTimestamp(releaseLastCheckAt)}</span>
          {/if}
          {#if releaseCheckError}
            <span class="error">{releaseCheckError}</span>
          {/if}
        </div>

        {#if newReleaseCount > 0}
          <p><span class="badge-new">{newReleaseCount} new chapter{newReleaseCount > 1 ? "s" : ""}</span> available</p>
        {:else if releaseLastCheckAt > 0}
          <p class="muted">Everything is up to date.</p>
        {:else}
          <p class="muted">No release check has been run yet.</p>
        {/if}

        {#if releaseResults.length > 0}
          <div class="list">
            {#each releaseResults.filter((r) => r.hasNew) as release}
              <article class="item item-has-new">
                <div class="item-main">
                  <p class="item-title">{release.name} <span class="badge-new">NEW</span></p>
                  {#if release.latestChapterName}
                    <p class="new-chapter-info">⬆ {release.latestChapterName}</p>
                  {/if}
                  <p class="muted">Mirror: {release.mirror}</p>
                </div>
                <div class="actions">
                  {#if release.latestChapterUrl}
                    <button class="primary" on:click={() => openReaderHere(release.latestChapterUrl, release.mirror)} disabled={!release.mirror}>Read New Chapter</button>
                  {/if}
                  <button on:click={() => openUrl(release.url)}>Open Manga</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ===== SHARING ===== -->
    {#if page === "sharing"}
      <header class="page-header">
        <h1>Sharing</h1>
        <p class="page-sub">Export and import manga lists</p>
      </header>

      <div class="panel">
        <h3>Export Library</h3>
        <div class="row">
          <button class="primary" on:click={exportLibrary}>Export Library</button>
          {#if shareExportJson}
            <button on:click={() => copyToClipboard(shareExportJson, "Library JSON copied")}>📋 Copy</button>
            <button on:click={() => { shareExportJson = ""; shareStatus = "" }}>Clear</button>
          {/if}
        </div>
        {#if shareExportJson}
          <textarea class="snapshot-area" readonly rows="8">{shareExportJson}</textarea>
        {/if}
      </div>

      <div class="panel">
        <h3>Import Shared List</h3>
        <textarea class="snapshot-area" rows="6" placeholder="Paste shared JSON here..." bind:value={shareImportJson}></textarea>
        <div class="row">
          <button class="primary" on:click={importSharedList} disabled={!shareImportJson.trim()}>Import</button>
        </div>
      </div>

      {#if shareStatus}
        <div class="panel">
          <p class="muted">{shareStatus}</p>
        </div>
      {/if}
    {/if}

    <!-- ===== IMPORT/EXPORT ===== -->
    {#if page === "importexport"}
      <header class="page-header">
        <h1>Import / Export</h1>
        <p class="page-sub">Full snapshot transfer for extension data</p>
      </header>

      <div class="panel">
        <p class="muted">Snapshot includes options, kv store, chapter cache, manga records, and bookmarks.</p>
        <div class="row">
          <button on:click={exportSnapshot}>Export Snapshot</button>
          <button on:click={downloadSnapshot}>Download JSON</button>
          <button class="primary" on:click={importSnapshotFromJson}>Import JSON</button>
        </div>
        <p>{importStatus}</p>
        <textarea rows="18" bind:value={snapshotJson} placeholder="Snapshot JSON appears here"></textarea>
      </div>
    {/if}

    <!-- ===== SETTINGS ===== -->
    {#if page === "settings"}
      <header class="page-header">
        <h1>Settings</h1>
        <p class="page-sub">Rewrite shell preferences and cutover controls</p>
      </header>

      <div class="settings-grid">
        <div class="panel tone-panel">
          <p class="panel-kicker">Reader routing</p>
          <h3>Dashboard reader</h3>
          <label class="setting-row">
            <input type="checkbox" bind:checked={enableDashboardReader} />
            <span>Enable in-dashboard reader</span>
          </label>
          <p class="muted">
            Disable this to always open chapters on source sites and hide the dashboard Reader tab.
          </p>
        </div>

        <div class="panel tone-panel">
          <p class="panel-kicker">Permissions</p>
          <h3>Runtime access</h3>
          <p class="muted">Host access: {hasHostPermissions ? "Granted" : "Missing"}</p>
          <p class="muted">Notifications: {hasNotificationsPermission ? "Granted" : "Missing"}</p>
          <div class="row">
            <button on:click={refreshPermissions}>Refresh</button>
            <button on:click={requestHostPermissions}>Request hosts</button>
            <button on:click={requestNotificationsPermission}>Request notifications</button>
          </div>
        </div>

        <div class="panel tone-panel">
          <p class="panel-kicker">Diagnostics</p>
          <h3>Advanced runtime tools</h3>
          <label class="setting-row">
            <input type="checkbox" checked={diagnosticsMode} on:change={toggleDiagnosticsMode} />
            <span>Show diagnostics pages in navigation</span>
          </label>
          <p class="muted">
            Keep destructive and low-level runtime tools out of normal navigation until you explicitly need them.
          </p>
          <div class="row">
            <button on:click={() => void openDiagnosticsPage("permissions")}>Open permissions page</button>
            <button on:click={() => void openDiagnosticsPage("lab")}>Open lab page</button>
          </div>
        </div>

        <div class="panel tone-panel">
          <p class="panel-kicker">Release handling</p>
          <h3>Operator checks</h3>
          <p class="muted">Runtime: {connected ? "Connected" : "Offline"}</p>
          <p class="muted">Readiness: {releaseReady ? "Ready" : "Blocked"}</p>
          <p class="muted">Mirror inventory: {mirrorSummary}</p>
          <div class="row">
            <button on:click={refreshAll}>Refresh runtime</button>
            <button on:click={checkForUpdates} disabled={releaseCheckRunning}>
              {releaseCheckRunning ? "Checking..." : "Check updates"}
            </button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="row">
          <button class="primary" on:click={saveSettings}>Save settings</button>
        </div>
        {#if settingsStatus}
          <p class="muted">{settingsStatus}</p>
        {/if}
      </div>
    {/if}

    <!-- ===== LAB ===== -->
    {#if page === "lab"}
      <header class="page-header">
        <h1>Lab</h1>
        <p class="page-sub">Diagnostics and destructive reset controls</p>
      </header>

      <div class="panel">
        <h3>Data Summary</h3>
        <p>{labSummary}</p>
        <div class="row">
          <button on:click={refreshLabSummary}>Refresh Summary</button>
          <button class="danger" on:click={resetLegacyData}>Reset All Local Data</button>
        </div>
        <p class="muted">Reset removes: mangas, bookmarks, chapter cache, legacy kv store, and rewrite legacy options.</p>
      </div>
    {/if}

    <!-- ===== PERMISSIONS ===== -->
    {#if page === "permissions"}
      <header class="page-header">
        <h1>Permissions</h1>
        <p class="page-sub">Host and API permission checks</p>
      </header>

      <div class="panel">
        <p>Host (http/https *): {hasHostPermissions ? "✅ Granted" : "❌ Missing"}</p>
        <p>Notifications: {hasNotificationsPermission ? "✅ Granted" : "❌ Missing"}</p>
        <div class="row">
          <button on:click={refreshPermissions}>Refresh</button>
          <button class="primary" on:click={requestHostPermissions}>Request Host Permissions</button>
          <button class="primary" on:click={requestNotificationsPermission}>Request Notifications</button>
        </div>
        {#if permissionStatus}
          <p class="muted">{permissionStatus}</p>
        {/if}
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(191, 219, 254, 0.2), transparent 26%),
      radial-gradient(circle at 90% 10%, rgba(245, 158, 11, 0.18), transparent 20%),
      linear-gradient(180deg, #f6efe4 0%, #ece4d6 46%, #dfd7cb 100%);
    color: #201b16;
    overflow: hidden;
  }

  :global(:root) {
    --amr-paper: rgba(255, 251, 244, 0.92);
    --amr-paper-strong: rgba(255, 254, 249, 0.96);
    --amr-ink: #201b16;
    --amr-muted: #665b4e;
    --amr-line: rgba(71, 58, 40, 0.14);
    --amr-accent: #224c77;
    --amr-accent-strong: #16324f;
    --amr-warm: #9a5a13;
    --amr-sidebar: #1a2634;
    --amr-sidebar-line: rgba(148, 163, 184, 0.16);
    --amr-shadow: 0 14px 38px rgba(76, 55, 24, 0.1);
  }

  /* ===== SHELL LAYOUT ===== */
  .shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* ===== SIDEBAR ===== */
  .sidebar {
    width: 220px;
    min-width: 220px;
    background:
      linear-gradient(180deg, rgba(26, 38, 52, 0.98), rgba(17, 24, 39, 0.98)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(245, 158, 11, 0.04));
    color: #e7edf6;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--amr-sidebar-line);
    box-shadow: 14px 0 32px rgba(15, 23, 42, 0.16);
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 18px 18px;
    border-bottom: 1px solid var(--amr-sidebar-line);
  }

  .brand-icon { font-size: 24px; }
  .brand-text {
    font-size: 21px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: none;
    color: #9cb0c7;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, color 0.15s, transform 0.15s;
    position: relative;
  }

  .nav-item:hover {
    background: rgba(90, 118, 149, 0.16);
    color: #f8fafc;
    transform: translateX(2px);
  }

  .nav-active {
    background: linear-gradient(135deg, #2f6297, #173552) !important;
    color: #fff !important;
    font-weight: 600;
    box-shadow: inset 0 0 0 1px rgba(191, 219, 254, 0.14);
  }

  .nav-icon { font-size: 16px; width: 22px; text-align: center; }
  .nav-label { flex: 1; }

  .nav-badge {
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    min-width: 18px;
    text-align: center;
  }

  .nav-divider {
    height: 1px;
    background: var(--amr-sidebar-line);
    margin: 8px 16px;
  }

  .sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    border-top: 1px solid #334155;
    font-size: 12px;
    color: #64748b;
  }

  .footer-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-btn {
    background: none;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    cursor: pointer;
    color: #94a3b8;
    line-height: 1;
  }
  .footer-btn:hover {
    background: #334155;
    color: #e2e8f0;
  }

  .footer-error-log {
    background: #1a1a2e;
    border: 1px solid #ef4444;
    border-radius: 4px;
    padding: 8px;
    font-size: 10px;
    color: #fca5a5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
    margin: 0;
  }

  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  .status-dot.status-ok { background: #22c55e; }

  .sidebar-status { font-weight: 500; }

  /* ===== MAIN CONTENT ===== */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 28px 32px 32px;
  }
  .content.content-reader {
    padding: 0;
    min-height: 100vh;
    background: #0b1220;
    overflow: hidden;
  }
  .content.content-reader .page-header {
    padding: 18px 28px 10px;
  }
  .content.content-reader .page-header h1 { color: #e2e8f0; }
  .content.content-reader .page-sub { color: #94a3b8; }

  .page-header {
    margin-bottom: 20px;
  }

  .page-header h1 {
    margin: 0 0 4px;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: 0.01em;
    color: #1d2b3d;
    font-family: Georgia, "Times New Roman", serif;
  }

  .page-sub {
    margin: 0;
    color: var(--amr-muted);
    font-size: 14px;
  }

  .hero-band {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
    gap: 16px;
    margin-bottom: 18px;
  }

  .hero-panel {
    border-radius: 22px;
    border: 1px solid var(--amr-line);
    padding: 22px 24px;
    box-shadow: var(--amr-shadow);
  }

  .hero-panel-main {
    background:
      linear-gradient(135deg, rgba(255, 248, 236, 0.94), rgba(245, 234, 214, 0.88)),
      linear-gradient(90deg, rgba(34, 76, 119, 0.08), rgba(154, 90, 19, 0.08));
  }

  .hero-panel-side {
    background:
      linear-gradient(180deg, rgba(24, 31, 43, 0.97), rgba(17, 24, 39, 0.97)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(245, 158, 11, 0.1));
    color: #e7edf6;
  }

  .hero-kicker,
  .panel-kicker {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--amr-warm);
  }

  .hero-panel-side .hero-kicker {
    color: #f5d48f;
  }

  .hero-panel h2 {
    margin: 0 0 10px;
    font-size: 28px;
    line-height: 1.05;
    font-family: Georgia, "Times New Roman", serif;
  }

  .hero-copy {
    margin: 0;
    max-width: 58ch;
    line-height: 1.6;
    color: var(--amr-muted);
    font-size: 14px;
  }

  .hero-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .hero-chip {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.16);
    font-size: 12px;
    font-weight: 700;
    color: #dbeafe;
  }

  .hero-chip.hero-chip-ok {
    background: rgba(34, 197, 94, 0.16);
    color: #dcfce7;
  }

  /* ===== STAT CARDS ===== */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }

  .stat-card {
    background: linear-gradient(180deg, var(--amr-paper-strong), rgba(247, 240, 228, 0.9));
    border: 1px solid var(--amr-line);
    border-radius: 18px;
    padding: 20px 16px;
    text-align: center;
    box-shadow: var(--amr-shadow);
  }

  .stat-value {
    font-size: 34px;
    font-weight: 800;
    color: var(--amr-accent);
    font-family: Georgia, "Times New Roman", serif;
  }

  .stat-label {
    font-size: 13px;
    color: var(--amr-muted);
    margin-top: 4px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* ===== CARD GRID ===== */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }

  .card {
    background: var(--amr-paper);
    border: 1px solid var(--amr-line);
    border-radius: 18px;
    padding: 18px;
    box-shadow: var(--amr-shadow);
  }

  .card h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: #1d2b3d;
    font-family: Georgia, "Times New Roman", serif;
  }

  .card-feature {
    display: grid;
    gap: 8px;
    align-content: start;
  }

  /* ===== PANEL ===== */
  .panel {
    background: var(--amr-paper);
    border: 1px solid var(--amr-line);
    border-radius: 18px;
    padding: 18px;
    margin-bottom: 16px;
    box-shadow: var(--amr-shadow);
  }

  .panel h3 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
    font-family: Georgia, "Times New Roman", serif;
  }

  .panel-lead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .tone-panel {
    background:
      linear-gradient(180deg, rgba(255, 252, 246, 0.96), rgba(243, 234, 221, 0.88));
  }

  .empty-panel {
    background:
      linear-gradient(180deg, rgba(255, 252, 246, 0.98), rgba(240, 232, 218, 0.92)),
      linear-gradient(135deg, rgba(34, 76, 119, 0.06), rgba(154, 90, 19, 0.08));
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .section-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
    margin: 0 0 16px;
  }

  .metric-card {
    display: grid;
    gap: 4px;
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid rgba(72, 56, 33, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 251, 245, 0.96), rgba(244, 235, 221, 0.92)),
      linear-gradient(135deg, rgba(34, 76, 119, 0.08), rgba(154, 90, 19, 0.08));
    box-shadow: var(--amr-shadow);
  }

  .metric-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 800;
    color: var(--amr-warm);
  }

  .metric-note {
    font-size: 12px;
    color: var(--amr-muted);
  }

  .metric-value-small {
    font-size: 20px;
    line-height: 1.2;
  }

  /* ===== LIST + ITEMS ===== */
  .list { display: grid; gap: 8px; margin-top: 10px; }

  .item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    background: rgba(255, 255, 255, 0.76);
    border: 1px solid rgba(78, 62, 41, 0.12);
    border-radius: 16px;
  }

  .item-main { padding: 12px; }

  .item-title { margin: 0 0 4px; font-weight: 700; font-size: 14px; }

  .meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 2px 0 8px;
  }

  .meta-chip-inline {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(34, 76, 119, 0.08);
    color: var(--amr-accent);
    border: 1px solid rgba(34, 76, 119, 0.12);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .item-has-new { border-left: 3px solid #ef4444; }

  .new-chapter-info {
    color: #16a34a;
    font-weight: 600;
    font-size: 13px;
    margin: 2px 0;
  }

  /* ===== ROW / ACTIONS ===== */
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .setting-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .setting-row input {
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: flex-start;
    padding: 12px;
  }

  .actions-inline {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .grow { flex: 1; min-width: 200px; }

  /* ===== TYPOGRAPHY ===== */
  .muted { color: var(--amr-muted); margin: 2px 0; font-size: 13px; }
  .error { color: #b91c1c; font-weight: 600; }

  /* ===== FORM ELEMENTS ===== */
  button, input, select, textarea {
    border: 1px solid rgba(75, 60, 40, 0.16);
    border-radius: 14px;
    padding: 10px 13px;
    font: inherit;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.94);
  }

  button {
    cursor: pointer;
    border-color: rgba(34, 76, 119, 0.2);
    color: var(--amr-accent);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: background 0.12s, transform 0.12s, box-shadow 0.12s;
  }

  button:hover {
    background: #f4ead8;
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(87, 61, 22, 0.08);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  button.primary {
    background: linear-gradient(135deg, var(--amr-accent), var(--amr-accent-strong));
    color: #fff;
    border-color: rgba(22, 50, 79, 0.35);
  }

  button.primary:hover { background: linear-gradient(135deg, var(--amr-accent), var(--amr-accent-strong)); }

  button.danger { border-color: #b91c1c; color: #b91c1c; }
  button.danger:hover { background: #fef2f2; }

  .btn-sm {
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 6px;
  }

  .btn-sm.primary-action {
    background: linear-gradient(135deg, var(--amr-accent), var(--amr-accent-strong));
    color: #fff;
    border-color: rgba(22, 50, 79, 0.34);
  }

  /* Search result cards */
  .search-command-panel {
    background:
      linear-gradient(180deg, rgba(255, 252, 246, 0.98), rgba(243, 235, 222, 0.92)),
      linear-gradient(135deg, rgba(34, 76, 119, 0.08), rgba(154, 90, 19, 0.08));
  }

  .search-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
    padding-top: 8px;
  }

  .search-card {
    background:
      linear-gradient(180deg, rgba(22, 33, 48, 0.98), rgba(16, 24, 37, 0.98)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(245, 158, 11, 0.08));
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 18px;
    overflow: hidden;
    transition: border-color 150ms, transform 150ms, box-shadow 150ms;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);
  }
  .search-card:hover {
    border-color: rgba(147, 197, 253, 0.34);
    transform: translateY(-2px);
  }

  .search-card-body {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 14px 8px;
    gap: 8px;
  }

  .search-card-title {
    margin: 0;
    font-weight: 700;
    font-size: 14px;
    line-height: 1.35;
    color: #e2e8f0;
  }

  .search-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .search-card-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .search-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #dbeafe;
    background: rgba(59, 130, 246, 0.16);
    border: 1px solid rgba(147, 197, 253, 0.22);
  }

  .search-pill.search-pill-subtle {
    color: #d1d5db;
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(148, 163, 184, 0.16);
  }

  .expand-chevron {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid #1e293b;
    border-radius: 6px;
    cursor: pointer;
    color: #94a3b8;
    font-size: 12px;
    transition: all 120ms;
    padding: 0;
  }
  .expand-chevron:hover { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .chevron-icon { display: inline-block; transition: transform 150ms; }
  .chevron-icon.expanded { transform: rotate(90deg); }

  /* Collapsed: small icon row */
  .mirror-icon-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 14px 12px;
  }

  .mirror-icon-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.06);
    border: 1px solid #1e293b;
    border-radius: 6px;
    cursor: pointer;
    padding: 0;
    transition: all 120ms;
  }
  .mirror-icon-btn:hover { border-color: #3b82f6; background: rgba(59,130,246,0.12); transform: scale(1.1); }

  .mirror-icon-img {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    object-fit: contain;
  }

  .mirror-icon-fallback {
    font-size: 12px;
    font-weight: 800;
    color: #93c5fd;
    text-transform: uppercase;
  }

  /* Expanded: full mirror list */
  .mirror-expanded-list {
    border-top: 1px solid #1e293b;
    padding: 6px 10px 8px;
  }

  .search-card-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .mirror-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 4px;
    border-radius: 6px;
    gap: 8px;
  }
  .mirror-row:hover { background: rgba(59,130,246,0.06); }

  .mirror-row-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mirror-row-name {
    font-size: 13px;
    font-weight: 600;
    color: #93c5fd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mirror-row-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-xs {
    padding: 2px 6px;
    font-size: 11px;
    border-radius: 4px;
    border-color: #94a3b8;
    color: #64748b;
    font-weight: 500;
  }

  .btn-link {
    border: none;
    background: none;
    color: #2563eb;
    padding: 0;
    text-decoration: underline;
    font-weight: 600;
    cursor: pointer;
  }

  textarea {
    width: 100%;
    resize: vertical;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  }

  .snapshot-area { font-size: 12px; }

  /* ===== LABELS ===== */
  label { display: inline-flex; flex-direction: column; gap: 4px; font-size: 13px; }

  .inline-label { flex-direction: row; align-items: center; gap: 6px; }

  .note-label { display: block; margin-top: 8px; }
  .note-label textarea { margin-top: 4px; }

  /* ===== BADGES ===== */
  .badge-new {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: #ef4444;
    color: #fff;
    margin-left: 6px;
    vertical-align: middle;
  }

  /* ===== MIRROR CHIPS / FILTERS ===== */
  .mirror-filter-details { margin: 8px 0; }
  .mirror-filter-details summary { cursor: pointer; user-select: none; }

  .mirror-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid rgba(72, 56, 33, 0.16);
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.86);
    flex-direction: row;
  }

  .chip-active {
    background: rgba(219, 234, 254, 0.88);
    border-color: var(--amr-accent);
    color: var(--amr-accent);
  }
  .chip input[type="checkbox"] { display: none; }
  .chip-icon { width: 16px; height: 16px; border-radius: 3px; object-fit: contain; flex-shrink: 0; }

  /* ===== ERROR SUMMARY ===== */
  .error-summary {
    margin-top: 8px;
    border: 1px solid #fde68a;
    border-radius: 8px;
    background: #fffbeb;
    overflow: hidden;
  }

  .error-summary-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    flex-wrap: wrap;
    border-bottom: 1px solid #fde68a;
    background: #fef3c7;
  }

  .error-summary-title {
    font-weight: 700;
    font-size: 13px;
    color: #92400e;
  }

  .error-summary-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
  }

  .err-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid;
  }

  .err-offline { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
  .err-blocked { background: #fef2f2; border-color: #f87171; color: #7f1d1d; }
  .err-changed { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
  .err-timeout { background: #fefce8; border-color: #fde047; color: #854d0e; }
  .err-other { background: #f4f4f5; border-color: #d4d4d8; color: #52525b; }

  .error-mirror-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .error-mirror-row {
    display: grid;
    grid-template-columns: auto 120px 1fr auto;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid #fef3c7;
    align-items: center;
    font-size: 12px;
  }

  .error-mirror-row:last-child { border-bottom: none; }

  .error-mirror-badge { font-size: 11px; white-space: nowrap; }

  .error-mirror-name { font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .error-mirror-msg {
    color: #78716c;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error-mirror-actions {
    display: flex;
    gap: 4px;
  }

  .error-mirror-detail {
    grid-column: 1 / -1;
    padding: 6px 8px;
    background: #fefce8;
    border-radius: 6px;
    margin-top: 2px;
  }

  .error-suggestion {
    font-size: 12px;
    color: #92400e;
    margin: 0 0 4px 0;
    font-style: italic;
  }

  .error-detail {
    background: #1e293b;
    color: #e2e8f0;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 11px;
    margin-top: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 120px;
    overflow-y: auto;
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 920px) {
    .sidebar { width: 56px; min-width: 56px; }
    .brand-text, .nav-label, .sidebar-status { display: none; }
    .nav-item { justify-content: center; padding: 12px 0; }
    .nav-icon { width: auto; }
    .sidebar-brand { justify-content: center; padding: 16px 8px; }
    .sidebar-footer { justify-content: center; }
    .content { padding: 16px; }
    .hero-band,
    .settings-grid { grid-template-columns: 1fr; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .item { grid-template-columns: 1fr; }
    .actions { padding-top: 0; }
  }

  @media (max-width: 600px) {
    .stat-grid { grid-template-columns: 1fr; }
    .content { padding: 12px; }
    .error-mirror-row { grid-template-columns: 1fr; }
    .error-mirror-msg { white-space: normal; }
  }
</style>
