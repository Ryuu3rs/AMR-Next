import { describe, it, expect } from "vitest"
import { mapBrowse, type BrowseResponse } from "./browse"

describe("mapBrowse", () => {
    it("maps page media to candidates with score and popularity", () => {
        const raw: BrowseResponse = {
            Page: {
                media: [
                    {
                        id: 1,
                        title: { english: "Top Rated" },
                        coverImage: { extraLarge: "https://img/xl.jpg" },
                        genres: ["Drama", null],
                        averageScore: 85,
                        popularity: 30000
                    }
                ]
            }
        }
        expect(mapBrowse(raw)).toEqual([
            {
                anilistId: 1,
                title: "Top Rated",
                coverUrl: "https://img/xl.jpg",
                genres: ["Drama"],
                averageScore: 85,
                popularity: 30000
            }
        ])
    })

    it("drops entries missing an id or title and dedupes ids", () => {
        const raw: BrowseResponse = {
            Page: {
                media: [
                    { id: 5, title: { english: "Kept" } },
                    { id: 5, title: { english: "Dup" } },
                    { title: { english: "No id" } },
                    { id: 6, title: null },
                    null
                ]
            }
        }
        expect(mapBrowse(raw)).toEqual([{ anilistId: 5, title: "Kept" }])
    })

    it("returns an empty array for empty or null input", () => {
        expect(mapBrowse(null)).toEqual([])
        expect(mapBrowse({ Page: null })).toEqual([])
        expect(mapBrowse({ Page: { media: [] } })).toEqual([])
    })
})
