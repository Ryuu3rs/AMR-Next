import { getAniListConfig } from "../anilist"
import { getCommunityProfile } from "../community"
import { getSettings } from "../settings"
import { getSyncConfig } from "../sync"

export const updateAlarmName = "check-manga-updates"
export const communityAlarmName = "community-sync"
export const syncAlarmName = "sync-push"
export const anilistAlarmName = "anilist-sync"
export const extensionUpdateAlarmName = "check-extension-update"
export const backupAlarmName = "amr-daily-backup"

export const EXTENSION_UPDATE_INTERVAL_HOURS = 24
export const GITHUB_RELEASES_URL = "https://api.github.com/repos/Ryuu3rs/AMR-Next/releases/latest"

export async function configureUpdateAlarm(): Promise<void> {
    const settings = await getSettings()
    await browser.alarms.clear(updateAlarmName)
    if (settings.updateIntervalHours > 0) {
        await browser.alarms.create(updateAlarmName, {
            periodInMinutes: settings.updateIntervalHours * 60
        })
    }
}

export async function configureSyncAlarm(): Promise<void> {
    const config = await getSyncConfig()
    await browser.alarms.clear(syncAlarmName)
    if (config.autoSync && config.token) {
        await browser.alarms.create(syncAlarmName, { periodInMinutes: 60 })
    }
}

export async function configureAniListAlarm(): Promise<void> {
    const config = await getAniListConfig()
    await browser.alarms.clear(anilistAlarmName)
    if (config.autoSync && config.token) {
        await browser.alarms.create(anilistAlarmName, { periodInMinutes: 180 })
    }
}

export async function configureBackupAlarm(enabled: boolean): Promise<void> {
    await browser.alarms.clear(backupAlarmName)
    if (enabled) {
        await browser.alarms.create(backupAlarmName, { periodInMinutes: 24 * 60 })
    }
}

export async function configureCommunityAlarm(): Promise<void> {
    const profile = await getCommunityProfile()
    await browser.alarms.clear(communityAlarmName)
    if (profile.enabled && profile.userId) {
        await browser.alarms.create(communityAlarmName, { periodInMinutes: 60 })
    }
}
