<script lang="ts">
  import { onMount } from "svelte"
  import { sendRuntimeMessage } from "../../core/extension/browser-api"

  let status = "Checking background worker..."
  let version = "-"
  let lastHeartbeat = "-"
  let compactMode = false
  let openLinksInNewTab = true
  let theme: "system" | "light" | "dark" = "system"

  async function refreshHealthAndSettings() {
    const [health, settings] = await Promise.all([
      sendRuntimeMessage({ type: "health:ping" }),
      sendRuntimeMessage({ type: "preferences:get" })
    ])

    status = health.ok ? "Background worker reachable ✅" : "Background worker unreachable"
    version = health.version
    lastHeartbeat = new Date(health.timestamp).toLocaleTimeString()

    compactMode = settings.preferences.compactMode
    openLinksInNewTab = settings.preferences.openLinksInNewTab
    theme = settings.preferences.theme
  }

  async function toggleCompactMode() {
    compactMode = !compactMode

    await sendRuntimeMessage({
      type: "preferences:set",
      payload: {
        compactMode,
        openLinksInNewTab,
        theme
      }
    })
  }

  async function openDashboard() {
    const dashboardUrl = chrome.runtime.getURL("pages/dashboard.html")
    await chrome.tabs.create({ url: dashboardUrl })
    window.close()
  }

  onMount(async () => {
    try {
      await refreshHealthAndSettings()
    } catch {
      status = "Background worker unreachable"
    }
  })
</script>

<main>
  <h1>AMR Svelte Rewrite</h1>
  <p>{status}</p>
  <p>Extension version: {version}</p>
  <p>Last heartbeat: {lastHeartbeat}</p>
  <button on:click={toggleCompactMode}>Compact mode: {compactMode ? "on" : "off"}</button>
  <button on:click={openDashboard}>Open Dashboard</button>
</main>
