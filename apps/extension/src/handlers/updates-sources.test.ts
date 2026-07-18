import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, SourceLinkRecord } from "@amr/contracts"
import { SourceRequestError } from "@amr/source-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../database"
import type { LibraryManga } from "../database"

const { listMangaChaptersMock, resolveGenresForMock, publishLiveMock } = vi.hoisted(() => ({
    listMangaChaptersMock: vi.fn(),
    resolveGenresForMock: vi.fn(),
    publishLiveMock: vi.fn()
}))

vi.mock("../sources", () => ({
    listMangaChapters: listMangaChaptersMock,
    checkSourcePermission: vi.fn(),
    getMangaChapters: vi.fn(),
    resolveGenresFor: resolveGenresForMock,
    searchManga: vi.fn()
}))

vi.mock("../live", () => ({
    publishLive: publishLiveMock
}))

// Minimal in-memory stand-in for browser.storage.local - a plain Map-backed
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
    resolveGenresForMock.mockReset()
    publishLiveMock.mockReset()
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

describe("checkUpdates per-title error handling", () => {
    // kagane.ts's listChapters() now propagates a Cloudflare-blocked series-page
    // fetch as a real SourceRequestError instead of swallowing it to []. This
    // confirms checkUpdates's per-title try/catch still handles that correctly:
    // the title is counted as failed and recorded in the errors list, and the
    // loop moves on to the rest of the library rather than throwing out of
    // checkUpdates entirely.
    it("records a thrown 403 (e.g. kagane's Cloudflare-gated series page) as a per-title failure without aborting the rest of the run", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const blocked = makeManga({ id: "m-blocked", sourceId: "kagane" })
        const normal = makeManga({ id: "m-normal" })
        await db.manga.bulkPut([blocked, normal])
        await db.sourceLinks.bulkPut([makeLink(blocked.id, "kagane"), makeLink(normal.id)])

        listMangaChaptersMock.mockImplementation(async (item: LibraryManga) => {
            if (item.id === "m-blocked") throw new SourceRequestError("Request failed with status 403", 403)
            return []
        })

        await checkUpdates()

        expect(listMangaChaptersMock).toHaveBeenCalledTimes(2)
        const status = storageLocal.store.get("updateStatus") as {
            failed: number
            checked: number
            errors: Array<{ mangaId: string; title: string; message: string }>
        }
        expect(status.failed).toBe(1)
        expect(status.checked).toBe(1)
        expect(status.errors).toContainEqual(
            expect.objectContaining({ mangaId: "m-blocked", message: "Request failed with status 403" })
        )
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

describe("checkUpdates live-bus publishing", () => {
    it("publishes chapters+library for a title whose latest chapter changed", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", latestChapterId: "old-chapter" })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        const chapters: ChapterRecord[] = [
            {
                id: "old-chapter",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Ch 1",
                url: "https://x/1",
                sortKey: 1
            },
            {
                id: "new-chapter",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Ch 2",
                url: "https://x/2",
                sortKey: 2
            }
        ]
        listMangaChaptersMock.mockResolvedValue(chapters)

        await checkUpdates()

        expect(publishLiveMock).toHaveBeenCalledWith(["chapters", "library"], [manga.id])
    })

    it("does not publish for a title whose latest chapter did not change", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", latestChapterId: "only-chapter" })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        const chapters: ChapterRecord[] = [
            {
                id: "only-chapter",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Ch 1",
                url: "https://x/1",
                sortKey: 1
            }
        ]
        listMangaChaptersMock.mockResolvedValue(chapters)

        await checkUpdates()

        expect(publishLiveMock).not.toHaveBeenCalled()
    })
})

