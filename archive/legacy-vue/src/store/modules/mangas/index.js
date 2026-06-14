/**
 * Mangas Store Module
 * Main entry point that combines all manga-related state, getters, actions, and mutations
 */

import storedb from "../../../amr/storedb"
import Manga from "../../../amr/manga"
import { mangaKey } from "../../../shared/utils"
import { debug } from "../../../core/debug"

// Import state and getters
import { state, getters } from "./mangas-state"

// Import mutations
import { mutations } from "./mangas-mutations"

// Import action modules
import { syncActions } from "./mangas-sync"
import { crudActions } from "./mangas-crud"
import { chapterActions } from "./mangas-chapters"
import { settingsActions } from "./mangas-settings"
import { readingActions } from "./mangas-reading"
import { updateActions } from "./mangas-update"

/**
 * Initialize mangas from database action
 */
const initActions = {
    /**
     * Retrieve manga list from DB, initialize the store
     * Also cleans up any corrupted entries (e.g., _no_key_ entries from bad imports)
     */
    async initMangasFromDB({ commit, dispatch, rootState }) {
        await dispatch("mdFixLang")
        await storedb.getMangaList().then(async mangasdb => {
            // Filter out corrupted entries and delete them from DB
            const corruptedEntries = mangasdb.filter(mg => !mg.key || mg.key === "_no_key_" || !mg.url || !mg.mirror)
            if (corruptedEntries.length > 0) {
                debug.storage.warn(
                    "Cleanup Found " + corruptedEntries.length + " corrupted manga entries, removing from database"
                )
                for (const corrupted of corruptedEntries) {
                    try {
                        await storedb.deleteManga(corrupted.key || "_no_key_")
                    } catch (e) {
                        debug.storage.error("Failed to delete corrupted entry: " + corrupted.key, e)
                    }
                }
            }

            // Filter to only valid entries
            const validMangas = mangasdb.filter(mg => mg.key && mg.key !== "_no_key_" && mg.url && mg.mirror)

            await dispatch("updateLanguageCategories")
            commit(
                "setMangas",
                validMangas.map(
                    mg =>
                        new Manga(
                            mg,
                            mangaKey({
                                url: mg.url,
                                mirror: mg.mirror,
                                language: mg.language,
                                rootState: { state: rootState }
                            })
                        )
                )
            )
        })
    }
}

/**
 * Combined actions from all modules
 */
const actions = {
    ...initActions,
    ...syncActions,
    ...crudActions,
    ...chapterActions,
    ...settingsActions,
    ...readingActions,
    ...updateActions
}

export default {
    state,
    getters,
    actions,
    mutations
}
