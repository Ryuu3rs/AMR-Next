import { describe, expect, it } from "vitest"
import { parseMangayomiBackup } from "./mangayomi"

function backup(): string {
    return JSON.stringify({
        version: "2",
        categories: [{ id: 1, name: "Reading" }],
        manga: [
            {
                id: 5,
                name: "Omniscient Reader",
                link: "/series/orv",
                imageUrl: "https://cover.test/orv.jpg",
                genre: ["Action", "Drama"],
                status: 0, // ongoing
                itemType: 0,
                categories: [1],
                sourceId: 99
            },
            { id: 6, name: "No Track Manhwa", link: "/x", status: 1, itemType: 0, genre: [], categories: [] },
            { id: 7, name: "Some Anime", status: 0, itemType: 1, genre: [], categories: [] } // skipped (anime)
        ],
        chapters: [
            { mangaId: 5, isRead: true, name: "Ch 1" },
            { mangaId: 5, isRead: true, name: "Ch 2" },
            { mangaId: 5, isRead: false, name: "Ch 3" },
            { mangaId: 6, isRead: true, name: "Ch 1" },
            { mangaId: 6, isRead: true, name: "Ch 2" },
            { mangaId: 6, isRead: true, name: "Ch 3" }
        ],
        tracks: [{ mangaId: 5, syncId: 2, mediaId: 777, lastChapterRead: 9 }]
    })
}

describe("parseMangayomiBackup", () => {
    it("maps a tracked manga: title, cover, genres, category, AniList id, and the tracker's last-read", () => {
        const out = parseMangayomiBackup(backup())
        const orv = out.find(m => m.title === "Omniscient Reader")!
        expect(orv).toBeTruthy()
        expect(orv.coverUrl).toBe("https://cover.test/orv.jpg")
        expect(orv.genres).toEqual(["Action", "Drama"])
        expect(orv.categories).toEqual(["Reading"])
        expect(orv.status).toBe("ongoing")
        expect(orv.anilistId).toBe(777)
        expect(orv.maxReadChapter).toBe(9) // tracker's lastChapterRead wins over the read-count (2)
    })

    it("falls back to the read-chapter count when there is no tracker", () => {
        const out = parseMangayomiBackup(backup())
        const noTrack = out.find(m => m.title === "No Track Manhwa")!
        expect(noTrack.maxReadChapter).toBe(3) // 3 read chapters, no chapter numbers available
        expect(noTrack.anilistId).toBeUndefined()
        expect(noTrack.status).toBe("completed")
    })

    it("skips non-manga item types (anime/novel)", () => {
        const out = parseMangayomiBackup(backup())
        expect(out.map(m => m.title)).toEqual(["Omniscient Reader", "No Track Manhwa"])
    })

    it("throws on non-JSON input", () => {
        expect(() => parseMangayomiBackup("not json")).toThrow(/valid JSON/)
    })
})
