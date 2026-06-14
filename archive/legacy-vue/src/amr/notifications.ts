import browser from "webextension-polyfill"
import i18n from "./i18n"
import { AppManga, AppStore, NotificationCreate } from "../types/common"
import { findNextChapter } from "../shared/utils"
import { debug } from "../core/debug"

/**
 * Manage browser notifications
 */
export class NotificationManager {
    // store current opened notifications
    private notifications = {}
    // last id of notification
    private currentId = 0

    constructor(private readonly store: AppStore) {}

    notificationClickCallback = (id: string | undefined) => {
        debug.ui.debug("Notification Click callback triggered for ID:", id)
        debug.ui.trace("Notification Known notifications:", Object.keys(this.notifications))

        if (this.notifications[id] !== undefined) {
            const url = this.notifications[id]
            debug.ui.debug("Notification Opening URL:", url)

            if (url) {
                browser.tabs.create({ url }).catch(e => {
                    debug.ui.error("Notification Failed to open URL: " + url, e)
                })
            } else {
                debug.ui.warn("Notification No URL stored for notification:", id)
            }

            // It deletes the used URL to avoid unbounded object growing.
            // Well, if the notification isn't clicked the said growing is not avoided.
            // If this proves to be a issue a close callback should be added too.
            delete this.notifications[id]
        } else {
            debug.ui.warn("Notification Unknown notification ID:", id)
        }
    }

    notificationCloseCallback = (id: string | undefined) => {
        if (this.notifications[id] !== undefined) {
            delete this.notifications[id]
        }
    }

    public async triggerNotification(notification: NotificationCreate): Promise<string | undefined> {
        return browser.notifications
            .create({
                type: "basic",
                title: notification.title,
                message: notification.message,
                contextMessage: notification.contextMessage,
                iconUrl: browser.runtime.getURL("/icons/icon_32.png"),
                isClickable: notification.isClickable
            })
            .catch(e => {
                debug.ui.error("Failed to create notification:", e)
                return undefined
            })
    }

    /**
     * Create a notification when a new chapter is released on a manga
     * @param {} mg manga to notify for
     */
    notifyNewChapter(mg: AppManga) {
        if (!browser.notifications) {
            debug.ui.error("Browser does not support notifications")
            return
        }

        if (mg.read !== 0 || this.store.state.options.shownotifications !== 1) {
            return // Skipping
        }

        const chapter = findNextChapter(mg)

        // Determine the best URL to open when notification is clicked:
        // 1. Try the next chapter URL
        // 2. Fall back to manga page URL
        const clickUrl = chapter?.url || mg.url

        const mangaData = {
            name: mg.displayName ? mg.displayName : mg.name,
            mirror: mg.mirror,
            url: clickUrl
        }

        // Debug logging
        debug.ui.debug("Notification Creating notification for:", mangaData.name)
        debug.ui.trace("Notification Chapter found: " + !!chapter + ", URL:", clickUrl)

        // The URL must be saved under a global object, mapped by ID.
        // (no one would like to click a manga notification and ending up opening another manga)
        const curId = this.currentId++
        this.notifications["amr_" + curId] = mangaData.url

        // opens the notification.
        browser.notifications
            .create("amr_" + curId, {
                type: "basic",
                title: mangaData.name,
                message: i18n("notif_message", mangaData.mirror),
                contextMessage: i18n("notif_message_chapter", chapter?.name ?? "— ⚠️"),
                iconUrl: browser.runtime.getURL("/icons/icon_32.png"),
                isClickable: true // Always clickable - opens manga page if no chapter URL
            })
            .catch(e => {
                debug.ui.error("Failed to create " + mangaData.name + " notification for " + mangaData.mirror, e)
            })

        //Auto close notification if required
        if (this.store.state.options.notificationtimer > 0) {
            setTimeout(function () {
                browser.notifications.clear("amr_" + curId)
            }, this.store.state.options.notificationtimer)
        }
    }
}

let instance: NotificationManager
export const getNotificationManager = (store: AppStore) => {
    if (!instance) {
        instance = new NotificationManager(store)
    }
    return instance
}
