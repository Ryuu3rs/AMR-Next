import "fake-indexeddb/auto"
import { fakeBrowser } from "wxt/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LibraryManga } from "../database"

vi.stubGlobal("browser", fakeBrowser)

vi.mock("../community", async () => {
    const actual = await vi.importActual<typeof import("../community")>("../community")
    return {
        ...actual,
        apiRegister: vi.fn(),
        apiSyncEvents: vi.fn(),
        apiFetchCommunityStats: vi.fn(),
        apiRate: vi.fn(),
        apiFetchMangaStats: vi.fn()
    }
})

const { db } = await import("../database")
const community = await import("../community")
const { getCommunityProfile, updateCommunityProfile } = community
const apiRegister = vi.mocked(community.apiRegister)
const apiSyncEvents = vi.mocked(community.apiSyncEvents)
const apiFetchCommunityStats = vi.mocked(community.apiFetchCommunityStats)
const { communityAlarmName } = await import("../background/alarms")
const { communityHandlers, runCommunitySync } = await import("./community")

const manga: LibraryManga = {
    id: "mangadex:manga:abc",
    sourceId: "mangadex",
    sourceUrl: "https://mangadex.org/title/abc",
    title: "Test Manga",
    normalizedTitle: "test manga",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1
}

beforeEach(async () => {
    fakeBrowser.reset()
    vi.clearAllMocks()
    await Promise.all([db.manga.clear(), db.historyEvents.clear()])
    apiSyncEvents.mockResolvedValue({ rank: 5, newAchievements: [], recommendations: [] })
    apiFetchCommunityStats.mockResolvedValue({
        leaderboard: [],
        trendingManga: [],
        topGenres: [],
        topRated: [],
        totalUsers: 0
    })
})

describe("runCommunitySync watermark", () => {
    it("captures the sync watermark before the network call so an in-flight history event is not lost", async () => {
        await updateCommunityProfile({ enabled: true, userId: "user-1", username: "tester", lastSyncAt: 0 })
        await db.manga.put(manga)

        // Simulate a history event recorded WHILE the sync's network call is in flight:
        // apiSyncEvents resolves only after we've inserted the event, mimicking the
        // real-world race between syncStartedAt capture and the completed fetch.
        let recordDuringSync!: () => Promise<void>
        apiSyncEvents.mockImplementation(async () => {
            await recordDuringSync()
            return { rank: 1, newAchievements: [], recommendations: [] }
        })

        // Seed one already-existing history event so apiSyncEvents is actually invoked.
        await db.historyEvents.add({
            mangaId: manga.id,
            chapterId: "mangadex:chapter:1",
            type: "completed",
            occurredAt: 100
        })

        let midSyncEventTime = 0
        recordDuringSync = async () => {
            midSyncEventTime = Date.now()
            await db.historyEvents.add({
                mangaId: manga.id,
                chapterId: "mangadex:chapter:2",
                type: "completed",
                occurredAt: midSyncEventTime
            })
        }

        await runCommunitySync()

        const profile = await getCommunityProfile()
        // The watermark must not have moved past the event recorded during the sync.
        expect(profile.lastSyncAt).toBeLessThanOrEqual(midSyncEventTime)

        // A second sync should still pick up that mid-flight event.
        apiSyncEvents.mockClear()
        apiSyncEvents.mockResolvedValueOnce({ rank: 2, newAchievements: [], recommendations: [] })
        await runCommunitySync()
        expect(apiSyncEvents).toHaveBeenCalledTimes(1)
        const eventsArg = apiSyncEvents.mock.calls[0]![1]
        expect(eventsArg.length).toBe(1)
    })
})

describe("runCommunitySync concurrency", () => {
    it("only allows one sync in flight — a concurrent call is a no-op", async () => {
        await updateCommunityProfile({ enabled: true, userId: "user-1", username: "tester", lastSyncAt: 0 })
        await db.manga.put(manga)
        await db.historyEvents.add({
            mangaId: manga.id,
            chapterId: "mangadex:chapter:1",
            type: "completed",
            occurredAt: 100
        })

        let resolveSync!: (v: { rank: number | null; newAchievements: string[]; recommendations: never[] }) => void
        apiSyncEvents.mockImplementation(
            () =>
                new Promise(resolve => {
                    resolveSync = resolve
                })
        )

        const first = runCommunitySync()
        const second = runCommunitySync()

        // Let the microtask queue drain so first's chain of db reads/awaits reaches
        // apiSyncEvents and assigns resolveSync before we resolve it.
        await vi.waitFor(() => expect(resolveSync).toBeDefined())
        resolveSync({ rank: 1, newAchievements: [], recommendations: [] })
        await Promise.all([first, second])

        expect(apiSyncEvents).toHaveBeenCalledTimes(1)
    })
})

describe("runCommunitySync with no new events", () => {
    it("refreshes communityStats but does not call apiSyncEvents", async () => {
        await updateCommunityProfile({ enabled: true, userId: "user-1", username: "tester", lastSyncAt: Date.now() })

        await runCommunitySync()

        expect(apiSyncEvents).not.toHaveBeenCalled()
        expect(apiFetchCommunityStats).toHaveBeenCalledTimes(1)
    })
})

describe("community:register handler", () => {
    it("is idempotent — returns the existing profile without calling apiRegister when userId is already set", async () => {
        await updateCommunityProfile({ userId: "existing-user", username: "already-here", enabled: true })

        const result = await communityHandlers["community:register"]!(
            { type: "community:register", username: "newname" },
            { sender: {} as never }
        )

        expect(apiRegister).not.toHaveBeenCalled()
        expect((result as { userId: string }).userId).toBe("existing-user")
    })
})

describe("community:toggle handler", () => {
    it("clears the community alarm when disabling", async () => {
        const clearSpy = vi.spyOn(fakeBrowser.alarms, "clear")

        await communityHandlers["community:toggle"]!(
            { type: "community:toggle", enabled: false },
            { sender: {} as never }
        )

        expect(clearSpy).toHaveBeenCalledWith(communityAlarmName)
    })

    it("(re)creates the alarm when enabling with a registered profile", async () => {
        await updateCommunityProfile({ userId: "user-1", username: "tester" })
        const createSpy = vi.spyOn(fakeBrowser.alarms, "create")

        await communityHandlers["community:toggle"]!(
            { type: "community:toggle", enabled: true },
            { sender: {} as never }
        )

        expect(createSpy).toHaveBeenCalledWith(communityAlarmName, expect.objectContaining({ periodInMinutes: 60 }))
    })
})
