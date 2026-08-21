const COMMUNITY_KEY = "community"

// Injected at build time from .env locally and from the VITE_COMMUNITY_API_URL repo
// variable in CI (see .github/workflows/release-please.yml) - never hardcoded in source.
const COMMUNITY_API_BASE = (import.meta.env.VITE_COMMUNITY_API_URL as string | undefined) ?? ""

// True only when a base URL was baked into this build. When false, every network call
// would resolve against the extension's own origin and fail with an opaque
// "NetworkError when attempting to fetch resource"; callers should surface a clear
// "not configured in this build" state instead of letting the raw fetch throw.
export const communityConfigured = COMMUNITY_API_BASE.length > 0

function assertCommunityConfigured() {
    if (!COMMUNITY_API_BASE) {
        throw new Error("The community server is not configured in this build.")
    }
}

export type CommunityRecommendation = {
    title: string
    sourceId: string
}

export type LeaderboardEntry = {
    rank: number
    username: string
    chaptersWeek: number
}

export type CommunityStats = {
    leaderboard: LeaderboardEntry[]
    trendingManga: Array<{ title: string; sourceId: string; count: number }>
    topGenres: Array<{ genre: string; count: number }>
    topRated: Array<{ title: string; avgRating: number; ratingCount: number }>
    totalUsers: number
}

export type CommunityMangaStats = {
    avgRating: number | null
    ratingCount: number
    readerCount: number
}

export type CommunityProfile = {
    enabled: boolean
    username: string
    userId: string
    lastSyncAt: number
    communityRank: number | null
    recommendations: CommunityRecommendation[]
    newAchievements: string[]
    communityStats: CommunityStats | null
}

const defaultProfile: CommunityProfile = {
    // Opt-IN: reading activity (titles/genres/dates) must not leave the device until the
    // user explicitly enables community features. Was opt-out, which auto-registered and
    // uploaded history with no consent. Existing users keep their stored setting.
    enabled: false,
    username: "",
    userId: "",
    lastSyncAt: 0,
    communityRank: null,
    recommendations: [],
    newAchievements: [],
    communityStats: null
}

export async function getCommunityProfile(): Promise<CommunityProfile> {
    const stored = await browser.storage.local.get(COMMUNITY_KEY)
    return { ...defaultProfile, ...(stored[COMMUNITY_KEY] as Partial<CommunityProfile> | undefined) }
}

export async function updateCommunityProfile(patch: Partial<CommunityProfile>): Promise<CommunityProfile> {
    const profile = { ...(await getCommunityProfile()), ...patch }
    await browser.storage.local.set({ [COMMUNITY_KEY]: profile })
    return profile
}

export type CommunityEvent = {
    type: "chapter_read"
    sourceId: string
    mangaTitle: string
    genres: string[]
    date: string
}

// Silent auto-registration uses a generic, clearly-anonymous handle - never
// anything that could pass for a real username someone chose deliberately.
export function generateAnonymousUsername(): string {
    return `Reader${1000 + Math.floor(Math.random() * 9000)}`
}

export async function apiRegister(username: string): Promise<{ userId: string }> {
    assertCommunityConfigured()
    const res = await fetch(`${COMMUNITY_API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    })
    if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
        throw new Error(body.error ?? `Registration failed: ${res.status}`)
    }
    return res.json() as Promise<{ userId: string }>
}

// The server stores at most 500 events per POST (index.ts .slice(0, 500)). Sending more in
// one request silently dropped the overflow while the caller still advanced its sync
// watermark - permanently losing events 501+ on the first sync of an established library.
// Chunk at the same size so every event is stored; the final chunk's response carries the
// up-to-date rank/achievements/recommendations. A mid-run failure throws before the caller
// advances the watermark, so the next sync re-sends everything (the server dedups).
const EVENT_CHUNK = 500

export async function apiSyncEvents(
    userId: string,
    events: CommunityEvent[]
): Promise<{
    rank: number | null
    newAchievements: string[]
    recommendations: CommunityRecommendation[]
}> {
    assertCommunityConfigured()
    type SyncResult = { rank: number | null; newAchievements: string[]; recommendations: CommunityRecommendation[] }
    // At least one request even with no events, so the caller still gets the current rank.
    const batches: CommunityEvent[][] = []
    for (let i = 0; i < events.length; i += EVENT_CHUNK) batches.push(events.slice(i, i + EVENT_CHUNK))
    if (batches.length === 0) batches.push([])

    let last: SyncResult = { rank: null, newAchievements: [], recommendations: [] }
    const achievements = new Set<string>()
    for (const batch of batches) {
        const res = await fetch(`${COMMUNITY_API_BASE}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, events: batch })
        })
        if (!res.ok) throw new Error(`Event sync failed: ${res.status}`)
        last = (await res.json()) as SyncResult
        for (const a of last.newAchievements) achievements.add(a)
    }
    // newAchievements can unlock on any chunk - union them so none is lost across batches.
    return { ...last, newAchievements: [...achievements] }
}

export async function apiFetchCommunityStats(): Promise<CommunityStats> {
    assertCommunityConfigured()
    const res = await fetch(`${COMMUNITY_API_BASE}/community`)
    if (!res.ok) throw new Error(`Community stats fetch failed: ${res.status}`)
    return res.json() as Promise<CommunityStats>
}

export async function apiRate(userId: string, mangaTitle: string, rating: number): Promise<void> {
    assertCommunityConfigured()
    const res = await fetch(`${COMMUNITY_API_BASE}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mangaTitle, rating })
    })
    if (!res.ok) throw new Error(`Rating sync failed: ${res.status}`)
}

export async function apiFetchMangaStats(mangaTitle: string): Promise<CommunityMangaStats> {
    assertCommunityConfigured()
    const res = await fetch(`${COMMUNITY_API_BASE}/manga?title=${encodeURIComponent(mangaTitle)}`)
    if (!res.ok) throw new Error(`Manga stats fetch failed: ${res.status}`)
    return res.json() as Promise<CommunityMangaStats>
}
