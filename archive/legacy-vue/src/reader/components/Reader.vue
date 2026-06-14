<template>
    <div
        class="amr-reader-container text-center"
        :class="{ 'no-full-chapter': !fullchapter }"
        @click="pageChange"
        @dblclick="tryChapterChange"
        ref="scancontainer">
        <!-- Scans -->
        <table
            ref="scantable"
            :style="'max-width: ' + maxWidthValue + '%;'"
            class="amr-scan-container"
            :class="{ webtoon: webtoonMode }"
            border="0"
            cellspacing="0"
            cellpadding="0">
            <!-- CRITICAL FIX: Use simple index-based key
                 Vue will properly destroy and recreate Page components when pages array changes
                 The key cleanup happens in Page.vue's beforeUnmount() hook -->
            <Page
                v-for="(scans, i) in pages"
                :key="'page-' + i"
                :index="i"
                :scans="scans"
                :direction="direction"
                :resize="resize"
                :scaleUp="scaleUp"
                ref="page"
                v-show="isVisible(i)"
                @become-current="becomeCurrent" />
        </table>
        <!-- Pages navigator -->
        <div
            v-if="options.bottomNavigationEnabled"
            class="amr-pages-nav"
            :class="{ display: navHover, 'shrink-draw': drawer }"
            @mouseenter="navHover = true"
            @mouseleave="navHover = false">
            <!-- Current page state + previous next buttons -->
            <PageNavigator
                :current-page="currentPage"
                :first-scan="firstScan"
                :go-next-scan="goNextScan"
                :go-previous-scan="goPreviousScan"
                :i18n="i18n"
                :last-scan="lastScan"
                :pages="pages"
                :should-invert-keys="shouldInvertKeys" />
            <ThumbnailNavigator
                v-show="scansState.loaded"
                ref="page-navigator"
                :current-page="currentPage"
                :direction="direction"
                :display-page-scans-indexes="displayPageScansIndexes"
                :go-scan="goScan"
                :pages="pages"
                :scans-state="scansState"
                :should-invert-keys="shouldInvertKeys" />
        </div>
    </div>
</template>

<script>
import { i18nmixin } from "../../mixins/i18n-mixin"
import { scroller } from "vue-scrollto/src/scrollTo"
import browser from "webextension-polyfill"

import options from "../state/options"
import pageData from "../state/pagedata"

import { scansProvider } from "../helpers/ScansProvider"
import { Util } from "../helpers/util"
import EventBus from "../helpers/EventBus"

import Page from "./Page"
import ThumbnailNavigator from "./ThumbnailNavigator"
import PageNavigator from "./PageNavigator"
import { isFirefox } from "../../shared/utils"
import { debug } from "../../core/debug"

/** Create a custom scroller (alias of $scrollTo method) to enable multiple scrollings (thumbs scroll simultaneously page scroll) */
const thumbsScroller = scroller()

