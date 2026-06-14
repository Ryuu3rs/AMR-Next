/**
 * Mangas Sync Manager Instance
 * Manages the singleton sync manager instance
 */

import { getSyncManager as getOriginalSyncManager } from "../../../amr/sync/SyncManager"

/**
 * Singleton sync manager instance
 */
let syncManager = null

/**
 * Get the current sync manager instance
 * @returns {object|null} The sync manager instance or null
 */
export function getSyncManagerInstance() {
    return syncManager
}

/**
 * Set the sync manager instance
 * @param {object} manager - The sync manager instance
 */
export function setSyncManagerInstance(manager) {
    syncManager = manager
}

/**
 * Get or create a sync manager instance
 * @param {object} syncOptions - Sync options
 * @param {object} rootState - Root state
 * @param {function} dispatch - Dispatch function
 * @returns {object} The sync manager instance
 */
export function getSyncManager(syncOptions, rootState, dispatch) {
    return getOriginalSyncManager(syncOptions, rootState, dispatch)
}

/**
 * Ensure sync manager exists and return it
 * @param {object} getters - Vuex getters
 * @param {object} rootState - Root state
 * @param {function} dispatch - Dispatch function
 * @returns {object} The sync manager instance
 */
export function ensureSyncManager(getters, rootState, dispatch) {
    if (!syncManager) {
        syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
    }
    return syncManager
}
