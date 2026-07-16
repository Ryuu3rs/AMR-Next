import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type StorageChange = { newValue?: unknown; oldValue?: unknown }
type ChangeListener = (changes: Record<string, StorageChange>, area: string) => void

function createOnChangedStub() {
    const listeners = new Set<ChangeListener>()
    return {
        addListener: vi.fn((l: ChangeListener) => listeners.add(l)),
        removeListener: vi.fn((l: ChangeListener) => listeners.delete(l)),
        emit(changes: Record<string, StorageChange>, area: string) {
            for (const l of [...listeners]) l(changes, area)
        }
    }
}

let sessionSet: ReturnType<typeof vi.fn>
let localSet: ReturnType<typeof vi.fn>
let onChanged: ReturnType<typeof createOnChangedStub>

// Minimal in-memory stand-in for the WXT-injected `browser` global - mirrors the
// pattern in handlers/updates-sources.test.ts (settings.ts/background.ts use the
// real WXT `browser` global at runtime, which vitest never provides).
function installBrowserStub(withSession: boolean) {
    sessionSet = vi.fn(async () => {})
    localSet = vi.fn(async () => {})
    onChanged = createOnChangedStub()
    // @ts-expect-error -- test-only global shim; WXT injects the real `browser`
    // global at build time, but vitest runs modules directly with no polyfill.
    globalThis.browser = {
        storage: {
            local: { set: localSet },
            ...(withSession ? { session: { set: sessionSet } } : {}),
            onChanged
        }
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    installBrowserStub(true)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("publishLive", () => {
    it("writes immediately on the first call (leading edge)", async () => {
        const { publishLive } = await import("./live")
        publishLive(["library"])
        await vi.advanceTimersByTimeAsync(0)

        expect(sessionSet).toHaveBeenCalledTimes(1)
        const event = sessionSet.mock.calls[0]?.[0]?.liveEvent
        expect(event.scopes).toEqual(["library"])
        expect(event.seq).toBe(1)
        expect(typeof event.at).toBe("number")
    })

    it("coalesces a burst inside the window into one trailing write with merged scopes/mangaIds", async () => {
        const { publishLive } = await import("./live")
        publishLive(["library"], ["m1"])
        publishLive(["chapters"], ["m2"])
        publishLive(["progress"], ["m1"])
        await vi.advanceTimersByTimeAsync(0)
        // Only the leading-edge write from the first call has happened so far.
        expect(sessionSet).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)
        expect(sessionSet).toHaveBeenCalledTimes(2)
        const trailing = sessionSet.mock.calls[1]?.[0]?.liveEvent
        expect(new Set(trailing.scopes)).toEqual(new Set(["chapters", "progress"]))
        expect(new Set(trailing.mangaIds)).toEqual(new Set(["m1", "m2"]))
    })

    it("does not schedule a second trailing write for a burst already pending", async () => {
        const { publishLive } = await import("./live")
        publishLive(["library"])
        await vi.advanceTimersByTimeAsync(0)
        publishLive(["chapters"])
        publishLive(["progress"])
        publishLive(["progress"])

        await vi.advanceTimersByTimeAsync(50)
        // Leading write + exactly one merged trailing write, not one per call.
        expect(sessionSet).toHaveBeenCalledTimes(2)
    })

    it("seq strictly increases across writes", async () => {
        const { publishLive } = await import("./live")
        publishLive(["library"])
        await vi.advanceTimersByTimeAsync(0)
        const first = sessionSet.mock.calls[0]?.[0]?.liveEvent.seq as number

        await vi.advanceTimersByTimeAsync(60)
        publishLive(["chapters"])
        await vi.advanceTimersByTimeAsync(0)
        const second = sessionSet.mock.calls[1]?.[0]?.liveEvent.seq as number

        expect(second).toBeGreaterThan(first)
    })

    it("falls back to storage.local when storage.session is unavailable", async () => {
        installBrowserStub(false)
        const { publishLive } = await import("./live")
        publishLive(["library"])
        await vi.advanceTimersByTimeAsync(0)

        expect(localSet).toHaveBeenCalledTimes(1)
        expect(sessionSet).not.toHaveBeenCalled()
    })
})

describe("subscribeLive", () => {
    it("does not fire for an event whose scopes don't intersect the subscription", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        subscribeLive(["chapters"], cb)

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["progress"] } } }, "session")
        await vi.advanceTimersByTimeAsync(300)

        expect(cb).not.toHaveBeenCalled()
    })

    it("fires for an event whose scopes intersect the subscription", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        subscribeLive(["chapters"], cb)

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["chapters"] } } }, "session")
        await vi.advanceTimersByTimeAsync(300)

        expect(cb).toHaveBeenCalledTimes(1)
    })

    it("fires for an 'all'-scoped event regardless of the subscription", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        subscribeLive(["chapters"], cb)

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["all"] } } }, "local")
        await vi.advanceTimersByTimeAsync(300)

        expect(cb).toHaveBeenCalledTimes(1)
    })

    it("ignores changes to storage areas other than session/local, and unrelated keys", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        subscribeLive(["library"], cb)

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["library"] } } }, "sync")
        onChanged.emit({ someOtherKey: { newValue: 1 } }, "session")
        await vi.advanceTimersByTimeAsync(300)

        expect(cb).not.toHaveBeenCalled()
    })

    it("debounces a burst of qualifying events into a single trailing callback", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        subscribeLive(["library"], cb)

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["library"] } } }, "session")
        await vi.advanceTimersByTimeAsync(100)
        onChanged.emit({ liveEvent: { newValue: { seq: 2, at: Date.now(), scopes: ["library"] } } }, "session")
        await vi.advanceTimersByTimeAsync(100)
        onChanged.emit({ liveEvent: { newValue: { seq: 3, at: Date.now(), scopes: ["library"] } } }, "session")

        expect(cb).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(250)

        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }))
    })

    it("stops invoking the callback after unsubscribe", async () => {
        const { subscribeLive } = await import("./live")
        const cb = vi.fn()
        const unsubscribe = subscribeLive(["library"], cb)
        unsubscribe()

        onChanged.emit({ liveEvent: { newValue: { seq: 1, at: Date.now(), scopes: ["library"] } } }, "session")
        await vi.advanceTimersByTimeAsync(300)

        expect(cb).not.toHaveBeenCalled()
    })
})
