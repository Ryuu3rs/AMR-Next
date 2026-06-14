/**
 * AMR Storage Module - Browser storage wrapper
 *
 * Provides typed, async wrapper around browser.storage.local
 * with automatic JSON serialization and debug logging.
 *
 * Usage:
 *   import { storage } from '@/core/storage'
 *
 *   // Get a value
 *   const value = await storage.get<MyType>('key')
 *
 *   // Set a value
 *   await storage.set('key', { foo: 'bar' })
 *
 *   // Remove a value
 *   await storage.remove('key')
 */

import browser from "webextension-polyfill"
import { debug } from "./debug"

/**
 * Get a value from storage
 * @param key Storage key
 * @param defaultValue Default value if key doesn't exist
 */
export async function get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
        const result = await browser.storage.local.get(key)
        const value = result[key]

        if (value === undefined) {
            debug.storage.trace(`get: ${key} (not found, using default)`)
            return defaultValue
        }

        debug.storage.trace(`get: ${key}`, { hasValue: true })
        return value as T
    } catch (error) {
        debug.storage.error(`get failed: ${key}`, error)
        return defaultValue
    }
}

/**
 * Get multiple values from storage
 * @param keys Array of storage keys
 */
export async function getMany<T extends Record<string, unknown>>(keys: (keyof T)[]): Promise<Partial<T>> {
    try {
        const result = await browser.storage.local.get(keys as string[])
        debug.storage.trace(`getMany: ${keys.length} keys`)
        return result as Partial<T>
    } catch (error) {
        debug.storage.error("getMany failed", error)
        return {}
    }
}

/**
 * Set a value in storage
 * @param key Storage key
 * @param value Value to store
 */
export async function set<T>(key: string, value: T): Promise<void> {
    try {
        await browser.storage.local.set({ [key]: value })
        debug.storage.trace(`set: ${key}`)
    } catch (error) {
        debug.storage.error(`set failed: ${key}`, error)
        throw error
    }
}

/**
 * Set multiple values in storage
 * @param items Object with key-value pairs to store
 */
export async function setMany(items: Record<string, unknown>): Promise<void> {
    try {
        await browser.storage.local.set(items)
        debug.storage.trace(`setMany: ${Object.keys(items).length} keys`)
    } catch (error) {
        debug.storage.error("setMany failed", error)
        throw error
    }
}

/**
 * Remove a value from storage
 * @param key Storage key to remove
 */
export async function remove(key: string): Promise<void> {
    try {
        await browser.storage.local.remove(key)
        debug.storage.trace(`remove: ${key}`)
    } catch (error) {
        debug.storage.error(`remove failed: ${key}`, error)
        throw error
    }
}

/**
 * Remove multiple values from storage
 * @param keys Array of storage keys to remove
 */
export async function removeMany(keys: string[]): Promise<void> {
    try {
        await browser.storage.local.remove(keys)
        debug.storage.trace(`removeMany: ${keys.length} keys`)
    } catch (error) {
        debug.storage.error("removeMany failed", error)
        throw error
    }
}

/**
 * Clear all values from storage
 * WARNING: This removes ALL extension data!
 */
export async function clear(): Promise<void> {
    try {
        await browser.storage.local.clear()
        debug.storage.warn("clear: All storage cleared!")
    } catch (error) {
        debug.storage.error("clear failed", error)
        throw error
    }
}

/**
 * Get all keys in storage
 */
export async function keys(): Promise<string[]> {
    try {
        const all = await browser.storage.local.get(null)
        const allKeys = Object.keys(all)
        debug.storage.trace(`keys: ${allKeys.length} total`)
        return allKeys
    } catch (error) {
        debug.storage.error("keys failed", error)
        return []
    }
}

/** Storage module exports */
export const storage = {
    get,
    getMany,
    set,
    setMany,
    remove,
    removeMany,
    clear,
    keys
}

export default storage
