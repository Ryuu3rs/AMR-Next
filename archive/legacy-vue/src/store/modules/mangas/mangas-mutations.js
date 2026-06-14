/**
 * Mangas Mutations Module
 * All possible mutations on manga objects.
 *
 * It is very important to write a mutation each time we need to update or create fields on a manga object.
 * This way, mutations are propagated in the different instances of the store.
 * If not, some modifications can be not reflected and not saved to the database.
 * A mutation MUST be a synchronous function.
 */

import Manga from "../../../amr/manga"
import { formatMangaName } from "../../../shared/utils"
import { reactiveSet, reactiveDelete } from "../../../shared/vue-compat"
import { debug } from "../../../core/debug"

export const mutations = {
    /**
     * Set the list of mangas in the store
     * Protected against clearing mangas when new list is empty but current list has data
     * This prevents race conditions from VuexMutationSharer clearing the list
     */
    setMangas(state, mangas) {
        debug.storage.debug(
            "setMangas called with " + (mangas?.length || 0) + " mangas, current:",
            state.all?.length || 0
        )

        // Protect against clearing existing mangas with empty array
        // This happens when another page initializes and shares an empty setMangas mutation
        if ((!mangas || mangas.length === 0) && state.all?.length > 0) {
            debug.storage.warn(
                "Blocked setMangas from clearing " + state.all.length + " existing mangas with empty array"
            )
            return // Don't clear existing mangas
        }

        state.all = mangas || []
    },

    /**
     * Set timestamp options for a manga
     */
    setMangaTsOpts(state, key, date) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.tsOpts = date || Date.now()
        }
    },

    /**
     * Change manga display mode
     */
    setMangaDisplayMode(state, { key, url, mirror, language, display }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.display = display
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Change manga reader layout mode
     */
    setMangaLayoutMode(state, { key, url, mirror, language, layout }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.layout = layout
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Change manga reader webtoon mode
     */
    setMangaWebtoonMode(state, { key, url, mirror, language, webtoon }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.webtoon = webtoon
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Change manga reader zoom mode
     */
    setMangaZoomMode(state, { key, url, mirror, language, zoom }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.zoom = zoom
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Change manga display name
     */
    setMangaDisplayName(state, { key, displayName }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.displayName = displayName
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Set that the manga has an error updating
     */
    markHasUpdateError(state, { manga, errorCode }) {
        const mg = state.all.find(m => m.key === manga.key)
        if (mg !== undefined) {
            mg.updateError = 1
            mg.updateErrorCode = errorCode
        }
    },

    /**
     * Set that the manga has no error updating
     */
    markNoUpdateError(state, { key }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.updateError = 0
            mg.updateErrorCode = 0
        }
    },

    /**
     * Mark a manga as orphaned (mirror dead or manga removed from source)
     */
    markAsOrphaned(state, { key, reason }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.orphaned = true
            mg.orphanedReason = reason || "Mirror unavailable"
            mg.lastKnownUrl = mg.url
        }
    },

    /**
     * Clear orphaned status (after successful re-linking)
     */
    clearOrphanedStatus(state, { key }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.orphaned = false
            mg.orphanedReason = ""
        }
    },

    /**
     * Change manga read top
     */
    setMangaReadTop(state, { key, url, read, mirror, language }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.read = read
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Change manga update top
     */
    setMangaUpdateTop(state, { key, url, update, mirror, language }, fromSync) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.update = update
            if (!fromSync) mg.tsOpts = Date.now()
        }
    },

    /**
     * Set upts to now (means: 'last time we found a new chapter is now')
     */
    updateMangaLastChapTime(state, { key }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) mg.upts = Date.now()
    },

    /**
     * Update the list of chapters of a manga
     */
    updateMangaListChaps(state, { key, listChaps }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.listChaps = listChaps
        }
    },

    /**
     * Update the list of languages supported of a manga
     */
    updateMangaListLangs(state, { key, langs }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.languages = langs
        }
    },

    /**
     * Update the last read chapter of a manga
     */
    updateMangaLastChapter(state, { key, obj }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.lastChapterReadURL = obj.lastChapterReadURL
            mg.lastChapterReadName = obj.lastChapterReadName
            if (!obj.fromSite) {
                debug.storage.debug("updated ts")
                mg.ts = Math.round(Date.now() / 1000)
            }
        }
    },

    /**
     * Change manga informations when a manga is consulted, update some of the properties
     */
    updateMangaEntryWithInfos(state, { key, obj }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            if (mg.name === "" && obj.name !== mg.name) {
                mg.name = obj.name
            }
            if (obj.display) {
                mg.display = obj.display
            }
            if (obj.layout) {
                mg.layout = obj.layout
            }
            if (obj.read) {
                mg.read = obj.read
            }
            if (obj.update) {
                mg.update = obj.update
            }
            if (obj.cats !== undefined && obj.cats !== null) {
                if (obj.cats instanceof Array) {
                    mg.cats = obj.cats
                } else {
                    mg.cats = JSON.parse(obj.cats) || []
                }
            }
            if (obj.ts && obj.fromSite) {
                mg.ts = obj.ts
            }
        }
    },

    /**
     * Reset manga reading for a manga to first chapter
     */
    resetManga(state, { key }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            if (mg.listChaps.length > 0) {
                mg.lastChapterReadURL = mg.listChaps[mg.listChaps.length - 1][1]
                mg.lastChapterReadName = mg.listChaps[mg.listChaps.length - 1][0]
                mg.ts = Math.round(Date.now() / 1000)
            }
        }
    },

    /**
     * Save current state (currentChapter, currentScanUrl)
     */
    saveCurrentState(state, { key, currentChapter, currentScanUrl }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            mg.currentChapter = currentChapter
            mg.currentScanUrl = currentScanUrl
        }
    },

    /**
     * Create a new manga
     */
    createManga(state, mgdef) {
        const mg = new Manga(mgdef, mgdef.key)
        const titMg = formatMangaName(mg.name)
        const smgs = state.all.filter(manga => formatMangaName(manga.name) === titMg)
        for (const sim of smgs) {
            mg.cats.push(...sim.cats)
            mg.layout = sim.layout
        }
        mg.cats = [...new Set(mg.cats)]
        state.all.push(mg)
    },

    /**
     * Delete a manga
     */
    deleteManga(state, key) {
        const mgindex = state.all.findIndex(manga => manga.key === key)
        if (mgindex >= 0) {
            state.all.splice(mgindex, 1)
        }
    },

    /**
     * Links a category to a manga
     */
    addCategoryToManga(state, { key, name }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            if (!mg.cats.includes(name)) {
                mg.cats.push(name)
            }
        }
    },

    /**
     * Unlink a category from a manga
     */
    removeCategoryFromManga(state, { key, name }) {
        const mg = state.all.find(manga => manga.key === key)
        if (mg !== undefined) {
            if (mg.cats.includes(name)) {
                mg.cats.splice(mg.cats.indexOf(name), 1)
            }
        }
    },

    /**
     * Toggle selection of a manga
     */
    onSelectChange(state, mangaKey) {
        if (state.selected[mangaKey]) {
            reactiveDelete(state.selected, mangaKey)
        } else {
            reactiveSet(state.selected, mangaKey, true)
        }
    },

    /**
     * Clear all manga selections
     */
    clearSelection(state) {
        reactiveSet(state, "selected", {})
    }
}
