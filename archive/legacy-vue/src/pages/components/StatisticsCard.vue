<template>
    <v-container fluid class="statistics-container">
        <v-row class="mb-4">
            <v-col cols="12" sm="6" md="3">
                <v-card class="stat-card" elevation="2">
                    <v-card-text class="text-center">
                        <v-icon size="48" color="primary" class="mb-2">mdi-book-open-page-variant</v-icon>
                        <div class="text-h4 font-weight-bold">{{ totalChaptersRead }}</div>
                        <div class="text-subtitle-2 text-grey">Chapters Read</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="stat-card" elevation="2">
                    <v-card-text class="text-center">
                        <v-icon size="48" color="success" class="mb-2">mdi-clock-outline</v-icon>
                        <div class="text-h4 font-weight-bold">{{ totalReadingTimeFormatted }}</div>
                        <div class="text-subtitle-2 text-grey">Reading Time</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="stat-card" elevation="2">
                    <v-card-text class="text-center">
                        <v-icon size="48" color="warning" class="mb-2">mdi-fire</v-icon>
                        <div class="text-h4 font-weight-bold">{{ currentStreak }}</div>
                        <div class="text-subtitle-2 text-grey">Day Streak</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="stat-card" elevation="2">
                    <v-card-text class="text-center">
                        <v-icon size="48" color="error" class="mb-2">mdi-trophy</v-icon>
                        <div class="text-h4 font-weight-bold">{{ longestStreak }}</div>
                        <div class="text-subtitle-2 text-grey">Best Streak</div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12" md="6">
                <v-card elevation="2">
                    <v-card-title><v-icon start color="primary">mdi-web</v-icon>Top Sources</v-card-title>
                    <v-card-text>
                        <v-list v-if="topMirrors.length > 0" density="compact">
                            <v-list-item v-for="(mirror, index) in topMirrors" :key="mirror.name">
                                <template v-slot:prepend>
                                    <v-avatar size="32" :color="getMirrorColor(index)">
                                        <span class="text-white font-weight-bold">{{ index + 1 }}</span>
                                    </v-avatar>
                                </template>
                                <v-list-item-title>{{ mirror.name }}</v-list-item-title>
                                <template v-slot:append>
                                    <v-chip size="small" color="primary" variant="tonal"
                                        >{{ mirror.count }} chapters</v-chip
                                    >
                                </template>
                            </v-list-item>
                        </v-list>
                        <div v-else class="text-center text-grey pa-4">
                            <v-icon size="48" color="grey-lighten-1">mdi-chart-bar</v-icon>
                            <p class="mt-2">No reading data yet</p>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" md="6">
                <v-card elevation="2">
                    <v-card-title><v-icon start color="success">mdi-calendar-week</v-icon>This Week</v-card-title>
                    <v-card-text>
                        <div v-if="weeklyChapters > 0" class="weekly-chart">
                            <div v-for="day in weekDays" :key="day.date" class="day-bar-container">
                                <div class="day-label text-caption">{{ day.label }}</div>
                                <div class="day-bar-wrapper">
                                    <div
                                        class="day-bar"
                                        :style="{ height: getBarHeight(day.count) + '%' }"
                                        :class="day.isToday ? 'today' : ''"></div>
                                </div>
                                <div class="day-count text-caption">{{ day.count }}</div>
                            </div>
                        </div>
                        <div v-else class="text-center text-grey pa-4">
                            <v-icon size="48" color="grey-lighten-1">mdi-calendar-blank</v-icon>
                            <p class="mt-2">No chapters read this week</p>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
        <!-- Reading Goals -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title class="d-flex align-center justify-space-between">
                        <div><v-icon start color="info">mdi-target</v-icon>Reading Goals</div>
                        <v-btn variant="text" size="small" @click="showGoalDialog = true"
                            ><v-icon>mdi-cog</v-icon></v-btn
                        >
                    </v-card-title>
                    <v-card-text>
                        <v-row>
                            <v-col cols="12" md="6">
                                <div class="goal-card pa-4 rounded" :class="weeklyGoalProgress ? 'active' : 'inactive'">
                                    <div class="d-flex align-center justify-space-between mb-2">
                                        <span class="text-subtitle-1 font-weight-bold">Weekly Goal</span>
                                        <v-chip
                                            v-if="weeklyGoalProgress"
                                            size="small"
                                            :color="weeklyGoalProgress.percent >= 100 ? 'success' : 'primary'"
                                            variant="tonal">
                                            {{ weeklyGoalProgress.current }} / {{ weeklyGoalProgress.target }}
                                        </v-chip>
                                        <v-chip v-else size="small" color="grey" variant="tonal">Not Set</v-chip>
                                    </div>
                                    <v-progress-linear
                                        v-if="weeklyGoalProgress"
                                        :model-value="weeklyGoalProgress.percent"
                                        :color="weeklyGoalProgress.percent >= 100 ? 'success' : 'primary'"
                                        height="12"
                                        rounded></v-progress-linear>
                                    <v-progress-linear
                                        v-else
                                        :model-value="0"
                                        color="grey"
                                        height="12"
                                        rounded></v-progress-linear>
                                </div>
                            </v-col>
                            <v-col cols="12" md="6">
                                <div
                                    class="goal-card pa-4 rounded"
                                    :class="monthlyGoalProgress ? 'active' : 'inactive'">
                                    <div class="d-flex align-center justify-space-between mb-2">
                                        <span class="text-subtitle-1 font-weight-bold">Monthly Goal</span>
                                        <v-chip
                                            v-if="monthlyGoalProgress"
                                            size="small"
                                            :color="monthlyGoalProgress.percent >= 100 ? 'success' : 'warning'"
                                            variant="tonal">
                                            {{ monthlyGoalProgress.current }} / {{ monthlyGoalProgress.target }}
                                        </v-chip>
                                        <v-chip v-else size="small" color="grey" variant="tonal">Not Set</v-chip>
                                    </div>
                                    <v-progress-linear
                                        v-if="monthlyGoalProgress"
                                        :model-value="monthlyGoalProgress.percent"
                                        :color="monthlyGoalProgress.percent >= 100 ? 'success' : 'warning'"
                                        height="12"
                                        rounded></v-progress-linear>
                                    <v-progress-linear
                                        v-else
                                        :model-value="0"
                                        color="grey"
                                        height="12"
                                        rounded></v-progress-linear>
                                </div>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
        <!-- Goal Settings Dialog -->
        <v-dialog v-model="showGoalDialog" max-width="400">
            <v-card>
                <v-card-title><v-icon start>mdi-target</v-icon>Set Reading Goals</v-card-title>
                <v-card-text>
                    <div class="mb-4">
                        <v-switch
                            v-model="goalForm.weeklyEnabled"
                            label="Weekly Goal"
                            color="primary"
                            hide-details></v-switch>
                        <v-text-field
                            v-if="goalForm.weeklyEnabled"
                            v-model.number="goalForm.weeklyTarget"
                            type="number"
                            label="Chapters per week"
                            min="1"
                            max="500"
                            density="compact"
                            class="mt-2"></v-text-field>
                    </div>
                    <div>
                        <v-switch
                            v-model="goalForm.monthlyEnabled"
                            label="Monthly Goal"
                            color="warning"
                            hide-details></v-switch>
                        <v-text-field
                            v-if="goalForm.monthlyEnabled"
                            v-model.number="goalForm.monthlyTarget"
                            type="number"
                            label="Chapters per month"
                            min="1"
                            max="2000"
                            density="compact"
                            class="mt-2"></v-text-field>
                    </div>
                </v-card-text>
                <v-card-actions
                    ><v-spacer></v-spacer><v-btn variant="text" @click="showGoalDialog = false">Cancel</v-btn
                    ><v-btn color="primary" @click="saveGoals">Save</v-btn></v-card-actions
                >
            </v-card>
        </v-dialog>
        <!-- Reading History Log -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title class="d-flex align-center justify-space-between">
                        <div><v-icon start color="purple">mdi-book-clock</v-icon>Reading History</div>
                        <v-btn
                            variant="outlined"
                            size="small"
                            color="primary"
                            @click="exportStats"
                            :disabled="totalChaptersRead === 0">
                            <v-icon start>mdi-download</v-icon>Export
                        </v-btn>
                    </v-card-title>
                    <v-card-text>
                        <v-table v-if="recentHistory.length > 0" density="compact" class="history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Manga</th>
                                    <th>Chapter</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(entry, idx) in recentHistory"
                                    :key="idx"
                                    class="history-row"
                                    @click="openChapter(entry.url)">
                                    <td>{{ formatDate(entry.date) }}</td>
                                    <td class="text-truncate" style="max-width: 200px">{{ entry.mangaName }}</td>
                                    <td>{{ entry.chapterName }}</td>
                                    <td>{{ entry.mirror }}</td>
                                </tr>
                            </tbody>
                        </v-table>
                        <div v-else class="text-center text-grey pa-4">
                            <v-icon size="48" color="grey-lighten-1">mdi-book-clock</v-icon>
                            <p class="mt-2">No reading history yet</p>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script>
