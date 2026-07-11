import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, SourceLinkRecord } from "@amr/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../database"
import type { LibraryManga } from "../database"

const { listMangaChaptersMock } = vi.hoisted(() => ({
    listMangaChaptersMock: vi.fn()
}))

vi.mock("../sources", () => ({
    listMangaChapters: listMangaChaptersMock,
    checkSourcePermission: vi.fn(),
    getMangaChapters: vi.fn(),
    resolveGenresFor: vi.fn(),
    searchManga: vi.fn()
}))

// Minimal in-memory stand-in for browser.storage.local — a plain Map-backed
// get/set/remove is enough for these tests; no existing helper covers this
// (settings.ts/background.ts use the real WXT-injected `browser` global at
// runtime, which vitest never provides).
function createStorageLocalStub() {
    const store = new Map<string, unknown>()
    return {
        store,
        get: vi.fn(async (key?: string | string[] | Record<string, unknown> | null) => {
            if (key == null) return Object.fromEntries(store)
            const keys = typeof key === "string" ? [key] : Array.isArray(key) ? key : Object.keys(key)
            const result: Record<string, unknown> = {}
            for (const k of keys) if (store.has(k)) result[k] = store.get(k)
            return result
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v)
        }),
        remove: vi.fn(async (key: string | string[]) => {
            const keys = typeof key === "string" ? [key] : key
            for (const k of keys) store.delete(k)
        }),
        clear: vi.fn(async () => store.clear())
    }
}

let storageLocal: ReturnType<typeof createStorageLocalStub>

beforeEach(async () => {
    await Promise.all([db.manga.clear(), db.sourceLinks.clear(), db.chapters.clear()])
    storageLocal = createStorageLocalStub()
    // @ts-expect-error -- test-only global shim; WXT injects the real `browser`
    // global at build time, but vitest runs modules directly with no polyfill.
    globalThis.browser = {
        storage: { local: storageLocal },
        runtime: { getManifest: () => ({ version: "1.0.0" }) }
    }
    listMangaChaptersMock.mockReset()
})

afterEach(() => {
    vi.restoreAllMocks()
})

function makeManga(overrides: Partial<LibraryManga> = {}): LibraryManga {
    const id = overrides.id ?? `src:manga:${Math.random().toString(36).slice(2)}`
    const base: MangaRecord = {
        id,
        title: "Test Manga",
        normalizedTitle: "test manga",
        authors: [],
        status: "ongoing",
        addedAt: 1,
        updatedAt: 1
    }
    return {
        ...base,
        sourceId: "mangadex",
        sourceUrl: "https://mangadex.org/chapter/1",
        ...overrides
    }
}

function makeLink(mangaId: string, sourceId = "mangadex"): SourceLinkRecord {
    return {
        mangaId,
        sourceId,
        sourceMangaId: "abc",
        url: "https://mangadex.org/title/abc",
        addedAt: 1,
        updatedAt: 1
    }
}

describe("checkUpdates", () => {
    it("skips manualTracking, onHold, and manga without a sourceLink", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manual = makeManga({ id: "m-manual", manualTracking: true })
        const onHold = makeManga({ id: "m-hold", onHold: true })
        const noLink = makeManga({ id: "m-nolink" })
        const normal = makeManga({ id: "m-normal" })

        await db.manga.bulkPut([manual, onHold, noLink, normal])
        await db.sourceLinks.bulkPut([makeLink(manual.id), makeLink(onHold.id), makeLink(normal.id)])
        // Intentionally no sourceLink for noLink.

        listMangaChaptersMock.mockResolvedValue([])

        await checkUpdates()

        expect(listMangaChaptersMock).toHaveBeenCalledTimes(1)
        expect(listMangaChaptersMock.mock.calls[0]?.[0]?.id).toBe("m-normal")
    })
})

