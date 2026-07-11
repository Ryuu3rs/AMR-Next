import "fake-indexeddb/auto"
import type { ChapterRecord } from "@amr/contracts"
import { beforeEach, describe, expect, it } from "vitest"
import { db, type LibraryManga } from "../database"
import { mineAndCacheEpisodesFromHtml } from "./chapter-cache"

const SOURCE_ID = "webtoons"
const SOURCE_MANGA_ID = "99"
const MANGA_ID = `${SOURCE_ID}:manga:${SOURCE_MANGA_ID}`
const HOSTNAME = "www.webtoons.com"

const manga: LibraryManga = {
    id: MANGA_ID,
    title: "Test Series",
    normalizedTitle: "test series",
    authors: [],
    status: "ongoing",
    addedAt: 1,
    updatedAt: 1,
    sourceId: SOURCE_ID,
    sourceUrl: `https://${HOSTNAME}/en/fantasy/slug/`,
    sourceMangaId: SOURCE_MANGA_ID,
    mangaUrl: `https://${HOSTNAME}/en/fantasy/slug/`
}

function link(titleNo: string, epNo: number): string {
    return `href="/en/fantasy/slug/ep-${epNo}/viewer?title_no=${titleNo}&episode_no=${epNo}"`
}

beforeEach(async () => {
    await Promise.all([db.manga.clear(), db.chapters.clear()])
})

describe("mineAndCacheEpisodesFromHtml", () => {
    it("rejects episode links whose title_no does not match the mined manga (Recommended for you pollution guard)", async () => {
        await db.manga.put(manga)
        const html = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
                ${link(SOURCE_MANGA_ID, 3)}
                <div class="recommend">
                    ${link("777", 5)}
                    ${link("888", 12)}
                </div>
            </div>
        `

        const stored = await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, html)

        expect(stored).toBe(3)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(3)
        expect(chapters.every(c => c.id.startsWith(`${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:`))).toBe(true)
        expect(chapters.map(c => c.sortKey).sort((a, b) => a - b)).toEqual([1, 2, 3])
    })

    it("self-heals by deleting stale chapter rows embedding a different sourceMangaId", async () => {
        await db.manga.put(manga)
        // Pre-seed a stale row simulating pre-fix pollution: stored under MANGA_ID but
        // whose id embeds a different sourceMangaId ("777").
        const staleChapter: ChapterRecord = {
            id: `${SOURCE_ID}:chapter:777:5`,
            mangaId: MANGA_ID,
            sourceId: SOURCE_ID,
            title: "Episode 5",
            url: `https://${HOSTNAME}/en/fantasy/slug/ep-5/viewer?title_no=777&episode_no=5`,
            sortKey: 5
        }
        await db.chapters.put(staleChapter)

        const cleanHtml = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
                ${link(SOURCE_MANGA_ID, 3)}
            </div>
        `

        await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, cleanHtml)

        expect(await db.chapters.get(staleChapter.id)).toBeUndefined()
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters.every(c => c.id.startsWith(`${SOURCE_ID}:chapter:${SOURCE_MANGA_ID}:`))).toBe(true)
    })

    it("returns 0 and stores nothing when the HTML has 2 or fewer matching links (pagination-only guard)", async () => {
        await db.manga.put(manga)
        const html = `
            <div>
                ${link(SOURCE_MANGA_ID, 1)}
                ${link(SOURCE_MANGA_ID, 2)}
            </div>
        `

        const stored = await mineAndCacheEpisodesFromHtml(MANGA_ID, SOURCE_ID, SOURCE_MANGA_ID, HOSTNAME, html)

        expect(stored).toBe(0)
        const chapters = await db.chapters.where("mangaId").equals(MANGA_ID).toArray()
        expect(chapters).toHaveLength(0)
    })
})