import { mapGetters } from "vuex"
import browser from "webextension-polyfill"
export default {
    name: "StatisticsCard",
    data() {
        return {
            showGoalDialog: false,
            goalForm: { weeklyEnabled: false, weeklyTarget: 10, monthlyEnabled: false, monthlyTarget: 50 }
        }
    },
    computed: {
        ...mapGetters([
            "totalChaptersRead",
            "totalReadingTimeFormatted",
            "currentStreak",
            "longestStreak",
            "topMirrors",
            "weeklyChapters",
            "chaptersByDay",
            "recentSessions",
            "recentHistory",
            "goals",
            "weeklyGoalProgress",
            "monthlyGoalProgress"
        ]),
        weekDays() {
            const days = [],
                labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                today = new Date()
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today)
                d.setDate(d.getDate() - i)
                const ds = d.toISOString().split("T")[0]
                days.push({
                    date: ds,
                    label: labels[d.getDay()],
                    count: this.chaptersByDay?.[ds] || 0,
                    isToday: i === 0
                })
            }
            return days
        },
        maxDayCount() {
            return Math.max(...this.weekDays.map(d => d.count), 1)
        }
    },
    watch: {
        goals: {
            handler(g) {
                if (g) {
                    this.goalForm.weeklyEnabled = g.weekly?.enabled || false
                    this.goalForm.weeklyTarget = g.weekly?.target || 10
                    this.goalForm.monthlyEnabled = g.monthly?.enabled || false
                    this.goalForm.monthlyTarget = g.monthly?.target || 50
                }
            },
            immediate: true
        }
    },
    methods: {
        getMirrorColor(i) {
            return ["primary", "success", "warning", "info", "secondary"][i % 5]
        },
        getBarHeight(c) {
            return this.maxDayCount === 0 ? 0 : Math.max((c / this.maxDayCount) * 100, c > 0 ? 10 : 0)
        },
        formatDate(ds) {
            return ds
                ? new Date(ds).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                  })
                : "-"
        },
        formatDuration(s) {
            if (!s) return "-"
            const h = Math.floor(s / 3600),
                m = Math.floor((s % 3600) / 60)
            return h > 0 ? `${h}h ${m}m` : `${m}m`
        },
        exportStats() {
            this.$store.dispatch("exportStatistics")
        },
        openChapter(url) {
            if (url) browser.tabs.create({ url })
        },
        saveGoals() {
            this.$store.dispatch("setGoal", {
                type: "weekly",
                target: this.goalForm.weeklyTarget,
                enabled: this.goalForm.weeklyEnabled
            })
            this.$store.dispatch("setGoal", {
                type: "monthly",
                target: this.goalForm.monthlyTarget,
                enabled: this.goalForm.monthlyEnabled
            })
            this.showGoalDialog = false
        }
    }
}
</script>

