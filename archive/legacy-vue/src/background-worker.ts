import browser from "webextension-polyfill"
import store from "./store"
import { Handler } from "./background/handler"
import { getAppLogger } from "./shared/AppLogger"
import { OptionStorage } from "./shared/OptionStorage"
import { AmrInit } from "./background/amr-init"
import storedb from "./amr/storedb"
import { convertToMangaDexV5 } from "./background/misc/mangedex-v5-converter"
import { Mangadex } from "./background/misc/mangadex-v5-integration"
import { getMirrorHelper } from "./mirrors/MirrorHelper"
import { getMirrorLoader } from "./mirrors/MirrorLoader"
import { getNetRulesForMirrors } from "./mirrors/MirrorNetRequestRules"
import { AmrUpdater } from "./pages/amr-updater"
import { getIconHelper } from "./amr/icon-helper"
import { host_permissions } from "./constants/required_permissions"
import { getNotificationManager } from "./amr/notifications"
import { Alarm, PeriodAlarms } from "./shared/AlarmService"
import { getSyncManager } from "./amr/sync/SyncManager"
import { getSyncOptions } from "./shared/Options"
import { debug } from "./core/debug"

const optionsStorage = new OptionStorage()
const iconHelper = getIconHelper(store)
const logger = getAppLogger({ debug: 0 })
const amrInit = new AmrInit(store, storedb, optionsStorage, logger)
const amrUpdater = new AmrUpdater(store, optionsStorage, logger)
const mirrorHelper = getMirrorHelper(store.state.options)
const mirrorLoader = getMirrorLoader(mirrorHelper)
const notifications = getNotificationManager(store)
const handler = new Handler(store, logger, optionsStorage, mirrorLoader, iconHelper)
const handleManga = handler.getHandleManga()

const init = async () => {
    const options = await optionsStorage.getVueOptions()

    await store.dispatch("initOptions", options)

    logger.setConfig(options)
    mirrorHelper.setOptions(options)

    const syncManager = getSyncManager(getSyncOptions(options), store.state, store.dispatch, notifications)

    /**
     * Initialize extension versioning --> after options because versioning update can affect options
     */
    const afterLoadingCall = await amrInit.init()

    /**
     * Initialize mirrors list in store from DB or repo
     */
    logger.debug("Initialize mirrors")
    await store.dispatch("initMirrors")

    /**
     * Initialize manga list in store from DB
     */
    logger.debug("Initialize mangas")
    await store.dispatch("initMangasFromDB")

    /**
     * Check to see if extension has required origin permissions
     */
    logger.debug("Checking for permissions")
    const hasPermission = await browser.permissions.contains(host_permissions)
    if (!hasPermission) {
        logger.debug("Missing required permissions. Opening request page")
        browser.tabs.create({ active: true, url: "/pages/permissions/permissions.html" })
    }

    /**
     * Reset watchers for components that can collide.
     */
    await store.dispatch("setOption", { key: "isSyncing", value: 0 })
    await store.dispatch("setOption", { key: "isUpdatingChapterLists", value: 0 })
    await store.dispatch("setOption", { key: "isConverting", value: 0 })
    /**
     * Start sync process between local and remote storage
     */
    await store.dispatch("setMangaTsOpts")
    await syncManager.start().catch(e => logger.error(new Error(`Failed to start sync manager`, { cause: e })))

    /**
     * Initialize bookmarks list in store from DB
     */
    logger.debug("Initialize bookmarks")
    await store.dispatch("initBookmarksFromDB")

    /**
     * Initialize statistics from DB
     */
    logger.debug("Initialize statistics")
    await store.dispatch("initStatisticsFromDB")

    /**
     * Initialize achievements from DB
     */
    logger.debug("Initialize achievements")
    await store.dispatch("initAchievementsFromDB")

    /**
     * Call function if there is anything to do after mirrors and mangas loading
     */
    if (typeof afterLoadingCall === "function") {
        await afterLoadingCall()
    }

    // set icon and badge
    iconHelper.refreshBadgeAndIcon()

    /**
     * If option update chapters lists on startup --> do it
     */
    if (store.state.options.checkmgstart === 1) {
        store.dispatch("updateChaptersLists", { force: false }) // force to false to avoid updating if not necessary
    }

    // Check the latest published version of AMR
    await amrUpdater.checkLatestPublishedVersion()

    logger.debug("Running mangadex converter")
    convertToMangaDexV5(store, logger).catch(e => logger.error(e))
    if (store.state.options.mangadexIntegrationEnable) {
        new Mangadex(store.getters.md_allOptions, store.dispatch)
    }

    return true
}

