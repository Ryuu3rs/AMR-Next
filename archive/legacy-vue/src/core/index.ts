/**
 * AMR Core Module
 *
 * Central exports for all core utilities.
 * Import from '@/core' or 'src/core' for convenience.
 */

// Debug system
export {
    debug,
    enableDebug,
    disableDebug,
    isDebugEnabled,
    getPersistedLogs,
    clearPersistedLogs,
    persistLogsToStorage
} from "./debug"

// Event system
export { createEventEmitter } from "./events"
export type { IEventEmitter, EventMap, EventHandler } from "./events"

// Crypto utilities
export {
    base64Decode,
    base64Encode,
    hexDecode,
    hexEncode,
    utf8Encode,
    utf8Decode,
    aesDecryptNative,
    aesEncryptNative,
    randomBytes,
    sha256
} from "./crypto"

// Storage wrapper
export { storage } from "./storage"
