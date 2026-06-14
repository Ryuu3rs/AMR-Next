/**
 * Mangas Chapters Actions Module
 * Contains chapter-related actions for manga management
 */

import { mangaKey, chapPath, isMultiLanguageList, findProbableChapter, gistDebug } from "../../../shared/utils"
import { getMirrorLoader } from "../../../mirrors/MirrorLoader"
import { getMirrorHelper } from "../../../mirrors/MirrorHelper"
import { getIconHelper } from "../../../amr/icon-helper"
import { getNotificationManager } from "../../../amr/notifications"
import { getSyncManager, getSyncManagerInstance, setSyncManagerInstance } from "./mangas-sync-manager"
import { ABSTRACT_MANGA_MSG, ERROR_CODE_EMPTY_LIST, MANGA_UPDATE_STOP, MANGA_READ_STOP } from "./mangas-constants"
import { debug as coreDebug } from "../../../core/debug"

const logger = { debug: coreDebug.storage.debug, info: coreDebug.storage.info, error: coreDebug.storage.error }

/**
 * Chapter-related actions
 */
export const chapterActions = {
    /**
     * Get list of chapters for a manga
     */
    async getMangaListOfChapters({ dispatch, commit, getters, rootState }, manga) {
        const mirrorLoader = getMirrorLoader(getMirrorHelper(rootState.options))
        const impl = await mirrorLoader.getImpl(manga.mirror)
        if (!impl || impl.disabled) {
            await dispatch("disabledManga", manga)
            throw new Error(`Failed to get implementation for mirror ${manga.mirror}`)
        }
        return impl.getListChaps(manga.url)
    },

    /**
     * Stop Reading and Following updates
     */
    async disabledManga({ dispatch }, manga) {
        manga.update = MANGA_UPDATE_STOP
        manga.read = MANGA_READ_STOP
        await dispatch("findAndUpdateManga", manga)
    },

    /**
     * Return list of chapters. Clean up multi language list if needed.
     */
    async getMangaChapters({ dispatch, commit, getters, rootState, state }, mg) {
        logger.debug("waiting for manga list of chapters for " + mg.name + " on " + mg.mirror)
        const listChaps = await dispatch("getMangaListOfChapters", mg)

        if (!isMultiLanguageList(listChaps)) {
            return listChaps
        }

        if (mg.language === undefined) {
            const availableChapterLanguages = Object.keys(listChaps)
            if (availableChapterLanguages.length === 0) {
                throw new Error(`Failed to get valid language for ${mg.key}`)
            }
            const readable = rootState.options.readlanguages

            const languagesToAdd = availableChapterLanguages.filter(l => readable.includes(l))

            if (languagesToAdd.length === 0) {
                languagesToAdd.push(availableChapterLanguages[0])
            }
            for (const language of languagesToAdd) {
                dispatch("readManga", {
                    url: mg.url,
                    mirror: mg.mirror,
                    language: language,
                    name: mg.name
                })
            }

            dispatch("deleteManga", mg)
            throw ABSTRACT_MANGA_MSG
        }

        logger.debug(
            "chapters in multiple languages found for " +
                mg.name +
                " on " +
                mg.mirror +
                " --> select language " +
                mg.language
        )
        if (listChaps[mg.language] && listChaps[mg.language].length > 0) {
            const listOfLanguages = Object.keys(listChaps).join(",")
            commit("updateMangaListLangs", { key: mg.key, langs: listOfLanguages })
            return listChaps[mg.language]
        }

        logger.debug(
            "required language " +
                mg.language +
                " does not exist in resulting list of chapters. Existing languages are : " +
                Object.keys(listChaps).join(",")
        )
        return listChaps
    },

    /**
     * Check if there is new chapters on a manga entry
     */
    async refreshLastChapters({ dispatch, commit, getters, rootState, state }, message, fromSync) {
        const key = mangaKey({
            url: message.url,
            mirror: message.mirror,
            language: message.language,
            rootState: { state: rootState }
        })
        const mg = state.all.find(manga => manga.key === key)
        if (mg.update !== 1) {
            return
        }

        const listChaps = await dispatch("getMangaChapters", mg)
        if (listChaps.length <= 0) {
            logger.error(`Not chapters found for ${key}, skipping refreshLastChapters...`)
            dispatch("markHasUpdateError", { manga: mg, errorCode: ERROR_CODE_EMPTY_LIST })
            return
        }

        const oldLastChap = typeof mg.listChaps[0] === "object" ? mg.listChaps[0][1] : undefined

        logger.debug(listChaps.length + " chapters found for " + mg.name + " on " + mg.mirror)
        commit("updateMangaListChaps", { key: mg.key, listChaps: listChaps })
        dispatch("markNoUpdateError", mg)

        const newLastChap = mg.listChaps[0][1]

        if (newLastChap !== oldLastChap && oldLastChap !== undefined) {
            if (!fromSync && !message.isSync) {
                getNotificationManager({ state: rootState }).notifyNewChapter(mg)
            }
            commit("updateMangaLastChapTime", { key: mg.key })
        }

        if (!mg.lastChapterReadURL) {
            commit("updateMangaLastChapter", {
                key: mg.key,
                obj: {
                    lastChapterReadURL: listChaps[listChaps.length - 1][1],
                    lastChapterReadName: listChaps[listChaps.length - 1][0],
                    fromSite: false
                }
            })
            return
        }
        if (rootState.options.gistDebugEnabled) {
            gistDebug(getters.syncOptions.gistSyncSecret, getters.syncOptions.gistSyncGitID, "amrResets.json", {
                name: mg.name,
                mirror: mg.mirror,
                oldPath: mg.lastChapterReadURL,
                oldName: mg.lastChapterReadName,
                newPath: listChaps[listChaps.length - 1][1],
                newName: listChaps[listChaps.length - 1][0],
                dateTime: new Date().toLocaleString()
            }).catch(e => logger.error(e))
        }

        const lastReadPath = chapPath(mg.lastChapterReadURL)
        const lastRead = mg.listChaps.find(arr => chapPath(arr[1]) === lastReadPath)
        if (lastRead) {
            return
        }

        logger.debug(
            "Manga " +
                mg.name +
                " on " +
                mg.mirror +
                " has a lastChapterReadURL set to " +
                mg.lastChapterReadURL +
                " but this url can no more be found in the chapters list. First url in list is " +
                mg.listChaps[0][1] +
                ". "
        )
        const probable = findProbableChapter(mg.lastChapterReadURL, mg.listChaps)
        if (probable !== undefined) {
            const [name, url] = probable
            logger.debug(`Found probable chapter : ${name} : ${url}`)
            commit("updateMangaLastChapter", {
                key: mg.key,
                obj: { lastChapterReadURL: url, lastChapterReadName: name, fromSite: false }
            })
            return
        }

        logger.debug("No list entry or multiple list entries match the known last chapter. Reset to first chapter")
        commit("updateMangaLastChapter", {
            key: mg.key,
            obj: {
                lastChapterReadURL: listChaps[listChaps.length - 1][1],
                lastChapterReadName: listChaps[listChaps.length - 1][0],
                fromSite: false
            }
        })
    }
}
