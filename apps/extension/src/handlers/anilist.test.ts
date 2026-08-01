import "fake-indexeddb/auto"
import type { MangaRecord } from "@amr/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db, type LibraryManga } from "../database"

const {
    getAniListConfigMock,
    setAniListConfigMock,
    getViewerProgressMock,
    saveViewerProgressMock,
    getMediaListEntryIdMock,
    saveMediaStatusMock,
    deleteMediaListEntryMock,
    resolveMetadataMock,
    configureAniListAlarmMock
} = vi.hoisted(() => ({
    getAniListConfigMock: vi.fn(),
    setAniListConfigMock: vi.fn(),
    getViewerProgressMock: vi.fn(),
    saveViewerProgressMock: vi.fn(),
    getMediaListEntryIdMock: vi.fn(),
    saveMediaStatusMock: vi.fn(),
    deleteMediaListEntryMock: vi.fn(),
    resolveMetadataMock: vi.fn(),
    configureAniListAlarmMock: vi.fn()
}))

vi.mock("../anilist", () => ({
    getAniListConfig: getAniListConfigMock,
    setAniListConfig: setAniListConfigMock,
    getAniListStatus: vi.fn(),
    getViewerName: vi.fn(),
    getViewerProgress: getViewerProgressMock,
    saveViewerProgress: saveViewerProgressMock,
    getMediaListEntryId: getMediaListEntryIdMock,
    saveMediaStatus: saveMediaStatusMock,
    deleteMediaListEntry: deleteMediaListEntryMock
}))
vi.mock("../metadata", () => ({ resolveMetadata: resolveMetadataMock }))
vi.mock("../background/alarms", () => ({ configureAniListAlarm: configureAniListAlarmMock }))
vi.mock("../live", () => ({ publishLive: vi.fn() }))

function makeManga(o: Partial<LibraryManga> = {}): LibraryManga {
    const base: MangaRecord = {
        id: o.id ?? `src:manga:${Math.random().toString(36).slice(2)}`,
        title: o.title ?? "Test",
        normalizedTitle: "test",
        authors: [],
        status: "ongoing",
        addedAt: 1,
        updatedAt: 1
    }
    return { ...base, sourceId: "mangadex", sourceUrl: "https://x/c/1", ...o }
}

beforeEach(async () => {
    await db.manga.clear()
    getAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: false })
    setAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: false })
    getViewerProgressMock.mockReset()
    saveViewerProgressMock.mockReset()
    getMediaListEntryIdMock.mockReset()
    saveMediaStatusMock.mockReset()
    deleteMediaListEntryMock.mockReset()
    resolveMetadataMock.mockReset()
    // Make the inter-title rate-limit delay instant.
    vi.stubGlobal("setTimeout", (fn: () => void) => {
        fn()
        return 0
    })
})

afterEach(() => vi.unstubAllGlobals())

describe("runAniListSync", () => {
    it("pushes the floored local progress when it is higher than remote", async () => {
        const { runAniListSync } = await import("./anilist")
        await db.manga.put(makeManga({ id: "m1", anilistId: 100, lastReadChapterNumber: 10.7 }))
        getViewerProgressMock.mockResolvedValue(5)
        saveViewerProgressMock.mockResolvedValue(10)

        const result = await runAniListSync()

        expect(saveViewerProgressMock).toHaveBeenCalledWith("t", 100, 10)
        expect(result.pushed).toBe(1)
    })

    it("does not lower remote progress", async () => {
        const { runAniListSync } = await import("./anilist")
        await db.manga.put(makeManga({ id: "m1", anilistId: 100, lastReadChapterNumber: 3 }))
        getViewerProgressMock.mockResolvedValue(20)

        const result = await runAniListSync()

        expect(saveViewerProgressMock).not.toHaveBeenCalled()
        expect(result.pushed).toBe(0)
        expect(result.checked).toBe(1)
    })

    it("resolves and caches a missing anilistId before pushing", async () => {
        const { runAniListSync } = await import("./anilist")
        await db.manga.put(makeManga({ id: "m1", title: "Solo Leveling", lastReadChapterNumber: 4 }))
        resolveMetadataMock.mockResolvedValue({ anilistId: 777 })
        getViewerProgressMock.mockResolvedValue(undefined)
        saveViewerProgressMock.mockResolvedValue(4)

        const result = await runAniListSync()

        expect(saveViewerProgressMock).toHaveBeenCalledWith("t", 777, 4)
        expect((await db.manga.get("m1"))?.anilistId).toBe(777)
        expect(result.pushed).toBe(1)
    })

    it("skips titles with no read number, on hold, or no resolvable anilistId", async () => {
        const { runAniListSync } = await import("./anilist")
        await db.manga.bulkPut([
            makeManga({ id: "no-num", anilistId: 1 }),
            makeManga({ id: "held", anilistId: 2, lastReadChapterNumber: 5, onHold: true }),
            makeManga({ id: "no-id", title: "Unknown", lastReadChapterNumber: 5 })
        ])
        resolveMetadataMock.mockResolvedValue(null)

        const result = await runAniListSync()

        expect(saveViewerProgressMock).not.toHaveBeenCalled()
        // no-num and held are filtered out entirely; no-id is checked-and-skipped.
        expect(result.pushed).toBe(0)
    })

    it("throws when no token is configured", async () => {
        const { runAniListSync } = await import("./anilist")
        getAniListConfigMock.mockResolvedValue({ autoSync: false })
        await expect(runAniListSync()).rejects.toThrow(/token/i)
    })

    it("adds an unread cached title as PLANNING only when membership sync is on", async () => {
        const { runAniListSync } = await import("./anilist")
        getAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: true })
        await db.manga.put(makeManga({ id: "u1", anilistId: 55 })) // unread, cached id
        getMediaListEntryIdMock.mockResolvedValue(undefined) // not on the list yet

        const result = await runAniListSync()

        expect(saveMediaStatusMock).toHaveBeenCalledWith("t", 55, "PLANNING")
        expect(result.added).toBe(1)
    })

    it("does not re-add an unread title that is already on the list", async () => {
        const { runAniListSync } = await import("./anilist")
        getAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: true })
        await db.manga.put(makeManga({ id: "u1", anilistId: 55 }))
        getMediaListEntryIdMock.mockResolvedValue(9001) // already has an entry

        const result = await runAniListSync()

        expect(saveMediaStatusMock).not.toHaveBeenCalled()
        expect(result.added).toBe(0)
    })
})

describe("removeFromAniList", () => {
    it("deletes the list entry when membership sync is on", async () => {
        const { removeFromAniList } = await import("./anilist")
        getAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: true })
        getMediaListEntryIdMock.mockResolvedValue(4242)

        await removeFromAniList(55)

        expect(deleteMediaListEntryMock).toHaveBeenCalledWith("t", 4242)
    })

    it("is a no-op when membership sync is off or the id is unknown", async () => {
        const { removeFromAniList } = await import("./anilist")
        getAniListConfigMock.mockResolvedValue({ token: "t", autoSync: false, syncMembership: false })
        await removeFromAniList(55)
        await removeFromAniList(undefined)
        expect(getMediaListEntryIdMock).not.toHaveBeenCalled()
        expect(deleteMediaListEntryMock).not.toHaveBeenCalled()
    })
})
