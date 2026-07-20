import "fake-indexeddb/auto"
import Dexie from "dexie"
import { beforeEach, describe, expect, it } from "vitest"

// Simulates a real cross-version extension update: seed the database at the exact
// v6 schema that shipped in 0.11.0, then open the current AmrDatabase (which runs the
// v7/v8/v9 upgrades) and assert the library survives. This is the automated stand-in
// for "install 0.11.0, add titles, update to a newer build, check nothing vanished" -
// it runs in CI on every commit so an upgrade that drops user data fails the build
// instead of only surfacing on a real Firefox profile.
//
// Caveat: fake-indexeddb is more permissive than Firefox about when a versionchange
// transaction auto-commits, so this catches a logically destructive migration but
// cannot fully reproduce Firefox's stricter transaction timing. A real Firefox install
// is still the final check.

const V6_STORES = {
    manga: "id, normalizedTitle, sourceId, addedAt, updatedAt",
    sourceLinks: "mangaId, sourceId, sourceMangaId, updatedAt",
    chapters: "id, mangaId, sourceId, sortKey",
    progress: "chapterId, mangaId, updatedAt, completed",
    historyEvents: "++id, mangaId, chapterId, type, occurredAt",
    downloads: "chapterId, mangaId, downloadedAt",
    covers: "mangaId",
    pageBookmarks: "id, mangaId, chapterId, addedAt",
    analyticsEvents: "++id, event, ts, sourceId"
}

// A 1x1 PNG as a data: URI - exercises the v8 cover-migration path.
const DATA_URI_COVER =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"

async function seedLegacyV6Database(): Promise<void> {
    const legacy = new Dexie("all-mangas-reader")
    legacy.version(6).stores(V6_STORES)
    await legacy.open()
    await legacy.table("manga").bulkPut([
        {
            id: "src:manga:kept-1",
            title: "Kept Title",
            normalizedTitle: "kept title",
            authors: ["Author"],
            status: "ongoing",
            coverUrl: DATA_URI_COVER,
            addedAt: 1,
            updatedAt: 1
        },
        {
            id: "src:manga:kept-2",
            title: "Second Title",
            normalizedTitle: "second title",
            authors: [],
            status: "ongoing",
            addedAt: 2,
            updatedAt: 2
        }
    ])
    await legacy.table("chapters").bulkPut([
        {
            id: "src:chapter:kept-1:1",
            mangaId: "src:manga:kept-1",
            sourceId: "src",
            title: "Chapter 1",
            sortKey: 1,
            url: "https://example.test/kept-1/1"
        },
        {
            id: "src:chapter:kept-1:2",
            mangaId: "src:manga:kept-1",
            sourceId: "src",
            title: "Chapter 2",
            sortKey: 2,
            url: "https://example.test/kept-1/2"
        }
    ])
    await legacy.table("progress").put({
        chapterId: "src:chapter:kept-1:1",
        mangaId: "src:manga:kept-1",
        pageIndex: 4,
        pageCount: 12,
        completed: false,
        updatedAt: 1
    })
    await legacy.table("historyEvents").add({
        mangaId: "src:manga:kept-1",
        chapterId: "src:chapter:kept-1:1",
        type: "completed",
        occurredAt: 1
    })
    legacy.close()
}

describe("cross-version upgrade from the 0.11.0 (v6) schema", () => {
    beforeEach(async () => {
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase("all-mangas-reader")
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () => resolve()
        })
    })

    it("preserves manga, chapters, progress, and history across the v7/v8/v9 upgrades", async () => {
        await seedLegacyV6Database()

        // Import after the legacy DB exists so the singleton opens onto it and upgrades.
        const { db } = await import("./database")
        await db.open()

        expect(await db.manga.count()).toBe(2)
        expect((await db.manga.get("src:manga:kept-1"))?.title).toBe("Kept Title")
        expect((await db.manga.get("src:manga:kept-2"))?.title).toBe("Second Title")
        expect(await db.chapters.where("mangaId").equals("src:manga:kept-1").count()).toBe(2)
        expect((await db.progress.get("src:chapter:kept-1:1"))?.pageIndex).toBe(4)
        expect(await db.historyEvents.count()).toBe(1)

        // v8 moved the inlined base64 cover into the covers table and cleared the data: URI.
        expect((await db.manga.get("src:manga:kept-1"))?.coverUrl).toBeUndefined()
        expect(await db.covers.get("src:manga:kept-1")).toBeTruthy()

        db.close()
    })
})
