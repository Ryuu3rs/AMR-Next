import "fake-indexeddb/auto"
import type { ChapterRecord, MangaRecord, ReadingProgress, SourceLinkRecord } from "@amr/contracts"
import type { SourceChapter } from "@amr/source-sdk"
import { beforeEach, describe, expect, it } from "vitest"
import {
    createBackup,
    db,
    exportDatabase,
    getLocalStats,
    importDatabase,
    listBackups,
    rekeyManga,
    removeManga,
    restoreBackup,
    saveProgress,
    saveResolvedChapter,
    seedDatabase,
    trackExternalChapter
} from "./database"
import type { LibraryManga, PageBookmark } from "./database"
import { exportEnvelopeSchema } from "./schema"

const manga: MangaRecord = {
    id: "mangadex:manga:abc",
    title: "Test Manga",
    normalizedTitle: "test manga",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1
}

const chapter: ChapterRecord = {
    id: "mangadex:chapter:1",
    mangaId: manga.id,
    sourceId: "mangadex",
    title: "Chapter 5",
    url: "https://mangadex.org/chapter/1",
    sortKey: 5
}

const sourceLink: SourceLinkRecord = {
    mangaId: manga.id,
    sourceId: "mangadex",
    url: "https://mangadex.org/title/abc",
    addedAt: 1,
    updatedAt: 1
}

beforeEach(async () => {
    await Promise.all([
        db.manga.clear(),
        db.sourceLinks.clear(),
        db.chapters.clear(),
        db.progress.clear(),
        db.historyEvents.clear(),
        db.downloads.clear(),
        db.covers.clear(),
        db.pageBookmarks.clear(),
        db.backups.clear()
    ])
})

describe("saveResolvedChapter", () => {
    it("persists manga, chapter, link, and the latest chapter number", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        const stored = await db.manga.get(manga.id)
        expect(stored?.latestChapterId).toBe(chapter.id)
        expect(stored?.latestChapterNumber).toBe(5)
        expect(await db.chapters.get(chapter.id)).toBeDefined()
        expect(await db.sourceLinks.get(manga.id)).toBeDefined()
    })
})

describe("saveProgress", () => {
    it("records read chapter number + lastReadAt and emits history events", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        const progress: ReadingProgress = {
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_700_000_000_000
        }
        await saveProgress(progress)

        const stored = await db.manga.get(manga.id)
        expect(stored?.lastReadChapterNumber).toBe(5)
        expect(stored?.lastReadAt).toBe(progress.updatedAt)

        const events = await db.historyEvents.toArray()
        expect(events.map(e => e.type).sort()).toEqual(["completed", "started"])
    })
})

describe("export / import round-trip", () => {
    it("preserves extended library fields (rating, categories, chapter numbers)", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { rating: 4, categories: ["fav", "action"], lastReadChapterNumber: 3 })

        const envelope = await exportDatabase()
        await db.manga.clear()
        await db.chapters.clear()
        await db.sourceLinks.clear()

        const result = await importDatabase(envelope)
        expect(result.manga).toBe(1)
        const restored = await db.manga.get(manga.id)
        expect(restored?.rating).toBe(4)
        expect(restored?.categories).toEqual(["fav", "action"])
        expect(restored?.lastReadChapterNumber).toBe(3)
        expect(restored?.latestChapterNumber).toBe(5)
    })

    it("rejects a malformed envelope", async () => {
        await expect(importDatabase({ format: "wrong", version: 9, data: {} })).rejects.toThrow(/invalid/i)
    })

    it("accepts legacy envelope with missing optional tables", async () => {
        const legacyEnvelope = {
            format: "all-mangas-reader",
            version: 1,
            data: {
                manga: [
                    {
                        id: "legacy-1",
                        title: "Legacy Manga",
                        normalizedTitle: "legacy manga",
                        authors: [],
                        status: "ongoing",
                        sourceId: "mangadex",
                        sourceUrl: "https://mangadex.org/chapter/x",
                        sourceMangaId: "legacy-src-id",
                        mangaUrl: "https://mangadex.org/title/legacy-id",
                        addedAt: Date.now(),
                        updatedAt: Date.now()
                    }
                ]
                // sourceLinks, chapters, progress, historyEvents intentionally omitted
            }
        }

        const result = await importDatabase(legacyEnvelope)
        expect(result.manga).toBe(1)
        expect(result.chapters).toBe(0)

        const restored = await db.manga.get("legacy-1")
        expect(restored?.title).toBe("Legacy Manga")
    })
})

