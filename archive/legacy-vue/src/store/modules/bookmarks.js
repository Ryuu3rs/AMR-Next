import storedb from "../../amr/storedb"
import { bookmarkKey } from "../../shared/utils"

/**
 *  initial state of the bookmarks module
 */
const state = {
    /**
     * List of bookmarks
     */
    all: [],
    /**
     * Index map for O(1) bookmark lookups by key
     * Maintained automatically by mutations
     */
    _keyIndex: new Map()
}

// getters
const getters = {
    /**
     * Return the whole list of bookmarks
     */
    allBookmarks: state => state.all
}

const actions = {
    /**
     * Get bookmarks from local database
     * @param {*} param0
     */
    async initBookmarksFromDB({ commit, dispatch }) {
        const bookmarks = await storedb.getBookmarks() // Get bookmarks from local database
        // set bookmarks list in store
        commit("setBookmarks", bookmarks)
    },
    /**
     * Create a bookmark in the store
     * @param {*} param0
     * @param {*} bm
     */
    async createBookmark({ commit, rootState }, bm) {
        if (!bm.key) {
            bm.key = bookmarkKey({ bookmark: bm, rootState: { state: rootState } })
        }
        commit("createBookmark", bm)
        await storedb.storeBookmark(bm)
    },
    /**
     * Updates the note on a bookmark
     * @param {*} param0
     * @param {*} bm bookmark with new note
     */
    async updateBookmarkNote({ commit, rootState }, bm) {
        if (!bm.key) {
            bm.key = bookmarkKey({ bookmark: bm, rootState: { state: rootState } })
        }
        commit("updateBookmarkNote", bm)
        await storedb.storeBookmark(bm)
    },
    /**
     * Delete a bookmark in the store
     * @param {*} param0
     * @param {*} bm existing bookmark
     */
    async deleteBookmark({ commit, rootState }, bm) {
        const key = bookmarkKey({ bookmark: bm, rootState: { state: rootState } })
        if (state.all.some(bookmark => bookmark.key === key)) {
            commit("deleteBookmark", key)
            await storedb.deleteBookmark(key)
        }
    }
}

/**
 * All possible mutations on bookmarks objects
 * It is very important to write a mutation each time we need to update or create fields on a bookmark object.
 * This way, mutations are propagated in the different instances of the store.
 * If not, some modifications can be not reflected and not saved to the database.
 * A mutation MUST be a synchrone function
 */
const mutations = {
    /**
     * Set the list of bookmarks in the store
     * @param {*} state
     * @param {*} bookmarks
     */
    setBookmarks(state, bookmarks) {
        state.all = []
        state.all.push(...bookmarks)
        // Rebuild index
        state._keyIndex.clear()
        for (const bm of bookmarks) {
            if (bm.key) {
                state._keyIndex.set(bm.key, bm)
            }
        }
    },
    /**
     * Create a new bookmark
     * @param {*} state
     * @param {*} bm object containing bookmark info
     */
    createBookmark(state, bm) {
        if (!bm.key) {
            bm.key = bookmarkKey({ bookmark: bm, rootState: this.$store })
        }
        state.all.push(bm)
        // Update index
        if (bm.key) {
            state._keyIndex.set(bm.key, bm)
        }
    },
    /**
     * Updates the note on a bookmark
     * @param {*} state
     * @param {*} bm bookmark with new note
     */
    async updateBookmarkNote(state, bm) {
        // Use index for O(1) lookup
        const bmn = state._keyIndex.get(bm.key) || state.all.find(bookmark => bookmark.key === bm.key)
        if (bmn !== undefined) {
            bmn.note = bm.note
            // Ensure index is up to date
            if (bm.key && !state._keyIndex.has(bm.key)) {
                state._keyIndex.set(bm.key, bmn)
            }
        }
    },
    /**
     * Delete a bookmark
     * @param {*} state
     * @param {*} key key of the bookmark to delete
     */
    deleteBookmark(state, key) {
        const bmindex = state.all.findIndex(bookmark => bookmark.key === key)
        if (bmindex >= 0) {
            state.all.splice(bmindex, 1)
        }
        // Remove from index
        state._keyIndex.delete(key)
    }
}

export default {
    state,
    getters,
    actions,
    mutations
}
