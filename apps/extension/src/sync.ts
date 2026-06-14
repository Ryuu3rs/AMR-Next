// GitHub Gist sync for the library/progress/settings backup. Stores a personal
// access token (gist scope) + gist id in storage.local. Snapshot-based:
// push uploads the full human-readable JSON export; pull imports it (bulkPut
// merge). Last push wins at the gist level — per-record LWW merge is future work.

const SYNC_KEY = "syncConfig"
const GIST_FILENAME = "amr-library.json"
const API = "https://api.github.com"

export type SyncConfig = {
    token?: string
    gistId?: string
    autoSync: boolean
    lastPushedAt?: number
    lastPulledAt?: number
}

const defaultSyncConfig: SyncConfig = { autoSync: false }

export async function getSyncConfig(): Promise<SyncConfig> {
    const stored = await browser.storage.local.get(SYNC_KEY)
    return { ...defaultSyncConfig, ...(stored[SYNC_KEY] as Partial<SyncConfig> | undefined) }
}

export async function setSyncConfig(patch: Partial<SyncConfig>): Promise<SyncConfig> {
    const next = { ...(await getSyncConfig()), ...patch }
    await browser.storage.local.set({ [SYNC_KEY]: next })
    return next
}

// Token-free view for the UI — never ship the token back to the page.
export async function getSyncStatus(): Promise<{
    hasToken: boolean
    gistId?: string
    autoSync: boolean
    lastPushedAt?: number
    lastPulledAt?: number
}> {
    const c = await getSyncConfig()
    return {
        hasToken: Boolean(c.token),
        ...(c.gistId ? { gistId: c.gistId } : {}),
        autoSync: c.autoSync,
        ...(c.lastPushedAt ? { lastPushedAt: c.lastPushedAt } : {}),
        ...(c.lastPulledAt ? { lastPulledAt: c.lastPulledAt } : {})
    }
}

async function githubFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init?.headers ?? {})
        }
    })
    if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200)
        throw new Error(`GitHub API ${res.status}${detail ? `: ${detail}` : ""}`)
    }
    return res
}

export async function pushToGist(envelope: unknown): Promise<{ gistId: string }> {
    const config = await getSyncConfig()
    if (!config.token) throw new Error("No GitHub token configured")
    const content = JSON.stringify(envelope, null, 2)
    const files = { [GIST_FILENAME]: { content } }

    if (config.gistId) {
        await githubFetch(`/gists/${config.gistId}`, config.token, {
            method: "PATCH",
            body: JSON.stringify({ description: "AMR library backup", files })
        })
        await setSyncConfig({ lastPushedAt: Date.now() })
        return { gistId: config.gistId }
    }

    const res = await githubFetch(`/gists`, config.token, {
        method: "POST",
        body: JSON.stringify({ description: "AMR library backup", public: false, files })
    })
    const json = (await res.json()) as { id: string }
    await setSyncConfig({ gistId: json.id, lastPushedAt: Date.now() })
    return { gistId: json.id }
}

export async function pullFromGist(): Promise<unknown> {
    const config = await getSyncConfig()
    if (!config.token || !config.gistId) throw new Error("Sync is not configured")
    const res = await githubFetch(`/gists/${config.gistId}`, config.token, { method: "GET" })
    const json = (await res.json()) as { files?: Record<string, { content?: string } | undefined> }
    const file = json.files?.[GIST_FILENAME]
    if (!file?.content) throw new Error("Backup file not found in the gist")
    await setSyncConfig({ lastPulledAt: Date.now() })
    return JSON.parse(file.content)
}