describe("seedDatabase", () => {
    it("is idempotent - re-seeding does not duplicate", async () => {
        await seedDatabase()
        const first = await db.manga.where("id").startsWith("seed-").count()
        await seedDatabase()
        const second = await db.manga.where("id").startsWith("seed-").count()
        expect(second).toBe(first)
        expect(first).toBeGreaterThan(0)
    })
})

describe("getLocalStats", () => {
    it("computes streaks from history days", async () => {
        const day = 86_400_000
        const base = Date.parse("2026-06-10T12:00:00Z")
        await db.historyEvents.bulkAdd([
            { mangaId: manga.id, chapterId: "c1", type: "completed", occurredAt: base },
            { mangaId: manga.id, chapterId: "c2", type: "completed", occurredAt: base + day },
            { mangaId: manga.id, chapterId: "c3", type: "completed", occurredAt: base + 2 * day }
        ])
        const stats = await getLocalStats()
        expect(stats.readingDays).toBe(3)
        expect(stats.longestStreak).toBe(3)
    })
})

describe("removeManga", () => {
    it("cascades delete to chapters, progress, history events, and source link", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveProgress({
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_700_000_000_000
        })

        await removeManga(manga.id)

        expect(await db.manga.get(manga.id)).toBeUndefined()
        expect(await db.sourceLinks.get(manga.id)).toBeUndefined()
        expect(await db.chapters.where("mangaId").equals(manga.id).count()).toBe(0)
        expect(await db.progress.where("mangaId").equals(manga.id).count()).toBe(0)
        expect(await db.historyEvents.where("mangaId").equals(manga.id).count()).toBe(0)
    })

    it("does not remove other manga's data", async () => {
        const manga2: MangaRecord = {
            ...manga,
            id: "mangadex:manga:xyz",
            title: "Other Manga",
            normalizedTitle: "other manga"
        }
        const chapter2: ChapterRecord = { ...chapter, id: "mangadex:chapter:2", mangaId: manga2.id }
        const sourceLink2: SourceLinkRecord = { ...sourceLink, mangaId: manga2.id }

        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveResolvedChapter({ manga: manga2, chapter: chapter2, sourceLink: sourceLink2 })

        await removeManga(manga.id)

        expect(await db.manga.get(manga2.id)).toBeDefined()
        expect(await db.chapters.where("mangaId").equals(manga2.id).count()).toBe(1)
        expect(await db.sourceLinks.get(manga2.id)).toBeDefined()
    })
})

describe("export / import integrity", () => {
    it("export→import→export produces identical data", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { rating: 4, categories: ["action"], lastReadChapterNumber: 3 })

        const first = await exportDatabase()

        await db.manga.clear()
        await db.chapters.clear()
        await db.sourceLinks.clear()
        await db.progress.clear()
        await db.historyEvents.clear()

        await importDatabase(first)
        const second = await exportDatabase()

        expect(second.data.manga).toEqual(first.data.manga)
        expect(second.data.chapters).toEqual(first.data.chapters)
        expect(second.data.sourceLinks).toEqual(first.data.sourceLinks)
        expect(second.data.progress).toEqual(first.data.progress)
        expect(second.data.historyEvents).toEqual(first.data.historyEvents)
    })
})

