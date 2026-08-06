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

// Create an alarm only when it is missing OR its period actually changed. Creating
// an alarm with an existing name resets its next-fire to now + period, so calling
// configure* on every onStartup/onInstalled (which fire far more often than a daily
// alarm's period) would let a browser restarted more often than the period run the
// long alarms forever without them ever firing. Skipping a healthy same-period alarm
// preserves its pending fire time, while still recovering a lost one and still
// re-applying a genuine interval change from a settings save.
async function ensureAlarm(name: string, periodInMinutes: number): Promise<void> {
    // browser.alarms.get lets us avoid resetting a healthy same-period alarm's next
    // fire time on every startup. It's absent in some contexts (unit-test mock, older
    // polyfills); there we fall back to create (the prior always-recreate behaviour).
    const existing = await browser.alarms.get?.(name)
    if (existing && existing.periodInMinutes === periodInMinutes) return
    await browser.alarms.create(name, { periodInMinutes })
}

export async function configureUpdateAlarm(): Promise<void> {
    const settings = await getSettings()
    if (settings.updateIntervalHours > 0) {
        await ensureAlarm(updateAlarmName, settings.updateIntervalHours * 60)
    } else {
        await browser.alarms.clear(updateAlarmName)
    }
}

export async function configureSyncAlarm(): Promise<void> {
    const config = await getSyncConfig()
    if (config.autoSync && config.token) {
        await ensureAlarm(syncAlarmName, 60)
    } else {
        await browser.alarms.clear(syncAlarmName)
    }
}

export async function configureAniListAlarm(): Promise<void> {
    const config = await getAniListConfig()
    if (config.autoSync && config.token) {
        await ensureAlarm(anilistAlarmName, 180)
    } else {
        await browser.alarms.clear(anilistAlarmName)
    }
}

export async function configureBackupAlarm(enabled: boolean): Promise<void> {
    if (enabled) {
        await ensureAlarm(backupAlarmName, 24 * 60)
    } else {
        await browser.alarms.clear(backupAlarmName)
    }
}

export async function configureCommunityAlarm(): Promise<void> {
    const profile = await getCommunityProfile()
    if (profile.enabled && profile.userId) {
        await ensureAlarm(communityAlarmName, 60)
    } else {
        await browser.alarms.clear(communityAlarmName)
    }
}

export async function configureExtensionUpdateAlarm(): Promise<void> {
    await ensureAlarm(extensionUpdateAlarmName, EXTENSION_UPDATE_INTERVAL_HOURS * 60)
}
