/**
 * All Mangas Reader V2
 * Content script included in every website matching a manga site
 */

import { createApp } from "vue"
import VueScrollTo from "vue-scrollto"

import AmrReader from "./AmrReader.vue"
import "./theme.css"

import browser from "webextension-polyfill"
import options from "./state/options"
import ChapterLoader from "./helpers/ChapterLoader"

const ourCss = ["https://fonts.googleapis.com/css?family=Roboto:300,400,500,700"]

if (globalThis["__armreader__"] === undefined) {
    // avoid loading script twice
    globalThis["__armreader__"] = {}

    globalThis["onPushState"] = async function () {
        // Do load manga only if it's not AMR that triggered the pushState
        if (globalThis["__AMR_IS_LOADING_CHAPTER__"]) {
            delete globalThis["__AMR_IS_LOADING_CHAPTER__"]
        } else if (globalThis["__AMR_RESTORED_PAGE__"]) {
            // load AMR ! pushState comes from website
            globalThis.location.reload()
        }
    }

    /**
     * Every mirror implementation ends by a call to registerMangaObject
     * This function is defined here.
     * This script is injected by background script if the page could be a manga page.
     * Once loaded, the mirror implementation is called and results in this function call
     */
    globalThis["amrLoadMirror"] = async function (mirror) {
        // initialize options
        if (typeof options.load === "function") {
            const opts = await browser.runtime.sendMessage({ action: "getoptions" })
            options.load(opts)
        }

        // initialize current chapter from data collected from current page
        const chap = new ChapterLoader(globalThis.location.href, mirror)
        await chap.checkAndLoadInfos() // get is a chapter ?, infos (current manga, chapter) and scans urls

        const done = chap.loadInReader(options, true) // load chapter data in states
        if (!done) {
            restorePage()
        } else {
            initReader(mirror, chap.title) // create the reader if this is the first chapter loaded in this environment
        }
        globalThis["__current_chapterloader__"] = chap // keep a reference to delete it later
    }
}

/**
 * This function replaces the current page by a custom reader, AMR Reader
 *  - No more glitches depending on the online reader css
 *  - more options, resize fit height, width
 */
function initReader(mirror, title) {
    if (!document.body) {
        // create body element if non existing (thanks mangarock)
        const bd = document.createElement("body")
        document.children[0].appendChild(bd)
    }
    if (title) {
        document.title = title
    }

    document.body.innerHTML = "" // empty the dom page
    const amrdiv = document.createElement("div")
    amrdiv.id = "amrapp"
    amrdiv.style.position = "relative"
    amrdiv.style.zIndex = "999999"
    document.body.appendChild(amrdiv)

    // Run style cleanup initially and schedule additional passes
    removeStyles(true, 3)

    // add viewport meta for mobile
    const metaview = document.createElement("meta")
    metaview.name = "viewport"
    metaview.content = "width=device-width, initial-scale=1"
    document.getElementsByTagName("head")[0].appendChild(metaview)

    // document is the only node we keep from the page, ensure it won't break our css
    document.body.style.padding = "0px"
    document.body.style.margin = "0px"
    document.body.style.setProperty("max-width", "none", "important")
    document.body.style.setProperty("min-width", "auto", "important")
    document.body.style.setProperty("width", "auto", "important")

    for (const css of ourCss) loadCss(css)

    // Create Vue app (Vuetify removed - using native Amr components)
    const app = createApp(AmrReader, { mirror })
    app.use(VueScrollTo)
    app.mount(amrdiv)

    // Set initial theme
    amrdiv.setAttribute("data-theme", options.darkreader === 1 ? "dark" : "light")

    // Run cleanup a limited number of times to catch late-injected elements
    // while avoiding the infinite loop that was causing performance issues
    removeJsAddedStuff(5)
}

/**
 * Clean up any elements added by the original page's JavaScript
 * Runs limited number of times with increasing delays to catch late-injected elements
 * @param {number} remaining - Number of cleanup passes remaining
 */