// Bug 5: the tests below are what should have caught Bugs 1 and 2 in the first
// place - a full-fidelity round-trip across every table and every optional field,
// a structural guard against future DB-shape/import-schema drift, and coverage for
// the partial-success import path from Bug 3.
describe("export / import full round-trip (Bug 5)", () => {
    it("preserves every table and every optional manga/chapter field (modulo autoincrement history ids)", async () => {
        const fullManga: LibraryManga = {
            id: "mangadex:manga:full",
            title: "Full Fixture Manga",
            normalizedTitle: "full fixture manga",
            coverUrl: "https://mangadex.org/covers/full.jpg",
            description: "A manga with every optional field set.",
            rating: 5,
            authors: ["Author One", "Author Two"],
            status: "ongoing",
            addedAt: 1_000,
            updatedAt: 2_000,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/chapter/full-1",
            sourceMangaId: "full-src-id",
            mangaUrl: "https://mangadex.org/title/full-src-id",
            latestChapterId: "mangadex:chapter:full-2",
            lastReadChapterId: "mangadex:chapter:full-1",
            latestChapterNumber: 2,
            lastReadChapterNumber: 1,
            lastReadAt: 1_500,
            manualTracking: true,
            categories: ["favorites", "action"],
            nsfw: true,
            notes: "Reread before the next volume drops.",
            genres: ["Action", "Drama"],
            noGapContinuous: true,
            onHold: false,
            readingDirection: "rtl",
            pageFit: "height"
        }
        const fullSourceLink: SourceLinkRecord = {
            mangaId: fullManga.id,
            sourceId: "mangadex",
            url: fullManga.mangaUrl!,
            sourceMangaId: fullManga.sourceMangaId,
            title: fullManga.title,
            language: "en",
            addedAt: 1_000,
            updatedAt: 2_000
        }
        // DB-shaped chapters: every real chapter-write path stores a SourceChapter
        // (ChapterRecord & { sourceChapterId, language }), never a bare ChapterRecord -
        // this is exactly the shape that used to break import (Bug 1).
        const fullChapter1: SourceChapter = {
            id: "mangadex:chapter:full-1",
            mangaId: fullManga.id,
            sourceId: "mangadex",
            title: "Chapter 1",
            url: "https://mangadex.org/chapter/full-1",
            sortKey: 1,
            chapterNumber: 1,
            volumeNumber: 1,
            publishedAt: 900,
            fetchedAt: 950,
            sourceChapterId: "full-1",
            language: "en"
        }
        const fullChapter2: SourceChapter = {
            ...fullChapter1,
            id: "mangadex:chapter:full-2",
            title: "Chapter 2",
            url: "https://mangadex.org/chapter/full-2",
            sortKey: 2,
            chapterNumber: 2,
            sourceChapterId: "full-2"
        }

        await db.transaction("rw", db.manga, db.sourceLinks, db.chapters, async () => {
            await db.manga.put(fullManga)
            await db.sourceLinks.put(fullSourceLink)
            await db.chapters.bulkPut([fullChapter1, fullChapter2])
        })
        await db.progress.put({
            mangaId: fullManga.id,
            chapterId: fullChapter1.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_400
        })
        await db.historyEvents.bulkAdd([
            { mangaId: fullManga.id, chapterId: fullChapter1.id, type: "started", occurredAt: 1_300 },
            { mangaId: fullManga.id, chapterId: fullChapter1.id, type: "completed", occurredAt: 1_400 }
        ])
        const bookmark: PageBookmark = {
            id: `${fullChapter1.id}:0`,
            mangaId: fullManga.id,
            chapterId: fullChapter1.id,
            pageIndex: 0,
            mangaTitle: fullManga.title,
            chapterTitle: fullChapter1.title,
            chapterUrl: fullChapter1.url,
            addedAt: 1_350
        }
        await db.pageBookmarks.put(bookmark)

        const exported = await exportDatabase()

        await Promise.all([
            db.manga.clear(),
            db.sourceLinks.clear(),
            db.chapters.clear(),
            db.progress.clear(),
            db.historyEvents.clear(),
            db.pageBookmarks.clear()
        ])

        const result = await importDatabase(exported)
        expect(result.skipped).toEqual([])

        const reimported = await exportDatabase()

        expect(reimported.data.manga).toEqual(exported.data.manga)
        expect(reimported.data.sourceLinks).toEqual(exported.data.sourceLinks)
        expect(reimported.data.chapters).toEqual(exported.data.chapters)
        expect(reimported.data.progress).toEqual(exported.data.progress)
        expect(reimported.data.pageBookmarks).toEqual(exported.data.pageBookmarks)
        // historyEvents ids are intentionally NOT preserved on import (see
        // importDatabase's comment on stripping foreign auto-increment ids) - compare
        // modulo id, but still assert both events survived the round-trip.
        expect(reimported.data.historyEvents.map(({ id: _id, ...rest }) => rest)).toEqual(
            exported.data.historyEvents.map(({ id: _id, ...rest }) => rest)
        )
        expect(reimported.data.historyEvents).toHaveLength(2)
    })
})