describe("checkUpdates latestChapterNumber advance gate", () => {
    it("re-points a foreign latestChapterId without counting it as updated when the number did not advance", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", latestChapterId: "webtoons:ch22", latestChapterNumber: 22 })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        const chapters: ChapterRecord[] = [
            {
                id: "mangadex:ch20",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Chapter 20",
                url: "https://mangadex.org/chapter/20",
                sortKey: 20
            }
        ]
        listMangaChaptersMock.mockResolvedValue(chapters)

        await checkUpdates()

        const updatedManga = await db.manga.get(manga.id)
        expect(updatedManga?.latestChapterId).toBe("mangadex:ch20")
        expect(updatedManga?.latestChapterNumber).toBe(20)
        expect(publishLiveMock).not.toHaveBeenCalled()
        const status = storageLocal.store.get("updateStatus") as { updated: number }
        expect(status.updated).toBe(0)
    })

    it("counts and publishes when the id changed and the number advanced", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", latestChapterId: "old", latestChapterNumber: 20 })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        const chapters: ChapterRecord[] = [
            {
                id: "new",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Chapter 21",
                url: "https://mangadex.org/chapter/21",
                sortKey: 21
            }
        ]
        listMangaChaptersMock.mockResolvedValue(chapters)

        await checkUpdates()

        const status = storageLocal.store.get("updateStatus") as { updated: number }
        expect(status.updated).toBe(1)
        expect(publishLiveMock).toHaveBeenCalledWith(["chapters", "library"], [manga.id])
    })

    it("keeps counting an id change whose latest has a non-finite sortKey", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1", latestChapterId: "old", latestChapterNumber: 20 })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        // IndexedDB keys (chapters is indexed on sortKey) can't be NaN, so use
        // Infinity to get a realistic non-finite sortKey - Number.isFinite(Infinity)
        // is false, which is what the guard actually checks.
        const chapters: ChapterRecord[] = [
            {
                id: "new",
                mangaId: manga.id,
                sourceId: "mangadex",
                title: "Chapter ?",
                url: "https://mangadex.org/chapter/new",
                sortKey: Infinity
            }
        ]
        listMangaChaptersMock.mockResolvedValue(chapters)

        await checkUpdates()

        const status = storageLocal.store.get("updateStatus") as { updated: number }
        expect(status.updated).toBe(1)
        const updatedManga = await db.manga.get(manga.id)
        expect(updatedManga?.latestChapterId).toBe("new")
        expect(updatedManga?.latestChapterNumber).toBe(20)
    })
})

describe("backfillMangaGenres live-bus publishing", () => {
    it("publishes library once after the whole backfill loop, not per title", async () => {
        const { backfillMangaGenres } = await import("./updates-sources")

        const mangaA = makeManga({ id: "m-a", mangaUrl: "https://mangadex.org/title/a" })
        const mangaB = makeManga({ id: "m-b", mangaUrl: "https://mangadex.org/title/b" })
        await db.manga.bulkPut([mangaA, mangaB])
        resolveGenresForMock.mockResolvedValue(["Action"])

        await backfillMangaGenres()

        expect(publishLiveMock).toHaveBeenCalledTimes(1)
        expect(publishLiveMock).toHaveBeenCalledWith(["library"])
    })

    it("does not publish when nothing needed backfilling", async () => {
        const { backfillMangaGenres } = await import("./updates-sources")

        await backfillMangaGenres()

        expect(publishLiveMock).not.toHaveBeenCalled()
    })
})

describe("checkUpdates progress writes", () => {
    it("writes incremental updateProgress and marks it done when the loop finishes", async () => {
        const { checkUpdates } = await import("./updates-sources")

        const mangaA = makeManga({ id: "m-a", title: "Manga A" })
        const mangaB = makeManga({ id: "m-b", title: "Manga B" })
        await db.manga.bulkPut([mangaA, mangaB])
        await db.sourceLinks.bulkPut([makeLink(mangaA.id), makeLink(mangaB.id)])
        listMangaChaptersMock.mockResolvedValue([])

        await checkUpdates()

        const finalProgress = storageLocal.store.get("updateProgress") as {
            running: boolean
            done: number
            total: number
        }
        expect(finalProgress.running).toBe(false)
        expect(finalProgress.done).toBe(2)
        expect(finalProgress.total).toBe(2)
    })

    it("records a failure state instead of throwing when loading the library fails", async () => {
        const { checkUpdates } = await import("./updates-sources")

        vi.spyOn(db.manga, "toArray").mockRejectedValueOnce(new Error("db exploded"))

        await expect(checkUpdates()).resolves.toBeUndefined()

        const finalProgress = storageLocal.store.get("updateProgress") as { running: boolean }
        expect(finalProgress.running).toBe(false)
        const status = storageLocal.store.get("updateStatus") as {
            errors: Array<{ message: string }>
        }
        expect(status.errors[0]?.message).toBe("db exploded")
    })
})