const initPromise = init()
initPromise.then(() => console.debug("completed background init"))

/**
 * Initialise all listeners at the top level, so they can be persisted in firefox
 */

// Initialize special net request rules that are needed to bypass protection on some sites.
// These rules are persistent through browser restarts and extension updates.
browser.runtime.onInstalled.addListener(async details => {
    logger.debug("Initialize net request rules")

    const oldRules = await browser.declarativeNetRequest.getDynamicRules()
    const oldRuleIds = oldRules.map(rule => rule.id)
    const newRules = getNetRulesForMirrors()
    await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: oldRuleIds,
        addRules: newRules
    })
})

// Alarms - Initialize refresh checkers
browser.alarms.onAlarm.addListener(async alarm => {
    logger.debug(`Running Alarm ${alarm.name} callback`)
    // Make sure init is complete
    await initPromise
    switch (alarm.name) {
        case PeriodAlarms.CheckChaptersUpdates:
        case Alarm.DelayedChaptersUpdates:
            amrUpdater.checkChaptersUpdates().catch(logger.error)
            break
        case PeriodAlarms.CheckMirrorsUpdates:
            amrUpdater.checkMirrorsUpdates()
            break
        case Alarm.StopSpinning:
            iconHelper.stopSpinning()
            break
        case Alarm.UpdatingChapterListsChange:
            store.dispatch("setOption", { key: "isUpdatingChapterLists", value: 0 }).catch(logger.error)
            break
        default:
            debug.background.error("Received unknown alarm: " + alarm.name)
    }
})

browser.alarms.create(PeriodAlarms.CheckChaptersUpdates, { delayInMinutes: 0.1, periodInMinutes: 1 })
browser.alarms.create(PeriodAlarms.CheckMirrorsUpdates, { delayInMinutes: 0.1, periodInMinutes: 1 })

let timers = [] // This is used to keep websites from spamming with calls. It fucks up the reader

browser.webNavigation.onCommitted.addListener(args => {
    if ("auto_subframe" === args["transitionType"]) {
        return // do not reload amr on embedded iframes
    }

    timers.push(args.tabId)

    setTimeout(() => {
        timers = timers.filter(id => id != args.tabId)
    }, 500)

    // This where all frontend AMR Reader actually begins
    handleManga.matchUrlAndLoadScripts(args.url, args.tabId)
})

// push state events are listened from content script (if from background, we reload the page on amr navigation)
browser.webNavigation.onHistoryStateUpdated.addListener(args => {
    if ("auto_subframe" === args["transitionType"]) {
        return
    } // do not reload amr on embedded iframes

    if (timers.includes(args.tabId)) {
        return // History spam
    }

    if (!args.url.includes("mangadex.org")) {
        timers.push(args.tabId)
    }

    setTimeout(() => {
        timers = timers.filter(id => id != args.tabId)
    }, 500)

    handleManga.sendPushState(args.url, args.tabId).catch(err => {
        logger.error(err)
    })
})

if (browser.notifications) {
    // Add the callback to ALL notifications opened by AMR.
    browser.notifications.onClicked.addListener(notifications.notificationClickCallback)
    // To prevent the notification array from growing
    browser.notifications.onClosed.addListener(notifications.notificationCloseCallback)
}

// Handle extension icon click - open dashboard directly
browser.action.onClicked.addListener(async () => {
    // Check if dashboard is already open
    const dashboardUrl = browser.runtime.getURL("/pages/dashboard/dashboard.html")
    const tabs = await browser.tabs.query({ url: dashboardUrl })

    if (tabs.length > 0) {
        // Dashboard already open, focus it
        await browser.tabs.update(tabs[0].id, { active: true })
        await browser.windows.update(tabs[0].windowId, { focused: true })
    } else {
        // Open new dashboard tab
        await browser.tabs.create({ url: dashboardUrl })
    }
})

