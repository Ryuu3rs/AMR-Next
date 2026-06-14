/**
 * Mangas Reading Actions Module
 * Contains reading-related actions for manga management
 */

import { mangaKey, chapPath } from "../../../shared/utils"
import { getIconHelper } from "../../../amr/icon-helper"
import { getSyncManager, getSyncManagerInstance, setSyncManagerInstance } from "./mangas-sync-manager"
import { debug as coreDebug } from "../../../core/debug"

const logger = { debug: coreDebug.reader.debug, info: coreDebug.reader.info, error: coreDebug.reader.error }

/**
 * Reading-related actions
 */
export const readingActions = {
    /**
     * Read a manga: update latest read chapter if the current chapter is more recent than the previous one
     */
    async readManga({ dispatch, commit, getters, rootState, state }, message) {
        coreDebug.reader.debug("readManga action called:", { name: message.name, mirror: message.mirror })

        // Validate required fields to prevent _no_key_ entries
        if (!message.url) {
            coreDebug.reader.error("readManga FAILED - missing URL. Manga data:", {
                name: message.name,
                mirror: message.mirror,
                url: message.url
            })
            // Return error info instead of silently failing
            return {
                success: false,
                error: "MISSING_URL",
                message: `Cannot import manga "${message.name || "Unknown"}" - missing URL`
            }
        }

        if (!message.mirror) {
            coreDebug.reader.error("readManga FAILED - missing mirror. Manga data:", {
                name: message.name,
                mirror: message.mirror,
                url: message.url
            })
            return {
                success: false,
                error: "MISSING_MIRROR",
                message: `Cannot import manga "${message.name || "Unknown"}" - missing mirror`
            }
        }

        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        coreDebug.reader.debug("readManga key:", key)

        // Prevent _no_key_ entries from being created
        if (key === "_no_key_") {
            coreDebug.reader.error("readManga FAILED - would create _no_key_ entry:", message)
            return {
                success: false,
                error: "INVALID_KEY",
                message: `Cannot import manga "${message.name || "Unknown"}" - invalid key generated`
            }
        }

        if (key.indexOf("unknown") === 0) {
            coreDebug.reader.error("readManga FAILED - unknown mirror: " + message.mirror, message)
            return {
                success: false,
                error: "UNKNOWN_MIRROR",
                message: `Cannot import manga "${message.name || "Unknown"}" - mirror "${message.mirror}" not found`
            }
        }
        const iconHelper = getIconHelper({ state: rootState, getters })
        const mg = state.all.find(manga => manga.key === key)
        if (mg === undefined) {
            coreDebug.reader.debug("readManga - manga not in list, creating unlisted manga")
            await dispatch("createUnlistedManga", message)
            coreDebug.reader.debug("readManga - createUnlistedManga completed")
            iconHelper.refreshBadgeAndIcon()
            return
        }

        try {
            await dispatch("consultManga", message)
        } catch (e) {
            coreDebug.reader.error("consultManga error:", e)
        }

        dispatch("findAndUpdateManga", mg)
        iconHelper.refreshBadgeAndIcon()
    },

    /**
     * Called when a manga entry is consulted
     */
    async consultManga({ dispatch, commit, getters, rootState, state }, message) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })

        let posOld = -1
        let posNew = -1
        const mg = state.all.find(manga => manga.key === key)

        const mgchap = chapPath(mg.lastChapterReadURL)
        const messchap = chapPath(message.lastChapterReadURL)

        for (let i = 0; i < mg.listChaps.length; i++) {
            if (chapPath(mg.listChaps[i][1]) === mgchap) {
                posOld = i
            }
            if (chapPath(mg.listChaps[i][1]) === messchap) {
                posNew = i
            }
        }

        commit("updateMangaEntryWithInfos", { key: mg.key, obj: message })

        if (posNew !== -1) {
            if (message.fromSite || posNew < posOld || posOld === -1) {
                commit("updateMangaLastChapter", { key: mg.key, obj: message }, { root: true })
                if (!message.isSync) {
                    let syncManager = getSyncManagerInstance()
                    if (!syncManager) {
                        syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                        setSyncManagerInstance(syncManager)
                    }
                    await syncManager.setToRemote(mg, "ts")
                }
            }
            return
        }

        if (mg.update !== 1) {
            return
        }

        let listChaps = await dispatch("getMangaListOfChapters", mg)
        if (listChaps !== undefined && !Array.isArray(listChaps)) {
            if (mg.language === undefined) {
                throw new Error(
                    "Mirror language is undefined. the case is handled for new mangas but not here when manga already exists"
                )
            }
            if (listChaps[mg.language] && listChaps[mg.language].length > 0) {
                const listLangs = Object.keys(listChaps).join(",")
                commit("updateMangaListLangs", { key: mg.key, langs: listLangs })
                listChaps = listChaps[mg.language]
            } else {
                logger.debug(
                    "required language " +
                        mg.language +
                        " does not exist in resulting list of chapters for manga " +
                        mg.name +
                        " on " +
                        mg.mirror +
                        ". Existing languages are : " +
                        Object.keys(listChaps).join(",")
                )
            }
        }
        if (listChaps.length > 0) {
            commit("updateMangaListChaps", { key: mg.key, listChaps: listChaps })
            const mgchap2 = chapPath(mg.lastChapterReadURL)
            const messchap2 = chapPath(message.lastChapterReadURL)
            for (let i = 0; i < listChaps.length; i++) {
                if (chapPath(listChaps[i][1]) === mgchap2) posOld = i
                if (chapPath(listChaps[i][1]) === messchap2) posNew = i
            }
            if (posNew !== -1 && (message.fromSite || posNew < posOld || posOld === -1)) {
                commit("updateMangaLastChapter", { key: mg.key, obj: message })
                if (!message.isSync) {
                    let syncManager = getSyncManagerInstance()
                    if (!syncManager) {
                        syncManager = getSyncManager(getters.syncOptions, rootState, dispatch)
                        setSyncManagerInstance(syncManager)
                    }
                    await syncManager.setToRemote(mg, "ts")
                }
            }
        }
    }
}