describe("chapter DB-shape vs import-schema drift guard (Bug 5)", () => {
    it("chapters written through saveResolvedChapter (the real chapter-write path) validate cleanly against the export/import schema", async () => {
        // sourceChapter is typed as the real @amr/source-sdk SourceChapter - if that
        // type ever grows a new required field, this object literal fails to compile,
        // forcing the schema below to be updated in the same change instead of a user
        // discovering the mismatch via a failed import.
        const sourceChapter: SourceChapter = {
            id: "mangadex:chapter:drift-1",
            mangaId: manga.id,
            sourceId: "mangadex",
            title: "Chapter 1",
            url: "https://mangadex.org/chapter/drift-1",
            sortKey: 1,
            sourceChapterId: "drift-1",
            language: "en"
        }
        await saveResolvedChapter({ manga, chapter: sourceChapter, sourceLink })

        const exported = await exportDatabase()
        const parsed = exportEnvelopeSchema.safeParse(exported)
        expect(parsed.success).toBe(true)
    })
})

describe("partial-success import (Bug 3)", () => {
    it("imports valid chapters and reports the invalid one instead of aborting the whole import", async () => {
        const envelope = {
            format: "all-mangas-reader" as const,
            version: 1 as const,
            data: {
                manga: [{ ...manga, sourceId: "mangadex", sourceUrl: "https://mangadex.org/chapter/1" }],
                sourceLinks: [sourceLink],
                chapters: [
                    {
                        id: "mangadex:chapter:1",
                        mangaId: manga.id,
                        sourceId: "mangadex",
                        title: "Chapter 1",
                        url: "https://mangadex.org/chapter/1",
                        sortKey: 1
                    },
                    // Deliberately broken: missing the required `url` field.
                    {
                        id: "mangadex:chapter:2",
                        mangaId: manga.id,
                        sourceId: "mangadex",
                        title: "Chapter 2",
                        sortKey: 2
                    },
                    {
                        id: "mangadex:chapter:3",
                        mangaId: manga.id,
                        sourceId: "mangadex",
                        title: "Chapter 3",
                        url: "https://mangadex.org/chapter/3",
                        sortKey: 3
                    }
                ],
                progress: [],
                historyEvents: [],
                pageBookmarks: []
            }
        }

        const result = await importDatabase(envelope)

        expect(result.manga).toBe(1)
        expect(result.chapters).toBe(2)
        expect(await db.chapters.get("mangadex:chapter:1")).toBeDefined()
        expect(await db.chapters.get("mangadex:chapter:2")).toBeUndefined()
        expect(await db.chapters.get("mangadex:chapter:3")).toBeDefined()

        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0]).toMatchObject({
            table: "chapters",
            index: 1,
            id: "mangadex:chapter:2",
            code: "MISSING_REQUIRED_FIELD"
        })
    })

    it("skips dependents of a manga record that itself failed validation (referential integrity)", async () => {
        const envelope = {
            format: "all-mangas-reader" as const,
            version: 1 as const,
            data: {
                manga: [
                    // Missing required sourceId/sourceUrl - fails libraryMangaSchema.
                    {
                        id: "broken:manga:1",
                        title: "Broken Manga",
                        normalizedTitle: "broken manga",
                        authors: [],
                        status: "ongoing",
                        addedAt: 1,
                        updatedAt: 1
                    }
                ],
                sourceLinks: [],
                chapters: [
                    {
                        id: "broken:chapter:1",
                        mangaId: "broken:manga:1",
                        sourceId: "mangadex",
                        title: "Chapter 1",
                        url: "https://mangadex.org/chapter/1",
                        sortKey: 1
                    }
                ],
                progress: [],
                historyEvents: [],
                pageBookmarks: []
            }
        }

        const result = await importDatabase(envelope)

        expect(result.manga).toBe(0)
        expect(result.chapters).toBe(0)
        expect(result.skipped).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ table: "manga", index: 0, id: "broken:manga:1" }),
                expect.objectContaining({ table: "chapters", index: 0, id: "broken:manga:1", code: "PARENT_SKIPPED" })
            ])
        )
        expect(await db.chapters.get("broken:chapter:1")).toBeUndefined()
    })
})

