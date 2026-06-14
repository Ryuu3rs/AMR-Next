import storedb from "../../amr/storedb"
import { debug } from "../../core/debug"

/**
 * Achievement definitions - organized by category
 */
const ACHIEVEMENTS = {
    // Milestone achievements - based on total chapters read
    milestones: [
        {
            id: "first_chapter",
            name: "First Steps",
            description: "Read your first chapter",
            icon: "mdi-baby-carriage",
            target: 1,
            category: "milestone"
        },
        {
            id: "chapters_10",
            name: "Getting Started",
            description: "Read 10 chapters",
            icon: "mdi-numeric-10-box",
            target: 10,
            category: "milestone"
        },
        {
            id: "chapters_50",
            name: "Bookworm",
            description: "Read 50 chapters",
            icon: "mdi-book-open-variant",
            target: 50,
            category: "milestone"
        },
        {
            id: "chapters_100",
            name: "Century Reader",
            description: "Read 100 chapters",
            icon: "mdi-numeric-100",
            target: 100,
            category: "milestone"
        },
        {
            id: "chapters_500",
            name: "Manga Master",
            description: "Read 500 chapters",
            icon: "mdi-star",
            target: 500,
            category: "milestone"
        },
        {
            id: "chapters_1000",
            name: "Legendary Reader",
            description: "Read 1000 chapters",
            icon: "mdi-crown",
            target: 1000,
            category: "milestone"
        }
    ],
    // Streak achievements - based on consecutive reading days
    streaks: [
        {
            id: "streak_3",
            name: "Consistent",
            description: "Read 3 days in a row",
            icon: "mdi-fire",
            target: 3,
            category: "streak"
        },
        {
            id: "streak_7",
            name: "Weekly Warrior",
            description: "Read 7 days in a row",
            icon: "mdi-calendar-week",
            target: 7,
            category: "streak"
        },
        {
            id: "streak_14",
            name: "Fortnight Fighter",
            description: "Read 14 days in a row",
            icon: "mdi-calendar-range",
            target: 14,
            category: "streak"
        },
        {
            id: "streak_30",
            name: "Monthly Master",
            description: "Read 30 days in a row",
            icon: "mdi-calendar-month",
            target: 30,
            category: "streak"
        }
    ],
    // Exploration achievements - based on manga/mirror variety
    exploration: [
        {
            id: "manga_5",
            name: "Explorer",
            description: "Follow 5 different manga",
            icon: "mdi-compass",
            target: 5,
            category: "exploration"
        },
        {
            id: "manga_20",
            name: "Collector",
            description: "Follow 20 different manga",
            icon: "mdi-bookshelf",
            target: 20,
            category: "exploration"
        },
        {
            id: "manga_50",
            name: "Library Builder",
            description: "Follow 50 different manga",
            icon: "mdi-library",
            target: 50,
            category: "exploration"
        },
        {
            id: "mirrors_3",
            name: "Source Seeker",
            description: "Read from 3 different sources",
            icon: "mdi-web",
            target: 3,
            category: "exploration"
        },
        {
            id: "mirrors_10",
            name: "Multi-Source Master",
            description: "Read from 10 different sources",
            icon: "mdi-earth",
            target: 10,
            category: "exploration"
        }
    ],
    // Dedication achievements - based on reading time
    dedication: [
        {
            id: "time_1h",
            name: "Hour Reader",
            description: "Spend 1 hour reading",
            icon: "mdi-clock-outline",
            target: 3600,
            category: "dedication"
        },
        {
            id: "time_10h",
            name: "Dedicated Reader",
            description: "Spend 10 hours reading",
            icon: "mdi-clock-check",
            target: 36000,
            category: "dedication"
        },
        {
            id: "time_50h",
            name: "Time Traveler",
            description: "Spend 50 hours reading",
            icon: "mdi-clock-star-four-points",
            target: 180000,
            category: "dedication"
        },
        {
            id: "time_100h",
            name: "Eternal Reader",
            description: "Spend 100 hours reading",
            icon: "mdi-infinity",
            target: 360000,
            category: "dedication"
        }
    ]
}

// Flatten all achievements into a single array
const ALL_ACHIEVEMENTS = Object.values(ACHIEVEMENTS).flat()

const state = {
    // Map of achievement ID to unlock status and progress
    achievements: {},
    // Recently unlocked achievements (for notifications)
    recentUnlocks: [],
    // Initialized flag
    initialized: false
}

const getters = {
    allAchievements: () => ALL_ACHIEVEMENTS,
    achievementsByCategory: () => ACHIEVEMENTS,
    unlockedAchievements: state => ALL_ACHIEVEMENTS.filter(a => state.achievements[a.id]?.unlocked),
    lockedAchievements: state => ALL_ACHIEVEMENTS.filter(a => !state.achievements[a.id]?.unlocked),
    achievementProgress: state => id => state.achievements[id] || { progress: 0, unlocked: false },
    totalUnlocked: state => ALL_ACHIEVEMENTS.filter(a => state.achievements[a.id]?.unlocked).length,
    totalAchievements: () => ALL_ACHIEVEMENTS.length,
    recentUnlocks: state => state.recentUnlocks,
    completionPercentage: (state, getters) => Math.round((getters.totalUnlocked / getters.totalAchievements) * 100)
}

