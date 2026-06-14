<script lang="ts">
  import { createEventDispatcher } from "svelte"

  export type ReaderImageState = {
    pageUrl: string
    imageUrl: string | null
    status: "pending" | "loaded" | "error"
    error?: string
  }

  export type ReaderChapter = {
    title: string
    url: string
  }

  export let mirrorName = ""
  export let chapterTitle = "Loading chapter..."
  export let status = "Initializing reader runtime..."
  export let loading = true
  export let progress = 0
  export let loadedPages = 0
  export let totalPages = 0
  export let images: ReaderImageState[] = []
  export let chapters: ReaderChapter[] = []
  export let selectedChapterUrl: string | null = null
  export let canGoPreviousChapter = false
  export let canGoNextChapter = false
  export let fullChapter = true
  export let currentPageIndex = 0
  export let imageWidth = 100
  export let theme: "dark" | "light" = "dark"
  export let chapterBookmarked = false
  export let embedded = false

  const dispatch = createEventDispatcher<{
    reload: void
    restore: void
    goPreviousChapter: void
    goNextChapter: void
    selectChapter: string
    toggleFullChapter: void
    goPreviousPage: void
    goNextPage: void
    setImageWidth: number
    toggleTheme: void
    toggleChapterBookmark: void
    openDashboard: void
  }>()

  $: visibleImages = fullChapter ? images : images.filter((_, index) => index === currentPageIndex)
  $: pagePositionLabel = totalPages > 0 ? `${currentPageIndex + 1}/${totalPages}` : "0/0"
  let chapterSelectValue = ""
  $: {
    const next = selectedChapterUrl ?? ""
    if (chapterSelectValue !== next) {
      chapterSelectValue = next
    }
  }

  function requestReload() {
    dispatch("reload")
  }

  function requestRestore() {
    dispatch("restore")
  }

  function requestPreviousChapter() {
    dispatch("goPreviousChapter")
  }

  function requestNextChapter() {
    dispatch("goNextChapter")
  }

  function onChapterSelect(event: Event) {
    const select = event.target as HTMLSelectElement
    dispatch("selectChapter", select.value)
  }

  function toggleMode() {
    dispatch("toggleFullChapter")
  }

  function requestPreviousPage() {
    dispatch("goPreviousPage")
  }

  function requestNextPage() {
    dispatch("goNextPage")
  }

  function onImageWidthInput(event: Event) {
    const input = event.target as HTMLInputElement
    dispatch("setImageWidth", Number(input.value))
  }

  function toggleTheme() {
    dispatch("toggleTheme")
  }

  function toggleChapterBookmark() {
    dispatch("toggleChapterBookmark")
  }

  function requestOpenDashboard() {
    dispatch("openDashboard")
  }

  let sidebarOpen = true
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen
  }
</script>

