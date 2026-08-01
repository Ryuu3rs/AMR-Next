import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
    getAniListConfig,
    setAniListConfig,
    getAniListStatus,
    getViewerProgress,
    saveViewerProgress,
    getViewerName
} from "./anilist"

function stubStorage() {
    const store = new Map<string, unknown>()
    // @ts-expect-error test-only shim
    globalThis.browser = {
        storage: {
            local: {
                get: vi.fn(async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {})),
                set: vi.fn(async (items: Record<string, unknown>) => {
                    for (const [k, v] of Object.entries(items)) store.set(k, v)
                })
            }
        }
    }
    return store
}

beforeEach(() => stubStorage())
afterEach(() => vi.unstubAllGlobals())

describe("AniList config store", () => {
    it("defaults to autoSync off and no token", async () => {
        expect(await getAniListConfig()).toEqual({ autoSync: false, syncMembership: false })
    })

    it("merges patches and round-trips", async () => {
        await setAniListConfig({ token: "abc", autoSync: true })
        const c = await getAniListConfig()
        expect(c.token).toBe("abc")
        expect(c.autoSync).toBe(true)
    })

    it("never exposes the token in the status view", async () => {
        await setAniListConfig({ token: "secret", autoSync: true, lastSyncAt: 123 })
        const status = await getAniListStatus()
        expect(status).toEqual({ hasToken: true, autoSync: true, syncMembership: false, lastSyncAt: 123 })
        expect(JSON.stringify(status)).not.toContain("secret")
    })
})

describe("AniList authed API", () => {
    it("reads viewer progress, undefined when no list entry", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { Media: { mediaListEntry: null } } }) })
        )
        expect(await getViewerProgress("t", 1)).toBeUndefined()

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { Media: { mediaListEntry: { progress: 42 } } } })
            })
        )
        expect(await getViewerProgress("t", 1)).toBe(42)
    })

    it("saves progress and returns the stored value", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue({ ok: true, json: async () => ({ data: { SaveMediaListEntry: { progress: 50 } } }) })
        )
        expect(await saveViewerProgress("t", 1, 50)).toBe(50)
    })

    it("throws on a GraphQL error (e.g. invalid token)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: "Invalid token" }] }) })
        )
        await expect(getViewerName("bad")).rejects.toThrow(/Invalid token/)
    })

    it("throws on a non-ok response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
        await expect(getViewerName("bad")).rejects.toThrow(/401/)
    })
})
