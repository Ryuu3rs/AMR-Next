import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, ReadingProgress } from "@amr/contracts"
import { beforeEach, describe, expect, it } from "vitest"
import {
    db,
    exportDatabase,
    importDatabase,
    applyUpdateCheckResult,
    saveProgress,
    fixupDanglingChapterIds,
    mergeMangaRecords,
    type LibraryManga
} from "./database"

function manga(o: Partial<LibraryManga> = {}): LibraryManga {
    const base: MangaRecord = {
        id: o.id ?? "mangadex:manga:x",
        title: "X",
        normalizedTitle: "x",
        authors: [],
        status: "ongoing",
        addedAt: 1,
        updatedAt: 1
    }
    return { ...base, sourceId: "mangadex", sourceUrl: "https://x/c/1", ...o }
}
function chapter(id: string, mangaId: string, sortKey: number): ChapterRecord {
    return { id, mangaId, sourceId: "mangadex", title: `Ch ${sortKey}`, url: `https://x/${id}`, sortKey }
}

beforeEach(async () => {
    await Promise.all([
        db.manga.clear(),
        db.chapters.clear(),
        db.progress.clear(),
        db.historyEvents.clear(),
        db.sourceLinks.clear()
    ])
})

describe("bughunt full-codebase regressions (database)", () => {
    it("#2 import does not duplicate history events on re-import", async () => {
        await db.manga.put(manga({ id: "m1" }))
        await db.historyEvents.add({ mangaId: "m1", chapterId: "m1:c1", type: "completed", occurredAt: 100 })
        const envelope = await exportDatabase()

        await importDatabase(envelope)
        await importDatabase(envelope)

        expect(await db.historyEvents.count()).toBe(1)
    })

    it("#5 import never regresses a completed chapter to incomplete", async () => {
        await db.manga.put(manga({ id: "m1" }))
        await db.progress.put({
            chapterId: "m1:c1",
            mangaId: "m1",
            pageIndex: 5,
            pageCount: 10,
            completed: true,
            updatedAt: 100
        })
        const envelope = (await exportDatabase()) as { data: { progress: ReadingProgress[] } }
        // A newer import that reopened but didn't re-finish the chapter.
        envelope.data.progress = [
            { chapterId: "m1:c1", mangaId: "m1", pageIndex: 1, pageCount: 10, completed: false, updatedAt: 200 }
        ]

        await importDatabase(envelope)

        expect((await db.progress.get("m1:c1"))?.completed).toBe(true)
    })

    it("#7 import merge keeps read number and id in lockstep", async () => {
        await db.manga.put(manga({ id: "m1", lastReadChapterNumber: 20, lastReadChapterId: "m1:c20" }))
        const envelope = (await exportDatabase()) as { data: { manga: LibraryManga[] } }
        envelope.data.manga = [
            { ...envelope.data.manga[0]!, lastReadChapterNumber: 10, lastReadChapterId: "m1:c10", updatedAt: 9999 }
        ]

        await importDatabase(envelope, { m1: "merge" })

        const stored = await db.manga.get("m1")
        expect(stored?.lastReadChapterNumber).toBe(20)
        expect(stored?.lastReadChapterId).toBe("m1:c20") // not the imported c10
    })

    it("#6 applyUpdateCheckResult does not orphan chapters for a removed manga", async () => {
        // manga NOT in the library (removed mid-fetch)
        await applyUpdateCheckResult({
            mangaId: "gone",
            chapters: [chapter("gone:c1", "gone", 1)],
            latest: chapter("gone:c1", "gone", 1),
            previousLatestChapterId: undefined,
            previousLatestChapterNumber: undefined
        })
        expect(await db.chapters.count()).toBe(0)
    })

    it("#10 saveProgress does not write orphans for a removed manga", async () => {
        await saveProgress({
            chapterId: "gone:c1",
            mangaId: "gone",
            pageIndex: 0,
            pageCount: 5,
            completed: true,
            updatedAt: 1
        })
        expect(await db.progress.count()).toBe(0)
        expect(await db.historyEvents.count()).toBe(0)
    })

    it("#9 fixupDanglingChapterIds repoints to the highest NUMBERED chapter, not an unnumbered one", async () => {
        await db.manga.put(manga({ id: "m1", lastReadChapterId: "m1:gone" })) // dangling
        const real = chapter("m1:c2", "m1", 2)
        const extra = chapter("m1:extra", "m1", Number.POSITIVE_INFINITY)
        await db.chapters.bulkPut([real, extra])

        await fixupDanglingChapterIds("m1", [real, extra], [real, extra])

        expect((await db.manga.get("m1"))?.lastReadChapterId).toBe("m1:c2")
    })

    it("#8 same-source merge does not leave the id pointing below the advanced number", async () => {
        await db.manga.put(manga({ id: "primary", latestChapterNumber: 5, latestChapterId: "primary:c5" }))
        await db.manga.put(manga({ id: "loser", sourceId: "mangadex", latestChapterNumber: 12 })) // no id

        const merged = await mergeMangaRecords("primary", ["loser"])

        expect(merged.latestChapterNumber).toBe(12)
        expect(merged.latestChapterId).not.toBe("primary:c5")
    })
})
