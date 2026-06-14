/**
 * State of bookmarks linked to the current chapter
 * Helpers to load / save / delete bookmarks
 */
import { reactive } from "vue"
import browser from "webextension-polyfill"

import pageData from "./pagedata"
import { debug } from "../../core/debug"

export default {
    state: reactive({
        booked: false, // true if chapter is booked
        note: undefined, // note of current chapter
        scans: [], // list of scans [{url, name, note, booked}]
        scansMap: new Map() // URL -> scan object for O(1) lookups (Performance Fix)
    }),

    mirror: {
        mirrorName: ""
    },

    /**
     * Clear all state to prevent memory leaks when switching chapters
     * This should be called before loading a new chapter
     */
    clear() {
        this.state.booked = false
        this.state.note = undefined
        this.state.scans.splice(0, this.state.scans.length)
        this.state.scansMap.clear()
    },

    /** Initialize state with a whole list of scans urls */
    init(scansUrl, mirror) {
        // Clean up previous state first (Memory Leak Fix)
        this.clear()
        this.mirror = mirror
        // Clear existing scans and push new ones to maintain reactivity
        this.state.scans.length = 0
        this.state.scansMap.clear()

        const newScans = scansUrl.map((url, i) => {
            return {
                index: i,
                url: url,
                name: "" + (i + 1),
                booked: false,
                note: undefined
            }
        })

        this.state.scans.push(...newScans)

        // Build the Map for O(1) lookups
        for (const scan of newScans) {
            this.state.scansMap.set(scan.url, scan)
        }

        // Load all bookmarks in one batched call instead of per-scan messages
        this.loadAllBookmarks(scansUrl)
    },

    /** retrieve a scan from state with O(1) lookup */
    getScan(scanUrl) {
        return this.state.scansMap.get(scanUrl) || null
    },

    /** Save a bookmark */
    async saveBookmark({ note, scanUrl, scanName } = {}) {
        debug.storage.debug("saveBookmark called", { note, scanUrl, scanName })
        debug.storage.debug("mirror:", this.mirror)
        debug.storage.debug("pageData.state:", pageData.state)

        const obj = {
            action: "addUpdateBookmark",
            mirror: this.mirror.mirrorName,
            url: pageData.state.currentMangaURL,
            chapUrl: pageData.state.currentChapterURL,
            name: pageData.state.name,
            chapName: pageData.state.currentChapter,
            note: note
        }
        if (!scanUrl) {
            obj.type = "chapter"
        } else {
            obj.type = "scan"
            obj.scanUrl = scanUrl
            obj.scanName = scanName
        }
        debug.storage.debug("Sending bookmark message:", obj)
        try {
            const result = await browser.runtime.sendMessage(obj)
            debug.storage.debug("Bookmark save result:", result)
        } catch (error) {
            debug.storage.error("Bookmark save error:", error)
            throw error
        }

        if (!scanUrl) {
            this.state.note = note
            this.state.booked = true
        } else {
            const sc = this.getScan(scanUrl)
            if (sc) {
                sc.note = note
                sc.booked = true
            }
        }
        debug.storage.debug("Bookmark state updated:", this.state)
    },
    /** Delete a bookmark */
    async deleteBookmark({ scanUrl } = {}) {
        const obj = {
            action: "deleteBookmark",
            mirror: this.mirror.mirrorName,
            url: pageData.state.currentMangaURL,
            chapUrl: pageData.state.currentChapterURL
        }
        if (!scanUrl) {
            obj.type = "chapter"
        } else {
            obj.type = "scan"
            obj.scanUrl = scanUrl
        }
        await browser.runtime.sendMessage(obj)

        if (!scanUrl) {
            this.state.note = undefined
            this.state.booked = false
        } else {
            const sc = this.getScan(scanUrl)
            if (sc) {
                sc.note = undefined
                sc.booked = false
            }
        }
    },

    /** Load all bookmarks for chapter and scans in one batched call */
    async loadAllBookmarks(scanUrls) {
        const obj = {
            action: "getBookmarksForChapter",
            mirror: this.mirror.mirrorName,
            url: pageData.state.currentMangaURL,
            chapUrl: pageData.state.currentChapterURL,
            scanUrls: scanUrls
        }

        const result = await browser.runtime.sendMessage(obj)

        // Update chapter bookmark
        if (result.chapter) {
            this.state.note = result.chapter.note
            this.state.booked = result.chapter.isBooked
        }

        // Update all scan bookmarks
        if (result.scans) {
            for (const scanUrl in result.scans) {
                const sc = this.getScan(scanUrl)
                if (sc) {
                    sc.note = result.scans[scanUrl].note
                    sc.booked = result.scans[scanUrl].isBooked
                }
            }
        }
    },

    /** Check data for a bookmark from server (legacy single-scan API, kept for compatibility) */
    async loadBookmark({ scanUrl } = {}) {
        const obj = {
            action: "getBookmarkNote",
            mirror: this.mirror.mirrorName,
            url: pageData.state.currentMangaURL,
            chapUrl: pageData.state.currentChapterURL
        }
        if (!scanUrl) {
            obj.type = "chapter"
        } else {
            obj.type = "scan"
            obj.scanUrl = scanUrl
        }
        const result = await browser.runtime.sendMessage(obj)

        if (!scanUrl) {
            this.state.note = result.note
            this.state.booked = result.isBooked
        } else {
            const sc = this.getScan(scanUrl)
            if (sc) {
                sc.note = result.note
                sc.booked = result.isBooked
            }
        }
    }
}
