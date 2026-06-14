<script lang="ts">
  import { onMount } from "svelte"
  import { sendRuntimeMessage } from "../../core/extension/browser-api"
  import type { MirrorCapability } from "../../core/mirrors/catalog"
  import type { SyncProvider } from "../../core/sync/status"

  let connected = false
  let version = "-"
  let compactMode = false
  let openLinksInNewTab = true
  let theme: "system" | "light" | "dark" = "system"
  let showNotifications = true
  let releaseCheckIntervalMinutes = 30
  let enableDashboardReader = true
  let saveStatus = ""
  let mirrors: MirrorCapability[] = []
  let mirrorSource = "unknown"
  let mirrorSummary = "-"
  let releaseReady = false
  let releaseBlockers = "none"
  let releaseNotes = "none"

  let syncEnabled = false
  let syncProvider: SyncProvider = "none"
  let autoSync = false
  let lastSyncAt = "never"
  let syncError = ""
  let gistId = ""
  let gistToken = ""
  let syncStats = "-"
  let syncRecordsJson = "[]"
  let syncRecordsStatus = ""

  function formatSyncStats(stats: {
    localCount: number
    remoteCount: number
    mergedCount: number
    keptTombstones: number
    prunedTombstones: number
    propagatedDeletes: number
    tieConflicts: number
    tombstoneTieBreaks: number
    duplicateKeyConflicts: number
    malformedLocalRecords: number
    malformedRemoteRecords: number
    remoteSchemaVersion: number
    usedLegacyArrayFormat: boolean
  } | null): string {
    if (!stats) return "-"

    return `local:${stats.localCount} remote:${stats.remoteCount} merged:${stats.mergedCount} deletes propagated:${stats.propagatedDeletes} tombstones kept:${stats.keptTombstones} pruned:${stats.prunedTombstones} ties:${stats.tieConflicts} tombstone tie-breaks:${stats.tombstoneTieBreaks} duplicate keys:${stats.duplicateKeyConflicts} malformed local:${stats.malformedLocalRecords} remote:${stats.malformedRemoteRecords} remote schema:${stats.remoteSchemaVersion} legacy format:${stats.usedLegacyArrayFormat ? "yes" : "no"}`
  }

  onMount(async () => {
    const [health, preferences, mirrorResponse, syncResponse, readinessResponse] = await Promise.all([
      sendRuntimeMessage({ type: "health:ping" }),
      sendRuntimeMessage({ type: "preferences:get" }),
      sendRuntimeMessage({ type: "mirrors:diagnostics" }),
      sendRuntimeMessage({ type: "sync:status:get" }),
      sendRuntimeMessage({ type: "release:readiness:get" })
    ])

    connected = health.ok
    version = health.version
    compactMode = preferences.preferences.compactMode
    openLinksInNewTab = preferences.preferences.openLinksInNewTab
    theme = preferences.preferences.theme
    showNotifications = preferences.preferences.showNotifications
    releaseCheckIntervalMinutes = preferences.preferences.releaseCheckIntervalMinutes
    enableDashboardReader = preferences.preferences.enableDashboardReader
    mirrors = mirrorResponse.mirrors
    mirrorSource = mirrorResponse.diagnostics.source
    mirrorSummary = `total:${mirrorResponse.diagnostics.total} searchable:${mirrorResponse.diagnostics.searchable} latest:${mirrorResponse.diagnostics.latest} disabled:${mirrorResponse.diagnostics.disabled}`

    syncEnabled = syncResponse.syncStatus.enabled
    syncProvider = syncResponse.syncStatus.provider
    autoSync = syncResponse.syncStatus.autoSync
    lastSyncAt = syncResponse.syncStatus.lastSyncAt ?? "never"
    syncError = syncResponse.syncStatus.lastError ?? ""
    gistId = syncResponse.syncStatus.gistId ?? ""
    gistToken = syncResponse.syncStatus.gistToken ?? ""
    syncStats = formatSyncStats(syncResponse.syncStatus.lastRunStats)

    releaseReady = readinessResponse.readiness.ready
    releaseBlockers = readinessResponse.readiness.blockers.length
      ? readinessResponse.readiness.blockers.join(" | ")
      : "none"
    releaseNotes = readinessResponse.readiness.notes.length
      ? readinessResponse.readiness.notes.join(" | ")
      : "none"

    const recordResponse = await sendRuntimeMessage({ type: "sync:records:get" })
    syncRecordsJson = JSON.stringify(recordResponse.records, null, 2)
  })



  async function refreshReleaseReadiness() {
    const response = await sendRuntimeMessage({ type: "release:readiness:get" })
    releaseReady = response.readiness.ready
    releaseBlockers = response.readiness.blockers.length ? response.readiness.blockers.join(" | ") : "none"
    releaseNotes = response.readiness.notes.length ? response.readiness.notes.join(" | ") : "none"
  }

  async function refreshMirrorDiagnostics() {
    const response = await sendRuntimeMessage({ type: "mirrors:diagnostics" })
    mirrors = response.mirrors
    mirrorSource = response.diagnostics.source
    mirrorSummary = `total:${response.diagnostics.total} searchable:${response.diagnostics.searchable} latest:${response.diagnostics.latest} disabled:${response.diagnostics.disabled}`
  }

  async function savePreferences() {
    const response = await sendRuntimeMessage({
      type: "preferences:set",
      payload: {
        compactMode,
        openLinksInNewTab,
        theme,
        showNotifications,
        releaseCheckIntervalMinutes,
        enableDashboardReader
      }
    })

    saveStatus = response.ok ? "Saved" : "Save failed"
  }

  async function saveSyncSettings() {
    const response = await sendRuntimeMessage({
      type: "sync:status:set",
      payload: {
        enabled: syncEnabled,
        provider: syncProvider,
        autoSync,
        gistId: gistId.trim() || null,
        gistToken: gistToken.trim() || null
      }
    })

    lastSyncAt = response.syncStatus.lastSyncAt ?? "never"
    syncError = response.syncStatus.lastError ?? ""
    syncStats = formatSyncStats(response.syncStatus.lastRunStats)
  }

  async function runSyncNow() {
    const response = await sendRuntimeMessage({ type: "sync:run-now" })
    lastSyncAt = response.syncStatus.lastSyncAt ?? "never"
    syncError = response.syncStatus.lastError ?? ""
    syncStats = formatSyncStats(response.syncStatus.lastRunStats)
  }

  async function refreshSyncRecords() {
    const response = await sendRuntimeMessage({ type: "sync:records:get" })
    syncRecordsJson = JSON.stringify(response.records, null, 2)
    syncRecordsStatus = `Loaded ${response.records.length} records`
  }

  async function importSyncRecords() {
    try {
      const parsed = JSON.parse(syncRecordsJson)
      if (!Array.isArray(parsed)) {
        syncRecordsStatus = "Import failed: JSON must be an array"
        return
      }

      const response = await sendRuntimeMessage({
        type: "sync:records:import",
        payload: {
          records: parsed
        }
      })

      syncRecordsJson = JSON.stringify(response.records, null, 2)
      syncRecordsStatus = `Imported ${response.result.importedCount}/${response.result.totalReceived} records (rejected: ${response.result.rejectedCount})`
    } catch (error) {
      syncRecordsStatus = error instanceof Error ? `Import failed: ${error.message}` : "Import failed"
    }
  }
