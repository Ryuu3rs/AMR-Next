<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import ReaderApp from "../reader/App.svelte"
  import { extensionApi } from "../../core/extension/browser-api"
  import type { MirrorCapability } from "../../core/mirrors/catalog"

  type ReaderImageState = {
    pageUrl: string
    imageUrl: string | null
    status: "pending" | "loaded" | "error"
    error?: string
  }

  type ReaderChapter = {
    title: string
    url: string
  }

  type ReaderTheme = "dark" | "light"

  type LegacyOptions = {
    darkreader: number
    prefetch: number
    imgorder: number
    displayFullChapter: number
    readingDirection: number
    displayBook: number
    resizeMode: number
    maxwidth: number
    addauto: number
  }

  type LegacyMangaInfo = {
    key: string
    read: number
    display: number
    layout: number
    lastchapter: string
    currentChapter: string
    currentScanUrl: string
    webtoon: boolean
    displayName: string
    zoom: number
  }

  type ChapterDataPayload = {
    isChapter?: boolean
    infos?: Record<string, unknown>
    images?: string[] | null
    title?: string
  }

  export let mirrors: MirrorCapability[] = []
  export let startRequest: { url: string; mirror: string } | null = null

  const dispatch = createEventDispatcher<{ close: void }>()

  const defaultLegacyOptions: LegacyOptions = {
    darkreader: 0,
    prefetch: 1,
    imgorder: 0,
    displayFullChapter: 1,
    readingDirection: 0,
    displayBook: 0,
    resizeMode: 0,
    maxwidth: 100,
    addauto: 1
  }

  let urlInput = ""
  let mirrorInput = ""

  let chapterTitle = "No chapter loaded"
  let readerStatus = "Idle"
  let loading = false
  let progress = 0
  let loadedPages = 0
  let totalPages = 0
  let images: ReaderImageState[] = []

  let chapters: ReaderChapter[] = []
  let selectedChapterUrl: string | null = null
  let fullChapter = true
  let currentPageIndex = 0
  let imageWidth = 100
  let theme: ReaderTheme = "dark"
  let chapterBookmarked = false

  let currentMirrorName = ""
  let currentMangaUrl = ""
  let currentChapterUrl = ""
  let currentMangaName = ""
  let currentLanguage = "en"
  let fallbackPreviousChapterUrl = ""
  let fallbackNextChapterUrl = ""
  let bootToken = 0
  let isNavigatingChapter = false

  $: mirrorOptions = mirrors.slice().sort((a, b) => a.name.localeCompare(b.name))

  $: if (startRequest) {
    mirrorInput = startRequest.mirror
    urlInput = startRequest.url
    void bootReader(startRequest.mirror, startRequest.url)
  }

  $: canGoPreviousChapter = (() => {
    const index = getSelectedChapterIndex()
    return index >= 0 && index < chapters.length - 1
  })()

  $: canGoNextChapter = (() => {
    const index = getSelectedChapterIndex()
    return index > 0
  })()

  async function sendLegacyMessage<T>(payload: Record<string, unknown>): Promise<T> {
    return (await extensionApi.runtime.sendMessage(payload)) as T
  }

  function normalizeUrl(value: unknown, baseUrl: string): string {
    if (typeof value !== "string" || !value.trim()) {
      return ""
    }

    try {
      return new URL(value, baseUrl).toString()
    } catch {
      return value
    }
  }

  function deriveSeriesUrlFromChapterUrl(url: string): string {
    try {
      const parsed = new URL(url)
      const parts = parsed.pathname.split("/").filter(Boolean)
      const mangaIndex = parts.findIndex((part) => part.toLowerCase() === "manga")
      if (mangaIndex >= 0 && parts.length > mangaIndex + 1) {
        return `${parsed.origin}/manga/${parts[mangaIndex + 1]}/`
      }
    } catch {
      // no-op
    }
    return ""
  }

  function chapterPath(value: string, baseUrl: string): string {
    try {
      const parsed = new URL(value, baseUrl)
      let path = parsed.pathname.replace(/\/+$/, "")
      // Normalize common "page 1" URL variants to chapter-level identity.
      path = path.replace(/\/1(?:\.html?)?$/i, "")
      if (!path) {
        path = "/"
      }
      return `${parsed.origin}${path}`.toLowerCase()
    } catch {
      return value
        .split(/[?#]/, 1)[0]
        .replace(/\/+$/, "")
        .replace(/\/1(?:\.html?)?$/i, "")
        .toLowerCase()
    }
  }

  function chapterUrlsMatch(left: string, right: string, baseUrl: string): boolean {
    return chapterPath(left, baseUrl) === chapterPath(right, baseUrl)
  }

  function isProbablyImageUrl(url: string): boolean {
    return /\.(png|jpg|jpeg|webp|gif|avif)(\?|#|$)/i.test(url) || url.startsWith("data:image/") || url.startsWith("blob:")
  }

  function normalizeResolvedImageUrl(url: string): string {
    return url.startsWith("//") ? `https:${url}` : url
  }

  function getStringValue(obj: Record<string, unknown> | undefined, key: string): string {
    if (!obj) {
      return ""
    }
    const value = obj[key]
    return typeof value === "string" ? value : ""
  }

  function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min
    }
    return Math.max(min, Math.min(max, value))
  }

  function normalizeChapterList(raw: unknown, preferredLanguage = "en"): ReaderChapter[] {
    const toChapter = (entry: unknown): ReaderChapter | null => {
      if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string" && typeof entry[1] === "string") {
        return { title: entry[0], url: entry[1] }
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>
        if (typeof record.url === "string") {
          return {
            title: typeof record.title === "string" ? record.title : record.url,
            url: record.url
          }
        }
      }

      return null
    }

    if (Array.isArray(raw)) {
      return raw.map(toChapter).filter((item): item is ReaderChapter => item !== null)
    }

    if (raw && typeof raw === "object") {
      const byLang = raw as Record<string, unknown>
      const preferred = byLang[preferredLanguage]
      if (Array.isArray(preferred) && preferred.length > 0) {
        return preferred.map(toChapter).filter((item): item is ReaderChapter => item !== null)
      }

      for (const key of Object.keys(byLang)) {
        const candidate = byLang[key]
        if (Array.isArray(candidate) && candidate.length > 0) {
          return candidate.map(toChapter).filter((item): item is ReaderChapter => item !== null)
        }
      }
    }

    return []
  }

  function getSelectedChapterIndex(): number {
    if (chapters.length === 0) {
      return -1
    }
    const candidates = [selectedChapterUrl, currentChapterUrl, urlInput].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    for (const candidate of candidates) {
      const index = chapters.findIndex((chapter) => chapterUrlsMatch(chapter.url, candidate, candidate))
      if (index !== -1) {
        return index
      }
    }
    return -1
  }

  async function persistReaderOption(key: string, value: unknown): Promise<void> {
    try {
      await sendLegacyMessage<Record<string, unknown>>({
        action: "save_option",
        key,
        value
      })
    } catch {
      // ignore preference persistence failures
    }
  }

  async function loadReaderOptions(): Promise<void> {
    try {
      const options = await sendLegacyMessage<Partial<LegacyOptions>>({ action: "getoptions" })
      const merged = { ...defaultLegacyOptions, ...options }
      fullChapter = merged.displayFullChapter === 1
      imageWidth = clamp(Number(merged.maxwidth), 35, 100)
      theme = merged.darkreader === 1 ? "dark" : "light"
    } catch {
      fullChapter = true
      imageWidth = 100
      theme = "dark"
    }
  }

  async function refreshBookmarkState(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl || !currentChapterUrl) {
      chapterBookmarked = false
      return
    }

    try {
      const response = await sendLegacyMessage<{
        chapter?: { isBooked?: boolean; note?: string }
      }>({
        action: "getBookmarksForChapter",
        mirror: currentMirrorName,
        url: currentMangaUrl,
        chapUrl: currentChapterUrl,
        scanUrls: []
      })

      chapterBookmarked = Boolean(response?.chapter?.isBooked)
    } catch {
      chapterBookmarked = false
    }
  }

  async function toggleBookmark(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl || !currentChapterUrl) {
      return
    }

    if (chapterBookmarked) {
      await sendLegacyMessage({
        action: "deleteBookmark",
        mirror: currentMirrorName,
        url: currentMangaUrl,
        chapUrl: currentChapterUrl,
        type: "chapter"
      })
    } else {
      await sendLegacyMessage({
        action: "addUpdateBookmark",
        mirror: currentMirrorName,
        url: currentMangaUrl,
        chapUrl: currentChapterUrl,
        type: "chapter",
        name: currentMangaName,
        chapName: chapterTitle,
        note: ""
      })
    }

    await refreshBookmarkState()
  }

  async function ensureMangaTracked(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl) {
      return
    }

    try {
      const exists = await sendLegacyMessage<boolean>({
        action: "mangaExists",
        url: currentMangaUrl,
        mirror: currentMirrorName,
        language: currentLanguage
      })

      if (!exists) {
        await sendLegacyMessage({
          action: "readManga",
          url: currentMangaUrl,
          mirror: currentMirrorName,
          language: currentLanguage,
          name: currentMangaName || currentMangaUrl
        })
      }
    } catch {
      // ignore tracking failures
    }
  }

  async function getChapterData(url: string, mirrorName: string): Promise<ChapterDataPayload> {
    const result = await sendLegacyMessage<ChapterDataPayload | null>({
      action: "getChapterData",
      url,
      mirrorName
    })
    return result ?? {}
  }

  function openRuntimePort(name: string): chrome.runtime.Port | null {
    try {
      if (extensionApi.runtime?.connect) {
        return extensionApi.runtime.connect({ name }) as chrome.runtime.Port
      }
      if (typeof chrome !== "undefined" && chrome.runtime?.connect) {
        return chrome.runtime.connect({ name })
      }
    } catch {
      return null
    }
    return null
  }

  async function getImageUrlFromPort(pageUrl: string, mirrorName: string): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const port = openRuntimePort(`imageRequest_${requestId}`)
      if (!port) {
        resolve(null)
        return
      }

      let settled = false

      const finish = (value: string | null): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutId)
        try {
          port.disconnect()
        } catch {
          // noop
        }
        resolve(value)
      }

      const timeoutId = setTimeout(() => {
        finish(null)
      }, 30000)

      port.onMessage.addListener((msg: any) => {
        if (!msg || msg.type !== "imageResponse" || msg.requestId !== requestId) {
          return
        }

        if (typeof msg.result === "string" && msg.result.length > 0 && msg.result !== "error") {
          finish(msg.result)
        } else {
          finish(null)
        }
      })

      port.onDisconnect.addListener(() => {
        if (chrome.runtime?.lastError) {
          finish(null)
        }
      })

      try {
        port.postMessage({
          type: "getImageUrlFromPageUrl",
          requestId,
          url: pageUrl,
          mirror: mirrorName,
          language: currentLanguage
        })
      } catch {
        finish(null)
      }
    })
  }

  async function getImageUrlFromMessage(pageUrl: string, mirrorName: string): Promise<string | null> {
    try {
      const value = await sendLegacyMessage<string | null>({
        action: "getImageUrlFromPageUrl",
        url: pageUrl,
        mirror: mirrorName,
        language: currentLanguage
      })
      if (typeof value !== "string" || !value || value === "error") {
        return null
      }
      return value
    } catch {
      return null
    }
  }

  async function resolveImageUrl(pageUrl: string, mirrorName: string): Promise<string | null> {
    const viaPort = await getImageUrlFromPort(pageUrl, mirrorName)
    if (viaPort) {
      return normalizeResolvedImageUrl(viaPort)
    }

    const viaMessage = await getImageUrlFromMessage(pageUrl, mirrorName)
    if (viaMessage) {
      return normalizeResolvedImageUrl(viaMessage)
    }

    if (isProbablyImageUrl(pageUrl)) {
      return normalizeResolvedImageUrl(pageUrl)
    }

    return null
  }

  async function runWithConcurrency(total: number, limit: number, worker: (index: number) => Promise<void>): Promise<void> {
    let next = 0
    const run = async (): Promise<void> => {
      while (true) {
        const index = next++
        if (index >= total) {
          return
        }
        await worker(index)
      }
    }
    const threads = Math.max(1, Math.min(limit, total))
    await Promise.all(Array.from({ length: threads }, async () => run()))
  }

  async function loadChapterList(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl) {
      chapters = []
      selectedChapterUrl = null
      return
    }

    let raw = await sendLegacyMessage<unknown>({
      action: "getListChaps",
      url: currentMangaUrl,
      mirror: currentMirrorName,
      language: currentLanguage
    })

    let normalized = normalizeChapterList(raw, currentLanguage)
    if (normalized.length === 0) {
      raw = await sendLegacyMessage<unknown>({
        action: "loadListChaps",
        mirror: currentMirrorName,
        url: currentMangaUrl,
        language: currentLanguage
      })
      normalized = normalizeChapterList(raw, currentLanguage)

      if (normalized.length > 0 && Array.isArray(raw)) {
        await sendLegacyMessage({
          action: "storeListChaps",
          url: currentMangaUrl,
          mirror: currentMirrorName,
          language: currentLanguage,
          listChaps: raw
        })
      }
    }

    chapters = normalized

    if (chapters.length === 0 && currentChapterUrl) {
      const fallbackList: ReaderChapter[] = []
      if (fallbackNextChapterUrl) {
        fallbackList.push({ title: "Next Chapter", url: fallbackNextChapterUrl })
      }
      fallbackList.push({ title: chapterTitle || "Current Chapter", url: currentChapterUrl })
      if (fallbackPreviousChapterUrl) {
        fallbackList.push({ title: "Previous Chapter", url: fallbackPreviousChapterUrl })
      }
      chapters = fallbackList
    }

    if (!currentChapterUrl && chapters.length > 0) {
      currentChapterUrl = chapters[0].url
    }

    const reference = currentChapterUrl || urlInput
    const matched = chapters.find((chapter) => chapterUrlsMatch(chapter.url, reference, reference))
    selectedChapterUrl = matched ? matched.url : chapters[0]?.url ?? null
    if (selectedChapterUrl) {
      currentChapterUrl = selectedChapterUrl
    }
  }

  async function saveReadingProgress(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl || !currentChapterUrl) {
      return
    }

    await sendLegacyMessage({
      action: "readManga",
      url: currentMangaUrl,
      mirror: currentMirrorName,
      language: currentLanguage,
      lastChapterReadName: chapterTitle,
      lastChapterReadURL: currentChapterUrl,
      name: currentMangaName
    })
  }

  async function loadMangaInfo(): Promise<void> {
    if (!currentMirrorName || !currentMangaUrl) {
      return
    }

    const info = await sendLegacyMessage<LegacyMangaInfo | null>({
      action: "mangaInfos",
      url: currentMangaUrl,
      mirror: currentMirrorName,
      language: currentLanguage
    })

    if (info && Number.isFinite(info.zoom)) {
      imageWidth = clamp(info.zoom, 35, 100)
    }
  }

  async function bootReader(mirrorName: string, targetUrl: string): Promise<void> {
    const token = ++bootToken
    currentMirrorName = mirrorName
    currentMangaUrl = ""
    currentChapterUrl = ""
    currentMangaName = ""
    currentLanguage = "en"
    fallbackPreviousChapterUrl = ""
    fallbackNextChapterUrl = ""

    readerStatus = "Loading chapter data..."
    loading = true
    progress = 0
    loadedPages = 0
    totalPages = 0
    images = []
    chapters = []
    selectedChapterUrl = null
    chapterBookmarked = false
    currentPageIndex = 0

    await loadReaderOptions()

    const chapter = await getChapterData(targetUrl, mirrorName)
    if (token !== bootToken) {
      return
    }

    const info = chapter.infos && typeof chapter.infos === "object" ? chapter.infos : undefined
    currentMangaUrl =
      normalizeUrl(getStringValue(info, "currentMangaURL"), targetUrl) ||
      deriveSeriesUrlFromChapterUrl(targetUrl) ||
      normalizeUrl(targetUrl, targetUrl)
    currentChapterUrl = normalizeUrl(getStringValue(info, "currentChapterURL"), targetUrl) || normalizeUrl(targetUrl, targetUrl)
    currentMangaName = getStringValue(info, "name") || chapter.title || currentMangaUrl
    currentLanguage = getStringValue(info, "language") || "en"
    chapterTitle = chapter.title || getStringValue(info, "currentChapter") || currentMangaName
    fallbackPreviousChapterUrl = normalizeUrl(getStringValue(info, "prechapterurl"), targetUrl)
    fallbackNextChapterUrl = normalizeUrl(getStringValue(info, "nextchapterurl"), targetUrl)

    await ensureMangaTracked()

    const pageUrls = Array.isArray(chapter.images) ? chapter.images.filter((value): value is string => typeof value === "string") : []

    await loadChapterList()
    if (token !== bootToken) {
      return
    }

    if (!chapter.isChapter || pageUrls.length === 0) {
      readerStatus = "Not a chapter page — choose a chapter from the list."
      loading = false
      images = []
      progress = 0
      loadedPages = 0
      totalPages = 0
      return
    }

    await loadMangaInfo()

    images = pageUrls.map((pageUrl) => ({
      pageUrl,
      imageUrl: null,
      status: "pending"
    }))

    totalPages = images.length
    loadedPages = 0
    progress = 0
    readerStatus = "Resolving page image URLs..."
    loading = true

    await runWithConcurrency(images.length, 4, async (index) => {
      const resolved = await resolveImageUrl(images[index].pageUrl, mirrorName)
      if (token !== bootToken) {
        return
      }

      const next = [...images]
      if (resolved) {
        next[index] = { ...next[index], imageUrl: resolved, status: "loaded" }
      } else {
        next[index] = { ...next[index], status: "error", error: "Failed to resolve direct image URL" }
      }
      images = next

      loadedPages += 1
      progress = Math.floor((loadedPages / images.length) * 100)
      readerStatus = `Resolved ${loadedPages}/${images.length} pages`
      loading = loadedPages < images.length
    })

    if (token !== bootToken) {
      return
    }

    loading = false
    readerStatus = "Chapter loaded"

    await saveReadingProgress()
    await refreshBookmarkState()
  }

  async function navigateToChapter(url: string): Promise<void> {
    if (!currentMirrorName || !url || isNavigatingChapter) {
      return
    }
    const base = selectedChapterUrl || currentChapterUrl || urlInput || url
    if (chapterUrlsMatch(base, url, base)) {
      return
    }

    isNavigatingChapter = true
    try {
      selectedChapterUrl = url
      currentChapterUrl = url
      urlInput = url
      await bootReader(currentMirrorName, url)
    } finally {
      isNavigatingChapter = false
    }
  }

  async function navigateRelativeChapter(delta: number): Promise<void> {
    const index = getSelectedChapterIndex()
    if (index < 0) {
      return
    }

    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= chapters.length) {
      return
    }

    await navigateToChapter(chapters[nextIndex].url)
  }

  async function startFromInput(): Promise<void> {
    const url = urlInput.trim()
    if (!url || !mirrorInput) {
      readerStatus = "Enter a URL and select a mirror to load."
      return
    }
    await bootReader(mirrorInput, url)
  }

  function clearReader(): void {
    readerStatus = "Idle"
    loading = false
    progress = 0
    loadedPages = 0
    totalPages = 0
    images = []
    chapters = []
    selectedChapterUrl = null
    chapterBookmarked = false
    currentMirrorName = ""
    currentMangaUrl = ""
    currentChapterUrl = ""
    currentMangaName = ""
    currentLanguage = "en"
    fallbackPreviousChapterUrl = ""
    fallbackNextChapterUrl = ""
    chapterTitle = "No chapter loaded"
  }

  function exitReader(): void {
    clearReader()
    dispatch("close")
  }
