import storedb from "../../amr/storedb"
import { debug } from "../../core/debug"

/**
 * Statistics module for tracking reading habits and patterns
 * Stores reading sessions, chapter counts, and time spent reading
 */

/**
 * Initial state of the statistics module
 */
const state = {
    // Total chapters read
    totalChaptersRead: 0,
    // Total reading time in seconds
    totalReadingTime: 0,
    // Reading sessions (array of { date, duration, chaptersRead, mirror })
    sessions: [],
    // Chapters read per mirror { mirrorName: count }
    chaptersByMirror: {},
    // Chapters read per day { 'YYYY-MM-DD': count }
    chaptersByDay: {},
    // Reading streaks
    currentStreak: 0,
    longestStreak: 0,
    lastReadDate: null,
    // Reading history log (array of { date, mangaName, chapterName, mirror, url })
    readingHistory: [],
    // Reading goals
    goals: {
        weekly: { target: 0, enabled: false },
        monthly: { target: 0, enabled: false }
    },
    // Initialized flag
    initialized: false
}

// Getters
const getters = {
    totalChaptersRead: state => state.totalChaptersRead,
    totalReadingTime: state => state.totalReadingTime,
    totalReadingTimeFormatted: state => {
        const hours = Math.floor(state.totalReadingTime / 3600)
        const minutes = Math.floor((state.totalReadingTime % 3600) / 60)
        return `${hours}h ${minutes}m`
    },
    currentStreak: state => state.currentStreak,
    longestStreak: state => state.longestStreak,
    chaptersByMirror: state => state.chaptersByMirror,
    chaptersByDay: state => state.chaptersByDay,
    recentSessions: state => state.sessions.slice(-10).reverse(),
    readingHistory: state => state.readingHistory || [],
    recentHistory: state => (state.readingHistory || []).slice(-50).reverse(),
    topMirrors: state => {
        return Object.entries(state.chaptersByMirror)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))
    },
    weeklyChapters: state => {
        const today = new Date()
        let count = 0
        for (let i = 0; i < 7; i++) {
            const date = new Date(today)
            date.setDate(date.getDate() - i)
            const key = date.toISOString().split("T")[0]
            count += state.chaptersByDay[key] || 0
        }
        return count
    },
    monthlyChapters: state => {
        const today = new Date()
        let count = 0
        for (let i = 0; i < 30; i++) {
            const date = new Date(today)
            date.setDate(date.getDate() - i)
            const key = date.toISOString().split("T")[0]
            count += state.chaptersByDay[key] || 0
        }
        return count
    },
    // Reading goals getters
    goals: state => state.goals || { weekly: { target: 0, enabled: false }, monthly: { target: 0, enabled: false } },
    weeklyGoalProgress: (state, getters) => {
        const goal = state.goals?.weekly
        if (!goal?.enabled || !goal?.target) return null
        return {
            current: getters.weeklyChapters,
            target: goal.target,
            percent: Math.min(100, Math.round((getters.weeklyChapters / goal.target) * 100))
        }
    },
    monthlyGoalProgress: (state, getters) => {
        const goal = state.goals?.monthly
        if (!goal?.enabled || !goal?.target) return null
        return {
            current: getters.monthlyChapters,
            target: goal.target,
            percent: Math.min(100, Math.round((getters.monthlyChapters / goal.target) * 100))
        }
    }
}

