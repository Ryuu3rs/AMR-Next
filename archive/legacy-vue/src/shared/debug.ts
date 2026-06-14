/**
 * Debug utility for AMR - Backwards compatibility wrapper
 *
 * This file wraps the new core/debug.ts module for backwards compatibility.
 * New code should import directly from '@/core/debug' instead.
 *
 * To enable debug logging:
 * - Call window.AMR_DEBUG = true in browser console
 * - Or call enableAMRDebug() in browser console
 */

import { debug, isDebugEnabled, enableDebug as coreEnableDebug, disableDebug as coreDisableDebug } from "../core/debug"

/**
 * Debug log - only logs if debug mode is enabled
 * @param args - Arguments to pass to console.log
 */
export function debugLog(...args: unknown[]): void {
    debug.ui.info(args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "))
}

/**
 * Debug warn - only logs if debug mode is enabled
 * @param args - Arguments to pass to console.warn
 */
export function debugWarn(...args: unknown[]): void {
    debug.ui.warn(args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "))
}

/**
 * Debug error - only logs if debug mode is enabled
 * @param args - Arguments to pass to console.error
 */
export function debugError(...args: unknown[]): void {
    debug.ui.error(args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "))
}

/**
 * Enable debug mode at runtime
 * Call this from browser console: enableAMRDebug()
 */
export function enableAMRDebug(): void {
    coreEnableDebug()
}

/**
 * Disable debug mode at runtime
 * Call this from browser console: disableAMRDebug()
 */
export function disableAMRDebug(): void {
    coreDisableDebug()
}

export default {
    log: debugLog,
    warn: debugWarn,
    error: debugError,
    enable: enableAMRDebug,
    disable: disableAMRDebug,
    isEnabled: isDebugEnabled
}
