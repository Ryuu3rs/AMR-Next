/**
 * Mangas CRUD Actions Module
 * Contains CRUD operations for manga management
 */

import storedb from "../../../amr/storedb"
import { mangaKey, readLanguage } from "../../../shared/utils"
import { getSyncManager, getSyncManagerInstance, setSyncManagerInstance } from "./mangas-sync-manager"
import { getIconHelper } from "../../../amr/icon-helper"
import samples from "../../../amr/samples"
import { ABSTRACT_MANGA_MSG } from "./mangas-constants"
import { debug } from "../../../core/debug"

/**
 * CRUD-related actions
 */
export const crudActions = {
    /**
     * Add a manga in the store
     */
    async addManga({ dispatch, getters, rootState, state }, { manga, fromSync }) {
        debug.storage.debug("addManga called, saving to database:", { key: manga?.key, name: manga?.name })
        try {
            // Convert reactive Proxy to plain object for IndexedDB storage
            const plainManga = JSON.parse(JSON.stringify(manga))
            await storedb.storeManga(plainManga)
            debug.storage.debug("storedb.storeManga completed successfully for:", manga?.key)
        } catch (e) {
            debug.storage.error("storedb.storeManga FAILED:", e)
        }
        await dispatch("exportManga", manga, { root: true })
        if (!fromSync) {
            let syncManager = getSyncManagerInstance()
            if (!syncManager) {
                syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                setSyncManagerInstance(syncManager)
            }
            await syncManager.setToRemote(manga, "ts")
        }
        try {
            dispatch("setOption", { key: "updated", value: Date.now() })
            dispatch("setOption", { key: "changesSinceSync", value: 1 })
        } catch (e) {
            debug.storage.error("Error while updating sync timestamp:", e)
        }
    },

    /**
     * Update a manga in the store (or create if it doesn't exist)
     * Uses upsert pattern to avoid errors when manga is not yet in IndexedDB
     */
    async findAndUpdateManga({ dispatch, commit }, manga) {
        if (!manga?.key) {
            debug.storage.warn("findAndUpdateManga Called with invalid manga (no key)")
            return
        }
        try {
            // Convert reactive Proxy to plain object for IndexedDB storage
            const plainManga = JSON.parse(JSON.stringify(manga))
            // Use storeManga which does upsert (put) instead of findAndUpdate which requires existing entry
            await storedb.storeManga(plainManga)
            dispatch("setOption", { key: "updated", value: Date.now() })
            dispatch("setOption", { key: "changesSinceSync", value: 1 })
        } catch (e) {
            debug.storage.error("findAndUpdateManga Error saving manga: " + manga?.key, e)
        }
    },

    /**
     * Set timestamp options for a manga
     */
    async setMangaTsOpts({ commit, dispatch, state }, manga, date) {
        if (manga) {
            const mg = state.all.find(m => m.key === manga.key)
            commit("setMangaTsOpts", mg.key, date)
        } else {
            const mgs = state.all.filter(m => typeof m.tsOpts === "undefined")
            for (const mg of mgs) {
                commit("setMangaTsOpts", mg.key)
                await dispatch("findAndUpdateManga", mg)
            }
        }
    },

    /**
     * Create an unlisted manga
     */
    async createUnlistedManga({ dispatch, commit, rootState, state }, message) {
        // Validate required fields before creating
        if (!message.url || !message.mirror) {
            debug.storage.error("createUnlistedManga FAILED - missing required fields:", {
                url: message.url,
                mirror: message.mirror,
                name: message.name
            })
            return {
                success: false,
                error: "MISSING_FIELDS",
                message: `Cannot create manga "${message.name || "Unknown"}" - missing URL or mirror`
            }
        }

        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        debug.storage.debug("createUnlistedManga called for key:", key)

        // Prevent _no_key_ entries
        if (key === "_no_key_") {
            debug.storage.error("createUnlistedManga FAILED - would create _no_key_ entry:", message)
            return {
                success: false,
                error: "INVALID_KEY",
                message: `Cannot create manga "${message.name || "Unknown"}" - invalid key`
            }
        }

        commit("createManga", {
            key,
            webtoon: rootState.options.webtoonDefault === 1,
            ...message
        })
        const mg = state.all.find(manga => manga.key === key)
        debug.storage.debug("After createManga commit, found manga in state:", mg?.name || "NOT FOUND")
        try {
            await dispatch("refreshLastChapters", message)
        } catch (e) {
            if (e === ABSTRACT_MANGA_MSG) {
                debug.storage.debug("Skipping abstract manga")
                return
            }
            debug.storage.error("refreshLastChapters error:", e)
        }

        debug.storage.debug("Calling addManga to save to database:", mg?.key)
        await dispatch("addManga", { manga: mg, fromSync: message.isSync })
        dispatch("updateLanguageCategories")
    },

    /**
     * Given its key, deletes a manga from reading list
     */
    async deleteManga({ dispatch, commit, getters, rootState, state }, message, fromSync = false) {
        const mg = state.all.find(manga => manga.key === message.key)
        if (mg !== undefined) {
            commit("deleteManga", message.key)
            storedb.deleteManga(message.key)
            dispatch("unExportManga", mg, { root: true })
            if (!fromSync) {
                let syncManager = getSyncManagerInstance()
                if (!syncManager) {
                    syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                    setSyncManagerInstance(syncManager)
                }
                await syncManager.deleteManga(message.key)
            }
        }
        const iconHelper = getIconHelper({ state: rootState, getters })
        iconHelper.refreshBadgeAndIcon()
        dispatch("updateLanguageCategories")
    },

    /**
     * Import sample mangas on user request
     */
    importSamples({ dispatch }) {
        console.debug("Importing samples manga in AMR (" + samples.length + " mangas to import)")
        for (const sample of samples) {
            sample.auto = true
            dispatch("readManga", sample)
        }
    },

    /**
     * Add category to manga
     */
    addCategoryToManga({ commit, dispatch, state }, obj) {
        const mg = state.all.find(manga => manga.key === obj.key)
        commit("addCategoryToManga", obj)
        dispatch("findAndUpdateManga", mg)
    },

    /**
     * Remove category from manga
     */
    removeCategoryFromManga({ commit, dispatch, state }, obj) {
        const mg = state.all.find(manga => manga.key === obj.key)
        commit("removeCategoryFromManga", obj)
        dispatch("findAndUpdateManga", mg)
    },

    /**
     * Updates categories to add language categories if there is mangas in more
     * than one different language
     */
    updateLanguageCategories({ commit, dispatch, rootState, state }) {
        const catsLang = rootState.options.categoriesStates.filter(cat => cat.type === "language")
        const langs = []
        for (const mg of state.all) {
            const l = readLanguage(mg, rootState.mirrors.all)
            if (l !== "aa" && !langs.includes(l)) langs.push(l)
        }
        if (catsLang.length > 0 && langs.length <= 1) {
            for (const cat of catsLang) {
                dispatch("removeLanguageCategory", cat.name)
            }
        } else if (langs.length > 1) {
            for (const l of langs) {
                if (catsLang.findIndex(cat => cat.name === l) === -1) {
                    dispatch("addLanguageCategory", l)
                }
            }
            for (const cat of catsLang) {
                if (!langs.includes(cat.name)) {
                    dispatch("removeLanguageCategory", cat.name)
                }
            }
        }
    },

    /**
     * Toggle manga selection
     */
    toggleMangaSelect({ commit }, mangaKey) {
        commit("onSelectChange", mangaKey)
    },

    /**
     * Clear manga selection
     */
    clearMangasSelect({ commit }) {
        commit("clearSelection")
    },

    /**
     * Mark a manga as orphaned (mirror dead or manga removed from source)
     */
    async markMangaAsOrphaned({ commit, dispatch, state }, { key, reason }) {
        commit("markAsOrphaned", { key, reason })
        const mg = state.all.find(manga => manga.key === key)
        if (mg) {
            await dispatch("findAndUpdateManga", mg)
        }
    },

    /**
     * Clear orphaned status after successful re-linking
     */
    async clearMangaOrphanedStatus({ commit, dispatch, state }, { key }) {
        commit("clearOrphanedStatus", { key })
        const mg = state.all.find(manga => manga.key === key)
        if (mg) {
            await dispatch("findAndUpdateManga", mg)
        }
    },

    /**
     * Get all orphaned manga
     */
    getOrphanedMangas({ state }) {
        return state.all.filter(manga => manga.orphaned === true)
    },

    /**
     * Get all manga with update errors
     */
    getMangasWithErrors({ state }) {
        return state.all.filter(manga => manga.updateError === 1)
    }
}
