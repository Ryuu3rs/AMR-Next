import { db } from "../database"
import {
    apiRegister,
    apiSyncEvents,
    apiFetchCommunityStats,
    apiRate,
    apiFetchMangaStats,
    getCommunityProfile,
    updateCommunityProfile,
    type CommunityEvent
} from "../community"
import { configureCommunityAlarm, communityAlarmName } from "../background/alarms"
import type { HandlerMap } from "../background/handler-types"

let communityRunning = false

export async function runCommunitySync() {
    if (communityRunning) return
    communityRunning = true
    try {
        const profile = await getCommunityProfile()
        if (!profile.enabled || !profile.userId) return

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
    "community:status": async () => {
        return await getCommunityProfile()
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
        const updated = await updateCommunityProfile({ enabled: request.enabled })
        if (request.enabled) {
            await configureCommunityAlarm()
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