describe("pre-import backups (Bug 4)", () => {
    it("createBackup snapshots the current library and listBackups returns it without the full envelope", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })

        await createBackup("pre-import")

        const summaries = await listBackups()
        expect(summaries).toHaveLength(1)
        expect(summaries[0]).toMatchObject({ reason: "pre-import" })
        expect(summaries[0]).not.toHaveProperty("envelope")

        const stored = await db.backups.toArray()
        expect(stored[0]?.envelope.data.manga).toHaveLength(1)
    })

    it("prunes to the last 3 backups", async () => {
        for (let i = 0; i < 5; i++) {
            await createBackup("pre-import")
        }
        expect(await db.backups.count()).toBe(3)
    })

    it("restoreBackup re-imports the snapshot and itself snapshots a pre-restore backup first", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await createBackup("pre-import")
        const [backup] = await listBackups()

        // Simulate a bad import wiping the library after the backup was taken.
        await db.manga.clear()
        await db.chapters.clear()
        await db.sourceLinks.clear()

        const result = await restoreBackup(backup!.id)

        expect(result.manga).toBe(1)
        expect(await db.manga.get(manga.id)).toBeDefined()
        // Restoring is itself undoable: it should have snapshotted the (now-empty)
        // pre-restore state before applying the restore.
        expect(await db.backups.count()).toBe(2)
    })

    it("restoreBackup throws for an unknown id", async () => {
        await expect(restoreBackup(999)).rejects.toThrow(/no backup/i)
    })
})

