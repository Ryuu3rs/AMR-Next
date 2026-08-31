import { describe, it, expect } from "vitest"
import { mapSequels, type RelationsResponse } from "./relations"

describe("mapSequels", () => {
    it("keeps SEQUEL and SIDE_STORY manga, dropping other relation types", () => {
        const raw: RelationsResponse = {
            relations: {
                edges: [
                    {
                        relationType: "SEQUEL",
                        node: {
                            id: 10,
                            type: "MANGA",
                            title: { english: "Part Two" },
                            coverImage: { extraLarge: "https://img/xl.jpg" },
                            genres: ["Action", null]
                        }
                    },
                    { relationType: "SIDE_STORY", node: { id: 11, type: "MANGA", title: { english: "Side Arc" } } },
                    { relationType: "PREQUEL", node: { id: 12, type: "MANGA", title: { english: "Before" } } },
                    { relationType: "ADAPTATION", node: { id: 13, type: "MANGA", title: { english: "Novel" } } }
                ]
            }
        }
        expect(mapSequels(raw)).toEqual([
            { anilistId: 10, title: "Part Two", coverUrl: "https://img/xl.jpg", genres: ["Action"] },
            { anilistId: 11, title: "Side Arc" }
        ])
    })

    it("drops anime adaptations even under a kept relation type", () => {
        const raw: RelationsResponse = {
            relations: {
                edges: [{ relationType: "SEQUEL", node: { id: 20, type: "ANIME", title: { english: "Season 2" } } }]
            }
        }
        expect(mapSequels(raw)).toEqual([])
    })

    it("dedupes repeated ids and drops nodes missing an id or title", () => {
        const raw: RelationsResponse = {
            relations: {
                edges: [
                    { relationType: "SEQUEL", node: { id: 30, title: { english: "Kept" } } },
                    { relationType: "SEQUEL", node: { id: 30, title: { english: "Dup" } } },
                    { relationType: "SEQUEL", node: { title: { english: "No id" } } },
                    { relationType: "SEQUEL", node: { id: 31, title: null } },
                    null
                ]
            }
        }
        expect(mapSequels(raw)).toEqual([{ anilistId: 30, title: "Kept" }])
    })

    it("returns an empty array for empty or null input", () => {
        expect(mapSequels(null)).toEqual([])
        expect(mapSequels({ relations: null })).toEqual([])
        expect(mapSequels({ relations: { edges: [] } })).toEqual([])
    })
})
