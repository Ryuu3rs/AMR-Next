/**
 * Mangas State Module
 * Contains the initial state and getters for manga management
 */

import { chapPath } from "../../../shared/utils"
import { getSyncOptions } from "../../../shared/Options"

/**
 * Initial state of the mangas module
 */
export const state = {
    /**
     * List of unique manga groups selected
     */
    selected: {},
    /**
     * List of followed mangas
     */
    all: []
}

/**
 * Getters for manga state
 */
export const getters = {
    /**
     * Return the whole list of followed mangas
     */
    allMangas: state => state.all,

    /**
     * Count mangas
     */
    countMangas: state => {
        return state.all.length
    },

    /**
     * Return the whole list of followed mangas
     */
    selectedManga: state => state.selected,
    selectedMangasCount: state => Object.keys(state.selected).length,
    selectedMangasKeys: state => Object.keys(state.selected),

    /**
     * Return true if there is unread chapters in manga list
     */
    hasNewMangas: state => {
        for (const mg of state.all) {
            // Ensure listChaps is an array before accessing
            if (mg.listChaps && Array.isArray(mg.listChaps) && mg.listChaps.length > 0) {
                if (chapPath(mg.listChaps[0][1]) != chapPath(mg.lastChapterReadURL) && mg.read == 0) {
                    return true
                }
            }
        }
        return false
    },

    /**
     * Return count of unread chapters in manga list
     */
    nbNewMangas: state => {
        let nb = 0
        for (const mg of state.all) {
            if (mg.listChaps.length > 0) {
                if (chapPath(mg.listChaps[0][1]) != chapPath(mg.lastChapterReadURL) && mg.read == 0) {
                    nb++
                }
            }
        }
        return nb
    },

    syncOptions: (state, getters, rootState) => {
        return getSyncOptions(rootState.options)
    },

    allOptions: rootState => {
        return Object.keys(rootState.options).reduce((obj, key) => {
            obj[key] = rootState.options[key]
            return obj
        }, {})
    }
}