/**
 * Simple debounce utility function (Performance Fix C)
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
    let timeoutId = null
    return function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
            fn.apply(this, args)
            timeoutId = null
        }, delay)
    }
}

/**
 * Simple throttle utility function (Performance Fix B)
 * Executes function at most once per delay period
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Minimum time between executions in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, delay) {
    let lastCall = 0
    let timeoutId = null

    const throttled = function (...args) {
        const now = Date.now()
        const remaining = delay - (now - lastCall)

        if (remaining <= 0) {
            // Execute immediately
            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }
            lastCall = now
            fn.apply(this, args)
        } else if (!timeoutId) {
            // Schedule execution for when delay expires
            timeoutId = setTimeout(() => {
                lastCall = Date.now()
                timeoutId = null
                fn.apply(this, args)
            }, remaining)
        }
    }

    // FIX #5: Add cancel method for proper cleanup on unmount
    throttled.cancel = function () {
        if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
        lastCall = 0
    }

    return throttled
}

export default {
    mixins: [i18nmixin],
    data() {
        return {
            regroupablePages: [] /* How to regroup pages to make a book */,
            pages: [] /* Current list of pages to render, built from scans/regroupablePages */,
            visible: [
                0
            ] /* List of indexes of visible pages, used when not fullchapter, one one in list except for transitions */,
            currentPage: 0 /* Current displayed page */,

            originalTitle: document.title /* Original title of the page */,

            animationDuration: 250 /* Duration of scrolls animation when navigating with keys */,
            scrollStepWithKeys: 50 /* Scroll step with keys when need to scroll by steps */,
            lastKeyPressTime: 0 /* Last time a key was pressed (to detect double tap) */,
            lastKeyPress: 0 /* Last key pressed */,
            doubleTapDuration: 250 /* Laps of time between two events to be considered as doubletap */,
            scrollRatio: 0 /* Keep the scroll ratio (scrollY / total) to restore position when resizing display zone */,

            options:
                options /* Make it reactive so update to local options object will be reflected in computed properties */,

            scansState: scansProvider.state /** the provider of scan images */,
            pageData: pageData.state /* reactive pageData state (current manga chapter infos) */,

            scanClickTimeout:
                -1 /* When clicking for next scan, if this is the last scan, wait for dblclick, this is the associated timeout, we need to clear it if going next chapter */,
            currentlyThumbsScrolling: false /* Track if currently scrolling in thumbs bar (moved from module-level) */,
            isMounted: false /* Track if component is mounted to prevent race conditions in $nextTick callbacks */,
            navHover: false /* Track hover state for bottom navigation (replaces v-hover) */
        }
    },
    props: {
        /** Currently loaded mirror implementation **/
        mirror: Object,
        direction: String /* Reading from left to right or right to left */,
        invertKeys: Boolean /* Invert keys in right to left mode */,
        book: Boolean /* Do we display side by side pages */,
        resize: String /* Mode of resize : width, height, container */,
        fullchapter: Boolean /* Do we display whole chapter or just current page */,
        drawer: Boolean /* Is the drawer opened ? (adjust some css) */,
        scaleUp: Boolean /* Does the image scale up larger than its native size */,
        webtoonMode: Boolean /* Removes whitespace between images */,
        maxWidthValue: Number /* Changes max width % of reader */,
        shouldInvertKeys: Boolean /* If keys and buttons should be flipped */
    },
    created() {
        debug.reader.debug("Reader.created() - scansState.scans.length:", this.scansState.scans.length)

        // PERFORMANCE MONITORING: Track check-viewport event frequency
        this._checkViewportCount = 0
        this._checkViewportStartTime = Date.now()

        // Instrumentation: track whether we are rebuilding pages repeatedly
        this._rebuildPagesCount = 0
        this._rebuildPagesBurstCount = 0
        this._rebuildPagesLastTs = 0

        // Leak instrumentation: periodic snapshot timer
        this._leakReaderTimer = null
        this._leakReaderStartTs = Date.now()
        this._leakReaderLastViewportCount = 0
        this._leakReaderLastViewportTs = Date.now()

        // Leak instrumentation: small persistent ring-buffer (avoid console lockups)
        this._leakReaderLines = []
        this._leakReaderLastPersistTs = 0

        this.util = new Util(this.mirror)
        /** Initialize key handlers */
        this.autoNextChapter = false
        this.handlekeys()

        /**
         * Debounced state save to avoid excessive background messages (Performance Fix C)
         * Saves at most once every 500ms during rapid page changes
         */
        this.debouncedSaveState = debounce(() => {
            browser.runtime.sendMessage({
                action: "saveCurrentState",
                url: this.pageData.currentMangaURL,
                language: this.pageData.language,
                mirror: this.mirror.mirrorName,
                currentChapter: this.pageData.currentChapterURL,
                currentScanUrl: this.getCurrentScanUrl()
            })
        }, 500)

        /**
         * Throttled scroll handler (Performance Fix B + Critical Fix)
         * Single centralized scroll listener instead of one per Page component
         * Throttled to 100ms (10fps) - reduced from 16ms to prevent event storm
         *
         * CRITICAL: At 16ms (60fps) with 100 pages, this caused 6000 checkInViewPort()
         * calls per second, each doing DOM traversal. This was the primary cause of
         * "unresponsive script" crashes in Firefox.
         */
        this.throttledScrollHandler = throttle(() => {
            // Update scroll ratio
            this.scrollRatio = window.pageYOffset / document.documentElement.scrollHeight

            // Leak instrumentation: count check-viewport emissions
            this._checkViewportCount++

            // Broadcast to all Page components to check viewport
            EventBus.$emit("check-viewport")
        }, 100) // 10fps - much more reasonable for viewport checks

        /** Store resize handler so we can remove it later */
        this._resizeHandler = () => {
            this.keepScrollPos(10)
            // Also check viewport on resize
            EventBus.$emit("check-viewport")
        }

        /** Store EventBus handlers for cleanup */
        this._eventHandlers = {
            loadedScan: this.updateProgress,
            chapterLoaded: this.loadedChapter,
            goToScanurl: url => {
                this.util.debug("Restore previous last scan : " + url)
                // Use $once instead of $on to prevent listener accumulation
                EventBus.$once("pages-loaded", () => {
                    setTimeout(() => this.goScanUrl(url), 0)
                })
            },
            offsetBook: () => {
                this.scansState.scans[0].doublepage = !this.scansState.scans[0].doublepage
                this.loadedChapter()
            }
        }

        /** Keep scroll ratio - now using throttled handler */
        window.addEventListener("scroll", this.throttledScrollHandler)
        /** Keep scroll ratio when resizing */
        window.addEventListener("resize", this._resizeHandler)
        /** Register EventBus listeners */
        EventBus.$on("loaded-scan", this._eventHandlers.loadedScan)
        EventBus.$on("go-to-scanurl", this._eventHandlers.goToScanurl)
        EventBus.$on("chapter-loaded", this._eventHandlers.chapterLoaded)
        EventBus.$on("offset-book", this._eventHandlers.offsetBook)

        // If scans are already present when Reader is created (common when coming from background state),
        // build the initial pages once here. This avoids using an `immediate` watcher on
        // scansState.scans.length, which was causing double-render and duplicate Page/Scan instances.
        if (this.scansState.scans.length > 0) {
            debug.reader.debug("Reader.created() - scans already available, rebuilding pages once")
            this.rebuildPages()
        }
    },
    beforeUnmount() {
        // Clear mounted flag to prevent race conditions (Issue 14 fix)
        this.isMounted = false

        // Clean up window event listeners
        window.removeEventListener("scroll", this.throttledScrollHandler)
        window.removeEventListener("resize", this._resizeHandler)

        // Clean up keyboard listeners (registered in handlekeys)
        if (this._keydownHandler) {
            window.removeEventListener("keydown", this._keydownHandler, true)
        }
        if (this._keyupHandler) {
            window.removeEventListener("keyup", this._keyupHandler, true)
        }
        if (this._keypressHandler) {
            window.removeEventListener("keypress", this._keypressHandler, true)
        }

        // Clean up EventBus listeners
        if (this._eventHandlers) {
            EventBus.$off("loaded-scan", this._eventHandlers.loadedScan)
            EventBus.$off("go-to-scanurl", this._eventHandlers.goToScanurl)
            EventBus.$off("chapter-loaded", this._eventHandlers.chapterLoaded)
            EventBus.$off("offset-book", this._eventHandlers.offsetBook)
            this._eventHandlers = null
        }

        // Cancel any pending debounced operations
        if (this.debouncedSaveState && this.debouncedSaveState.cancel) {
            this.debouncedSaveState.cancel()
        }
        if (this.throttledScrollHandler && this.throttledScrollHandler.cancel) {
            this.throttledScrollHandler.cancel()
        }

        // Clear scanClickTimeout to prevent timer firing after unmount (Issue 9 fix)
        if (this.scanClickTimeout && this.scanClickTimeout !== -1) {
            clearTimeout(this.scanClickTimeout)
            this.scanClickTimeout = -1
        }
    },
    watch: {
        // Rebuild pages whenever the number of scans changes after mount.
        // NOTE: no `immediate: true` here on purpose to avoid double-render on initial mount.
        "scansState.scans.length": {
            handler(newLength, oldLength) {
                if (newLength === oldLength) return
                debug.reader.debug("scansState.scans.length changed:", oldLength, "->", newLength)

                // CRITICAL: Check for infinite growth
                if (newLength > 1000) {
                    debug.reader.error("scans.length is growing infinitely!", newLength, "- indicates memory leak")
                    return // Don't rebuild pages if we're in an infinite loop
                }

                this.rebuildPages()
            }
        },
        /** Adjust the scroll in the thumbnails bar to have at most the currentPage centered and at least visible */
        currentPage(nVal, oVal) {
            // while scrolling main page to go to selected page, currentPage is updated multiple times, do not rescroll if currently scrolling
            if (this.currentlyThumbsScrolling) return
            this.currentlyThumbsScrolling = true
            this.$nextTick(() => {
                // Rely on scansState.loaded
                const pageNavigator = this.$refs["page-navigator"]
                if (!pageNavigator) {
                    this.currentlyThumbsScrolling = false
                    return
                }

                // Guard against thumbnail not being available
                const thumbnail = pageNavigator.$refs.thumbnail?.[nVal]
                if (!thumbnail?.$el) {
                    this.currentlyThumbsScrolling = false
                    return
                }

                const $el = thumbnail.$el
                const offset = -(window.innerWidth - (this.drawer ? 300 : 0)) + $el.clientWidth

                thumbsScroller($el, this.animationDuration, {
                    container: pageNavigator.$el,
                    offset: offset / 2,
                    x: true,
                    y: false,
                    onDone: () => {
                        this.currentlyThumbsScrolling = false
                    }
                })
            })
            /** Save current page state (debounced - Performance Fix C) */
            this.debouncedSaveState()
        },
        resize(nVal, oVal) {
            this.keepScrollPos(100) // keep the scrolling ratio when changing resize mode
            if (nVal !== "none") {
                this.$refs.scantable.style.zoom = 1
            }
            /* Check if page can scroll vertically */
            this.checkResizeOverflow()
        },
        book(nVal, oVal) {
            // keep the scrolling ratio when changing book mode / not really relevant but better than nothing...
            this.keepScrollPos(100)
            // Rebuild pages when toggling book mode so layout matches the mode
            if (this.scansState.scans.length > 0) {
                this.rebuildPages()
            }
        },
        /**
         * When pages change (from not fully loaded to loaded and booked or when book property is changed),
         * try to keep the old visible scan still visible.
         */
        pages(nVal, oVal) {
            debug.reader.debug("pages watcher fired - old length:", oVal?.length, "new length:", nVal?.length)
            if (nVal.length === oVal.length) return // pages didn't change that much :)
            let furl // url of the first viewable scan on currentpage
            if (nVal.length < oVal.length) {
                // Guard against undefined scans access
                const currentScan = this.scansState.scans[this.currentPage]
                furl = currentScan?.url // retrieve it from images cause old book value was false, so one page per image
            } else {
                if (this.regroupablePages[this.currentPage] && this.regroupablePages[this.currentPage].length > 0) {
                    furl = this.regroupablePages[this.currentPage][0].src // retrieve it from rearrange pages cause old book value was true
                }
            }
            if (furl) {
                // calculate new currentPage and go to it after new arrangement has been calculated
                this.$nextTick(() => {
                    this.goScanUrl(furl)
                })
            }
        },
        /** Keep drawer state */
        drawer(nVal, oVal) {
            this.keepScrollPos() // keep the scrolling ratio when opening / closing drawer !
        },
        /** Change resize value if passing from !fullchapter to fullchapter (height and container are no more available) */
        fullchapter(nVal, oVal) {
            if (nVal && !oVal) {
                this.$nextTick(() => {
                    this.$scrollTo(
                        this.$refs.page[this.currentPage].$el,
                        -1
                    ) /* use -1 cause 0 not taken into account */
                })
            } else {
                window.scroll(0, 0)
            }
            /* Check if page can scroll vertically */
            this.checkResizeOverflow()
        }
    },
    mounted() {
        // Set mounted flag to prevent race conditions in $nextTick callbacks
        this.isMounted = true
        debug.reader.debug("Reader.mounted() - Reader component mounted")
        /* Check if page can scroll vertically */
        this.checkResizeOverflow()

        // Safety: ensure pages are built even if created() timing was off
        // This handles edge case where scans are populated between created() and mounted()
        // or where scans.length doesn't change after mount (watcher won't fire)
        this.$nextTick(() => {
            // Guard against unmounted component (Issue 14 fix)
            if (!this.isMounted) return
            if (this.scansState.scans.length > 0 && this.pages.length === 0) {
                debug.reader.debug("Reader.mounted() $nextTick - pages empty but scans exist, rebuilding")
                this.rebuildPages()
            }
        })
    },
    computed: {
        firstScan() {
            const cur = this.currentPage
            let n = cur
            if (cur - 1 >= 0) n = cur - 1
            return n === cur
        },
        lastScan() {
            const cur = this.currentPage
            let n = cur
            if (cur + 1 < this.pages.length) n = cur + 1
            return n === cur
        }
    },
    components: { PageNavigator, ThumbnailNavigator, Page },
    methods: {
        /**
         * Rebuild the list of pages from the current scans state and book mode.
         * This replaces the old `pages()` computed + `cachedSinglePages` watcher combo
         * that caused duplicate Page/Scan instances and EventBus listener leaks.
         */
        rebuildPages() {
            // FIX #6: Guard against concurrent rebuilds
            if (this._isRebuilding) {
                debug.reader.debug("rebuildPages() skipped - already rebuilding")
                return
            }
            this._isRebuilding = true

            // Detect excessive rebuildPages() calls
            this._rebuildPagesCount = (this._rebuildPagesCount || 0) + 1
            const now = Date.now()
            const lastTs = this._rebuildPagesLastTs || 0
            if (lastTs && now - lastTs < 250) {
                this._rebuildPagesBurstCount = (this._rebuildPagesBurstCount || 0) + 1
                if (this._rebuildPagesBurstCount > 20) {
                    debug.reader.warn(
                        `rebuildPages() called frequently (burst=${this._rebuildPagesBurstCount}) scans=${
                            this.scansState?.scans?.length || 0
                        } pages=${this.pages?.length || 0}`
                    )
                }
            } else {
                this._rebuildPagesBurstCount = 0
            }
            this._rebuildPagesLastTs = now

            const scans = this.scansState.scans || []
            const nbscans = scans.length
            if (!nbscans) {
                debug.reader.debug("rebuildPages - no scans, clearing pages")
                this.pages = []
                this._isRebuilding = false
                return
            }

            // If in book mode and regroupablePages has been populated, use it as source of truth.
            if (this.book && this.regroupablePages.length > 0) {
                debug.reader.debug("rebuildPages - using regroupablePages, length:", this.regroupablePages.length)
                this.pages = this.regroupablePages
                this._isRebuilding = false
                return
            }

            // Default: single-page layout, one scan per page in order
            const newPages = []
            for (let i = 0; i < nbscans; i++) {
                const sc = scans[i]
                if (!sc) continue
                newPages.push([{ src: sc.url, name: "" + (i + 1) }])
            }
            debug.reader.debug("rebuildPages - single-page layout, length:", newPages.length)
            this.pages = newPages
            this._isRebuilding = false
        },
        /**
         * Click on the scans container, if single page mode, go to next or previous page
         */
        pageChange(e) {
            this.util.clearSelection()
            if (this.fullchapter) return

            if (e.clientX >= this.$refs.scancontainer.clientWidth / 2) {
                if (this.lastScan) {
                    // last scan, wait a little before trying to go next scan so if double click, it will be handled
                    clearTimeout(this.scanClickTimeout)
                    this.scanClickTimeout = setTimeout(() => this.goNextScan(false, true), 250)
                } else {
                    this.goNextScan(false, true)
                }
            } else {
                if (this.firstScan) {
                    // first scan, wait a little before trying to go next scan so if double click, it will be handled
                    clearTimeout(this.scanClickTimeout)
                    this.scanClickTimeout = setTimeout(() => this.goPreviousScan(false, true), 250)
                } else {
                    this.goPreviousScan(false, true)
                }
            }
        },
        /**
         * Double click on the scans container :
         *  - if first scan and click left --> go to previous chapter
         *  - if last scan and click right --> go to next chapter
         */
        tryChapterChange(e) {
            this.util.clearSelection()
            if (e.clientX >= this.$refs.scancontainer.clientWidth / 2) {
                if (this.lastScan) {
                    clearTimeout(this.scanClickTimeout)
                    EventBus.$emit("go-next-chapter")
                    return
                }
            } else {
                if (this.firstScan) {
                    clearTimeout(this.scanClickTimeout)
                    EventBus.$emit("go-previous-chapter")
                    return
                }
            }
        },
        /**
         * Determine if a page should be shown.
         * Always true if fullChapter mode, just current page if not
         */
        isVisible(page_index) {
            return this.fullchapter || this.visible.includes(page_index)
        },
        /** Called when a scan has been loaded, update progression */
        updateProgress() {
            // display progression
            if (options.load == 1 && !this.scansState.loaded) {
                if (this.scansState.progress < 100) {
                    document.title = this.scansState.progress + " % - " + this.originalTitle
                } else {
                    document.title = this.originalTitle
                }
            }
        },

        /** Called when all scans from chapter have been loaded */
        loadedChapter() {
            // All scans loaded. Build the book (regroup scans that can be read side by side, depending on double page scans (width > height) position)
            const scans = []
            let lastfull = 0
            const nbscans = this.scansState.scans.length
            for (let i = 0; i < nbscans; i++) {
                let full = false
                if (this.scansState.scans[i].doublepage) {
                    full = true
                    if ((i - lastfull) % 2 !== 0) {
                        // Change display of scan which is after the previous double page scan
                        scans[lastfull].full = true
                    }
                    lastfull = i + 1
                }
                scans.push({ url: this.scansState.scans[i].url, full: full })
            }
            if ((nbscans - 1 - lastfull - 1) % 2 !== 0) {
                // Set last page full width because alone
                scans[nbscans - 1].full = true
            }
            // Calculates how to regroup pages
            let curPage = 0
            const regrouped = []
            let curScan = 0
            for (const sc of scans) {
                const toadd = { src: sc.url, name: "" + (curScan + 1) }
                if (!regrouped[curPage]) {
                    regrouped[curPage] = [toadd]
                } else {
                    regrouped[curPage].push(toadd)
                }
                if (sc.full || regrouped[curPage].length === 2) {
                    curPage++
                }
                curScan++
            }
            this.regroupablePages.length = 0
            this.regroupablePages.push(...regrouped)

            // Reset document title
            document.title = this.originalTitle

            // Pages are loaded
            EventBus.$emit("pages-loaded")

            // If we are in book mode, regroupablePages has just been updated, so rebuild pages
            if (this.book && this.scansState.scans.length > 0) {
                debug.reader.debug("loadedChapter() - rebuilding pages for book mode")
                this.rebuildPages()
            }
        },
        /** Return a string containing the scan indexes (1-based) contained in the page of index page_index in the right order (using direction ltr or rtl) */
        displayPageScansIndexes(page_index) {
            const scs = this.pages[page_index]
            if (scs.length === 1) return scs[0].name
            else {
                if (this.direction === "ltr") return scs[0].name + " - " + scs[1].name
                else return scs[1].name + " - " + scs[0].name
            }
        },
        getCurrentScanUrl() {
            let furl // url of the first viewable scan on currentpage
            if (!this.book) {
                furl = this.scansState.scans[this.currentPage].url // retrieve it from images cause one scan at a time
            } else {
                if (this.regroupablePages[this.currentPage] && this.regroupablePages[this.currentPage].length > 0) {
                    furl = this.regroupablePages[this.currentPage][0].src // retrieve it from rearrange pages cause book is displayed
                }
            }
            return furl
        },
        /** Go to scan url */
        goScanUrl(url) {
            const ncur = this.getPageIndexFromScanUrl(url)
            if (ncur >= 0) this.goScan(ncur)
        },
        /** Go to scan */
        goScan(index) {
            if (index === undefined || index < 0 || index >= this.pages.length) return
            if (!this.fullchapter) {
                // just change the visibility of current page and next page
                if (index === this.currentPage) return

                this.currentPage = index
                this.visible = [index]
                window.scroll(0, 0)
            } else {
                /* We set currentScan first so the horizontal Scroller in thumbs bar will go to the right scan. It is not necessary cause scrolling will update currentScan on it's own but if we don't, scrolling in thumbs bar is glitchy... */
                this.currentPage = index
                this.visible = [index]
                this.$scrollTo(this.$refs.page[index].$el, this.animationDuration)
            }
        },
        /** Go to next scan respecting the invert keys option */
        goNextScan(doubletap = false, clicked = false) {
            // If we are in Right to Left mode and the user set the option to also invert the keys, we invert the logic
            if (this.shouldInvertKeys) {
                return this.goPreviousScanImpl(doubletap, clicked)
            }

            return this.goNextScanImpl(doubletap, clicked)
        },
        /** Go to next scan */
        goNextScanImpl(doubletap = false, clicked = false) {
            const cur = this.currentPage
            let n = cur
            if (cur + 1 < this.pages.length) n = cur + 1

            if (doubletap && n === cur) {
                EventBus.$emit("go-next-chapter")
                return
            }

            if (!this.fullchapter) {
                // just change the visibility of current page and next page
                if (cur === n) {
                    // this is latest scan of the chapter
                    EventBus.$emit("temporary-dialog", {
                        message: clicked
                            ? this.i18n("reader_alert_lastscan_clicked")
                            : this.i18n("reader_alert_lastscan"),
                        duration: 2000
                    })
                    return
                }

                this.currentPage = n
                this.visible = [n]
                window.scroll(0, 0)
            } else {
                // if current page top is visible, go to top of the page, if not and bottom not visible, go to bottom, else and if there is a next page go to top of next page
                const curpage = this.$refs.page[this.currentPage]
                if (curpage.topInViewport && !curpage.atTop) {
                    // go to top of the current page
                    this.$scrollTo(curpage.$el, this.animationDuration)
                } else if (!curpage.bottomInViewport) {
                    // go to bottom of the current page
                    this.$scrollTo(curpage.$el, this.animationDuration, {
                        offset: curpage.$el.offsetHeight - window.innerHeight
                    })
                } else if (n !== cur) {
                    // go to top of the next page
                    this.$scrollTo(this.$refs.page[n].$el, this.animationDuration)
                }
            }
        },
        /** Go to previous scan respecting the invert keys option  */
        goPreviousScan(doubletap = false, clicked = false) {
            // If we are in Right to Left mode and the user set the option to also invert the keys, we invert the logic
            if (this.shouldInvertKeys) {
                return this.goNextScanImpl(doubletap, clicked)
            }

            return this.goPreviousScanImpl(doubletap, clicked)
        },
        /** Go to previous scan */
        goPreviousScanImpl(doubletap = false, clicked = false) {
            const cur = this.currentPage
            let n = cur
            if (cur - 1 >= 0) n = cur - 1

            if (doubletap && n === cur) {
                EventBus.$emit("go-previous-chapter")
                return
            }

            if (!this.fullchapter) {
                // just change the visibility of current page and previous page
                if (cur === n) {
                    // this is first scan of the chapter
                    EventBus.$emit("temporary-dialog", {
                        message: clicked
                            ? this.i18n("reader_alert_firstscan_clicked")
                            : this.i18n("reader_alert_firstscan"),
                        duration: 2000
                    })
                    return
                }

                this.currentPage = n
                this.visible = [n]
                window.scroll(0, 0)
            } else {
                // if current page bottom is visible, go to bottom of the current page, if not and top not visible, go to top, else and if there is a previous page go to bottom of previous page
                const curpage = this.$refs.page[this.currentPage]
                if (curpage.bottomInViewport && !curpage.atBottom) {
                    // go to top of the current page
                    this.$scrollTo(curpage.$el, this.animationDuration, {
                        offset: curpage.$el.offsetHeight - window.innerHeight
                    })
                } else if (!curpage.topInViewport) {
                    // go to bottom of the current page
                    this.$scrollTo(curpage.$el, this.animationDuration)
                } else if (n !== cur) {
                    // go to top of the next page
                    this.$scrollTo(this.$refs.page[n].$el, this.animationDuration, {
                        offset: this.$refs.page[n].$el.offsetHeight - window.innerHeight
                    })
                }
            }
        },
        /** Keep the scroll ratio in vertical scrollbar while resizing scans (open drawer, resize window, change layout options...) */
        keepScrollPos(duration = 500) {
            const ratio = this.scrollRatio
            const start = Date.now()
            const keepScrollPosAnime = () => {
                window.scroll(0, document.documentElement.scrollHeight * ratio)
                if (Date.now() - start < duration) {
                    requestAnimationFrame(keepScrollPosAnime)
                }
            }
            keepScrollPosAnime()
        },
        /** Called when a page becomes the new current page (more than half of the viewport) */
        becomeCurrent({ index }) {
            this.currentPage = index
            this.visible = [index]
        },
        /** Handle key shortcuts */
        handlekeys() {
            const registerKeys = e => {
                e = e || window.event
                const t = e.target || e.srcElement
                const prevent = () => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.stopImmediatePropagation()
                }
                if (!((t.type && t.type === "text") || (t.nodeName && t.nodeName.toLowerCase() === "textarea"))) {
                    if (!e.shiftKey && !e.altKey) {
                        // Handle double tap events
                        let doubletap = false
                        if (
                            this.lastKeyPress === e.which &&
                            Date.now() - this.lastKeyPressTime <= this.doubleTapDuration
                        ) {
                            doubletap = true
                        }
                        this.lastKeyPress = e.which
                        this.lastKeyPressTime = Date.now()

                        if (e.which === 87 || e.which === 38) {
                            //W or up arrow
                            window.scrollBy(0, -this.scrollStepWithKeys)
                            prevent()
                        }
                        if (e.which === 83 || e.which === 40) {
                            //S or down arrow
                            window.scrollBy(0, this.scrollStepWithKeys)
                            prevent()
                        }
                        if (e.which === 107 || e.which === 187 || e.which === 61) {
                            //+
                            // keep the scrolling ratio when zooming in
                            this.keepScrollPos(100)
                            // eslint-disable-next-line vue/no-mutating-props
                            this.resize = "none"
                            if (isFirefox()) {
                                const zoom = this.$refs.scantable.style.transform.replace(/[^0-9.]+/g, "")
                                if (zoom === "0" || zoom === "") {
                                    this.$refs.scantable.style.transform = "scale(1)"
                                } else {
                                    this.$refs.scantable.style.transform = `scale(${zoom * 1.1})`
                                }
                                this.$refs.scantable.style.transformOrigin = "top center"
                            } else {
                                if (!this.$refs.scantable.style.zoom || this.$refs.scantable.style.zoom === 0) {
                                    this.$refs.scantable.style.zoom = 1
                                } else {
                                    this.$refs.scantable.style.zoom = this.$refs.scantable.style.zoom * 1.1
                                }
                            }
                            prevent()
                        }
                        if (e.which === 109 || e.which === 189 || e.which === 173) {
                            //-
                            // keep the scrolling ratio when zooming out
                            this.keepScrollPos(100)
                            // eslint-disable-next-line vue/no-mutating-props
                            this.resize = "none"
                            if (isFirefox()) {
                                const zoom = this.$refs.scantable.style.transform.replace(/[^0-9.]+/g, "")
                                if (zoom === "0" || zoom === "") {
                                    this.$refs.scantable.style.transform = "scale(1)"
                                } else {
                                    this.$refs.scantable.style.transform = `scale(${zoom * 0.9})`
                                }
                                this.$refs.scantable.style.transformOrigin = "top center"
                            } else {
                                if (!this.$refs.scantable.style.zoom || this.$refs.scantable.style.zoom === 0) {
                                    this.$refs.scantable.style.zoom = 1
                                } else {
                                    this.$refs.scantable.style.zoom = this.$refs.scantable.style.zoom * 0.9
                                }
                            }
                            prevent()
                        }
                        //Left key or A
                        if (e.which === 37 || e.which === 65) {
                            if (window.pageXOffset > 0) {
                                // scroll horizontally if it is possible
                                window.scrollBy(-this.scrollStepWithKeys, 0)
                            } else {
                                // go to previous scan
                                try {
                                    this.goPreviousScan(doubletap)
                                } catch (e) {
                                    // Intentionally swallowed - prevent default in any case
                                }
                            }
                            prevent()
                        }
                        //Right key or D
                        if (e.which === 39 || e.which === 68) {
                            // go to next scan
                            if (window.innerWidth + window.pageXOffset < this.$refs.scantable.offsetWidth) {
                                // scroll horizontally if it is possible
                                window.scrollBy(this.scrollStepWithKeys, 0)
                            } else {
                                try {
                                    this.goNextScan(doubletap)
                                } catch (e) {
                                    // Intentionally swallowed - prevent default in any case
                                }
                            }
                            prevent()
                        }
                        if (e.which === 32 && this.options.magicScrollEnabled) {
                            const images = this.$refs.page
                            // Are we at the end of the last page
                            // can't use this.lastScan cause that is any point on last page, also wont work if the last scan is small
                            if (images[images.length - 1].$el.getBoundingClientRect().bottom - window.innerHeight < 1) {
                                // Should we go to next chapter because we previously reached the end of page ?
                                if (this.autoNextChapter) {
                                    try {
                                        this.autoNextChapter = false
                                        EventBus.$emit("go-next-chapter")
                                    } catch (e) {
                                        // Intentionally swallowed - prevent default in any case
                                    }
                                } else {
                                    // Prepare for next chapter
                                    this.autoNextChapter = true
                                    // gotta press spacebar again within 4s
                                    // im doing this rather than using this.goNextScan(doubletap) cause i don't like how that works
                                    setTimeout(() => {
                                        this.autoNextChapter = false
                                    }, 4000)
                                }
                            } else {
                                // Lets stay on current chapter
                                // Find current images within view
                                const targetScrollImages = [...images].filter(image => {
                                    const rect = image.$el.getBoundingClientRect()
                                    return rect.top <= window.innerHeight && rect.bottom > 1
                                })

                                // If multiple images filtered, get the last one. If none scroll use the top image
                                const targetScrollImage = targetScrollImages[targetScrollImages.length - 1] || images[0]

                                // Is the target image top within view ? then scroll to the top of it
                                if (targetScrollImage.$el.getBoundingClientRect().top > 1) {
                                    // Scroll to it
                                    this.$scrollTo(targetScrollImage.$el, this.animationDuration)
                                }
                                // Do we stay within target ? (bottom is further than current view)
                                else if (
                                    window.innerHeight + 1 <
                                    targetScrollImage.$el.getBoundingClientRect().bottom
                                ) {
                                    //scroll to 80%
                                    this.$scrollTo(document.body, {
                                        duration: this.animationDuration,
                                        offset: window.innerHeight * 0.8 + window.visualViewport.pageTop
                                    })
                                }
                                // We have to try to get to next image
                                else {
                                    // Find next image
                                    const nextScrollImage = targetScrollImage.$el.nextElementSibling
                                    // Scroll to it
                                    this.$scrollTo(nextScrollImage, this.animationDuration)
                                }
                            }
                            prevent()
                        }
                    }
                    if (e.altKey && !e.shiftKey) {
                        // Display current state in the chapter
                        if (e.which === 83) {
                            // alt + s
                            if (this.pages.length > 0) {
                                EventBus.$emit("temporary-dialog", {
                                    message:
                                        this.currentPage +
                                        1 +
                                        " / " +
                                        this.pages.length +
                                        "\n**" +
                                        Math.floor(((this.currentPage + 1) / this.pages.length) * 100) +
                                        "%**"
                                })
                            }
                            prevent()
                        }
                        // Jump to last scan
                        if (e.which === 39 || e.which === 68) {
                            // alt + d or alt + right arrow
                            this.shouldInvertKeys ? this.goScan(0) : this.goScan(this.pages.length - 1)
                            prevent()
                        }
                        // Jump to first scan
                        if (e.which === 37 || e.which === 65) {
                            // alt + a or alt + left arrow
                            this.shouldInvertKeys ? this.goScan(this.pages.length - 1) : this.goScan(0)
                            prevent()
                        }
                        // Jump to random page
                        if (e.which === 82) {
                            // alt + r
                            this.goScan(Math.floor(Math.random() * this.pages.length))
                            prevent()
                        }
                    }
                }
            }
            // Store references for cleanup in beforeUnmount
            this._keydownHandler = registerKeys
            window.addEventListener("keydown", this._keydownHandler, true)

            //disable default websites shortcuts
            const stopProp = e => e.stopImmediatePropagation()
            this._keyupHandler = stopProp
            this._keypressHandler = stopProp
            window.addEventListener("keyup", this._keyupHandler, true)
            window.addEventListener("keypress", this._keypressHandler, true)
        },
        /** Return page index from scan url */
        getPageIndexFromScanUrl(url) {
            return this.pages.findIndex(scans => scans.find(s => s.src === url))
        },
        /** add overflow:hidden on body if resize in [height, container] and !fullchapter */
        checkResizeOverflow() {
            if (["height", "container"].includes(this.resize) && !this.fullchapter) {
                document.documentElement.style.overflow = "hidden"
                window.scroll(0, 0)
            } else {
                document.documentElement.style.overflow = "auto"
            }
        }
    }
}
</script>