</script>
<main class="options-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">AMR Rewrite Control Room</p>
      <h1>Extension Options</h1>
      <p class="subtext">Tune reader behavior, monitor release readiness, and manage sync from one rewrite-native surface.</p>
    </div>
    <div class="hero-meta">
      <span class="meta-chip" class:ok={connected}>{connected ? "Background linked" : "Background offline"}</span>
      <span class="meta-chip">Version {version}</span>
      <span class="meta-chip">Mirrors {mirrors.length}</span>
    </div>
  </section>

  <section class="grid grid-top">
    <article class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Preferences</p>
          <h2>Reading and dashboard</h2>
        </div>
        <button class="primary" on:click={savePreferences}>Save preferences</button>
      </div>

      <div class="setting-grid">
        <label class="toggle-card">
          <input type="checkbox" bind:checked={compactMode} />
          <span class="toggle-copy">
            <strong>Compact mode</strong>
            <span>Reduce density in shell views once the compact treatment is expanded.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input type="checkbox" bind:checked={openLinksInNewTab} />
          <span class="toggle-copy">
            <strong>Open chapter links in new tab</strong>
            <span>Keep external mirror navigation separated from dashboard state.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input type="checkbox" bind:checked={enableDashboardReader} />
          <span class="toggle-copy">
            <strong>Enable in-dashboard reader</strong>
            <span>Use the rewrite reader surface instead of falling back to the source site.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input type="checkbox" bind:checked={showNotifications} />
          <span class="toggle-copy">
            <strong>Show notifications</strong>
            <span>Allow release and runtime alerts once notification flows are fully wired.</span>
          </span>
        </label>
      </div>

      <div class="form-grid">
        <label>
          <span>Theme</span>
          <select bind:value={theme}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label>
          <span>Release check interval (minutes)</span>
          <input type="number" min="5" step="1" bind:value={releaseCheckIntervalMinutes} />
        </label>
      </div>

      {#if saveStatus}
        <p class="status-line">{saveStatus}</p>
      {/if}
    </article>

    <article class="panel tone-dark">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Release Gate</p>
          <h2>Readiness snapshot</h2>
        </div>
        <button on:click={refreshReleaseReadiness}>Refresh</button>
      </div>

      <div class="stat-strip">
        <div class="stat-pill" class:ok={releaseReady}>
          <span class="stat-label">Ready</span>
          <strong>{releaseReady ? "Yes" : "No"}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Mirror source</span>
          <strong>{mirrorSource}</strong>
        </div>
      </div>

      <p class="status-copy"><strong>Blockers:</strong> {releaseBlockers}</p>
      <p class="status-copy"><strong>Notes:</strong> {releaseNotes}</p>
      <p class="status-copy"><strong>Mirror summary:</strong> {mirrorSummary}</p>
    </article>
  </section>

  <section class="grid">
    <article class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Mirror diagnostics</p>
          <h2>Capability baseline</h2>
        </div>
        <button on:click={refreshMirrorDiagnostics}>Refresh mirror diagnostics</button>
      </div>

      <div class="mirror-list">
        {#each mirrors as mirror}
          <div class="mirror-row">
            <span class="mirror-name">{mirror.label}</span>
            <span class="mirror-flags">
              <span class="flag">{mirror.supportsSearch ? "search" : "no search"}</span>
              <span class="flag">{mirror.supportsLatest ? "latest" : "manual"}</span>
              <span class="flag">{mirror.supportsBatch ? "batch" : "single"}</span>
            </span>
          </div>
        {/each}
      </div>
    </article>

    <article class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-kicker">Sync bridge</p>
          <h2>Remote sync controls</h2>
        </div>
        <div class="row-actions">
          <button on:click={saveSyncSettings}>Save sync settings</button>
          <button class="primary" on:click={runSyncNow}>Run sync now</button>
        </div>
      </div>

      <div class="setting-grid">
        <label class="toggle-card">
          <input type="checkbox" bind:checked={syncEnabled} />
          <span class="toggle-copy">
            <strong>Enable sync</strong>
            <span>Persist library state to the selected provider when configured.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input type="checkbox" bind:checked={autoSync} />
          <span class="toggle-copy">
            <strong>Auto sync</strong>
            <span>Run background sync without manual operator input.</span>
          </span>
        </label>
      </div>

      <div class="form-grid">
        <label>
          <span>Provider</span>
          <select bind:value={syncProvider}>
            <option value="none">None</option>
            <option value="gist">GitHub Gist</option>
          </select>
        </label>

        <label>
          <span>Last sync</span>
          <input type="text" value={lastSyncAt} readonly />
        </label>
      </div>

      {#if syncProvider === "gist"}
        <div class="form-grid">
          <label>
            <span>Gist ID</span>
            <input type="text" bind:value={gistId} placeholder="e.g. 0123456789abcdef" />
          </label>

          <label>
            <span>Gist token</span>
            <input type="password" bind:value={gistToken} placeholder="GitHub token" />
          </label>
        </div>
      {/if}

      <p class="status-copy"><strong>Stats:</strong> {syncStats}</p>
      {#if syncError}
        <p class="status-line error-text">{syncError}</p>
      {/if}
    </article>
  </section>

  <section class="panel panel-wide">
    <div class="panel-head">
      <div>
        <p class="panel-kicker">Operator tool</p>
        <h2>Local sync records</h2>
      </div>
      <div class="row-actions">
        <button on:click={refreshSyncRecords}>Refresh records</button>
        <button on:click={importSyncRecords}>Import records JSON</button>
      </div>
    </div>
    <p class="subtext compact">Use this to inspect or seed local sync records before validating remote sync flows.</p>
    <textarea bind:value={syncRecordsJson} rows="12"></textarea>
    {#if syncRecordsStatus}
      <p class="status-line">{syncRecordsStatus}</p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(191, 219, 254, 0.18), transparent 28%),
      radial-gradient(circle at top right, rgba(217, 119, 6, 0.14), transparent 22%),
      linear-gradient(180deg, #f6efe4 0%, #efe7d8 42%, #e4ded3 100%);
    color: #241f19;
  }

  .options-shell {
    max-width: 1260px;
    margin: 0 auto;
    padding: 32px 24px 40px;
  }

  .hero {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 22px;
    padding: 24px 28px;
    border: 1px solid rgba(54, 45, 31, 0.14);
    border-radius: 24px;
    background:
      linear-gradient(135deg, rgba(255, 248, 236, 0.94), rgba(246, 235, 218, 0.88)),
      linear-gradient(90deg, rgba(46, 70, 96, 0.09), rgba(172, 98, 23, 0.08));
    box-shadow: 0 18px 50px rgba(68, 48, 22, 0.12);
  }

  .eyebrow,
  .panel-kicker {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a5b16;
  }

  h1,
  h2 {
    font-family: Georgia, "Times New Roman", serif;
    letter-spacing: 0.01em;
  }

  .hero h1 {
    margin: 0 0 10px;
    font-size: clamp(32px, 5vw, 52px);
    line-height: 0.95;
    color: #1f2937;
  }

  .subtext {
    margin: 0;
    max-width: 720px;
    font-size: 14px;
    line-height: 1.6;
    color: #5d5346;
  }

  .subtext.compact {
    margin-bottom: 12px;
  }

  .hero-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .meta-chip,
  .flag,
  .stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(68, 48, 22, 0.14);
    background: rgba(255, 252, 245, 0.8);
    font-size: 12px;
    font-weight: 700;
    color: #44321d;
  }

  .meta-chip.ok,
  .stat-pill.ok {
    background: rgba(209, 250, 229, 0.75);
    border-color: rgba(22, 101, 52, 0.18);
    color: #166534;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .grid-top {
    align-items: stretch;
  }

  .panel {
    padding: 22px;
    border-radius: 22px;
    border: 1px solid rgba(54, 45, 31, 0.14);
    background: rgba(255, 251, 244, 0.92);
    box-shadow: 0 12px 34px rgba(73, 52, 26, 0.09);
  }

  .panel-wide {
    margin-bottom: 0;
  }

  .tone-dark {
    background:
      linear-gradient(180deg, rgba(24, 31, 43, 0.97), rgba(16, 22, 31, 0.97)),
      linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(245, 158, 11, 0.12));
    color: #e5edf6;
    border-color: rgba(148, 163, 184, 0.18);
  }

  .tone-dark .panel-kicker,
  .tone-dark .status-copy,
  .tone-dark h2 {
    color: inherit;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .panel h2 {
    margin: 0;
    font-size: 24px;
    color: #223042;
  }

  .row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .setting-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .toggle-card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(72, 56, 33, 0.12);
    background: rgba(255, 255, 255, 0.76);
  }

  .toggle-card input {
    margin-top: 3px;
  }

  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toggle-copy strong {
    font-size: 13px;
    color: #1f2937;
  }

  .toggle-copy span {
    font-size: 12px;
    line-height: 1.5;
    color: #675b4e;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 4px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #5a4c3a;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    border-radius: 14px;
    border: 1px solid rgba(70, 56, 37, 0.18);
    background: rgba(255, 255, 255, 0.94);
    color: #1f2937;
  }

  button {
    padding: 11px 15px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    background: #f8f0e2;
    color: #5b3a11;
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }

  button:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(87, 61, 22, 0.1);
    background: #f2e5d0;
  }

  button.primary {
    background: linear-gradient(135deg, #2b5c92, #183452);
    color: #f8fbff;
    border-color: rgba(18, 52, 82, 0.35);
  }

  input,
  select,
  textarea {
    padding: 11px 13px;
    font-size: 13px;
  }

  textarea {
    width: 100%;
    resize: vertical;
    min-height: 240px;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    background: #fffdf9;
  }

  .stat-strip {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .stat-label {
    opacity: 0.7;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .status-copy,
  .status-line {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: #5d5346;
  }

  .error-text {
    color: #b42318;
  }

  .mirror-list {
    display: grid;
    gap: 10px;
    max-height: 420px;
    overflow: auto;
    padding-right: 4px;
  }

  .mirror-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(72, 56, 33, 0.1);
  }

  .mirror-name {
    font-size: 13px;
    font-weight: 800;
    color: #1f2937;
  }

  .mirror-flags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .flag {
    padding: 6px 10px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  @media (max-width: 920px) {
    .grid,
    .setting-grid,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .hero,
    .panel-head {
      flex-direction: column;
    }

    .hero-meta,
    .row-actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 640px) {
    .options-shell {
      padding: 18px 14px 28px;
    }

    .hero,
    .panel {
      padding: 18px;
      border-radius: 18px;
    }

    .mirror-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