describe("import merge - progress and history", () => {
    it("does not regress a completed chapter when the imported progress record is older", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveProgress({
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 2_000
        })

        const staleEnvelope = {
            format: "all-mangas-reader" as const,
            version: 1 as const,
            data: {
                manga: [],
                sourceLinks: [],
                chapters: [],
                progress: [
                    {
                        mangaId: manga.id,
                        chapterId: chapter.id,
                        pageIndex: 2,
                        pageCount: 10,
                        completed: false,
                        updatedAt: 1_000 // older than what's stored
                    }
                ],
                historyEvents: []
            }
        }

        await importDatabase(staleEnvelope)
        const stored = await db.progress.get(chapter.id)
        expect(stored?.completed).toBe(true)
        expect(stored?.updatedAt).toBe(2_000)
    })

    it("does overwrite when the imported progress record is newer", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveProgress({
            mangaId: manga.id,
            chapterId: chapter.id,
            pageIndex: 2,
            pageCount: 10,
            completed: false,
            updatedAt: 1_000
        })

        await importDatabase({
            format: "all-mangas-reader",
            version: 1,
            data: {
                manga: [],
                sourceLinks: [],
                chapters: [],
                progress: [
                    {
                        mangaId: manga.id,
                        chapterId: chapter.id,
                        pageIndex: 9,
                        pageCount: 10,
                        completed: true,
                        updatedAt: 2_000
                    }
                ],
                historyEvents: []
            }
        })
        const stored = await db.progress.get(chapter.id)
        expect(stored?.completed).toBe(true)
    })

    it("does not let a foreign backup's history event id collide with local history", async () => {
        // Simulate a local history event that happens to occupy auto-increment id 1.
        await db.historyEvents.add({
            mangaId: manga.id,
            chapterId: "local-chapter",
            type: "started",
            occurredAt: 1_000
        })
        const localEvents = await db.historyEvents.toArray()
        expect(localEvents).toHaveLength(1)
        const localId = localEvents[0]!.id!

        // A backup from a different profile whose own auto-increment also started at 1 -
        // importing it must not silently overwrite the unrelated local event above.
        await importDatabase({
            format: "all-mangas-reader",
            version: 1,
            data: {
                manga: [],
                sourceLinks: [],
                chapters: [],
                progress: [],
                historyEvents: [
                    {
                        id: localId,
                        mangaId: "other:manga:xyz",
                        chapterId: "foreign-chapter",
                        type: "completed",
                        occurredAt: 5_000
                    }
                ]
            }
        })

        const allEvents = await db.historyEvents.toArray()
        expect(allEvents).toHaveLength(2)
        expect(allEvents.some(e => e.chapterId === "local-chapter")).toBe(true)
        expect(allEvents.some(e => e.chapterId === "foreign-chapter")).toBe(true)
    })

    it("unions categories instead of one side winning outright on merge", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { categories: ["local-tag"] })

        const importedManga: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/title/abc",
            categories: ["imported-tag"]
        }

        await importDatabase(
            {
                format: "all-mangas-reader",
                version: 1,
                data: {
                    manga: [importedManga],
                    sourceLinks: [],
                    chapters: [],
                    progress: [],
                    historyEvents: []
                }
            },
            { [manga.id]: "merge" }
        )

        const stored = await db.manga.get(manga.id)
        expect(stored?.categories?.sort()).toEqual(["imported-tag", "local-tag"])
    })

    it("preserves an existing per-series noGapContinuous override over an imported one", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(manga.id, { noGapContinuous: true })

        const importedManga: LibraryManga = {
            ...manga,
            sourceId: "mangadex",
            sourceUrl: "https://mangadex.org/title/abc",
            noGapContinuous: false
        }

        await importDatabase(
            {
                format: "all-mangas-reader",
                version: 1,
                data: {
                    manga: [importedManga],
                    sourceLinks: [],
                    chapters: [],
                    progress: [],
                    historyEvents: []
                }
            },
            { [manga.id]: "merge" }
        )

        const stored = await db.manga.get(manga.id)
        expect(stored?.noGapContinuous).toBe(true)
    })
})

