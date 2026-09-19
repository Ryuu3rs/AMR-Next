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
                genres: ["Action", "Adventure"],
                searchTitles: ["Vinland Saga"]
            }
        ])
    })

    it("builds Latin-only searchTitles from english, romaji and synonyms, best-first and deduped", () => {
        const cand = mapRecommendations({
            recommendations: {
                nodes: [
                    {
                        mediaRecommendation: {
                            id: 55,
                            // No english on AniList (real case: a Korean manhwa) - romaji + synonyms carry it.
                            title: { romaji: "Jaebeorui pumgyeok", native: "재벌집 막내아들" },
                            synonyms: ["Reborn Rich", "The Youngest Son of a Conglomerate", "재벌집", null]
                        }
                    }
                ]
            }
        })[0]
        // Native Hangul is dropped (never matches a source); the rest kept in order, deduped.
        expect(cand?.searchTitles).toEqual(["Jaebeorui pumgyeok", "Reborn Rich", "The Youngest Son of a Conglomerate"])
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
        expect(mapRecommendations(raw)).toEqual([{ anilistId: 7, title: "Kept", searchTitles: ["Kept"] }])
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
        expect(mapRecommendations(raw)).toEqual([{ anilistId: 9, title: "First", searchTitles: ["First"] }])
    })

    it("returns an empty array for empty or null input", () => {
        expect(mapRecommendations(null)).toEqual([])
        expect(mapRecommendations({ recommendations: { nodes: [] } })).toEqual([])
        expect(mapRecommendations({ recommendations: null })).toEqual([])
    })

    it("carries edge rating (clamped >=0), averageScore, and popularity when present", () => {
        const raw: RecommendationsResponse = {
            recommendations: {
                nodes: [
                    {
                        rating: 42,
                        mediaRecommendation: {
                            id: 1,
                            title: { english: "Strong" },
                            averageScore: 88,
                            popularity: 12000
                        }
                    },
                    // A downvoted edge (negative rating) clamps to 0; a 0 averageScore is
                    // treated as "unknown" and dropped, not carried as a real 0.
                    {
                        rating: -5,
                        mediaRecommendation: { id: 2, title: { english: "Weak" }, averageScore: 0, popularity: 0 }
                    }
                ]
            }
        }
        expect(mapRecommendations(raw)).toEqual([
            {
                anilistId: 1,
                title: "Strong",
                recStrength: 42,
                averageScore: 88,
                popularity: 12000,
                searchTitles: ["Strong"]
            },
            { anilistId: 2, title: "Weak", recStrength: 0, popularity: 0, searchTitles: ["Weak"] }
        ])
    })
})
