import { describe, it, expect, vi, afterEach } from "vitest"
import { vpsProvider } from "./vps"

// import.meta.env is build-inlined, but vps.ts reads VITE_METADATA_API_ORIGIN
// lazily inside metadataOrigin() on every call, so vi.stubEnv controls it per case.
const ORIGIN = "https://catalog.example.com/*"

function jsonResponse(body: unknown, ok = true) {
    return { ok, json: async () => body }
}

describe("vpsProvider.resolve", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    it("returns the MetadataResult for a catalog hit and strips the /* origin suffix", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                anilistId: 105398,
                title: "Chainsaw Man",
                status: "completed",
                coverUrl: "https://img/xl.jpg",
                genres: ["Action"]
            })
        )
        vi.stubGlobal("fetch", fetchMock)

        const result = await vpsProvider.resolve({
            title: "Chainsaw Man",
            sourceId: "mangadex",
            sourceMangaId: "abc"
        })

        expect(result?.anilistId).toBe(105398)
        expect(result?.status).toBe("completed")
        const calledUrl = String(fetchMock.mock.calls[0]?.[0])
        expect(calledUrl).toContain("https://catalog.example.com/metadata/resolve?")
        expect(calledUrl).not.toContain("/*/")
        expect(calledUrl).toContain("title=Chainsaw+Man")
        expect(calledUrl).toContain("sourceId=mangadex")
        expect(calledUrl).toContain("sourceMangaId=abc")
    })

    it("returns null when the body has no catalog fields ({ result: null })", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: null })))
        expect(await vpsProvider.resolve({ title: "x" })).toBeNull()
    })

    it("returns null on a non-ok / 404 response", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)))
        expect(await vpsProvider.resolve({ title: "x" })).toBeNull()
    })

    it("returns null when fetch rejects (network error / timeout)", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")))
        expect(await vpsProvider.resolve({ title: "x" })).toBeNull()
    })

    it("returns null without calling fetch when the origin is unset", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", "")
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        expect(await vpsProvider.resolve({ title: "x" })).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("returns null for an empty title without calling fetch", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        expect(await vpsProvider.resolve({ title: "   " })).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe("vpsProvider.getByAnilistId", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    it("hits the by-anilist endpoint and returns the MetadataResult", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", ORIGIN)
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ anilistId: 30002, status: "ongoing" }))
        vi.stubGlobal("fetch", fetchMock)

        const result = await vpsProvider.getByAnilistId?.(30002)

        expect(result?.anilistId).toBe(30002)
        expect(fetchMock.mock.calls[0]?.[0]).toBe("https://catalog.example.com/metadata/by-anilist/30002")
    })

    it("returns null without calling fetch when the origin is unset", async () => {
        vi.stubEnv("VITE_METADATA_API_ORIGIN", "")
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        expect(await vpsProvider.getByAnilistId?.(1)).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
