/**
 * Keyboard Shortcuts Handler for AMR Reader
 * Extracts keyboard handling logic from AmrReader.vue
 */

/**
 * Key codes used for keyboard shortcuts
 */
export const KEY_CODES = {
    B: 66,
    N: 78,
    F1: 112,
    LEFT_ARROW: 37,
    RIGHT_ARROW: 39,
    A: 65,
    D: 68,
    M: 77,
    C: 67,
    W: 87,
    H: 72,
    F: 70,
    P: 80,
    L: 76,
    R: 82,
    PLUS: 107,
    PLUS_ALT: 187,
    MINUS: 109,
    MINUS_ALT: 54
} as const

/**
 * Resize mode type
 */
export type ResizeMode = "container" | "width" | "height"

/**
 * Handler functions interface for keyboard shortcuts
 */
export interface KeyboardHandlers {
    goPreviousChapter: () => void
    goNextChapter: () => void
    openShortcuts: () => void
    toggleDrawer: () => void
    setResize: (mode: ResizeMode) => void
    toggleFullchapter: () => void
    toggleBook: () => void
    toggleDirection: () => void
    addManga: () => void
    deleteManga: () => void
    toggleReadTop: () => void
    markAsLatest: () => void
    reloadErrors: () => void
    toggleFullScreen: () => void
    displayChapterInfo: () => void
    jumpToLastChapter: () => void
    jumpToFirstChapter: () => void
    jumpToRandomChapter: () => void
    getShouldInvertKeys: () => boolean
    canAddManga: () => boolean
    canDeleteManga: () => boolean
    canToggleReadTop: () => boolean
    canMarkAsLatest: () => boolean
    isFullchapter: () => boolean
}

/**
 * Cleanup function type
 */
export type CleanupFunction = () => void

/**
 * Creates keyboard event handlers for the reader
 */
export function setupKeyboardShortcuts(handlers: KeyboardHandlers): CleanupFunction {
    const {
        goPreviousChapter,
        goNextChapter,
        openShortcuts,
        toggleDrawer,
        setResize,
        toggleFullchapter,
        toggleBook,
        toggleDirection,
        addManga,
        deleteManga,
        toggleReadTop,
        markAsLatest,
        reloadErrors,
        toggleFullScreen,
        displayChapterInfo,
        jumpToLastChapter,
        jumpToFirstChapter,
        jumpToRandomChapter,
        getShouldInvertKeys,
        canAddManga,
        canDeleteManga,
        canToggleReadTop,
        canMarkAsLatest,
        isFullchapter
    } = handlers

    const registerKeys = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement
        const prevent = (): void => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
        }

        // Skip if typing in text input
        const inputType = (target as HTMLInputElement).type
        if ((inputType && inputType === "text") || (target.nodeName && target.nodeName.toLowerCase() === "textarea")) {
            return
        }

        const shouldInvertKeys = getShouldInvertKeys()

        // No modifier keys
        if (!e.shiftKey && !e.altKey) {
            if (e.which === KEY_CODES.B) {
                goPreviousChapter()
                prevent()
            }
            if (e.which === KEY_CODES.N) {
                goNextChapter()
                prevent()
            }
            if (e.which === KEY_CODES.F1) {
                openShortcuts()
                prevent()
            }
        }

        // Shift key only
        if (e.shiftKey && !e.altKey) {
            if (e.which === KEY_CODES.RIGHT_ARROW || e.which === KEY_CODES.D) {
                shouldInvertKeys ? goPreviousChapter() : goNextChapter()
                prevent()
            }
            if (e.which === KEY_CODES.LEFT_ARROW || e.which === KEY_CODES.A) {
                shouldInvertKeys ? goNextChapter() : goPreviousChapter()
                prevent()
            }
            if (e.which === KEY_CODES.M) {
                toggleDrawer()
                prevent()
            }
            if (e.which === KEY_CODES.C) {
                if (!isFullchapter()) setResize("container")
                prevent()
            }
            if (e.which === KEY_CODES.W) {
                setResize("width")
                prevent()
            }
            if (e.which === KEY_CODES.H) {
                if (!isFullchapter()) setResize("height")
                prevent()
            }
            if (e.which === KEY_CODES.F) {
                toggleFullchapter()
                prevent()
            }
            if (e.which === KEY_CODES.B) {
                toggleBook()
                prevent()
            }
            if (e.which === KEY_CODES.D) {
                toggleDirection()
                prevent()
            }
            if (e.which === KEY_CODES.PLUS || e.which === KEY_CODES.PLUS_ALT) {
                if (canAddManga()) addManga()
                prevent()
            }
            if (e.which === KEY_CODES.MINUS || e.which === KEY_CODES.MINUS_ALT) {
                if (canDeleteManga()) deleteManga()
                prevent()
            }
            if (e.which === KEY_CODES.P) {
                if (canToggleReadTop()) toggleReadTop()
                prevent()
            }
            if (e.which === KEY_CODES.L) {
                if (canMarkAsLatest()) markAsLatest()
                prevent()
            }
            if (e.which === KEY_CODES.R) {
                reloadErrors()
                prevent()
            }
        }

        // Alt key only
        if (e.altKey && !e.shiftKey) {
            if (e.which === KEY_CODES.F) {
                toggleFullScreen()
                prevent()
            }
            if (e.which === KEY_CODES.C) {
                displayChapterInfo()
                prevent()
            }
        }

        // Alt + Shift
        if (e.altKey && e.shiftKey) {
            if (e.which === KEY_CODES.RIGHT_ARROW || e.which === KEY_CODES.D) {
                jumpToLastChapter()
                prevent()
            }
            if (e.which === KEY_CODES.LEFT_ARROW || e.which === KEY_CODES.A) {
                jumpToFirstChapter()
                prevent()
            }
            if (e.which === KEY_CODES.R) {
                jumpToRandomChapter()
                prevent()
            }
        }
    }

    const stopProp = (e: Event): void => {
        e.stopImmediatePropagation()
    }

    window.addEventListener("keydown", registerKeys, true)
    window.addEventListener("keyup", stopProp, true)
    window.addEventListener("keypress", stopProp, true)

    // Return cleanup function
    return (): void => {
        window.removeEventListener("keydown", registerKeys, true)
        window.removeEventListener("keyup", stopProp, true)
        window.removeEventListener("keypress", stopProp, true)
    }
}