logger.info("Initialize message handler")

// Handle Port connections for getImageUrlFromPageUrl - works around Firefox MV3 message passing bugs
browser.runtime.onConnect.addListener(port => {
    // Only handle ports for image requests
    if (!port.name?.startsWith("imageRequest_")) {
        return
    }

    const tabId = port.sender?.tab?.id
    console.log("[AMR BG Worker] Port connected:", port.name, "tabId:", tabId)

    // FIX #15: Store message listener reference for proper cleanup on disconnect
    const messageListener = async (msg: {
        type?: string
        requestId?: string
        url?: string
        mirror?: string
        language?: string
    }) => {
        if (msg.type !== "getImageUrlFromPageUrl" || !msg.requestId) {
            return
        }

        const requestId = msg.requestId
        console.log("[AMR BG Worker] Port processing requestId:", requestId, "tabId:", tabId)

        try {
            await initPromise
            // Create a fake sender object for the handler
            const fakeSender = { tab: { id: tabId || -1 } }
            const result = await handler.handle(
                {
                    action: "getImageUrlFromPageUrl",
                    url: msg.url,
                    mirror: msg.mirror,
                    language: msg.language
                },
                fakeSender
            )

            const resultStr = typeof result === "string" ? result.substring(0, 80) : result
            console.log("[AMR BG Worker] Got result for requestId:", requestId, "result:", resultStr)

            // Try sending via port first
            let portSent = false
            try {
                port.postMessage({
                    type: "imageResponse",
                    requestId: requestId,
                    result: result
                })
                portSent = true
                console.log("[AMR BG Worker] Port.postMessage sent for requestId:", requestId)
            } catch (e) {
                console.log("[AMR BG Worker] Port.postMessage failed:", (e as Error)?.message || e)
            }

            // Also try tabs.sendMessage as backup
            if (tabId && tabId > 0) {
                try {
                    await browser.tabs.sendMessage(tabId, {
                        type: "imageResponse",
                        requestId: requestId,
                        result: result
                    })
                    console.log("[AMR BG Worker] tabs.sendMessage sent for requestId:", requestId)
                } catch (e) {
                    console.log("[AMR BG Worker] tabs.sendMessage failed:", (e as Error)?.message || e)
                }
            }
        } catch (error) {
            console.error("[AMR BG Worker] Port handler error:", error)
            const errorMsg = {
                type: "imageResponse",
                requestId: requestId,
                error: (error as Error)?.message || String(error)
            }
            try {
                port.postMessage(errorMsg)
            } catch (e) {
                // Ignore
            }
            if (tabId && tabId > 0) {
                try {
                    await browser.tabs.sendMessage(tabId, errorMsg)
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    port.onMessage.addListener(messageListener)

    // FIX #15: Properly clean up message listener when port disconnects
    port.onDisconnect.addListener(() => {
        const error = browser.runtime.lastError
        console.log("[AMR BG Worker] Port disconnected:", port.name, error ? `Error: ${error.message}` : "(normal)")

        // Remove the message listener to prevent memory accumulation
        try {
            port.onMessage.removeListener(messageListener)
        } catch (e) {
            // Port may already be invalid, ignore
        }
    })
})

// Handle regular messages
browser.runtime.onMessage.addListener((msg, sender) => {
    // Skip getImageUrlFromPageUrl - handled via Port connections now
    if (msg.action === "getImageUrlFromPageUrl") {
        // Return undefined - these are handled via Ports now
        return undefined
    }

    // For all other messages with an action, use standard Promise return
    // Only return a Promise for messages this handler will actually respond to
    // MDN warns: returning a Promise for EVERY message prevents other listeners from responding
    if (msg && msg.action) {
        return new Promise((resolve, reject) => {
            initPromise
                .then(() => handler.handle(msg, sender))
                .then(result => {
                    resolve(result)
                })
                .catch(error => {
                    console.error("[AMR BG Worker] onMessage error:", error)
                    reject(error)
                })
        })
    }

    // Return undefined for messages we don't handle (no action property)
    // This allows other listeners to respond and prevents Promise accumulation
    return undefined
})
