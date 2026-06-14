import type { LastSync } from "./common"
import { Notifications } from "webextension-polyfill"

export type SearchListAction = { action: "searchList"; mirror: string; search: string }

export type BaseAction = { key: string; action: string; url: string; mirror?: string }

export type LastSyncAction = { action: "lastSync"; lastSync: LastSync }

export type TriggerNotificationAction = {
    action: "triggerNotification"
    notification: Notifications.CreateNotificationOptions
}

export type AddMangaByUrlAction = { action: "addMangaByUrl"; url: string; mirrorName: string }

export type DebugDumpLogsAction = {
    action: "debugDumpLogs"
    source: string
    payload: unknown
}

export type AllActions =
    | SearchListAction
    | LastSyncAction
    | TriggerNotificationAction
    | AddMangaByUrlAction
    | DebugDumpLogsAction
    | BaseAction

export type DispatchMethod = (action: string, payload: unknown, silent?: boolean | unknown) => Promise<unknown>
