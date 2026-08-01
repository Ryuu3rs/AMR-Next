// AniList personal-list sync: stores a user access token (obtained via AniList's
// implicit-grant flow and pasted into Settings) and pushes per-title read progress.
// Mirrors sync.ts: token in storage.local, never shipped back to the page; the app
// sees only a token-free status view. Public metadata reads live separately in
// metadata/anilist.ts and need no token.

const ANILIST_KEY = "anilistConfig"
const GRAPHQL = "https://graphql.anilist.co"

export type AniListConfig = {
    token?: string
    autoSync: boolean
    // Mirror library membership to AniList: add titles (read -> progress, unread ->
    // PLANNING) and delete a title's list entry when it's removed from the library.
    // Off by default - it mutates the user's AniList list, not just progress.
    syncMembership: boolean
    lastSyncAt?: number
}

const defaultConfig: AniListConfig = { autoSync: false, syncMembership: false }

export async function getAniListConfig(): Promise<AniListConfig> {
    const stored = await browser.storage.local.get(ANILIST_KEY)
    return { ...defaultConfig, ...(stored[ANILIST_KEY] as Partial<AniListConfig> | undefined) }
}

export async function setAniListConfig(patch: Partial<AniListConfig>): Promise<AniListConfig> {
    const next = { ...(await getAniListConfig()), ...patch }
    await browser.storage.local.set({ [ANILIST_KEY]: next })
    return next
}

// Token-free view for the UI - never ship the token back to the page.
export async function getAniListStatus(): Promise<{
    hasToken: boolean
    autoSync: boolean
    syncMembership: boolean
    lastSyncAt?: number
}> {
    const c = await getAniListConfig()
    return {
        hasToken: Boolean(c.token),
        autoSync: c.autoSync,
        syncMembership: c.syncMembership,
        ...(c.lastSyncAt ? { lastSyncAt: c.lastSyncAt } : {})
    }
}

async function anilistFetch<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(GRAPHQL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({ query, variables })
    })
    if (!res.ok) throw new Error(`AniList API ${res.status}`)
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (json.errors?.length) throw new Error(`AniList: ${json.errors[0]?.message ?? "error"}`)
    if (json.data === undefined || json.data === null) throw new Error("AniList: empty response")
    return json.data
}

// The authed user's current progress for a media, or undefined when they have no
// list entry for it yet. Used to avoid ever lowering remote progress.
export async function getViewerProgress(token: string, mediaId: number): Promise<number | undefined> {
    const data = await anilistFetch<{ Media: { mediaListEntry: { progress: number } | null } | null }>(
        token,
        `query ($mediaId: Int) { Media(id: $mediaId, type: MANGA) { mediaListEntry { progress } } }`,
        { mediaId }
    )
    return data.Media?.mediaListEntry?.progress ?? undefined
}

// Sets absolute chapter progress on the user's list entry (creating it if absent).
// Returns the stored progress AniList echoes back.
export async function saveViewerProgress(token: string, mediaId: number, progress: number): Promise<number> {
    const data = await anilistFetch<{ SaveMediaListEntry: { progress: number } }>(
        token,
        `mutation ($mediaId: Int, $progress: Int) {
            SaveMediaListEntry(mediaId: $mediaId, progress: $progress) { progress }
        }`,
        { mediaId, progress }
    )
    return data.SaveMediaListEntry.progress
}

// Validates a pasted token by querying the viewer's name; throws on an invalid token.
export async function getViewerName(token: string): Promise<string | undefined> {
    const data = await anilistFetch<{ Viewer: { name: string } | null }>(token, `query { Viewer { name } }`, {})
    return data.Viewer?.name
}

// The user's list-entry id for a media (needed to delete it), or undefined if the
// title isn't on their list.
export async function getMediaListEntryId(token: string, mediaId: number): Promise<number | undefined> {
    const data = await anilistFetch<{ Media: { mediaListEntry: { id: number } | null } | null }>(
        token,
        `query ($mediaId: Int) { Media(id: $mediaId, type: MANGA) { mediaListEntry { id } } }`,
        { mediaId }
    )
    return data.Media?.mediaListEntry?.id ?? undefined
}

// Adds/ensures the title on the user's list with a status (e.g. PLANNING for an
// unread library title). Does not touch progress.
export async function saveMediaStatus(token: string, mediaId: number, status: string): Promise<void> {
    await anilistFetch(
        token,
        `mutation ($mediaId: Int, $status: MediaListStatus) {
            SaveMediaListEntry(mediaId: $mediaId, status: $status) { id }
        }`,
        { mediaId, status }
    )
}

// Removes a title from the user's list by its list-entry id.
export async function deleteMediaListEntry(token: string, entryId: number): Promise<boolean> {
    const data = await anilistFetch<{ DeleteMediaListEntry: { deleted: boolean } }>(
        token,
        `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`,
        { id: entryId }
    )
    return data.DeleteMediaListEntry.deleted
}