describe("trackExternalChapter", () => {
    it("derives distinct chapter records from episode_no query params, not just the word 'chapter'", async () => {
        const first = await trackExternalChapter({
            url: "https://www.webtoons.com/en/fantasy/slug/ep-1/viewer?title_no=99&episode_no=1",
            sourceId: "webtoons",
            mangaInfo: { sourceMangaId: "99", mangaUrl: "https://www.webtoons.com/en/fantasy/slug/" }
        })
        const second = await trackExternalChapter({
            url: "https://www.webtoons.com/en/fantasy/slug/ep-2/viewer?title_no=99&episode_no=2",
            sourceId: "webtoons",
            mangaInfo: { sourceMangaId: "99", mangaUrl: "https://www.webtoons.com/en/fantasy/slug/" }
        })

        expect(first.mangaId).toBe(second.mangaId)
        expect(first.chapterNumber).toBe(1)
        expect(second.chapterNumber).toBe(2)

        const chapters = await db.chapters.where("mangaId").equals(first.mangaId).toArray()
        expect(chapters).toHaveLength(2)
        expect(new Set(chapters.map(c => c.id)).size).toBe(2)
    })

    it("matches an existing manga by sourceId:manga:sourceMangaId instead of creating a duplicate", async () => {
        const existing: LibraryManga = {
            id: "webtoons:manga:99",
            title: "Existing Series",
            normalizedTitle: "existing series",
            authors: [],
            status: "ongoing",
            addedAt: 1,
            updatedAt: 1,
            sourceId: "webtoons",
            sourceUrl: "https://www.webtoons.com/en/fantasy/slug/",
            mangaUrl: "https://www.webtoons.com/en/fantasy/slug/"
        }
        await db.manga.put(existing)

        const result = await trackExternalChapter({
            url: "https://www.webtoons.com/en/fantasy/slug/ep-3/viewer?title_no=99&episode_no=3",
            sourceId: "webtoons",
            mangaInfo: { sourceMangaId: "99", mangaUrl: "https://www.webtoons.com/en/fantasy/slug/" }
        })

        expect(result.mangaId).toBe(existing.id)
        expect(await db.manga.count()).toBe(1)
    })

    it("does not cross-contaminate progress onto an unrelated Webtoons title when the direct id lookup misses", async () => {
        // Every Webtoons URL has the shape /<locale>/<genre>/<slug>/... - none of that
        // matches MANGA_PATH_MARKERS, so a naive slug fallback degenerates to the locale
        // token ("en") for every title and spuriously "matches" any two Webtoons titles.
        const unrelated: LibraryManga = {
            id: "webtoons:manga:legacy-unrelated",
            title: "Unrelated Manga",
            normalizedTitle: "unrelated manga",
            authors: [],
            status: "ongoing",
            addedAt: 1,
            updatedAt: 1,
            sourceId: "webtoons",
            sourceUrl: "https://www.webtoons.com/en/fantasy/some-other-manga/list?title_no=1111",
            mangaUrl: "https://www.webtoons.com/en/fantasy/some-other-manga/list?title_no=1111"
        }
        await db.manga.put(unrelated)

        const result = await trackExternalChapter({
            url: "https://www.webtoons.com/en/action/hero-killer/episode-271/viewer?title_no=2745&episode_no=271",
            sourceId: "webtoons",
            mangaInfo: {
                sourceMangaId: "2745",
                mangaUrl: "https://www.webtoons.com/en/action/hero-killer/list?title_no=2745"
            }
        })

        // Must create/track a distinct "Hero Killer" (title_no=2745) record - not silently
        // attach progress to the unrelated title_no=1111 record via the degenerate
        // host+locale slug match.
        expect(result.mangaId).not.toBe(unrelated.id)
        expect(await db.manga.count()).toBe(2)
        const untouched = await db.manga.get(unrelated.id)
        expect(untouched?.lastReadChapterNumber).toBeUndefined()
    })

    it("reuses an existing Webtoons entry matched by title_no when its id predates the sourceId:manga:sourceMangaId scheme", async () => {
        // Simulates a legacy-imported (or otherwise differently-keyed) library entry whose
        // stored mangaUrl is the older .../list?title_no=X shape, matched against a newer
        // series-prefix chapter URL that also carries title_no.
        const legacyHeroKiller: LibraryManga = {
            id: "webtoons:manga:legacy-hero-killer",
            title: "Hero Killer",
            normalizedTitle: "hero killer",
            authors: [],
            status: "ongoing",
            addedAt: 1,
            updatedAt: 1,
            sourceId: "webtoons",
            sourceUrl: "https://www.webtoons.com/en/action/hero-killer/list?title_no=2745",
            mangaUrl: "https://www.webtoons.com/en/action/hero-killer/list?title_no=2745"
        }
        await db.manga.put(legacyHeroKiller)

        const result = await trackExternalChapter({
            url: "https://www.webtoons.com/en/action/hero-killer/episode-271/viewer?title_no=2745&episode_no=271",
            sourceId: "webtoons",
            mangaInfo: {
                sourceMangaId: "2745",
                mangaUrl: "https://www.webtoons.com/en/action/hero-killer/list?title_no=2745"
            }
        })

        expect(result.mangaId).toBe(legacyHeroKiller.id)
        expect(await db.manga.count()).toBe(1)
        const stored = await db.manga.get(legacyHeroKiller.id)
        expect(stored?.lastReadChapterNumber).toBe(271)
    })

    it("still matches non-Webtoons hosts via the path-marker slug fallback (regression guard)", async () => {
        const existing: LibraryManga = {
            id: "genericsource:manga:legacy-one-piece",
            title: "One Piece",
            normalizedTitle: "one piece",
            authors: [],
            status: "ongoing",
            addedAt: 1,
            updatedAt: 1,
            sourceId: "genericsource",
            sourceUrl: "https://example.com/manga/one-piece/",
            mangaUrl: "https://example.com/manga/one-piece/"
        }
        await db.manga.put(existing)

        // Different marker segment ("read" vs "manga") so the raw startsWith prefix check
        // fails and this only succeeds via the marker-based slug fallback.
        const result = await trackExternalChapter({
            url: "https://example.com/read/one-piece/chapter-5",
            sourceId: "genericsource"
        })

        expect(result.mangaId).toBe(existing.id)
        expect(await db.manga.count()).toBe(1)
    })
})

