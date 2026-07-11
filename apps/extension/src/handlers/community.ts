import { db } from "../database"
import {
    apiRegister,
    apiSyncEvents,
    apiFetchCommunityStats,
    apiRate,
    apiFetchMangaStats,
    generateAnonymousUsername,
    getCommunityProfile,
    updateCommunityProfile,
    type CommunityEvent,
    type CommunityProfile
} from "../community"
import { configureCommunityAlarm, communityAlarmName } from "../background/alarms"
import type { HandlerMap } from "../background/handler-types"

let communityRunning = false
let autoRegistering = false

const MAX_AUTO_REGISTER_ATTEMPTS = 5

// Silent auto-registration: sync defaults to opt-out (enabled: true), but the
// community API requires a userId. Rather than making the user manually type a
// name and click "Join" before sync can ever do anything, we register a generic
// anonymous handle on their behalf the first time we notice enabled && !userId.
// Manual registration (community:register) still works for anyone who wants a
// custom name — this only fires when nothing has been registered yet.
async function ensureRegistered(profile: CommunityProfile): Promise<CommunityProfile> {
    if (!profile.enabled || profile.userId) return profile
    if (autoRegistering) return await getCommunityProfile()
    autoRegistering = true
    try {
        // Re-read in case a concurrent manual "Join" completed while we were waiting.
        const current = await getCommunityProfile()
        if (current.userId) return current

        for (let attempt = 0; attempt < MAX_AUTO_REGISTER_ATTEMPTS; attempt++) {
            const username = generateAnonymousUsername()
            try {
                const { userId } = await apiRegister(username)
                const updated = await updateCommunityProfile({ username, userId, lastSyncAt: 0 })
                await configureCommunityAlarm()
                return updated
            } catch (error) {
                // The community server responds 409 with { error: "Username already taken" }
                // for collisions — retry with a freshly generated name. Any other failure
                // (network down, server error, etc.) should fail soft, not spin the retry loop.
                const isCollision = error instanceof Error && /taken/i.test(error.message)
                if (!isCollision) {
                    console.warn("[AMR] Community auto-registration failed", error)
                    return current
                }
            }
        }
        console.warn(
            `[AMR] Community auto-registration gave up after ${MAX_AUTO_REGISTER_ATTEMPTS} username collisions`
        )
        return current
    } finally {
        autoRegistering = false
    }
}

export async function runCommunitySync() {
    if (communityRunning) return
    communityRunning = true
    try {
        let profile = await getCommunityProfile()
        if (!profile.enabled) return
        if (!profile.userId) {
            profile = await ensureRegistered(profile)
            if (!profile.userId) return
        }

        // Capture the watermark before the read/network calls below, not after — a
        // history event recorded while this sync is in flight has occurredAt before
        // syncStartedAt, so the next sync's "above(lastSyncAt)" query still picks it up.
        // Using Date.now() captured at the END would silently skip it forever.
        const syncStartedAt = Date.now()

        const newHistory = await db.historyEvents
            .where("occurredAt")
            .above(profile.lastSyncAt)
            .filter(h => h.type === "completed")
            .toArray()

        const mangaIds = [...new Set(newHistory.map(h => h.mangaId))]
        const mangaList = await db.manga.where("id").anyOf(mangaIds).toArray()
        const mangaMap = new Map(mangaList.map(m => [m.id, m]))

        const events: CommunityEvent[] = newHistory
            .map(h => {
                const manga = mangaMap.get(h.mangaId)
                if (!manga) return null
                return {
                    type: "chapter_read" as const,
                    sourceId: manga.sourceId,
                    mangaTitle: manga.title,
                    genres: manga.genres ?? [],
                    date: new Date(h.occurredAt).toISOString().slice(0, 10)
                }
            })
            .filter((e): e is CommunityEvent => e !== null)

        let rank = profile.communityRank
        let recommendations = profile.recommendations ?? []
        let newAchievements: string[] = []
        if (events.length > 0) {
            const result = await apiSyncEvents(profile.userId, events)
            rank = result.rank
            recommendations = result.recommendations
            newAchievements = result.newAchievements
        }
        const communityStats = await apiFetchCommunityStats().catch(() => profile.communityStats)

        await updateCommunityProfile({
            lastSyncAt: syncStartedAt,
            communityRank: rank,
            recommendations,
            newAchievements: [...(profile.newAchievements ?? []), ...newAchievements],
            communityStats
        })
    } catch (error) {
        console.warn("[AMR] Community sync failed", error)
    } finally {
        communityRunning = false
    }
}

export const communityHandlers: HandlerMap = {
    // Settings/Achievements load this on every visit — since the alarm-driven sync
    // can't run before a userId exists, this doubles as the main opportunistic
    // trigger for silent first-time registration.
    "community:status": async () => {
        const profile = await getCommunityProfile()
        if (profile.enabled && !profile.userId) {
            const updated = await ensureRegistered(profile)
            if (updated.userId) void runCommunitySync()
            return updated
        }
        return profile
    },
    "community:register": async request => {
        const existing = await getCommunityProfile()
        if (existing.userId) return existing
        const { userId } = await apiRegister(request.username)
        const updated = await updateCommunityProfile({
            username: request.username,
            userId,
            enabled: true,
            lastSyncAt: 0
        })
        await configureCommunityAlarm()
        void runCommunitySync()
        return updated
    },
    "community:sync": async () => {
        await runCommunitySync()
        return null
    },
    "community:toggle": async request => {
        let updated = await updateCommunityProfile({ enabled: request.enabled })
        if (request.enabled) {
            if (!updated.userId) updated = await ensureRegistered(updated)
            await configureCommunityAlarm()
            if (updated.userId) void runCommunitySync()
        } else {
            await browser.alarms.clear(communityAlarmName)
        }
        return updated
    },
    "community:rate": async request => {
        const profile = await getCommunityProfile()
        if (!profile.enabled || !profile.userId) return null
        await apiRate(profile.userId, request.mangaTitle, request.rating)
        return null
    },
    "community:manga-stats": async request => {
        return await apiFetchMangaStats(request.mangaTitle)
    }
}