describe("checkUpdates storage writes", () => {
    it("does not write updateStatus for a scoped (sourceId) check but does for a full check", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", sourceId: "mangadex" })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        listMangaChaptersMock.mockResolvedValue([])

        await checkUpdates("mangadex")
        expect(storageLocal.store.has("updateStatus")).toBe(false)

        await checkUpdates()
        expect(storageLocal.store.has("updateStatus")).toBe(true)
    })
})

describe("checkUpdates concurrency guard", () => {
    it("a second concurrent call returns immediately instead of running the loop twice", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1" })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))

        let resolveFirst: (() => void) | undefined
        listMangaChaptersMock.mockImplementation(
            () =>
                new Promise(resolve => {
                    resolveFirst = () => resolve([])
                })
        )

        const first = checkUpdates()
        // Let the first call reach the in-flight fetch before starting the second.
        await new Promise(r => setTimeout(r, 0))

        const second = checkUpdates()
        const secondResult = await second
        expect(secondResult).toBeUndefined()
        expect(listMangaChaptersMock).toHaveBeenCalledTimes(1)

        resolveFirst?.()
        await first
    })
})

describe("updates:new-chapters handler", () => {
    it("returns chapters newer than lastReadChapterNumber, falling back to the last 3", async () => {
        const { updatesSourcesHandlers } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", lastReadChapterNumber: 3 })
        await db.manga.put(manga)

        const chapters: ChapterRecord[] = [1, 2, 3, 4, 5].map(n => ({
            id: `ch-${n}`,
            mangaId: manga.id,
            sourceId: "mangadex",
            title: `Chapter ${n}`,
            url: `https://mangadex.org/chapter/${n}`,
            sortKey: n
        }))
        await db.chapters.bulkPut(chapters)

        const handler = updatesSourcesHandlers["updates:new-chapters"]
        if (!handler) throw new Error("handler missing")
        const result = (await handler({ type: "updates:new-chapters", mangaId: manga.id }, { sender: {} })) as Array<{
            sortKey: number
        }>

        expect(result.map(c => c.sortKey)).toEqual([4, 5])
    })

    it("falls back to the last 3 chapters when none are newer than lastReadChapterNumber", async () => {
        const { updatesSourcesHandlers } = await import("./updates-sources")

        const manga = makeManga({ id: "m-2", lastReadChapterNumber: 10 })
        await db.manga.put(manga)

        const chapters: ChapterRecord[] = [1, 2, 3, 4, 5].map(n => ({
            id: `ch2-${n}`,
            mangaId: manga.id,
            sourceId: "mangadex",
            title: `Chapter ${n}`,
            url: `https://mangadex.org/chapter/${n}`,
            sortKey: n
        }))
        await db.chapters.bulkPut(chapters)

        const handler = updatesSourcesHandlers["updates:new-chapters"]
        if (!handler) throw new Error("handler missing")
        const result = (await handler({ type: "updates:new-chapters", mangaId: manga.id }, { sender: {} })) as Array<{
            sortKey: number
        }>

        expect(result.map(c => c.sortKey)).toEqual([3, 4, 5])
    })
})

describe("checkExtensionUpdate", () => {
    it("clears a stale extensionUpdate value before fetching fresh data when forced", async () => {
        const { checkExtensionUpdate } = await import("./updates-sources")

        await storageLocal.set({
            extensionUpdate: {
                available: false,
                latestVersion: "0.1.0",
                releaseUrl: "https://example.com/old",
                checkedAt: 1
            }
        })

        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                tag_name: "v2.0.0",
                html_url: "https://github.com/Ryuu3rs/AMR-Next/releases/tag/v2.0.0"
            })
        }))
        vi.stubGlobal("fetch", fetchMock)

        await checkExtensionUpdate(true)

        expect(storageLocal.remove).toHaveBeenCalledWith("extensionUpdate")
        const stored = storageLocal.store.get("extensionUpdate") as { latestVersion: string; available: boolean }
        expect(stored.latestVersion).toBe("2.0.0")
        expect(stored.available).toBe(true)

        vi.unstubAllGlobals()
    })
})
