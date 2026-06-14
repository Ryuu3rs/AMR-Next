<template>
    <v-app-bar density="compact" color="primary" class="dashboard-nav">
        <v-app-bar-nav-icon @click="$emit('toggle-sidebar')" class="d-md-none">
            <v-icon>mdi-menu</v-icon>
        </v-app-bar-nav-icon>

        <v-app-bar-title class="d-flex align-center">
            <img src="/icons/icon_32.png" alt="AMR" class="mr-2" width="24" height="24" />
            <span class="text-subtitle-1 font-weight-medium">All Mangas Reader</span>
            <!-- Performance Overlay - toggleable debug feature -->
            <PerformanceOverlay />
        </v-app-bar-title>

        <v-spacer></v-spacer>

        <!-- Navigation Tabs -->
        <v-tabs v-model="activeTab" class="nav-tabs d-none d-md-flex" bg-color="primary" slider-color="white">
            <v-tab value="library" @click="navigateTo('library')" class="nav-tab">
                <v-icon start>mdi-bookshelf</v-icon>
                {{ i18n("nav_library") || "Library" }}
            </v-tab>
            <v-tab value="statistics" @click="navigateTo('statistics')" class="nav-tab">
                <v-icon start>mdi-chart-line</v-icon>
                {{ i18n("nav_statistics") || "Statistics" }}
            </v-tab>
            <v-tab value="achievements" @click="navigateTo('achievements')" class="nav-tab">
                <v-icon start>mdi-trophy</v-icon>
                {{ i18n("nav_achievements") || "Achievements" }}
            </v-tab>
        </v-tabs>

        <v-spacer></v-spacer>

        <!-- Quick Actions -->
        <v-btn icon variant="text" @click="$emit('refresh')">
            <v-icon>mdi-refresh</v-icon>
            <v-tooltip activator="parent" location="bottom">
                {{ i18n("nav_refresh") || "Refresh" }}
            </v-tooltip>
        </v-btn>

        <v-btn icon variant="text" @click="toggleCompactMode">
            <v-icon>{{ compactMode ? "mdi-view-agenda" : "mdi-view-list" }}</v-icon>
            <v-tooltip activator="parent" location="bottom">{{ compactViewLabel }}</v-tooltip>
        </v-btn>

        <v-btn icon variant="text" @click="$emit('open-search')">
            <v-icon>mdi-magnify</v-icon>
            <v-tooltip activator="parent" location="bottom">
                {{ i18n("nav_search") || "Search" }}
            </v-tooltip>
        </v-btn>

        <!-- Import Menu -->
        <v-menu location="bottom end" :close-on-content-click="false">
            <template v-slot:activator="{ props }">
                <v-btn icon variant="text" v-bind="props">
                    <v-icon>mdi-import</v-icon>
                    <v-tooltip activator="parent" location="bottom">
                        {{ i18n("nav_import") || "Import" }}
                    </v-tooltip>
                </v-btn>
            </template>
            <v-card min-width="280" class="import-menu-card">
                <v-card-title class="text-subtitle-1 pb-0">
                    <v-icon start size="small">mdi-import</v-icon>
                    Import Data
                </v-card-title>
                <v-card-text class="pt-2">
                    <v-list density="compact" class="pa-0">
                        <v-list-item @click="$emit('add-by-url')" prepend-icon="mdi-link-plus">
                            <v-list-item-title>Add by URL</v-list-item-title>
                            <v-list-item-subtitle>Paste manga/chapter URL directly</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item @click="triggerImportMangaList" prepend-icon="mdi-book-multiple">
                            <v-list-item-title>Manga List</v-list-item-title>
                            <v-list-item-subtitle>Import from older AMR versions</v-list-item-subtitle>
                        </v-list-item>
                        <v-list-item @click="triggerImportStatsAchievements" prepend-icon="mdi-chart-box">
                            <v-list-item-title>Stats & Achievements</v-list-item-title>
                            <v-list-item-subtitle>Import reading stats and achievements</v-list-item-subtitle>
                        </v-list-item>
                    </v-list>
                    <!-- Hidden file inputs -->
                    <input
                        ref="mangaFileInput"
                        type="file"
                        accept=".json"
                        style="display: none"
                        @change="handleMangaFileImport" />
                    <input
                        ref="statsFileInput"
                        type="file"
                        accept=".json"
                        style="display: none"
                        @change="handleStatsFileImport" />
                </v-card-text>
            </v-card>
        </v-menu>

        <!-- Dark Mode Toggle -->
        <v-btn icon variant="text" @click="toggleDarkMode">
            <v-icon>mdi-brightness-6</v-icon>
            <v-tooltip activator="parent" location="bottom">
                {{ i18n("nav_dark_mode") || "Toggle Dark Mode" }}
            </v-tooltip>
        </v-btn>

        <v-btn icon variant="text" @click="openSettings">
            <v-icon>mdi-cog</v-icon>
            <v-tooltip activator="parent" location="bottom">
                {{ i18n("nav_settings") || "Settings" }}
            </v-tooltip>
        </v-btn>

        <!-- More Menu (Links, Changelog, Export, Timers) -->
        <v-menu location="bottom end" :close-on-content-click="false">
            <template v-slot:activator="{ props }">
                <v-btn icon variant="text" v-bind="props">
                    <v-icon>mdi-dots-vertical</v-icon>
                    <v-tooltip activator="parent" location="bottom">
                        {{ i18n("nav_more") || "More" }}
                    </v-tooltip>
                </v-btn>
            </template>
            <v-card min-width="280" class="more-menu-card">
                <v-list density="compact">
                    <!-- Links Section -->
                    <v-list-subheader>Links</v-list-subheader>
                    <v-list-item @click="openTab('https://amr-releases.com')" prepend-icon="mdi-web">
                        <v-list-item-title>AMR Website</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="openTab('/pages/bookmarks/bookmarks.html')" prepend-icon="mdi-star">
                        <v-list-item-title>{{ i18n("nav_bookmarks") || "Bookmarks" }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="openTab('/pages/lab/lab.html')" prepend-icon="mdi-antenna">
                        <v-list-item-title>{{ i18n("nav_lab") || "Lab" }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item
                        @click="openTab('https://gitlab.com/all-mangas-reader/all-mangas-reader-2/wikis/home')"
                        prepend-icon="mdi-help-circle">
                        <v-list-item-title>{{ i18n("nav_help") || "Help / Wiki" }}</v-list-item-title>
                    </v-list-item>

                    <v-divider class="my-1"></v-divider>

                    <!-- Tools Section -->
                    <v-list-subheader>Tools</v-list-subheader>
                    <v-list-item @click="openChangelog" prepend-icon="mdi-information">
                        <v-list-item-title>{{ i18n("change_log_button_tooltip") || "Changelog" }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="openTimers" prepend-icon="mdi-timer">
                        <v-list-item-title>{{ i18n("nav_timers") || "Refresh Timers" }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="openHealthCheck" prepend-icon="mdi-alert-circle">
                        <v-list-item-title>{{ i18n("nav_health_check") || "Manga Health Check" }}</v-list-item-title>
                        <template v-slot:append v-if="problemMangaCount > 0">
                            <v-chip size="x-small" color="warning">{{ problemMangaCount }}</v-chip>
                        </template>
                    </v-list-item>

                    <v-divider class="my-1"></v-divider>

                    <!-- Export Section -->
                    <v-list-subheader>Export</v-list-subheader>
                    <v-list-item @click="exportMangaList" prepend-icon="mdi-book-multiple">
                        <v-list-item-title>{{ i18n("nav_export_manga") || "Export Manga List" }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="exportStats" prepend-icon="mdi-chart-box">
                        <v-list-item-title>{{
                            i18n("nav_export_stats") || "Export Stats & Achievements"
                        }}</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-card>
        </v-menu>
    </v-app-bar>

    <!-- Mobile Bottom Navigation -->
    <v-bottom-navigation v-model="activeTab" grow class="d-md-none mobile-nav" color="primary">
        <v-btn value="library" @click="navigateTo('library')">
            <v-icon>mdi-bookshelf</v-icon>
            <span>{{ i18n("nav_library") || "Library" }}</span>
        </v-btn>
        <v-btn value="statistics" @click="navigateTo('statistics')">
            <v-icon>mdi-chart-line</v-icon>
            <span>{{ i18n("nav_statistics") || "Stats" }}</span>
        </v-btn>
        <v-btn value="achievements" @click="navigateTo('achievements')">
            <v-icon>mdi-trophy</v-icon>
            <span>{{ i18n("nav_achievements") || "Achieve" }}</span>
        </v-btn>
    </v-bottom-navigation>
</template>

<script>
import i18n from "../../amr/i18n"
import browser from "webextension-polyfill"
import PerformanceOverlay from "./PerformanceOverlay.vue"
import { debug } from "../../core/debug"

export default {
    name: "NavigationBar",
    components: { PerformanceOverlay },
    props: {
        currentView: {
            type: String,
            default: "library"
        }
    },
    emits: [
        "toggle-sidebar",
        "refresh",
        "navigate",
        "toggle-compact",
        "open-search",
        "import-manga-list",
        "import-stats",
        "open-changelog",
        "open-timers",
        "open-health-check",
        "add-by-url"
    ],
    data() {
        return {
            activeTab: this.currentView,
            compactMode: this.$store?.state?.options?.compactMode || false
        }
    },
    computed: {
        compactViewLabel() {
            if (this.compactMode) {
                return this.i18n("nav_normal_view") || "Normal View"
            }
            return this.i18n("nav_compact_view") || "Compact View"
        },
        problemMangaCount() {
            const mangas = this.$store?.state?.mangas?.all || []
            return mangas.filter(m => m.orphaned || m.updateError === 1).length
        }
    },
    watch: {
        currentView(newVal) {
            this.activeTab = newVal
        }
    },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        navigateTo(view) {
            this.$emit("navigate", view)
        },
        openSettings() {
            browser.runtime.sendMessage({ action: "opentab", url: "/pages/options/options.html" })
        },
        toggleCompactMode() {
            this.compactMode = !this.compactMode
            this.$store?.dispatch("setOption", { key: "compactMode", value: this.compactMode })
            this.$emit("toggle-compact", this.compactMode)
        },
        triggerImportMangaList() {
            this.$refs.mangaFileInput?.click()
        },
        triggerImportStatsAchievements() {
            this.$refs.statsFileInput?.click()
        },
        handleMangaFileImport(event) {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result)
                    this.$emit("import-manga-list", data)
                } catch (err) {
                    debug.ui.error("Failed to parse manga list file:", err)
                    alert("Invalid JSON file. Please select a valid AMR export file.")
                }
            }
            reader.readAsText(file)
            event.target.value = "" // Reset so same file can be selected again
        },
        handleStatsFileImport(event) {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result)
                    this.$emit("import-stats", data)
                } catch (err) {
                    debug.ui.error("Failed to parse stats file:", err)
                    alert("Invalid JSON file. Please select a valid stats/achievements export file.")
                }
            }
            reader.readAsText(file)
            event.target.value = ""
        },
        toggleDarkMode() {
            const isDark = !this.$store.state.options.dark
            this.$vuetify.theme.global.name = isDark ? "dark" : "light"
            this.$store.dispatch("setOption", { key: "dark", value: isDark ? 1 : 0 })
        },
        openTab(url) {
            browser.tabs.create({ url })
        },
        openChangelog() {
            this.$emit("open-changelog")
        },
        openTimers() {
            this.$emit("open-timers")
        },
        openHealthCheck() {
            this.$emit("open-health-check")
        },
        async exportMangaList() {
            // Get manga list from store and export as JSON
            const mangas = this.$store.state.mangas.all || []
            const exportData = {
                version: "3.0",
                exportDate: new Date().toISOString(),
                mangas: mangas.map(m => ({
                    key: m.key,
                    name: m.name,
                    url: m.url,
                    mirror: m.mirror,
                    lastChapterReadURL: m.lastChapterReadURL,
                    lastChapterReadName: m.lastChapterReadName,
                    read: m.read,
                    update: m.update,
                    display: m.display,
                    layout: m.layout,
                    cats: m.cats,
                    ts: m.ts,
                    upts: m.upts
                }))
            }
            this.downloadJSON(exportData, `amr-manga-export-${this.formatDate()}.json`)
        },
        async exportStats() {
            // Get statistics and achievements from store
            const stats = this.$store.state.statistics || {}
            const achievements = this.$store.state.achievements || {}
            const exportData = {
                version: "3.0",
                exportDate: new Date().toISOString(),
                statistics: {
                    totalChaptersRead: stats.totalChaptersRead || 0,
                    totalPagesRead: stats.totalPagesRead || 0,
                    totalReadingTime: stats.totalReadingTime || 0,
                    longestReadingSession: stats.longestReadingSession || 0,
                    currentStreak: stats.currentStreak || 0,
                    longestStreak: stats.longestStreak || 0,
                    lastReadDate: stats.lastReadDate || null,
                    dailyStats: stats.dailyStats || {},
                    mirrorStats: stats.mirrorStats || {}
                },
                achievements: achievements
            }
            this.downloadJSON(exportData, `amr-stats-export-${this.formatDate()}.json`)
        },
        downloadJSON(data, filename) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        },
        formatDate() {
            const d = new Date()
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
                2,
                "0"
            )}`
        }
    }
}
</script>

<style scoped>
.dashboard-nav {
    z-index: 1000;
}

.nav-tabs {
    max-width: 400px;
}

/* Ensure proper text visibility on tabs */
.nav-tab {
    color: rgba(255, 255, 255, 0.7) !important;
}

.nav-tab.v-tab--selected {
    color: white !important;
    background-color: rgba(255, 255, 255, 0.15) !important;
}

.mobile-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
}

/* Ensure content doesn't overlap with mobile nav */
@media (max-width: 959px) {
    .v-main {
        padding-bottom: 56px !important;
    }
}
</style>