describe("rekeyManga", () => {
    const oldId = manga.id
    const newId = "mangadex:manga:new"
    const newSourceLink: SourceLinkRecord = { ...sourceLink, mangaId: newId }

    it("preserves onHold, unions categories, and deletes old-id chapters when merging into an existing duplicate", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await db.manga.update(oldId, {
            onHold: true,
            categories: ["old-tag"],
            rating: 5,
            notes: "old notes",
            noGapContinuous: true
        })

        // A duplicate already exists at the new canonical id (e.g. auto-captured earlier).
        const duplicate: LibraryManga = {
            ...manga,
            id: newId,
            sourceId: "mangadex",
            sourceUrl: newSourceLink.url,
            categories: ["new-tag"],
            addedAt: 500
        }
        await db.manga.put(duplicate)

        // Mirrors what library:relink actually does: build `next` from the old record's
        // preserved user fields before calling rekeyManga - rekeyManga only merges
        // whatever `next` is handed against whatever's already at the new id, it doesn't
        // re-fetch the old record itself.
        const existing = await db.manga.get(oldId)
        const next: LibraryManga = {
            ...manga,
            id: newId,
            sourceId: "mangadex",
            sourceUrl: newSourceLink.url,
            ...(existing?.onHold !== undefined ? { onHold: existing.onHold } : {}),
            ...(existing?.categories !== undefined ? { categories: existing.categories } : {}),
            ...(existing?.rating !== undefined ? { rating: existing.rating } : {}),
            ...(existing?.notes !== undefined ? { notes: existing.notes } : {}),
            ...(existing?.noGapContinuous !== undefined ? { noGapContinuous: existing.noGapContinuous } : {})
        }

        await rekeyManga(oldId, next, newSourceLink)

        const merged = await db.manga.get(newId)
        expect(merged?.onHold).toBe(true)
        expect(merged?.categories?.sort()).toEqual(["new-tag", "old-tag"])
        expect(merged?.rating).toBe(5)
        expect(merged?.notes).toBe("old notes")
        expect(merged?.noGapContinuous).toBe(true)
        expect(merged?.addedAt).toBe(1) // min() of the two addedAt values (1 from `manga`, 500 from the duplicate)

        expect(await db.manga.get(oldId)).toBeUndefined()
        expect(await db.chapters.where("mangaId").equals(oldId).count()).toBe(0)
    })

    it("migrates progress and history events to the new id", async () => {
        await saveResolvedChapter({ manga, chapter, sourceLink })
        await saveProgress({
            mangaId: oldId,
            chapterId: chapter.id,
            pageIndex: 9,
            pageCount: 10,
            completed: true,
            updatedAt: 1_700_000_000_000
        })

        const next: LibraryManga = { ...manga, id: newId, sourceId: "mangadex", sourceUrl: newSourceLink.url }
        await rekeyManga(oldId, next, newSourceLink)

        expect(await db.progress.where("mangaId").equals(oldId).count()).toBe(0)
        expect(await db.progress.where("mangaId").equals(newId).count()).toBe(1)
        expect(await db.historyEvents.where("mangaId").equals(oldId).count()).toBe(0)
        expect(await db.historyEvents.where("mangaId").equals(newId).count()).toBeGreaterThan(0)
    })
})
