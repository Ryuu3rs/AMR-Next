<template>
    <v-app>
        <!-- Navigation Bar -->
        <NavigationBar
            :current-view="currentView"
            @toggle-sidebar="sidebarOpen = !sidebarOpen"
            @refresh="refreshMangas"
            @navigate="navigateTo"
            @toggle-compact="handleCompactToggle"
            @open-search="openSearch"
            @import-manga-list="handleImportMangaList"
            @import-stats="handleImportStats"
            @open-changelog="changelogOpen = true"
            @open-timers="timersOpen = true"
            @open-health-check="healthCheckOpen = true"
            @add-by-url="addByUrlOpen = true" />

        <!-- Sidebar -->
        <Sidebar
            v-model="sidebarOpen"
            ref="sidebar"
            @filter-category="filterByCategory"
            @filter-mirror="filterByMirror" />

        <!-- Main Content -->
        <v-main class="dashboard-main">
            <v-container fluid class="pa-4">
                <!-- Library View - use v-show to keep component alive and avoid re-rendering -->
                <div v-show="currentView === 'library'">
                    <MangaList
                        ref="mangaList"
                        :category-filter="categoryFilter"
                        :mirror-filter="mirrorFilter"
                        @search-request="openSearch" />
                </div>

                <!-- Statistics View - wrapped in keep-alive to cache when switching tabs -->
                <keep-alive>
                    <StatisticsCard v-if="currentView === 'statistics'" />
                </keep-alive>

                <!-- Achievements View - wrapped in keep-alive to cache when switching tabs -->
                <keep-alive>
                    <AchievementCard v-if="currentView === 'achievements'" />
                </keep-alive>
            </v-container>
        </v-main>

        <!-- Search Dialog -->
        <v-dialog v-model="searchOpen" fullscreen transition="dialog-bottom-transition" scrollable>
            <v-card rounded="0">
                <v-toolbar height="64">
                    <v-btn icon @click="searchOpen = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>{{ i18n("search_title") }}</v-toolbar-title>
                </v-toolbar>
                <v-main>
                    <Search v-if="searchOpen" :to-search="searchQuery" />
                </v-main>
            </v-card>
        </v-dialog>

        <!-- Achievement Unlock Notification -->
        <v-snackbar v-model="achievementSnackbar" :timeout="5000" color="success" location="bottom right">
            <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-trophy</v-icon>
                <div>
                    <div class="font-weight-bold">Achievement Unlocked!</div>
                    <div class="text-caption">{{ achievementMessage }}</div>
                </div>
            </div>
            <template v-slot:actions>
                <v-btn variant="text" @click="viewAchievements">View</v-btn>
                <v-btn variant="text" icon @click="achievementSnackbar = false"><v-icon>mdi-close</v-icon></v-btn>
            </template>
        </v-snackbar>

        <!-- Keyboard Shortcuts Help Dialog -->
        <v-dialog v-model="showKeyboardHelp" max-width="400">
            <v-card>
                <v-card-title class="d-flex align-center">
                    <v-icon start>mdi-keyboard</v-icon>Keyboard Shortcuts
                </v-card-title>
                <v-card-text>
                    <v-list density="compact">
                        <v-list-item
                            ><v-list-item-title><kbd>/</kbd> Open search</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>1</kbd> Library view</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>2</kbd> Statistics view</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>3</kbd> Achievements view</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>r</kbd> Refresh mangas</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>s</kbd> Toggle sidebar</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>Esc</kbd> Close dialogs</v-list-item-title></v-list-item
                        >
                        <v-list-item
                            ><v-list-item-title><kbd>?</kbd> Show this help</v-list-item-title></v-list-item
                        >
                    </v-list>
                </v-card-text>
                <v-card-actions
                    ><v-spacer></v-spacer
                    ><v-btn color="primary" @click="showKeyboardHelp = false">Close</v-btn></v-card-actions
                >
            </v-card>
        </v-dialog>

        <!-- Quick Actions FAB -->
        <QuickActionsPanel />

        <!-- Changelog Dialog -->
        <v-dialog v-model="changelogOpen" fullscreen transition="dialog-bottom-transition" scrollable>
            <v-card rounded="0">
                <v-toolbar height="64">
                    <v-btn icon @click="changelogOpen = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>{{ i18n("change_log_title") }}</v-toolbar-title>
                </v-toolbar>
                <v-main>
                    <ChangeLog v-if="changelogOpen" />
                </v-main>
            </v-card>
        </v-dialog>

        <!-- Timers Dialog -->
        <v-dialog v-model="timersOpen" max-width="600" scrollable>
            <v-card>
                <v-toolbar height="64" color="primary">
                    <v-btn icon @click="timersOpen = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>{{ i18n("nav_timers") || "Refresh Timers" }}</v-toolbar-title>
                </v-toolbar>
                <v-card-text class="pa-0">
                    <Timers v-if="timersOpen" />
                </v-card-text>
            </v-card>
        </v-dialog>

        <!-- Manga Health Check Dialog -->
        <v-dialog v-model="healthCheckOpen" max-width="700" scrollable>
            <MangaHealth
                v-if="healthCheckOpen"
                @close="healthCheckOpen = false"
                @search-request="openSearchFromHealth" />
        </v-dialog>

        <!-- Add by URL Dialog -->
        <AddByUrlDialog v-model="addByUrlOpen" @manga-added="handleMangaAdded" />
    </v-app>
