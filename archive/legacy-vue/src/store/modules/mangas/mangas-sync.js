/**
 * Mangas Sync Actions Module
 * Contains sync-related actions for manga synchronization
 */

import storedb from "../../../amr/storedb"
import Manga from "../../../amr/manga"
import { getSyncManager, getSyncManagerInstance, setSyncManagerInstance } from "./mangas-sync-manager"
import { mdFixLang, mdFixLangKey, mdFixLangsListPrefix } from "../../../shared/mangaDexUtil"

/**
 * Sync-related actions
 */
export const syncActions = {
    /**
     * Fix MangaDex language issues during initialization
     */
    async mdFixLang({ getters, rootState, dispatch }) {
        const mangasdb = await storedb.getMangaList()
        const mgs = mangasdb.filter(
            mg => mg.mirror === "MangaDex V5" && new RegExp(mdFixLangsListPrefix.join("|")).test(mg.key)
        )
        if (!mgs.length) {
            return
        }
        const temporarySyncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
        const payload = []
        for (const oldManga of mgs) {
            const key = mdFixLangKey(oldManga.key)
            const newManga = new Manga(oldManga, key)
            newManga.language = mdFixLang(newManga.language)
            newManga.languages = mdFixLang(newManga.languages)
            payload.push({ oldManga, newManga })
            await storedb.replace({ oldManga, newManga })
        }
        await temporarySyncManager.fixLang(payload)
    },

    /**
     * Initialize syncManager
     */
    async initSync({ commit, rootState, dispatch, getters }) {
        const currentSyncManager = getSyncManagerInstance()
        if (currentSyncManager) currentSyncManager.stop()
        const newSyncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
        setSyncManagerInstance(newSyncManager)
        newSyncManager.start()
    },

    /**
     * Update syncManager options
     * @param {key: string, value: boolean} payload
     */
    async updateSync({ getters, rootState, dispatch }, payload) {
        let currentSyncManager = getSyncManagerInstance()
        if (currentSyncManager) {
            currentSyncManager.stop()
            currentSyncManager.init(getters.syncOptions, rootState, dispatch)
            currentSyncManager.start()
        } else {
            currentSyncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
            setSyncManagerInstance(currentSyncManager)
            currentSyncManager.start()
        }
    }
}