<style data-amr="true">
/* Reader container (replaces v-container) */
.amr-reader-container {
    width: 100%;
    padding: 0;
    padding-bottom: 16px;
}

.amr-reader-container.text-center {
    text-align: center;
}

/** Scans container table */
.amr-scan-container {
    margin-left: auto;
    margin-right: auto;
    min-height: 100vh;
    width: 100%;
}

.amr-scan-container td {
    padding-bottom: 4px;
    padding-top: 4px;
    line-height: 0;
}

.amr-scan-container-webtoon td {
    padding-bottom: 0px;
    padding-top: 0px;
    line-height: 0;
}

.webtoon.amr-scan-container td,
.no-full-chapter .amr-scan-container td {
    padding-bottom: 0px;
    padding-top: 0px;
}

.no-full-chapter,
.no-full-chapter > table {
    height: 100%;
}

.amr-scan-container td {
    text-align: center;
    vertical-align: middle;
}

/** Create an horizontal scrollbar overflowing the side drawer when necessary (resize=none) */
html {
    max-height: 100vh;
    overflow: auto;
}

/** Pages navigator toolbar */
.amr-page-next-prev .amr-toolbar {
    opacity: 0.8;
    padding: 5px 10px;
    border-radius: 5px;
}

.amr-pages-nav {
    min-height: 110px;
    position: fixed;
    bottom: 0;
    width: 100%;
    padding-bottom: 5px;
    padding-top: 5px;
    opacity: 0;
}

.amr-pages-nav.shrink-draw {
    width: calc(100% - 300px);
    /* Adjust size of navigator if drawer is opened */
}

.amr-pages-nav.display {
    opacity: 1;
    /* display navigator when hovered */
}

.amr-pages-nav,
.amr-pages-nav * {
    transition: all 0.2s;
    line-height: 0;
}

.amr-bookmarked-scan {
    cursor: pointer;
}

.amr-bookmarked-scans-cont {
    max-width: 400px;
}

.amr-bookmarked-scans-cont > .layout {
    align-items: center;
    justify-content: center;
}

/* do not force 50% width on thumbs so we don't have vast spaces with background if scans are not the same width */
.amr-pages-nav td.scanContainer.xs6 {
    width: auto;
}
</style>