const actions = {
    /**
     * Initialize statistics from IndexedDB
     */
    async initStatisticsFromDB({ commit }) {
        try {
            const stats = await storedb.getStatistics()
            if (stats) {
                commit("setStatistics", stats)
            }
            commit("setInitialized", true)
        } catch (e) {
            debug.storage.error("Statistics Failed to load from DB:", e)
            commit("setInitialized", true)
        }
    },

    /**
     * Record a chapter read event
     */
    async recordChapterRead({ commit, state }, { mirror, chapterName, mangaName, chapterUrl }) {
        const today = new Date().toISOString().split("T")[0]

        commit("incrementChaptersRead")
        commit("incrementMirrorCount", mirror)
        commit("incrementDayCount", today)
        commit("updateStreak", today)

        // Add to reading history log
        commit("addHistoryEntry", {
            date: new Date().toISOString(),
            mangaName: mangaName || "Unknown",
            chapterName: chapterName || "Unknown",
            mirror: mirror || "Unknown",
            url: chapterUrl || ""
        })

        // Persist to IndexedDB
        await storedb.storeStatistics(JSON.parse(JSON.stringify(state)))
    },

    /**
     * Record reading time for a session
     */
    async recordReadingTime({ commit, state }, { duration, mirror, chaptersRead }) {
        const session = {
            date: new Date().toISOString(),
            duration,
            chaptersRead,
            mirror
        }

        commit("addReadingTime", duration)
        commit("addSession", session)

        // Persist to IndexedDB
        await storedb.storeStatistics(JSON.parse(JSON.stringify(state)))
    },

    /**
     * Export statistics to JSON
     */
    exportStatistics({ state }) {
        const data = JSON.stringify(state, null, 2)
        const blob = new Blob([data], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `amr-statistics-${new Date().toISOString().split("T")[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
    },

    /**
     * Import statistics from JSON data
     */
    async importStatistics({ commit, state }, data) {
        // Merge imported data with existing data
        if (data.totalChaptersRead !== undefined) {
            commit("setTotalChaptersRead", (state.totalChaptersRead || 0) + (data.totalChaptersRead || 0))
        }
        if (data.totalReadingTime !== undefined) {
            commit("setTotalReadingTime", (state.totalReadingTime || 0) + (data.totalReadingTime || 0))
        }
        if (data.readingSessions && Array.isArray(data.readingSessions)) {
            data.readingSessions.forEach(session => commit("addSession", session))
        }
        if (data.dailyStats) {
            Object.entries(data.dailyStats).forEach(([date, stats]) => {
                if (!state.dailyStats[date]) {
                    state.dailyStats[date] = stats
                } else {
                    state.dailyStats[date].chaptersRead += stats.chaptersRead || 0
                    state.dailyStats[date].readingTime += stats.readingTime || 0
                }
            })
        }
        if (data.currentStreak) {
            commit("setCurrentStreak", Math.max(state.currentStreak || 0, data.currentStreak))
        }
        if (data.longestStreak) {
            commit("setLongestStreak", Math.max(state.longestStreak || 0, data.longestStreak))
        }
        if (data.readingGoals) {
            commit("setReadingGoals", data.readingGoals)
        }
        // Persist to IndexedDB
        await storedb.storeStatistics(JSON.parse(JSON.stringify(state)))
        return { success: true, message: "Statistics imported successfully" }
    },

    /**
     * Reset all statistics
     */
    async resetStatistics({ commit }) {
        commit("resetState")
        await storedb.storeStatistics({
            totalChaptersRead: 0,
            totalReadingTime: 0,
            sessions: [],
            chaptersByMirror: {},
            chaptersByDay: {},
            currentStreak: 0,
            longestStreak: 0,
            lastReadDate: null,
            goals: { weekly: { target: 0, enabled: false }, monthly: { target: 0, enabled: false } }
        })
    },

    /**
     * Set reading goal
     */
    async setGoal({ commit, state }, { type, target, enabled }) {
        commit("updateGoal", { type, target, enabled })
        await storedb.storeStatistics(JSON.parse(JSON.stringify(state)))
    }
}

const mutations = {
    setStatistics(state, stats) {
        Object.assign(state, stats)
    },
    setInitialized(state, value) {
        state.initialized = value
    },
    incrementChaptersRead(state) {
        state.totalChaptersRead++
    },
    incrementMirrorCount(state, mirror) {
        if (!state.chaptersByMirror[mirror]) {
            state.chaptersByMirror[mirror] = 0
        }
        state.chaptersByMirror[mirror]++
    },
    incrementDayCount(state, day) {
        if (!state.chaptersByDay[day]) {
            state.chaptersByDay[day] = 0
        }
        state.chaptersByDay[day]++
    },
    updateStreak(state, today) {
        if (!state.lastReadDate) {
            state.currentStreak = 1
        } else {
            const lastDate = new Date(state.lastReadDate)
            const todayDate = new Date(today)
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24))

            if (diffDays === 0) {
                // Same day, no change
            } else if (diffDays === 1) {
                state.currentStreak++
            } else {
                state.currentStreak = 1
            }
        }
        state.lastReadDate = today
        if (state.currentStreak > state.longestStreak) {
            state.longestStreak = state.currentStreak
        }
    },
    addReadingTime(state, duration) {
        state.totalReadingTime += duration
    },
    addSession(state, session) {
        state.sessions.push(session)
        // Keep only last 100 sessions
        if (state.sessions.length > 100) {
            state.sessions = state.sessions.slice(-100)
        }
    },
    addHistoryEntry(state, entry) {
        if (!state.readingHistory) {
            state.readingHistory = []
        }
        state.readingHistory.push(entry)
        // Keep only last 500 history entries
        if (state.readingHistory.length > 500) {
            state.readingHistory = state.readingHistory.slice(-500)
        }
    },
    resetState(state) {
        state.totalChaptersRead = 0
        state.totalReadingTime = 0
        state.sessions = []
        state.chaptersByMirror = {}
        state.chaptersByDay = {}
        state.currentStreak = 0
        state.longestStreak = 0
        state.lastReadDate = null
        state.readingHistory = []
        state.goals = { weekly: { target: 0, enabled: false }, monthly: { target: 0, enabled: false } }
    },
    updateGoal(state, { type, target, enabled }) {
        if (!state.goals) {
            state.goals = { weekly: { target: 0, enabled: false }, monthly: { target: 0, enabled: false } }
        }
        if (type === "weekly" || type === "monthly") {
            state.goals[type] = {
                target: target || 0,
                enabled: enabled !== undefined ? enabled : state.goals[type].enabled
            }
        }
    },
    setTotalChaptersRead(state, value) {
        state.totalChaptersRead = value
    },
    setTotalReadingTime(state, value) {
        state.totalReadingTime = value
    },
    setCurrentStreak(state, value) {
        state.currentStreak = value
    },
    setLongestStreak(state, value) {
        state.longestStreak = value
    },
    setReadingGoals(state, goals) {
        if (goals) {
            state.goals = goals
        }
    }
}

export default {
    state,
    getters,
    actions,
    mutations
}
