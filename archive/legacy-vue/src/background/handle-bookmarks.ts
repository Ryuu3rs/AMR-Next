import i18n from "../amr/i18n"
import browser from "webextension-polyfill"
import { AppStore } from "../types/common"
import { mangaKey } from "../shared/utils"
import { MirrorLoader } from "../mirrors/MirrorLoader"
import { NOT_HANDLED_MESSAGE } from "./background-util"

export class HandleBookmarks {
    private context_ids: string[]

    constructor(private store: AppStore, private mirrorLoader: MirrorLoader) {
        this.context_ids = []
    }
    async handle(message, sender) {
        switch (message.action) {
            case "getBookmarkNote":
                const noteBM = this.getBookmark(message)
                return {
                    isBooked: noteBM.booked,
                    note: noteBM.note,
                    scanSrc: noteBM.scanSrc
                }
            case "getBookmarksForChapter":
                // Batched API: get all scan bookmarks for a chapter in one call
                return this.getBookmarksForChapter(message)
            case "deleteBookmark":
                this.deleteBookmark(message)
                return {}
            case "addUpdateBookmark":
                this.addBookmark(message)
                return Promise.resolve({})
            case "createContextMenu":
                const url = message.lstUrls[0]
                if (this.context_ids.indexOf(url) < 0) {
                    this.context_ids.push(url)
                    const id = browser.contextMenus.create({
                        title: i18n("background_bookmark_menu"),
                        contexts: ["image", "link"],
                        onclick: function (info, tab) {
                            browser.scripting.executeScript({
                                target: { tabId: tab.id },
                                func: function (srcUrl) {
                                    if (typeof globalThis.clickOnBM === "function") {
                                        globalThis.clickOnBM(srcUrl)
                                    }
                                },
                                args: [info.srcUrl]
                            })
                        },
                        targetUrlPatterns: [encodeURI(url), url]
                    })
                }
                return Promise.resolve({})
            case "getScanUrl":
                return this.getScanUrl(message)
            default:
                return NOT_HANDLED_MESSAGE
        }
    }

    /**
     * Gets a scan url
     */
    async getScanUrl(message) {
        const impl = await this.mirrorLoader.getImpl(message.mirror)
        return impl.getImageUrlFromPage(message.url)
    }
    /**
     * Find a bookmark from store using O(1) index lookup
     * @param {*} obj
     */
    findBookmark(obj) {
        const prefixKey = mangaKey({
            url: obj.chapUrl,
            mirror: obj.mirror,
            rootState: this.store
        })

        // Only generate scanUrl key if scanUrl is defined (for scan bookmarks, not chapter bookmarks)
        let key = prefixKey
        if (obj.scanUrl) {
            const scanUrlKey = mangaKey({
                url: obj.scanUrl,
                mirror: obj.mirror,
                rootState: this.store
            })
            key = `${prefixKey}_${scanUrlKey}`
        }

        // Use index for O(1) lookup instead of O(n) linear search
        const index = this.store.state.bookmarks._keyIndex
        if (index && index.has(key)) {
            return index.get(key)
        }

        // Fallback to linear search if index not available (shouldn't happen)
        return this.store.state.bookmarks.all.find(bookmark => bookmark.key === key)
    }

    getBookmark(obj) {
        const bm = this.findBookmark(obj)
        if (bm === undefined) {
            return {
                booked: false,
                note: ""
            }
        }
        if (obj.type === "chapter") {
            return {
                booked: true,
                note: bm.note
            }
        }
        return {
            booked: true,
            note: bm.note,
            scanSrc: obj.scanUrl
        }
    }

    /**
     * Get all scan bookmarks for a chapter in one batch call
     * Reduces O(scans) messages to O(1) message
     * @param {*} obj - { mirror, url, chapUrl, scanUrls: string[] }
     * @returns {Object} - Map of scanUrl -> { isBooked, note }
     */
    getBookmarksForChapter(obj) {
        const result = {
            chapter: { isBooked: false, note: "" },
            scans: {}
        }

        // Get chapter bookmark
        const chapterBm = this.getBookmark({
            mirror: obj.mirror,
            url: obj.url,
            chapUrl: obj.chapUrl,
            type: "chapter"
        })
        result.chapter = {
            isBooked: chapterBm.booked,
            note: chapterBm.note
        }

        // Get all scan bookmarks
        for (const scanUrl of obj.scanUrls || []) {
            const scanBm = this.getBookmark({
                mirror: obj.mirror,
                url: obj.url,
                chapUrl: obj.chapUrl,
                scanUrl: scanUrl,
                type: "scan"
            })
            result.scans[scanUrl] = {
                isBooked: scanBm.booked,
                note: scanBm.note
            }
        }

        return result
    }

    /**
     * Adds a bookmark in store
     * @param {*} obj
     */
    addBookmark(obj) {
        const bm = this.findBookmark(obj)
        const tosave = {
            mirror: obj.mirror,
            url: obj.url,
            chapUrl: obj.chapUrl,
            type: obj.type,
            name: obj.name,
            chapName: obj.chapName,
            scanUrl: obj.scanUrl,
            scanName: obj.scanName,
            note: obj.note
        }
        if (bm === undefined) {
            // adds a new bookmark
            this.store.dispatch("createBookmark", tosave)
        } else {
            // update bookmark note
            this.store.dispatch("updateBookmarkNote", tosave)
        }
    }

    /**
     * Deletes a bookmark from store
     * @param {*} obj
     */
    deleteBookmark(obj) {
        // adds a new bookmark
        this.store.dispatch("deleteBookmark", {
            chapUrl: obj.chapUrl,
            scanUrl: obj.scanUrl,
            mirror: obj.mirror
        })
    }
}
