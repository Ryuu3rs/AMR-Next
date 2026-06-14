/**
 * Mangas Update Actions Module
 * Contains update-related actions for manga chapter list updates
 */

import { getIconHelper } from "../../../amr/icon-helper"
import { Alarm, createAlarm, clearAlarm } from "../../../shared/AlarmService"
import * as syncUtils from "../../../amr/sync/utils"
import { shouldDelayUpdate } from "../../../shared/chapterUpdaterUtil"
import { shouldCheckForUpdate } from "../../../shared/utils"
import { ABSTRACT_MANGA_MSG, ERROR_CODE_FAILED_UPDATE } from "./mangas-constants"
import { debug as coreDebug } from "../../../core/debug"

const logger = { debug: coreDebug.storage.debug, info: coreDebug.storage.info, error: coreDebug.storage.error }

/**
 * Update-related actions
 */
export const updateActions = {
    /**
     * Update all mangas chapters lists
     */
    async updateChaptersLists({ dispatch, getters, state, rootState }, { force } = { force: true }) {
        const delayUpdate = shouldDelayUpdate(rootState)
        if (delayUpdate.shouldSkip) {
            logger.debug(delayUpdate.message)
            if (delayUpdate.nextRunTimestamp) {
                createAlarm({ name: Alarm.DelayedChaptersUpdates, when: delayUpdate.nextRunTimestamp })
            }
            return
        }

        dispatch("setOption", { key: "isUpdatingChapterLists", value: 1 })
        const nowInMs = Date.now()
        dispatch("setOption", { key: "lastChaptersUpdate", value: nowInMs })
        logger.info(
            `Started chapter lists update. lastChaptersUpdate is now ${new Date(nowInMs).toISOString()} (${nowInMs})`
        )

        const iconHelper = getIconHelper({ state: rootState, getters })
        createAlarm({ name: Alarm.UpdatingChapterListsChange, delayInMinutes: 10 })
        if (rootState.options.refreshspin === 1) {
            iconHelper.spinIcon()
            createAlarm({ name: Alarm.StopSpinning, delayInMinutes: 2 })
        }

        /** @type {Record<string, any[]>} */
        const mirrorTasks = {}
        for (const mg of state.all) {
            if (mg.deleted === syncUtils.DELETED) {
                continue
            }

            if (force || shouldCheckForUpdate(mg, rootState.options, logger)) {
                if (!mirrorTasks[mg.mirror]) {
                    mirrorTasks[mg.mirror] = []
                }
                mirrorTasks[mg.mirror].push(mg)
            }
        }
        logger.debug(`Completed grouping with ${Object.keys(mirrorTasks).length} mirrors`)
        logger.info(
            Object.entries(mirrorTasks).reduce((acc, [name, list]) => {
                acc[name] = list.length
                return acc
            }, {})
        )

        async function refreshManga(mg) {
            return dispatch("refreshLastChapters", mg)
                .then(() => {
                    dispatch("findAndUpdateManga", mg)
                    iconHelper.refreshBadgeAndIcon()
                })
                .catch(e => {
                    if (e !== ABSTRACT_MANGA_MSG) {
                        logger.error(e)
                        dispatch("markHasUpdateError", { manga: mg, errorCode: ERROR_CODE_FAILED_UPDATE })
                    }
                })
        }

        const sleep = delay => new Promise(resolve => setTimeout(() => resolve(), delay))
        const waitDelayInMs = Math.max(rootState.options.waitbetweenupdates, 1) * 1000

        await Promise.all(
            Object.entries(mirrorTasks).map(async ([name, mirrorMangas]) => {
                const now = Date.now()
                for (const mg of mirrorMangas) {
                    await refreshManga(mg).catch(logger.error)
                    await sleep(waitDelayInMs)
                }
                logger.info(`[${name}] completed processing in ${Date.now() - now}ms`)
            })
        ).catch(logger.error)

        logger.info("Done updating chapter lists")

        if (!rootState.options.isUpdatingChapterLists) {
            clearAlarm(Alarm.UpdatingChapterListsChange).then(r =>
                logger.debug(`${Alarm.UpdatingChapterListsChange} Cleared=${r}`)
            )
        }
        dispatch("setOption", { key: "isUpdatingChapterLists", value: 0 })

        if (rootState.options.refreshspin === 1) {
            iconHelper.stopSpinning()
            clearAlarm(Alarm.StopSpinning).then(r => logger.debug(`${Alarm.StopSpinning} Cleared=${r}`))
        }
    }
}
