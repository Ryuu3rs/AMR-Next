import { describe, it, expect } from "vitest"
import { mapRecommendations, type RecommendationsResponse } from "./recommendations"

describe("mapRecommendations", () => {
    it("maps recommendation nodes to candidates", () => {
        const raw: RecommendationsResponse = {
            recommendations: {
                nodes: [
                    {
                        mediaRecommendation: {
                            id: 101,
                            title: { english: "Vinland Saga", romaji: "Vinland Saga" },
                            coverImage: { extraLarge: "https://img/xl.jpg", large: "https://img/l.jpg" },
                            genres: ["Action", "Adventure", null]
                        }
                    }
                ]
            }
        }
        expect(mapRecommendations(raw)).toEqual([
            {
                anilistId: 101,
                title: "Vinland Saga",
                coverUrl: "https://img/xl.jpg",
                genres: ["Action", "Adventure"]
            }
        ])
    })

    it("prefers english then romaji then native for the title", () => {
        const only = (media: Record<string, unknown>) =>
            mapRecommendations({ recommendations: { nodes: [{ mediaRecommendation: media }] } })[0]?.title
        expect(only({ id: 1, title: { native: "ベルセルク", romaji: "Berserk" } })).toBe("Berserk")
        expect(only({ id: 1, title: { native: "ベルセルク" } })).toBe("ベルセルク")
    })

    it("falls back large -> nothing for the cover", () => {
        const r = mapRecommendations({
            recommendations: {
                nodes: [
                    {
                        mediaRecommendation: {
                            id: 1,
                            title: { english: "X" },
                            coverImage: { large: "https://img/l.jpg" }
                        }
                    }
                ]
            }
        })
        expect(r[0]?.coverUrl).toBe("https://img/l.jpg")
    })

    it("drops null recommendations and nodes missing an id or title", () => {
        const raw: RecommendationsResponse = {
            recommendations: {
                nodes: [
                    null,
                    { mediaRecommendation: null },
                    { mediaRecommendation: { id: 5, title: null } },
                    { mediaRecommendation: { title: { english: "No id" } } },
                    { mediaRecommendation: { id: 7, title: { english: "Kept" } } }
                ]
            }
        }
        expect(mapRecommendations(raw)).toEqual([{ anilistId: 7, title: "Kept" }])
    })

    it("dedupes repeated recommendation ids, keeping the first", () => {
        const raw: RecommendationsResponse = {
            recommendations: {
                nodes: [
                    { mediaRecommendation: { id: 9, title: { english: "First" } } },
                    { mediaRecommendation: { id: 9, title: { english: "Second" } } }
                ]
            }
        }
        expect(mapRecommendations(raw)).toEqual([{ anilistId: 9, title: "First" }])
    })

    it("returns an empty array for empty or null input", () => {
        expect(mapRecommendations(null)).toEqual([])
        expect(mapRecommendations({ recommendations: { nodes: [] } })).toEqual([])
        expect(mapRecommendations({ recommendations: null })).toEqual([])
    })
})