describe("updates:check handler", () => {
    it("acks immediately without awaiting the full check, and reports alreadyRunning on a concurrent call", async () => {
        const { updatesSourcesHandlers } = await import("./updates-sources")

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

        const handler = updatesSourcesHandlers["updates:check"]
        if (!handler) throw new Error("handler missing")

        const ack = (await handler({ type: "updates:check" }, { sender: {} })) as { started: boolean }
        expect(ack.started).toBe(true)

        await vi.waitFor(() => expect(listMangaChaptersMock).toHaveBeenCalledTimes(1))

        const secondAck = (await handler({ type: "updates:check" }, { sender: {} })) as {
            started: boolean
            alreadyRunning?: boolean
        }
        expect(secondAck.started).toBe(false)
        expect(secondAck.alreadyRunning).toBe(true)

        resolveFirst?.()
        await vi.waitFor(() => expect(storageLocal.store.get("updateStatus")).toBeTruthy())
    })
})

describe("updates:check handler stale-progress self-healing", () => {
    it("clears a stuck updateProgress from a crashed check and proceeds with a new check", async () => {
        const { updatesSourcesHandlers } = await import("./updates-sources")

        const manga = makeManga({ id: "m-1" })
        await db.manga.put(manga)
        await db.sourceLinks.put(makeLink(manga.id))
        listMangaChaptersMock.mockResolvedValue([])

        // Simulate a service worker that was killed mid-loop on a previous check:
        // running: true with a startedAt well past the staleness threshold, and
        // nothing left to ever flip it back to false.
        const staleStartedAt = Date.now() - 20 * 60 * 1000
        await storageLocal.set({
            updateProgress: { running: true, done: 0, total: 0, startedAt: staleStartedAt }
        })

        const handler = updatesSourcesHandlers["updates:check"]
        if (!handler) throw new Error("handler missing")

        const ack = (await handler({ type: "updates:check" }, { sender: {} })) as {
            started: boolean
            alreadyRunning?: boolean
        }

        expect(ack.started).toBe(true)
        expect(ack.alreadyRunning).toBeUndefined()

        await vi.waitFor(() => expect(listMangaChaptersMock).toHaveBeenCalledTimes(1))
        await vi.waitFor(
            () => {
                const progress = storageLocal.store.get("updateProgress") as { running: boolean; startedAt: number }
                expect(progress.running).toBe(false)
            },
            { timeout: 2000 }
        )
    })

    it("treats a recent running updateProgress as still active and reports alreadyRunning", async () => {
        const { updatesSourcesHandlers } = await import("./updates-sources")

        // Well within the staleness threshold - a check plausibly still in progress.
        const recentStartedAt = Date.now() - 30 * 1000
        await storageLocal.set({
            updateProgress: { running: true, done: 0, total: 5, startedAt: recentStartedAt }
        })

        const handler = updatesSourcesHandlers["updates:check"]
        if (!handler) throw new Error("handler missing")

        const ack = (await handler({ type: "updates:check" }, { sender: {} })) as {
            started: boolean
            alreadyRunning?: boolean
        }

        expect(ack.started).toBe(false)
        expect(ack.alreadyRunning).toBe(true)
        // The recent progress record must be left untouched, not overwritten.
        expect(listMangaChaptersMock).not.toHaveBeenCalled()
        const progress = storageLocal.store.get("updateProgress") as { running: boolean; startedAt: number }
        expect(progress.running).toBe(true)
        expect(progress.startedAt).toBe(recentStartedAt)
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
        // Poll rather than a fixed tick - how many microtasks the DB reads take
        // before reaching listMangaChapters varies (much slower under coverage
        // instrumentation), so a single setTimeout(0) is not reliably enough.
        await vi.waitFor(() => expect(listMangaChaptersMock).toHaveBeenCalledTimes(1))

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