<style scoped>
.stat-card {
    transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.weekly-chart {
    display: flex;
    justify-content: space-around;
    align-items: flex-end;
    height: 150px;
    padding: 16px 0;
}

.day-bar-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
}

.day-label {
    color: #666;
    margin-bottom: 8px;
}

.day-bar-wrapper {
    width: 24px;
    height: 100px;
    background: #f0f0f0;
    border-radius: 4px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
}

.day-bar {
    width: 100%;
    background: linear-gradient(to top, #4caf50, #81c784);
    border-radius: 4px;
    transition: height 0.3s ease;
}

.day-bar.today {
    background: linear-gradient(to top, #2196f3, #64b5f6);
}

.day-count {
    margin-top: 8px;
    font-weight: 500;
}

.history-row {
    cursor: pointer;
    transition: background-color 0.2s;
}

.history-row:hover {
    background-color: rgba(var(--v-theme-primary), 0.08);
}

.history-table {
    max-height: 300px;
    overflow-y: auto;
}

.goal-card {
    border: 2px solid #e0e0e0;
    transition: border-color 0.2s, background-color 0.2s;
}

.goal-card.active {
    border-color: rgba(var(--v-theme-primary), 0.3);
    background-color: rgba(var(--v-theme-primary), 0.05);
}

.goal-card.inactive {
    opacity: 0.7;
}
</style>
