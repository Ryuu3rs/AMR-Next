import { afterEach, describe, expect, it, vi } from "vitest"

// apiSyncEvents reads COMMUNITY_API_BASE from import.meta.env at module load, so stub the env
// and (re)import inside each test.
describe("apiSyncEvents chunking (BUG 2: 500-cap event loss)", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it("splits >500 events into 500-sized POSTs so the server never drops the overflow", async () => {
        vi.stubEnv("VITE_COMMUNITY_API_URL", "https://test.example")
        const sizes: number[] = []
        const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(init.body as string) as { events: unknown[] }
            sizes.push(body.events.length)
            return { ok: true, json: async () => ({ rank: 1, newAchievements: [], recommendations: [] }) } as Response
        })
        vi.stubGlobal("fetch", fetchMock)

        const { apiSyncEvents } = await import("./community")
        const events = Array.from({ length: 1200 }, (_, i) => ({
            sourceId: "mangadex",
            mangaTitle: `t${i}`,
            genres: [],
            date: "2026-08-20"
        }))
        await apiSyncEvents("u", events as never)
        expect(sizes).toEqual([500, 500, 200])
    })

    it("unions newAchievements unlocked across chunks", async () => {
        vi.stubEnv("VITE_COMMUNITY_API_URL", "https://test.example")
        let call = 0
        const fetchMock = vi.fn(async () => {
            call += 1
            return {
                ok: true,
                json: async () => ({
                    rank: call,
                    newAchievements: [`a${call}`],
                    recommendations: []
                })
            } as Response
        })
        vi.stubGlobal("fetch", fetchMock)

        const { apiSyncEvents } = await import("./community")
        const events = Array.from({ length: 600 }, () => ({
            sourceId: "s",
            mangaTitle: "t",
            genres: [],
            date: "2026-08-20"
        }))
        const res = await apiSyncEvents("u", events as never)
        expect(res.newAchievements.sort()).toEqual(["a1", "a2"])
    })

    it("still POSTs once with no events so the caller gets the current rank", async () => {
        vi.stubEnv("VITE_COMMUNITY_API_URL", "https://test.example")
        const fetchMock = vi.fn(
            async () =>
                ({ ok: true, json: async () => ({ rank: 7, newAchievements: [], recommendations: [] }) }) as Response
        )
        vi.stubGlobal("fetch", fetchMock)

        const { apiSyncEvents } = await import("./community")
        const res = await apiSyncEvents("u", [])
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(res.rank).toBe(7)
    })
})
