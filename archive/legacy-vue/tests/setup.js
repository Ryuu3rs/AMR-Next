/**
 * Vitest test setup file
 * Configures global mocks and test utilities
 */
import { vi } from "vitest"

// Mock webextension-polyfill globally
vi.mock("webextension-polyfill", () => {
    return import("./mocks/webextension-polyfill.js")
})

// Mock BroadcastChannel for VuexMutationSharer
global.BroadcastChannel = class BroadcastChannel {
    constructor(name) {
        this.name = name
        this.onmessage = null
    }
    postMessage(message) {}
    close() {}
}

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    }))
})

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
        this.callback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
        this.callback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
}

// Mock fetch
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
        blob: () => Promise.resolve(new Blob())
    })
)

// Reset mocks between tests
beforeEach(() => {
    vi.clearAllMocks()
})
