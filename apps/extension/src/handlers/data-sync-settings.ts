import { exportDatabase, importDatabase, previewImport, seedDatabase } from "../database"
import { getSettings, updateSettings } from "../settings"
import { getSyncConfig, getSyncStatus, pullFromGist, pushToGist, setSyncConfig } from "../sync"
import { configureSyncAlarm, configureUpdateAlarm } from "../background/alarms"
import type { HandlerMap } from "../background/handler-types"

export const dataSyncSettingsHandlers: HandlerMap = {
    "data:export": async () => {
        return await exportDatabase()
    },
    "data:import:preview": async request => {
        return await previewImport(request.envelope)
    },
    "data:import": async request => {
        return await importDatabase(request.envelope, request.resolutions)
    },
    "data:seed": async () => {
        return await seedDatabase()
    },
    "sync:status": async () => {
        return await getSyncStatus()
    },
    "sync:config": async request => {
        const patch = Object.fromEntries(Object.entries(request.config).filter(([, v]) => v !== undefined))
        const next = await setSyncConfig(patch)
        await configureSyncAlarm()
        return {
            hasToken: Boolean(next.token),
            ...(next.gistId ? { gistId: next.gistId } : {}),
            autoSync: next.autoSync
        }
    },
    "sync:push": async () => {
        const envelope = await exportDatabase()
        return await pushToGist(envelope)
    },
    "sync:pull": async () => {
        const envelope = await pullFromGist()
        return await importDatabase(envelope)
    },
    "settings:get": async () => {
        return await getSettings()
    },
    "settings:update": async request => {
        const settings = await updateSettings(
            Object.fromEntries(Object.entries(request.settings).filter(([, value]) => value !== undefined)) as Partial<
                Awaited<ReturnType<typeof getSettings>>
            >
        )
        await configureUpdateAlarm()
        return settings
    }
}

export async function autoPush() {
    const config = await getSyncConfig()
    if (!config.autoSync || !config.token) return
    try {
        await pushToGist(await exportDatabase())
    } catch (error) {
        console.warn("[AMR] Auto sync push failed", error)
    }
}
