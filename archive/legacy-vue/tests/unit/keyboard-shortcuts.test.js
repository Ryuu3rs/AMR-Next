/**
 * Tests for keyboard shortcuts helper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { setupKeyboardShortcuts, KEY_CODES } from "../../src/reader/helpers/keyboardShortcuts.ts"

describe("keyboardShortcuts", () => {
    let handlers
    let cleanup

    beforeEach(() => {
        handlers = {
            goPreviousChapter: vi.fn(),
            goNextChapter: vi.fn(),
            openShortcuts: vi.fn(),
            toggleDrawer: vi.fn(),
            setResize: vi.fn(),
            toggleFullchapter: vi.fn(),
            toggleBook: vi.fn(),
            toggleDirection: vi.fn(),
            addManga: vi.fn(),
            deleteManga: vi.fn(),
            toggleReadTop: vi.fn(),
            markAsLatest: vi.fn(),
            reloadErrors: vi.fn(),
            toggleFullScreen: vi.fn(),
            displayChapterInfo: vi.fn(),
            jumpToLastChapter: vi.fn(),
            jumpToFirstChapter: vi.fn(),
            jumpToRandomChapter: vi.fn(),
            getShouldInvertKeys: vi.fn().mockReturnValue(false),
            canAddManga: vi.fn().mockReturnValue(true),
            canDeleteManga: vi.fn().mockReturnValue(true),
            canToggleReadTop: vi.fn().mockReturnValue(true),
            canMarkAsLatest: vi.fn().mockReturnValue(true),
            isFullchapter: vi.fn().mockReturnValue(false)
        }
    })

    afterEach(() => {
        if (cleanup) {
            cleanup()
            cleanup = null
        }
    })

    const simulateKeydown = (keyCode, options = {}) => {
        const event = new KeyboardEvent("keydown", {
            which: keyCode,
            shiftKey: options.shiftKey || false,
            altKey: options.altKey || false,
            bubbles: true
        })
        // Override which property since KeyboardEvent doesn't set it properly
        Object.defineProperty(event, "which", { value: keyCode })
        window.dispatchEvent(event)
    }

    describe("KEY_CODES", () => {
        it("should export correct key codes", () => {
            expect(KEY_CODES.B).toBe(66)
            expect(KEY_CODES.N).toBe(78)
            expect(KEY_CODES.F1).toBe(112)
            expect(KEY_CODES.LEFT_ARROW).toBe(37)
            expect(KEY_CODES.RIGHT_ARROW).toBe(39)
        })
    })

    describe("setupKeyboardShortcuts", () => {
        it("should return a cleanup function", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            expect(typeof cleanup).toBe("function")
        })

        it("should call goPreviousChapter on B key", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.B)
            expect(handlers.goPreviousChapter).toHaveBeenCalled()
        })

        it("should call goNextChapter on N key", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.N)
            expect(handlers.goNextChapter).toHaveBeenCalled()
        })

        it("should call openShortcuts on F1 key", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.F1)
            expect(handlers.openShortcuts).toHaveBeenCalled()
        })

        it("should call toggleDrawer on Shift+M", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.M, { shiftKey: true })
            expect(handlers.toggleDrawer).toHaveBeenCalled()
        })

        it("should call toggleFullchapter on Shift+F", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.F, { shiftKey: true })
            expect(handlers.toggleFullchapter).toHaveBeenCalled()
        })

        it("should call toggleBook on Shift+B", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.B, { shiftKey: true })
            expect(handlers.toggleBook).toHaveBeenCalled()
        })

        it("should call toggleFullScreen on Alt+F", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.F, { altKey: true })
            expect(handlers.toggleFullScreen).toHaveBeenCalled()
        })

        it("should call displayChapterInfo on Alt+C", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.C, { altKey: true })
            expect(handlers.displayChapterInfo).toHaveBeenCalled()
        })

        it("should call jumpToLastChapter on Alt+Shift+Right", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.RIGHT_ARROW, { altKey: true, shiftKey: true })
            expect(handlers.jumpToLastChapter).toHaveBeenCalled()
        })

        it("should call jumpToFirstChapter on Alt+Shift+Left", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.LEFT_ARROW, { altKey: true, shiftKey: true })
            expect(handlers.jumpToFirstChapter).toHaveBeenCalled()
        })

        it("should call jumpToRandomChapter on Alt+Shift+R", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            simulateKeydown(KEY_CODES.R, { altKey: true, shiftKey: true })
            expect(handlers.jumpToRandomChapter).toHaveBeenCalled()
        })

        it("should remove event listeners on cleanup", () => {
            cleanup = setupKeyboardShortcuts(handlers)
            cleanup()

            // Reset mock call counts
            handlers.goPreviousChapter.mockClear()

            // Simulate keydown after cleanup
            simulateKeydown(KEY_CODES.B)

            // Handler should not be called after cleanup
            expect(handlers.goPreviousChapter).not.toHaveBeenCalled()
        })
    })
})