</template>

<script>
import i18n from "../../amr/i18n"
import browser from "webextension-polyfill"
import { mapGetters } from "vuex"
import NavigationBar from "./NavigationBar.vue"
import Sidebar from "./Sidebar.vue"
import MangaList from "./MangaList.vue"
import Search from "./Search.vue"
import StatisticsCard from "./StatisticsCard.vue"
import AchievementCard from "./AchievementCard.vue"
import QuickActionsPanel from "./QuickActionsPanel.vue"
import ChangeLog from "./ChangeLog.vue"
import Timers from "./Timers.vue"
import MangaHealth from "./MangaHealth.vue"
import AddByUrlDialog from "./AddByUrlDialog.vue"

export default {
    name: "Dashboard",
    components: {
        NavigationBar,
        Sidebar,
        MangaList,
        Search,
        StatisticsCard,
        AchievementCard,
        QuickActionsPanel,
        ChangeLog,
        Timers,
        MangaHealth,
        AddByUrlDialog
    },
    data() {
        return {
            currentView: "library",
            sidebarOpen: true,
            searchOpen: false,
            searchQuery: "",
            categoryFilter: null,
            mirrorFilter: null,
            achievementSnackbar: false,
            achievementMessage: "",
            showKeyboardHelp: false,
            compactMode: this.$store?.state?.options?.compactMode || false,
            changelogOpen: false,
            timersOpen: false,
            healthCheckOpen: false,
            addByUrlOpen: false
        }
    },
    computed: {
        ...mapGetters(["recentUnlocks"])
    },
    watch: {
        recentUnlocks: {
            handler(newUnlocks) {
                if (newUnlocks && newUnlocks.length > 0) {
                    this.achievementMessage = newUnlocks[0].name
                    this.achievementSnackbar = true
                    // Clear after showing
                    setTimeout(() => this.$store.dispatch("clearRecentUnlocks"), 100)
                }
            },
            deep: true
        }
    },
    created() {
        // Initialize state from background
        this.$store.dispatch("getStateFromReference", {
            module: "mirrors",
            key: "all",
            mutation: "setMirrors"
        })
    },
    mounted() {
        // Add keyboard event listener
        document.addEventListener("keydown", this.handleKeydown)
    },
    beforeUnmount() {
        // Remove keyboard event listener
        document.removeEventListener("keydown", this.handleKeydown)
    },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        navigateTo(view) {
            this.currentView = view
        },
        openSearch(query = "") {
            this.searchQuery = query
            this.searchOpen = true
        },
        openSearchFromHealth(query) {
            this.healthCheckOpen = false
            this.openSearch(query)
        },
        openHealthCheck() {
            this.healthCheckOpen = true
        },
        refreshMangas() {
            browser.runtime.sendMessage({ action: "refreshMangas" })
        },
        filterByCategory(category) {
            this.categoryFilter = category
        },
        filterByMirror(mirror) {
            this.mirrorFilter = mirror
        },
        viewAchievements() {
            this.achievementSnackbar = false
            this.currentView = "achievements"
        },
        handleCompactToggle(isCompact) {
            this.compactMode = isCompact
            // Forward to MangaList if it exists
            if (this.$refs.mangaList && typeof this.$refs.mangaList.setCompactMode === "function") {
                this.$refs.mangaList.setCompactMode(isCompact)
            }
        },
        async handleImportMangaList(data) {
            // Import manga list using existing mechanism
            if (data.mangas && Array.isArray(data.mangas)) {
                browser.runtime.sendMessage({
                    action: "importMangas",
                    importcat: "",
                    imports: data
                })
                this.showSnackbar(`Importing ${data.mangas.length} manga(s)...`, "success")
            } else {
                this.showSnackbar("Invalid AMR export file. No manga list found.", "error")
            }
        },
        async handleImportStats(data) {
            let statsImported = false
            let achievementsImported = false
            // Handle combined stats & achievements file OR individual files
            if (data.statistics || data.totalChaptersRead !== undefined) {
                const statsData = data.statistics || data
                await this.$store.dispatch("importStatistics", statsData)
                statsImported = true
            }
            if (data.achievements) {
                await this.$store.dispatch("importAchievements", data)
                achievementsImported = true
            }
            if (statsImported || achievementsImported) {
                const parts = []
                if (statsImported) parts.push("Statistics")
                if (achievementsImported) parts.push("Achievements")
                this.showSnackbar(`${parts.join(" & ")} imported successfully!`, "success")
            } else {
                this.showSnackbar("Invalid file. No statistics or achievements data found.", "error")
            }
        },
        showSnackbar(message, color = "primary") {
            this.achievementMessage = message
            this.achievementSnackbar = true
        },
        handleMangaAdded(result) {
            this.showSnackbar(`Added "${result.mangaName}" to your library!`, "success")
            // Refresh manga list to show the new entry
            this.$refs.mangaList?.refreshList?.()
        },
        handleKeydown(e) {
            // Don't handle shortcuts when typing in input fields
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
                return
            }
            // Don't handle if dialog is open
            if (this.searchOpen) {
                if (e.key === "Escape") {
                    this.searchOpen = false
                    e.preventDefault()
                }
                return
            }
            switch (e.key) {
                case "/": // Open search
                    e.preventDefault()
                    this.openSearch()
                    break
                case "1": // Navigate to Library
                    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                        this.currentView = "library"
                    }
                    break
                case "2": // Navigate to Statistics
                    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                        this.currentView = "statistics"
                    }
                    break
                case "3": // Navigate to Achievements
                    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                        this.currentView = "achievements"
                    }
                    break
                case "r": // Refresh mangas
                    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                        this.refreshMangas()
                    }
                    break
                case "s": // Toggle sidebar
                    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                        this.sidebarOpen = !this.sidebarOpen
                    }
                    break
                case "?": // Show keyboard shortcuts help
                    this.showKeyboardHelp = true
                    break
            }
        }
    }
}
</script>

<style scoped>
.dashboard-main {
    background-color: #f5f5f5;
}

.v-theme--dark .dashboard-main {
    background-color: #121212;
}

/* Keyboard shortcut styling */
kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 12px;
    font-family: monospace;
    background-color: #f5f5f5;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
    margin-right: 8px;
    min-width: 24px;
    text-align: center;
}

.v-theme--dark kbd {
    background-color: #333;
    border-color: #555;
}
</style>
