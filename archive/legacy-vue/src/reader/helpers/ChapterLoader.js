import pageData from "../state/pagedata"
import bookmarks from "../state/bookmarks"
import { scansProvider, ScansLoader } from "./ScansProvider"
import browser from "webextension-polyfill"
import { debug } from "../../core/debug"

/**
 * This class loads a chapter, retrieve informations, scans, and initialize or reinitialize the reader with all this data
 */
export default class ChapterLoader {
    constructor(url, mirror) {
        this.mirror = mirror
        this.url = url
        this.isAChapter = false
        this.infos = null
        this.images = null
        this.title = null
        this.scansProvider = null
    }
    /**
     * Initialize the Chapter loading :
     *  - if this.url is not null, load the chapter in background
     *  - check if it is a chapter page through implementation
     *  - get informations from page using implementation
     *  - get images from page
     * @param {*} url
     */
    async checkAndLoadInfos() {
        let url = this.url
        debug.reader.debug("ChapterLoader.checkAndLoadInfos() starting for:", url?.substring(0, 60))
        if (!url) {
            debug.reader.error("MISSING URL checkAndLoadInfos")
            url = window.location.href
        }

        // If we're on the current page, pass the DOM content directly to avoid
        // re-fetching which can fail due to Cloudflare or other protections.
        // IMPORTANT: strip stylesheets because injected CSS (ex: Vuetify) can include
        // huge inline sourcemaps that bloat the HTML string and can cause massive memory spikes.
        let htmlContent = null
        if (url === window.location.href && document.documentElement) {
            const rawHtml = document.documentElement.outerHTML
            // Keep scripts (some mirrors embed image URLs in scripts), but remove CSS.
            // This is intentionally conservative: CSS is not needed for mirror parsing.
            htmlContent = rawHtml
                .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "")

            debug.reader.debug("ChapterLoader - using current page HTML (sanitized)", {
                rawLength: rawHtml?.length,
                sanitizedLength: htmlContent?.length
            })
        }

        debug.reader.debug("ChapterLoader - sending getChapterData to background")
        const msg = {
            action: "getChapterData",
            url: url,
            htmlContent: htmlContent, // pass DOM content if available
            mirrorName: this.mirror.mirrorName, // assuming we read on the same mirror (no other possibilities for now...)
            language: pageData.state.language // and in the same language...
        }
        const data = await browser.runtime.sendMessage(msg)
        // Help GC: avoid keeping large strings alive longer than necessary.
        msg.htmlContent = null
        htmlContent = null
        debug.reader.debug("ChapterLoader - getChapterData response:", {
            isChapter: data?.isChapter,
            infos: data?.infos ? "present" : "missing",
            imagesCount: data?.images?.length,
            title: data?.title?.substring?.(0, 40)
        })

        this.isAChapter = data.isChapter
        this.infos = data.infos
        this.images = data.images
        this.title = data.title
    }

    /**
     * This method allows to pre load the scans without switching to this chapter in the current state
     */
    loadScans() {
        debug.reader.debug(
            (this.url ? this.url : "current page") + " --> " + this.images.length + " images to load in background"
        )
        this.scansProvider = new ScansLoader(this.images, this.mirror)
        this.scansProvider.load() // pre load scans
        return this.scansProvider
    }

    /**
     * Once checkAndLoadInfos has been called,
     * loadInReader switch the current state to this specific chapter to read
     */
    loadInReader(options) {
        debug.reader.debug("ChapterLoader.loadInReader() called", {
            isAChapter: this.isAChapter,
            imagesCount: this.images?.length,
            options: options ? Object.keys(options) : "none"
        })
        if (this.isAChapter) {
            debug.reader.debug("ChapterLoader.loadInReader - is a chapter, loading pageData")
            // Clear previous pageData state to prevent memory leaks when switching chapters
            pageData.clear()
            // Initialize pageData state
            pageData.load(this.infos)

            if (!this.images || this.images.length === 0) {
                // No images, chapter loading fails
                debug.reader.debug("ChapterLoader.loadInReader - NO IMAGES, returning false")
                return false
            }
            debug.reader.debug("ChapterLoader.loadInReader - has", this.images.length, "images to load")

            bookmarks.init(this.images, this.mirror) // initialize scans bookmarks state
            // initialize scans loading
            if (this.scansProvider === null) {
                debug.reader.debug("ChapterLoader.loadInReader - calling scansProvider.init()")
                scansProvider.init(this.images, this.mirror, options.imgorder === 1) // new scan loader
            } else {
                debug.reader.debug("ChapterLoader.loadInReader - calling scansProvider.initWithProvider()")
                scansProvider.initWithProvider(this.scansProvider) // scans already totally or partially loaded from this loader, switch the state to that scans loader
            }
            debug.reader.debug("ChapterLoader.loadInReader - scansProvider state:", {
                scansCount: scansProvider.state.scans.length,
                progress: scansProvider.state.progress,
                loaded: scansProvider.state.loaded
            })
            return true
        } else {
            debug.reader.debug("ChapterLoader.loadInReader - NOT a chapter, returning false")
            return false
        }
    }
}