<div class={`reader-shell theme-${theme}`} class:embedded={embedded}>
  <!-- Sidebar toggle tab (always visible on left edge) -->
  <button class="sidebar-tab" class:open={sidebarOpen} on:click={toggleSidebar} title={sidebarOpen ? "Close panel" : "Open panel"}>
    <span class="tab-chevron">{sidebarOpen ? "▸" : "◂"}</span>
  </button>

  <!-- Sidebar overlay (click to close on mobile) -->
  {#if sidebarOpen}
    <div class="sidebar-backdrop" on:click={toggleSidebar} role="presentation"></div>
  {/if}

  <!-- Collapsible side panel -->
  <aside class="sidebar" class:open={sidebarOpen}>
    <div class="sb-header">
      <span class="brand">AMR Reader</span>
      <button class="sb-close" on:click={toggleSidebar} title="Close panel">✕</button>
    </div>

    <!-- Chapter info -->
    <div class="sb-section">
      <h2 class="sb-title">{chapterTitle}</h2>
      <p class="sb-meta">{mirrorName || "Unknown mirror"}</p>
    </div>

    <!-- Chapter navigation -->
    <div class="sb-section">
      <div class="sb-label">Chapter</div>
      <select class="sb-select" bind:value={chapterSelectValue} on:change={onChapterSelect}>
        {#if chapters.length === 0}
          <option value="">No chapters</option>
        {:else}
          {#each chapters as chapter}
            <option value={chapter.url}>{chapter.title}</option>
          {/each}
        {/if}
      </select>
      <div class="sb-row">
        <button class="sb-btn" on:click={requestPreviousChapter} disabled={!canGoPreviousChapter}>◀ Prev Chapter</button>
        <button class="sb-btn" on:click={requestNextChapter} disabled={!canGoNextChapter}>Next Chapter ▶</button>
      </div>
    </div>

    <!-- View mode -->
    <div class="sb-section">
      <div class="sb-label">View Mode</div>
      <button class="sb-btn full" on:click={toggleMode}>
        {fullChapter ? "📄 Switch to Single Page" : "📑 Switch to Full Scroll"}
      </button>
      {#if !fullChapter}
        <div class="sb-row page-nav">
          <button class="sb-btn" on:click={requestPreviousPage} disabled={currentPageIndex <= 0}>‹ Prev</button>
          <span class="sb-page-label">{pagePositionLabel}</span>
          <button class="sb-btn" on:click={requestNextPage} disabled={currentPageIndex >= totalPages - 1}>Next ›</button>
        </div>
      {/if}
    </div>

    <!-- Width -->
    <div class="sb-section">
      <div class="sb-label">Image Width: {imageWidth}%</div>
      <input class="sb-range" type="range" min="35" max="100" value={imageWidth} on:input={onImageWidthInput} />
    </div>

    <!-- Actions -->
    <div class="sb-section">
      <div class="sb-label">Actions</div>
      <div class="sb-actions">
        <button class="sb-btn" class:bookmarked={chapterBookmarked} on:click={toggleChapterBookmark}>
          {chapterBookmarked ? "★ Bookmarked" : "☆ Bookmark"}
        </button>
        {#if !embedded}
          <button class="sb-btn" on:click={requestOpenDashboard}>Open Dashboard</button>
        {/if}
        <button class="sb-btn" on:click={toggleTheme}>
          {theme === "dark" ? "☀ Light Mode" : "🌙 Dark Mode"}
        </button>
        <button class="sb-btn" on:click={requestReload}>↻ Reload</button>
        <button class="sb-btn danger" on:click={requestRestore}>✕ Exit Reader</button>
      </div>
    </div>

    <!-- Progress -->
    {#if loading}
      <div class="sb-section">
        <div class="sb-label">Loading…</div>
        <div class="sb-progress-track">
          <div class="sb-progress-fill" style={`width:${progress}%`}></div>
        </div>
        <p class="sb-meta">{loadedPages}/{totalPages} pages resolved</p>
        <p class="sb-meta">{status}</p>
      </div>
    {/if}
  </aside>

  <!-- Main content area -->
  <main class="reader-main">
    {#if loading && images.length === 0}
      <div class="pg-loading-overlay">
        <span class="pg-icon spin">⟳</span>
        <p>{status}</p>
        <div class="sb-progress-track" style="width:200px;margin-top:12px">
          <div class="sb-progress-fill" style={`width:${progress}%`}></div>
        </div>
      </div>
    {/if}

    {#each visibleImages as image, i}
      <div class="pg-slot">
        {#if image.status === "loaded" && image.imageUrl}
          <img
            class="pg-img"
            src={image.imageUrl}
            alt="Page {fullChapter ? i + 1 : currentPageIndex + 1}"
            loading="lazy"
            style={`max-width:${imageWidth}%`}
          />
        {:else if image.status === "error"}
          <div class="pg-state error">
            <span class="pg-icon">⚠</span>
            <p>Failed to load image</p>
            <p class="pg-hint">{image.error ?? image.pageUrl}</p>
          </div>
        {:else}
          <div class="pg-state pending">
            <span class="pg-icon spin">⟳</span>
            <p>Resolving image…</p>
          </div>
        {/if}
      </div>
    {/each}

    {#if !loading && images.length === 0}
      <div class="pg-empty">
        <p>No pages to display</p>
        <p class="pg-hint">{status}</p>
      </div>
    {/if}

    <!-- Bottom chapter nav -->
    {#if images.length > 0 && !loading}
      <div class="foot">
        <button class="foot-btn" on:click={requestPreviousChapter} disabled={!canGoPreviousChapter}>◀ Previous Chapter</button>
        <span class="foot-info">{totalPages} pages</span>
        <button class="foot-btn" on:click={requestNextChapter} disabled={!canGoNextChapter}>Next Chapter ▶</button>
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; padding: 0; font-family: "Trebuchet MS", "Segoe UI", sans-serif; }

  .reader-shell { min-height: 100vh; display: flex; flex-direction: row; position: relative; }
  .theme-dark {
    background:
      radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 26%),
      linear-gradient(180deg, #071019 0%, #0b1220 55%, #121826 100%);
    color: #e2e8f0;
  }
  .theme-light {
    background:
      radial-gradient(circle at top left, rgba(191, 219, 254, 0.2), transparent 25%),
      linear-gradient(180deg, #f4ecdf 0%, #ece4d7 100%);
    color: #1a2433;
  }
  .reader-shell.embedded {
    min-height: 70vh;
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    overflow: hidden;
    box-shadow: 0 24px 56px rgba(15, 23, 42, 0.22);
  }

  /* ── Sidebar toggle tab ── */
  .sidebar-tab {
    position: fixed; right: 0; top: 50%; z-index: 200;
    transform: translateY(-50%);
    width: 24px; height: 60px;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 8px 0 0 8px;
    cursor: pointer; font-size: 14px;
    transition: all 150ms;
    padding: 0;
  }
  .theme-dark .sidebar-tab { background: rgba(12, 19, 30, 0.96); color: #93c5fd; }
  .theme-light .sidebar-tab { background: rgba(255, 251, 244, 0.96); color: #224c77; }
  .sidebar-tab:hover { width: 30px; }
  .theme-dark .sidebar-tab:hover { background: #2b5c92; color: #fff; }
  .theme-light .sidebar-tab:hover { background: #2b5c92; color: #fff; }
  .sidebar-tab.open { right: 280px; }
  .tab-chevron { display: inline-block; }
  .reader-shell.embedded .sidebar-tab { position: absolute; }

  /* ── Backdrop ── */
  .sidebar-backdrop {
    position: fixed; inset: 0; z-index: 149;
    background: rgba(0,0,0,0.4);
  }
  .reader-shell.embedded .sidebar-backdrop { position: absolute; }

  /* ── Sidebar ── */
  .sidebar {
    position: fixed; right: -290px; top: 0; bottom: 0; z-index: 150;
    width: 280px;
    overflow-y: auto;
    transition: right 200ms ease;
    display: flex; flex-direction: column;
  }
  .reader-shell.embedded .sidebar { position: absolute; }
  .sidebar.open { right: 0; }
  .theme-dark .sidebar {
    background:
      linear-gradient(180deg, rgba(14, 20, 30, 0.98), rgba(11, 17, 25, 0.98)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(245, 158, 11, 0.08));
    border-left: 1px solid rgba(148,163,184,0.14);
    box-shadow: -18px 0 34px rgba(2, 6, 23, 0.28);
  }
  .theme-light .sidebar {
    background:
      linear-gradient(180deg, rgba(255, 251, 244, 0.98), rgba(245, 236, 221, 0.98));
    border-left: 1px solid rgba(68,48,22,0.12);
    box-shadow: -18px 0 34px rgba(91, 67, 38, 0.12);
  }

  .sb-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 10px; flex-shrink: 0;
  }
  .brand {
    font-weight: 900;
    font-size: 15px;
    color: #d8e9ff;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .theme-light .brand { color: #224c77; }
  .sb-close {
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; cursor: pointer; font-size: 16px;
    border-radius: 6px; transition: all 100ms; padding: 0;
  }
  .theme-dark .sb-close { color: #64748b; }
  .theme-light .sb-close { color: #94a3b8; }
  .sb-close:hover { background: #ef4444; color: #fff; }

  .sb-section {
    padding: 12px 16px;
    border-top: 1px solid rgba(148,163,184,0.08);
  }
  .sb-label {
    display: block; font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.14em; opacity: 0.62; margin-bottom: 8px;
  }
  .sb-title {
    margin: 0 0 4px; font-size: 18px; font-weight: 700; line-height: 1.15;
    font-family: Georgia, "Times New Roman", serif;
    word-break: break-word;
  }
  .sb-meta { margin: 0; font-size: 11px; opacity: 0.56; }

  .sb-select {
    width: 100%; padding: 7px 10px; border-radius: 8px; font-size: 12px;
    font-family: inherit; margin-bottom: 8px; outline: none;
    border: 1px solid rgba(148,163,184,0.15);
  }
  .theme-dark .sb-select { background: rgba(15, 23, 35, 0.9); color: #e2e8f0; }
  .theme-light .sb-select { background: rgba(255,255,255,0.9); color: #0f172a; }

  .sb-row {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .sb-row.page-nav { margin-top: 8px; align-items: center; }
  .sb-page-label { font-size: 12px; font-weight: 700; flex: 1; text-align: center; }

  /* ── Shared button base ── */
  button, select { font-family: inherit; outline: none; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
  button:disabled { opacity: 0.3; cursor: not-allowed; }

  .sb-btn {
    flex: 1; padding: 8px 12px; font-weight: 600; font-size: 12px;
    border-radius: 8px; transition: all 100ms; text-align: center;
  }
  .sb-btn.full { flex: unset; width: 100%; }
  .theme-dark .sb-btn { background: rgba(30, 41, 59, 0.92); color: #bfdbfe; }
  .theme-light .sb-btn { background: rgba(226, 232, 240, 0.88); color: #224c77; }
  .sb-btn:hover:not(:disabled) { background: #2b5c92; color: #fff; }
  .sb-btn.bookmarked { background: #f59e0b; color: #111827; }
  .sb-btn.danger { color: #f87171; }
  .sb-btn.danger:hover:not(:disabled) { background: #ef4444; color: #fff; }

  .sb-actions { display: flex; flex-direction: column; gap: 6px; }

  .sb-range {
    width: 100%; height: 4px; accent-color: #3b82f6; border: none; outline: none;
  }

  /* ── Progress ── */
  .sb-progress-track {
    height: 4px; border-radius: 999px; overflow: hidden;
  }
  .theme-dark .sb-progress-track { background: #1e293b; }
  .theme-light .sb-progress-track { background: #d1d5db; }
  .sb-progress-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #38bdf8, #6366f1);
    transition: width 120ms linear;
  }

  /* ── Main content ── */
  .reader-main {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 0; gap: 10px;
  }
  .reader-shell.embedded .reader-main {
    min-height: 70vh;
    padding: 24px 0 12px;
  }

  .pg-loading-overlay {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 100px 20px; opacity: 0.6;
  }
  .pg-loading-overlay p { margin: 8px 0 0; font-size: 13px; }

  .pg-slot { width: 100%; display: flex; justify-content: center; padding: 0 18px; box-sizing: border-box; }
  .pg-img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 18px;
    box-shadow: 0 24px 44px rgba(2, 6, 23, 0.3);
    background: rgba(255,255,255,0.04);
  }

  /* States */
  .pg-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 48px 20px; width: 100%; max-width: 420px; text-align: center; gap: 4px;
  }
  .pg-icon { font-size: 36px; margin-bottom: 6px; }
  .pg-state p { margin: 0; font-size: 13px; }
  .pg-hint { font-size: 10px; color: #64748b; word-break: break-all; margin-top: 4px; }
  .pg-state.error .pg-icon { color: #f87171; }
  .pg-state.pending .pg-icon { color: #38bdf8; }
  .spin { animation: sp 1s linear infinite; display: inline-block; }
  @keyframes sp { to { transform: rotate(360deg); } }

  .pg-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 100px 20px; opacity: 0.5;
  }
  .pg-empty p { margin: 4px 0; }

  /* ── Footer ── */
  .foot {
    display: flex; align-items: center; justify-content: center; gap: 20px;
    padding: 20px 12px; width: 100%;
  }
  .theme-dark .foot { border-top: 1px solid rgba(255,255,255,0.04); }
  .theme-light .foot { border-top: 1px solid rgba(68,48,22,0.1); }

  .foot-btn {
    padding: 10px 22px; font-weight: 700; font-size: 13px; border-radius: 10px;
    transition: all 100ms; border: none;
  }
  .theme-dark .foot-btn { background: rgba(30, 41, 59, 0.92); color: #e2e8f0; }
  .theme-light .foot-btn { background: rgba(226, 232, 240, 0.88); color: #334155; }
  .foot-btn:hover:not(:disabled) { background: #2b5c92; color: #fff; }

  .foot-info { font-size: 12px; opacity: 0.5; font-weight: 600; }

  /* ── Responsive ── */
  @media (min-width: 900px) {
    .sidebar-backdrop { display: none; }
    .sidebar-tab.open { right: 280px; }
  }
</style>
