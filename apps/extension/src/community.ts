const COMMUNITY_KEY = "community"

// Injected at build time from .env — never hardcoded in source.
// Set VITE_COMMUNITY_API_URL in apps/extension/.env (gitignored).
const COMMUNITY_API_BASE = (import.meta.env.VITE_COMMUNITY_API_URL as string | undefined) ?? ""

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
    totalUsers: number
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
    enabled: true,
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

export async function apiRegister(username: string): Promise<{ userId: string }> {
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

export async function apiSyncEvents(
    userId: string,
    events: CommunityEvent[]
): Promise<{
    rank: number | null
    newAchievements: string[]
    recommendations: CommunityRecommendation[]
}> {
    const res = await fetch(`${COMMUNITY_API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, events })
    })
    if (!res.ok) throw new Error(`Event sync failed: ${res.status}`)
    return res.json() as Promise<{
        rank: number | null
        newAchievements: string[]
        recommendations: CommunityRecommendation[]
    }>
}

export async function apiFetchCommunityStats(): Promise<CommunityStats> {
    const res = await fetch(`${COMMUNITY_API_BASE}/community`)
    if (!res.ok) throw new Error(`Community stats fetch failed: ${res.status}`)
    return res.json() as Promise<CommunityStats>
}