function removeJsAddedStuff(remaining = 1) {
    document.body.style.padding = "0px"
    document.body.style.margin = "0px"
    document.body.style.position = ""
    document.body.style.setProperty("max-width", "none", "important")
    document.body.style.setProperty("min-width", "auto", "important")
    document.body.style.setProperty("width", "auto", "important")

    // Collect children to remove (avoid modifying collection while iterating)
    const toRemove = []
    for (const child of document.body.children) {
        const id = child.getAttribute("id")
        // Keep only our app container
        if (id !== "amrapp") {
            toRemove.push(child)
        }
    }
    // Remove collected elements
    for (const el of toRemove) {
        el.remove()
    }

    // Schedule additional cleanup passes with increasing delays
    if (remaining > 1) {
        const delay = remaining > 3 ? 2000 : 4000 // First 2 runs at 2s, remaining at 4s
        setTimeout(() => removeJsAddedStuff(remaining - 1), delay)
    }
}

/**
 * Remove styles from original page to avoid interference with AMR reader
 * Runs limited number of times to catch late-injected styles
 * @param {boolean} withInline - Whether to remove inline style tags
 * @param {number} remaining - Number of cleanup passes remaining
 */
function removeStyles(withInline = false, remaining = 1) {
    // Collect link stylesheets to remove
    const stylesheets = Array.from(document.getElementsByTagName("link"))
    for (const sheet of stylesheets) {
        const rel = sheet.getAttribute("rel")
        const type = sheet.getAttribute("type")
        const href = sheet.getAttribute("href")
        if (((rel && rel === "stylesheet") || (type && type.toLowerCase() === "text/css")) && !ourCss.includes(href)) {
            if (sheet.parentNode) {
                sheet.parentNode.removeChild(sheet)
            }
        }
    }

    if (withInline) {
        // Collect inline styles to remove
        const inline = Array.from(document.getElementsByTagName("style"))
        for (const sheet of inline) {
            // Skip AMR styles - preserve our own styles
            if (sheet.getAttribute("data-amr")) continue
            if (sheet.getAttribute("id") === "custom-scrollbar-css") continue

            // Check for AMR class prefix - sample first 500 chars for efficiency
            const content = sheet.textContent || ""
            const sample = content.substring(0, 500)
            if (sample.includes(".amr-") || sheet.getAttribute("data-v-")) {
                continue
            }

            // Remove site styles
            if (sheet.parentNode) {
                sheet.parentNode.removeChild(sheet)
            }
        }
    }

    // Schedule additional cleanup passes
    if (remaining > 1) {
        setTimeout(() => removeStyles(withInline, remaining - 1), 3000)
    }
}
/** Load css in the page for AMR reader needs */
function loadCss(file) {
    var link = document.createElement("link")
    link.href = file
    link.type = "text/css"
    link.rel = "stylesheet"
    link.media = "screen,print"

    document.getElementsByTagName("head")[0].appendChild(link)
}
/**
 * Restore the page as it was before we included our scripts tags and code
 * The best would be not to load it but :
 *  - this script is only included in manga websites pages
 *  - we have to load the implementation in the page to know if the reader needs to be loaded. If we do that in a separate script, we will have to reload implementation another time and this will result in more loading time...
 */
function restorePage() {
    globalThis["__AMR_RESTORED_PAGE__"] = true
    const cover = document.getElementById("amr-loading-cover")
    if (cover) cover.parentNode.removeChild(cover)

    // Remove our own styles - use a single pass collecting all to remove first
    // to avoid modifying the live collection while iterating (Issue 7 fix)
    const removeOurStyles = () => {
        const styles = document.getElementsByTagName("style")
        const toRemove = []
        for (let i = 0; i < styles.length; i++) {
            const st = styles[i]
            if (st && st.innerHTML) {
                // Check first 500 chars for performance
                const sample = st.innerHTML.substring(0, 500)
                if (sample.indexOf(".amr-") >= 0 || sample.indexOf("Vuetify") >= 0) {
                    toRemove.push(st)
                }
            }
        }
        // Remove collected styles
        for (const st of toRemove) {
            if (st.parentNode) {
                st.parentNode.removeChild(st)
            }
        }
        return toRemove.length
    }

    // Run up to 3 times max (reduced from 10), stop early if nothing removed
    let removed = removeOurStyles()
    if (removed > 0) removed = removeOurStyles()
    if (removed > 0) removeOurStyles()
}
