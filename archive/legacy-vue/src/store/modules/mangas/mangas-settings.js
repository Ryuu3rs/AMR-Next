/**
 * Mangas Settings Actions Module
 * Contains display/layout/settings-related actions for manga management
 */

import storedb from "../../../amr/storedb"
import { mangaKey } from "../../../shared/utils"
import { getIconHelper } from "../../../amr/icon-helper"
import { getSyncManager, getSyncManagerInstance, setSyncManagerInstance } from "./mangas-sync-manager"
import { debug } from "../../../core/debug"

/**
 * Settings-related actions
 */
export const settingsActions = {
    /**
     * Change manga display mode
     */
    async setMangaDisplayMode({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        message.key = key
        const mg = state.all.find(manga => manga.key === key)
        commit("setMangaDisplayMode", message, fromSync)
        dispatch("findAndUpdateManga", mg)
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(mg, "display")
        }
    },

    /**
     * Change manga reader layout mode
     */
    async setMangaLayoutMode({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        message.key = key
        const mg = state.all.find(manga => manga.key === key)
        commit("setMangaLayoutMode", message, fromSync)
        dispatch("findAndUpdateManga", mg)
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(mg, "layout")
        }
    },

    /**
     * Change manga reader webtoon mode
     */
    async setMangaWebtoonMode({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        message.key = key
        const mg = state.all.find(manga => manga.key === key)
        commit("setMangaWebtoonMode", message, fromSync)
        dispatch("findAndUpdateManga", mg)
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(mg, "webtoon")
        }
    },

    /**
     * Change manga reader zoom value
     */
    async setMangaZoomMode({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        message.key = key
        const mg = state.all.find(manga => manga.key === key)
        commit("setMangaZoomMode", message)
        dispatch("findAndUpdateManga", mg)
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(mg, "zoom")
        }
    },

    /**
     * Change manga display name
     */
    async setMangaDisplayName({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const mg = state.all.find(manga => manga.key === message.key)
        commit("setMangaDisplayName", message, fromSync)
        dispatch("findAndUpdateManga", mg)
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(mg, "displayName")
        }
    },

    /**
     * Reset manga reading for a manga to first chapter
     */
    async resetManga({ dispatch, commit, getters, rootState, state }, message) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        const mg = state.all.find(manga => manga.key === key)
        commit("resetManga", mg)
        dispatch("findAndUpdateManga", mg)
        let syncManager = getSyncManagerInstance()
        if (!syncManager) {
            syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
            setSyncManagerInstance(syncManager)
        }
        await syncManager.setToRemote(mg, "ts")
    },

    /**
     * Save the state of reading (currentChapter and currentScanUrl)
     */
    async saveCurrentState({ dispatch, commit, getters, rootState, state }, message) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        commit("saveCurrentState", { key, ...message })
        const mg = state.all.find(manga => manga.key === key)
        dispatch("findAndUpdateManga", mg)
        return true
    },

    /**
     * Change the read top on a manga
     */
    async markMangaReadTop({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            message.key = key
            commit("setMangaReadTop", message, fromSync)
            dispatch("findAndUpdateManga", mg)
            if (!fromSync) {
                let syncManager = getSyncManagerInstance()
                if (!syncManager) {
                    syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                    setSyncManagerInstance(syncManager)
                }
                await syncManager.setToRemote(mg, "read")
            }
        }
        const iconHelper = getIconHelper({ state: rootState, getters })
        iconHelper.refreshBadgeAndIcon()
    },

    /**
     * Mark manga as having an update error
     */
    markHasUpdateError({ dispatch, commit }, { manga, errorCode }) {
        commit("markHasUpdateError", { manga, errorCode })
        dispatch("findAndUpdateManga", manga)
    },

    /**
     * Mark manga as having no update error
     */
    markNoUpdateError({ dispatch, commit }, manga) {
        commit("markNoUpdateError", manga)
        dispatch("findAndUpdateManga", manga)
    },

    /**
     * Change the update top on a manga
     */
    async markMangaUpdateTop({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            message.key = key
            commit("setMangaUpdateTop", message, fromSync)
            dispatch("findAndUpdateManga", mg)
            if (!fromSync) {
                let syncManager = getSyncManagerInstance()
                if (!syncManager) {
                    syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                    setSyncManagerInstance(syncManager)
                }
                await syncManager.setToRemote(mg, "update")
            }
        }
        const iconHelper = getIconHelper({ state: rootState, getters })
        iconHelper.refreshBadgeAndIcon()
    },

    /**
     * Refresh chapters and update mangas from the message mangas list
     */
    async refreshMangas({ dispatch, getters, rootState }, { manga }) {
        const iconHelper = getIconHelper({ state: rootState, getters })
        iconHelper.spinIcon()
        try {
            await dispatch("refreshLastChapters", manga)
            await storedb.storeManga(manga)
        } catch (e) {
            debug.storage.error("Error in forceRefreshList:", e)
        }
        iconHelper.stopSpinning()
    }
}
