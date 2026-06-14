/**
 * AMR Debug System - Modular, toggle-able logging
 *
 * Features:
 * - Per-module toggles (scans, reader, mirrors, background, etc.)
 * - Log levels (error, warn, info, debug, trace)
 * - Runtime enable/disable via window.AMR_DEBUG
 * - Optional persistence to browser.storage.local
 *
 * Usage:
 *   import { debug } from '@/core/debug'
 *   debug.reader.info('Loading chapter', { url })
 *   debug.scans.debug('Image loaded', { width, height })
 *
 * Enable at runtime:
 *   window.AMR_DEBUG = true                    // Enable all
 *   window.AMR_DEBUG = { scans: true }         // Enable specific module
 *   window.AMR_DEBUG = { level: 'trace' }      // Set log level
 */

// Log levels in order of severity (lower index = more severe)
const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"] as const
type LogLevel = (typeof LOG_LEVELS)[number]

// Available debug modules
const DEBUG_MODULES = ["reader", "scans", "mirrors", "background", "storage", "events", "crypto", "ui"] as const
type DebugModule = (typeof DEBUG_MODULES)[number]

// Debug configuration
interface DebugConfig {
    enabled: boolean
    level: LogLevel
    modules: Partial<Record<DebugModule, boolean>>
    persist: boolean
    maxPersistLines: number
}

// Extend Window interface
declare global {
    interface Window {
        AMR_DEBUG?: boolean | Partial<DebugConfig>
        AMR_DEBUG_LOGS?: string[]
    }
}

// Default configuration
const defaultConfig: DebugConfig = {
    enabled: false,
    level: "info",
    modules: {},
    persist: false,
    maxPersistLines: 200
}

// Runtime state
let persistedLogs: string[] = []

/**
 * Get current debug configuration by merging defaults with window.AMR_DEBUG
 */
function getConfig(): DebugConfig {
    const config = { ...defaultConfig }

    if (typeof globalThis !== "undefined" && "AMR_DEBUG" in globalThis) {
        const windowDebug = (globalThis as typeof window).AMR_DEBUG
        if (windowDebug === true) {
            config.enabled = true
        } else if (typeof windowDebug === "object" && windowDebug !== null) {
            if ("enabled" in windowDebug) config.enabled = !!windowDebug.enabled
            else config.enabled = true // If object provided, assume enabled
            if (windowDebug.level && LOG_LEVELS.includes(windowDebug.level as LogLevel)) {
                config.level = windowDebug.level as LogLevel
            }
            if (windowDebug.modules) {
                config.modules = { ...windowDebug.modules }
            }
            if ("persist" in windowDebug) config.persist = !!windowDebug.persist
        }
    }

    // Also check NODE_ENV for development mode
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
        config.enabled = true
    }

    return config
}

/**
 * Check if a log should be output based on module and level
 */
function shouldLog(module: DebugModule, level: LogLevel): boolean {
    const config = getConfig()
    if (!config.enabled) return false

    // Check module-specific toggle
    if (Object.keys(config.modules).length > 0) {
        if (config.modules[module] === false) return false
        if (config.modules[module] !== true && !Object.values(config.modules).some(v => v === true)) {
            // No modules explicitly enabled, allow all
        } else if (config.modules[module] !== true) {
            return false
        }
    }

    // Check log level
    const configLevelIndex = LOG_LEVELS.indexOf(config.level)
    const messageLevelIndex = LOG_LEVELS.indexOf(level)
    return messageLevelIndex <= configLevelIndex
}

/**
 * Format log message with timestamp and module
 */
function formatMessage(module: DebugModule, level: LogLevel, msg: string): string {
    const ts = new Date().toISOString().substring(11, 23) // HH:mm:ss.SSS
    return `[${ts}][${module.toUpperCase()}][${level.toUpperCase()}] ${msg}`
}

/**
 * Persist log line to memory buffer (can be dumped to storage on demand)
 */
function persistLog(formatted: string): void {
    const config = getConfig()
    if (!config.persist) return

    persistedLogs.push(formatted)
    if (persistedLogs.length > config.maxPersistLines) {
        persistedLogs = persistedLogs.slice(-config.maxPersistLines)
    }

    // Expose to window for easy access
    if (typeof globalThis !== "undefined") {
        ;(globalThis as typeof window).AMR_DEBUG_LOGS = persistedLogs
    }
}

/**
 * Core log function
 */
function log(module: DebugModule, level: LogLevel, msg: string, data?: unknown): void {
    if (!shouldLog(module, level)) return

    const formatted = formatMessage(module, level, msg)
    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log"

    if (data !== undefined) {
        console[consoleMethod](formatted, data)
    } else {
        console[consoleMethod](formatted)
    }

    persistLog(formatted + (data ? ` ${JSON.stringify(data)}` : ""))
}

/**
 * Create a module-specific logger
 */
function createModuleLogger(module: DebugModule) {
    return {
        error: (msg: string, data?: unknown) => log(module, "error", msg, data),
        warn: (msg: string, data?: unknown) => log(module, "warn", msg, data),
        info: (msg: string, data?: unknown) => log(module, "info", msg, data),
        debug: (msg: string, data?: unknown) => log(module, "debug", msg, data),
        trace: (msg: string, data?: unknown) => log(module, "trace", msg, data)
    }
}

// ============ Exported Debug Interface ============

/** Module-specific loggers */
export const debug = {
    reader: createModuleLogger("reader"),
    scans: createModuleLogger("scans"),
    mirrors: createModuleLogger("mirrors"),
    background: createModuleLogger("background"),
    storage: createModuleLogger("storage"),
    events: createModuleLogger("events"),
    crypto: createModuleLogger("crypto"),
    ui: createModuleLogger("ui")
} as const

/** Enable debug mode at runtime */
export function enableDebug(config?: Partial<DebugConfig>): void {
    if (typeof globalThis !== "undefined") {
        ;(globalThis as typeof window).AMR_DEBUG = config ?? true
        console.log("[AMR] Debug mode enabled", config ?? "all modules")
    }
}

/** Disable debug mode at runtime */
export function disableDebug(): void {
    if (typeof globalThis !== "undefined") {
        ;(globalThis as typeof window).AMR_DEBUG = false
        console.log("[AMR] Debug mode disabled")
    }
}

/** Get persisted logs */
export function getPersistedLogs(): string[] {
    return [...persistedLogs]
}

/** Clear persisted logs */
export function clearPersistedLogs(): void {
    persistedLogs = []
    if (typeof globalThis !== "undefined") {
        ;(globalThis as typeof window).AMR_DEBUG_LOGS = []
    }
}

/** Check if debug is currently enabled */
export function isDebugEnabled(): boolean {
    return getConfig().enabled
}

/** Dump logs to browser.storage.local (async) */
export async function persistLogsToStorage(): Promise<void> {
    try {
        const browser = await import("webextension-polyfill")
        await browser.default.storage.local.set({
            amrDebugLogs: {
                ts: Date.now(),
                lines: persistedLogs.slice()
            }
        })
    } catch {
        // Storage not available (e.g., not in extension context)
    }
}

// Expose to window for console access
if (typeof globalThis !== "undefined") {
    const win = globalThis as typeof window & {
        enableAMRDebug?: typeof enableDebug
        disableAMRDebug?: typeof disableDebug
        dumpAMRLogs?: typeof persistLogsToStorage
    }
    win.enableAMRDebug = enableDebug
    win.disableAMRDebug = disableDebug
    win.dumpAMRLogs = persistLogsToStorage
}

export default debug