</script>

<section class="reader-page-shell">
  {#if !currentMirrorName || (!loading && images.length === 0)}
    <div class="panel reader-setup">
      <div class="reader-setup-head">
        <div>
          <p class="reader-kicker">Embedded Reader Control</p>
          <h2>Load a mirror chapter into the dashboard reader</h2>
        </div>
        <div class="reader-meta-strip">
          <span class="reader-meta-chip">{mirrorOptions.length} mirrors</span>
          <span class="reader-meta-chip">{theme} theme</span>
          <span class="reader-meta-chip">{fullChapter ? "full scroll" : "single page"}</span>
        </div>
      </div>
      <div class="row">
        <input
          class="grow"
          type="text"
          placeholder="Paste chapter or series URL..."
          bind:value={urlInput}
          on:keydown={(e) => e.key === "Enter" && startFromInput()}
        />
        <select bind:value={mirrorInput}>
          <option value="">Select mirror…</option>
          {#each mirrorOptions as mirror}
            <option value={mirror.name}>{mirror.label}</option>
          {/each}
        </select>
        <button class="primary" on:click={startFromInput} disabled={!urlInput.trim() || !mirrorInput || loading}>
          {loading ? "Loading..." : "Load"}
        </button>
        <button on:click={clearReader} disabled={loading}>Clear</button>
      </div>
      <p class="muted">Uses legacy mirror scrapers to fetch pages. If a mirror breaks, the mirror parser needs updating.</p>
      {#if readerStatus && !loading}
        <p class="muted">{readerStatus}</p>
      {/if}
    </div>
  {/if}

  <div class="reader-stage" class:reader-stage-full={Boolean(currentMirrorName)}>
    <div class="reader-stage-shell">
      <div class="reader-stage-bar">
        <div>
          <p class="reader-kicker">Reader Runtime</p>
          <h3>{chapterTitle}</h3>
        </div>
        <div class="reader-meta-strip">
          <span class="reader-meta-chip">{currentMirrorName || "No mirror"}</span>
          <span class="reader-meta-chip">{totalPages} pages</span>
          <span class="reader-meta-chip">{readerStatus}</span>
        </div>
      </div>
    </div>
    <ReaderApp
      mirrorName={currentMirrorName}
      chapterTitle={chapterTitle}
      status={readerStatus}
      loading={loading}
      progress={progress}
      loadedPages={loadedPages}
      totalPages={totalPages}
      images={images}
      chapters={chapters}
      selectedChapterUrl={selectedChapterUrl}
      canGoPreviousChapter={canGoPreviousChapter}
      canGoNextChapter={canGoNextChapter}
      fullChapter={fullChapter}
      currentPageIndex={currentPageIndex}
      imageWidth={imageWidth}
      theme={theme}
      chapterBookmarked={chapterBookmarked}
      embedded={true}
      on:reload={() => currentMirrorName && urlInput && void bootReader(currentMirrorName, urlInput)}
      on:restore={exitReader}
      on:goPreviousChapter={() => void navigateRelativeChapter(1)}
      on:goNextChapter={() => void navigateRelativeChapter(-1)}
      on:selectChapter={(event) => void navigateToChapter(event.detail)}
      on:toggleFullChapter={() => { fullChapter = !fullChapter; void persistReaderOption("displayFullChapter", fullChapter ? 1 : 0) }}
      on:goPreviousPage={() => { if (currentPageIndex > 0) currentPageIndex -= 1 }}
      on:goNextPage={() => { if (currentPageIndex < totalPages - 1) currentPageIndex += 1; else void navigateRelativeChapter(-1) }}
      on:setImageWidth={(event) => { imageWidth = clamp(event.detail, 35, 100); void persistReaderOption("maxwidth", imageWidth) }}
      on:toggleTheme={() => { theme = theme === "dark" ? "light" : "dark"; void persistReaderOption("darkreader", theme === "dark" ? 1 : 0) }}
      on:toggleChapterBookmark={() => { void toggleBookmark() }}
    />
  </div>
</section>

<style>
  .reader-page-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 0;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 20%),
      linear-gradient(180deg, #08111c 0%, #0b1220 100%);
  }

  .panel {
    background: rgba(255, 251, 244, 0.94);
    border: 1px solid rgba(75, 60, 40, 0.16);
    border-radius: 18px;
    padding: 18px;
    margin-bottom: 16px;
    box-shadow: 0 18px 34px rgba(2, 6, 23, 0.18);
  }
  .reader-setup {
    margin: 14px 16px 10px;
    background:
      linear-gradient(180deg, rgba(14, 20, 30, 0.96), rgba(11, 18, 32, 0.96)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(245, 158, 11, 0.08));
    border-color: rgba(148, 163, 184, 0.16);
  }

  .reader-setup-head,
  .reader-stage-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .reader-kicker {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #f5d48f;
  }

  .reader-setup h2,
  .reader-stage-bar h3 {
    margin: 0;
    color: #eef2ff;
    font-size: 24px;
    line-height: 1.1;
    font-family: Georgia, "Times New Roman", serif;
  }

  .reader-meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .reader-meta-chip {
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.16);
    color: #dbeafe;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .grow { flex: 1; min-width: 220px; }

  .muted { color: #a6b5c8; margin: 4px 0 0; font-size: 13px; }

  .reader-stage {
    flex: 1;
    min-height: 0;
    padding: 0 16px 16px;
  }

  .reader-stage.reader-stage-full {
    min-height: 100vh;
  }

  .reader-stage-shell {
    border-radius: 22px 22px 0 0;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-bottom: none;
    padding: 16px 18px 14px;
    background:
      linear-gradient(180deg, rgba(15, 23, 35, 0.98), rgba(13, 18, 28, 0.96)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(245, 158, 11, 0.08));
    box-shadow: 0 24px 40px rgba(2, 6, 23, 0.24);
  }

  .reader-stage :global(.reader-shell.embedded) {
    min-height: 100%;
    height: 100%;
    border-radius: 0 0 22px 22px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-top: none;
    box-shadow: 0 24px 40px rgba(2, 6, 23, 0.24);
  }

  button, input, select {
    border: 1px solid rgba(75, 60, 40, 0.16);
    border-radius: 14px;
    padding: 10px 13px;
    font: inherit;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.94);
  }
  .reader-setup input,
  .reader-setup select {
    background: rgba(15, 23, 35, 0.92);
    color: #e2e8f0;
    border-color: rgba(148, 163, 184, 0.14);
  }

  button {
    cursor: pointer;
    border-color: rgba(43, 92, 146, 0.24);
    color: #224c77;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: background 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  }

  button:disabled { opacity: 0.5; cursor: not-allowed; }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 22px rgba(15, 23, 42, 0.18);
  }

  button.primary {
    background: linear-gradient(135deg, #2b5c92, #183452);
    color: #fff;
    border-color: rgba(24, 52, 82, 0.36);
  }

  @media (max-width: 900px) {
    .reader-stage {
      padding: 0 10px 10px;
    }

    .reader-stage-shell {
      border-radius: 18px 18px 0 0;
      padding: 14px;
    }

    .reader-stage :global(.reader-shell.embedded) {
      border-radius: 0 0 18px 18px;
    }

    .reader-setup h2,
    .reader-stage-bar h3 {
      font-size: 20px;
    }
  }
</style>