const actions = {
    async initAchievementsFromDB({ commit }) {
        try {
            const data = await storedb.getAchievements()
            if (data) commit("setAchievements", data)
            commit("setInitialized", true)
        } catch (e) {
            debug.storage.error("Achievements Failed to load from DB:", e)
            commit("setInitialized", true)
        }
    },

    async checkAchievements({ commit, state, rootState }) {
        const newUnlocks = []
        const stats = rootState.statistics || {}
        const mangaCount = rootState.mangas?.all?.length || 0
        const mirrorCount = Object.keys(stats.chaptersByMirror || {}).length

        // Check milestone achievements
        for (const a of ACHIEVEMENTS.milestones) {
            if (!state.achievements[a.id]?.unlocked && stats.totalChaptersRead >= a.target) {
                commit("unlockAchievement", { id: a.id, progress: stats.totalChaptersRead })
                newUnlocks.push(a)
            } else if (!state.achievements[a.id]?.unlocked) {
                commit("updateProgress", { id: a.id, progress: stats.totalChaptersRead })
            }
        }

        // Check streak achievements
        for (const a of ACHIEVEMENTS.streaks) {
            const streak = Math.max(stats.currentStreak || 0, stats.longestStreak || 0)
            if (!state.achievements[a.id]?.unlocked && streak >= a.target) {
                commit("unlockAchievement", { id: a.id, progress: streak })
                newUnlocks.push(a)
            } else if (!state.achievements[a.id]?.unlocked) {
                commit("updateProgress", { id: a.id, progress: streak })
            }
        }

        // Check exploration achievements (manga count)
        for (const a of ACHIEVEMENTS.exploration.filter(x => x.id.startsWith("manga_"))) {
            if (!state.achievements[a.id]?.unlocked && mangaCount >= a.target) {
                commit("unlockAchievement", { id: a.id, progress: mangaCount })
                newUnlocks.push(a)
            } else if (!state.achievements[a.id]?.unlocked) {
                commit("updateProgress", { id: a.id, progress: mangaCount })
            }
        }

        // Check exploration achievements (mirror count)
        for (const a of ACHIEVEMENTS.exploration.filter(x => x.id.startsWith("mirrors_"))) {
            if (!state.achievements[a.id]?.unlocked && mirrorCount >= a.target) {
                commit("unlockAchievement", { id: a.id, progress: mirrorCount })
                newUnlocks.push(a)
            } else if (!state.achievements[a.id]?.unlocked) {
                commit("updateProgress", { id: a.id, progress: mirrorCount })
            }
        }

        // Check dedication achievements (reading time)
        for (const a of ACHIEVEMENTS.dedication) {
            if (!state.achievements[a.id]?.unlocked && stats.totalReadingTime >= a.target) {
                commit("unlockAchievement", { id: a.id, progress: stats.totalReadingTime })
                newUnlocks.push(a)
            } else if (!state.achievements[a.id]?.unlocked) {
                commit("updateProgress", { id: a.id, progress: stats.totalReadingTime })
            }
        }

        if (newUnlocks.length > 0) {
            commit("addRecentUnlocks", newUnlocks)
            await storedb.storeAchievements(JSON.parse(JSON.stringify(state.achievements)))
        }
        return newUnlocks
    },

    clearRecentUnlocks({ commit }) {
        commit("clearRecentUnlocks")
    },

    async exportAchievements({ state }) {
        const data = {
            achievements: state.achievements,
            exportDate: new Date().toISOString(),
            allDefs: ALL_ACHIEVEMENTS
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `amr-achievements-${new Date().toISOString().split("T")[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
    },

    /**
     * Import achievements from JSON data
     */
    async importAchievements({ commit, state }, data) {
        if (data.achievements && typeof data.achievements === "object") {
            // Merge imported achievements with existing ones
            const mergedAchievements = { ...state.achievements }
            Object.entries(data.achievements).forEach(([id, imported]) => {
                const existing = mergedAchievements[id]
                if (!existing) {
                    mergedAchievements[id] = imported
                } else {
                    // Keep the best progress/unlock state
                    mergedAchievements[id] = {
                        ...existing,
                        unlocked: existing.unlocked || imported.unlocked,
                        unlockedAt: existing.unlockedAt || imported.unlockedAt,
                        progress: Math.max(existing.progress || 0, imported.progress || 0)
                    }
                }
            })
            commit("setAchievements", mergedAchievements)
            // Persist to IndexedDB
            await storedb.storeAchievements(JSON.parse(JSON.stringify(mergedAchievements)))
            return { success: true, message: "Achievements imported successfully" }
        }
        return { success: false, message: "Invalid achievements data" }
    }
}

const mutations = {
    setAchievements(state, data) {
        state.achievements = data
    },
    setInitialized(state, value) {
        state.initialized = value
    },
    unlockAchievement(state, { id, progress }) {
        state.achievements[id] = { unlocked: true, unlockedAt: new Date().toISOString(), progress }
    },
    updateProgress(state, { id, progress }) {
        if (!state.achievements[id]) {
            state.achievements[id] = { unlocked: false, progress: 0 }
        }
        state.achievements[id].progress = progress
    },
    addRecentUnlocks(state, achievements) {
        state.recentUnlocks = [...achievements, ...state.recentUnlocks].slice(0, 5)
    },
    clearRecentUnlocks(state) {
        state.recentUnlocks = []
    }
}

export default {
    state,
    getters,
    actions,
    mutations
}
