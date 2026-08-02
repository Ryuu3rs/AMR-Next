import "fake-indexeddb/auto"
import { fakeBrowser } from "wxt/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.stubGlobal("browser", fakeBrowser)

const create = vi.fn().mockResolvedValue("id")
// fakeBrowser has no notifications API; provide a minimal stub the helper can call.
;(fakeBrowser as unknown as { notifications: unknown }).notifications = { create, clear: vi.fn() }

const { notifyNewChapters } = await import("./notifications")
const { updateSettings } = await import("./settings")

beforeEach(async () => {
    fakeBrowser.reset()
    create.mockClear()
    ;(fakeBrowser as unknown as { notifications: unknown }).notifications = { create, clear: vi.fn() }
    await updateSettings({ notifyNewChapters: true })
})

describe("notifyNewChapters", () => {
    it("shows the single title for one new chapter", async () => {
        await notifyNewChapters(["Berserk"])
        expect(create).toHaveBeenCalledTimes(1)
        const opts = create.mock.calls[0]![1] as { title: string; message: string }
        expect(opts.title).toBe("New chapter available")
        expect(opts.message).toBe("Berserk")
    })

    it("aggregates many titles with an overflow count", async () => {
        await notifyNewChapters(["A", "B", "C", "D", "E", "F", "G"])
        const opts = create.mock.calls[0]![1] as { title: string; message: string }
        expect(opts.title).toBe("7 titles updated")
        expect(opts.message).toBe("A, B, C, D, E, and 2 more")
    })

    it("does nothing when there are no updated titles", async () => {
        await notifyNewChapters([])
        expect(create).not.toHaveBeenCalled()
    })

    it("respects the opt-out setting", async () => {
        await updateSettings({ notifyNewChapters: false })
        await notifyNewChapters(["Berserk"])
        expect(create).not.toHaveBeenCalled()
    })
})
