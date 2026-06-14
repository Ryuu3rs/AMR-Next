<template>
    <div class="quick-actions-fab">
        <!-- FAB Button -->
        <v-fab
            :active="isOpen"
            location="bottom end"
            app
            appear
            @click="isOpen = !isOpen"
            color="primary"
            icon
            size="large"
            class="fab-main">
            <v-icon>{{ isOpen ? "mdi-close" : "mdi-lightning-bolt" }}</v-icon>
        </v-fab>
        <!-- Speed Dial Actions -->
        <v-expand-transition>
            <div v-show="isOpen" class="fab-actions">
                <v-tooltip location="left" v-for="action in actions" :key="action.id">
                    <template v-slot:activator="{ props }">
                        <v-btn
                            v-bind="props"
                            :color="action.color"
                            icon
                            size="small"
                            class="fab-action-btn mb-2"
                            @click="executeAction(action.id)"
                            :disabled="action.disabled">
                            <v-icon>{{ action.icon }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ action.label }}</span>
                </v-tooltip>
            </div>
        </v-expand-transition>
    </div>
</template>

<script>
import { mapGetters } from "vuex"
import browser from "webextension-polyfill"

export default {
    name: "QuickActionsPanel",
    data() {
        return {
            isOpen: false
        }
    },
    computed: {
        ...mapGetters(["allMangas"]),
        hasNewChapters() {
            // Check for manga with unread chapters - listChaps can be array or undefined
            return this.allMangas.some(m => {
                if (!m.listChaps || !Array.isArray(m.listChaps) || m.listChaps.length === 0) {
                    return false
                }
                // Manga has new chapters if read === 0 and lastChapterReadURL doesn't match first chapter
                return m.read === 0 && m.lastChapterReadURL !== m.listChaps[0]?.[1]
            })
        },
        actions() {
            return [
                { id: "refresh", icon: "mdi-refresh", label: "Refresh All Manga", color: "primary", disabled: false },
                {
                    id: "markAllRead",
                    icon: "mdi-eye-check",
                    label: "Mark All as Read",
                    color: "success",
                    disabled: !this.hasNewChapters
                },
                {
                    id: "openRandom",
                    icon: "mdi-shuffle-variant",
                    label: "Read Random Manga",
                    color: "warning",
                    disabled: this.allMangas.length === 0
                },
                { id: "exportData", icon: "mdi-download", label: "Export Data", color: "info", disabled: false },
                { id: "openSettings", icon: "mdi-cog", label: "Settings", color: "grey", disabled: false }
            ]
        }
    },
    methods: {
        executeAction(actionId) {
            this.isOpen = false
            switch (actionId) {
                case "refresh":
                    this.$store.dispatch("updateMangasFromStore")
                    this.$eventBus.$emit("show-snackbar", { text: "Refreshing all manga...", color: "primary" })
                    break
                case "markAllRead":
                    this.markAllAsRead()
                    break
                case "openRandom":
                    this.openRandomManga()
                    break
                case "exportData":
                    this.$store.dispatch("exportStatistics")
                    break
                case "openSettings":
                    browser.runtime.openOptionsPage()
                    break
            }
        },
        markAllAsRead() {
            const mangasWithNew = this.allMangas.filter(m => {
                if (!m.listChaps || !Array.isArray(m.listChaps) || m.listChaps.length === 0) {
                    return false
                }
                return m.read === 0 && m.lastChapterReadURL !== m.listChaps[0]?.[1]
            })
            mangasWithNew.forEach(manga => {
                this.$store.dispatch("readManga", {
                    key: manga.key,
                    mirror: manga.mirror,
                    url: manga.url,
                    name: manga.name,
                    language: manga.language,
                    lastChapterReadURL: manga.lastChapterReadURL,
                    lastChapterReadName: manga.lastChapterReadName,
                    fromSite: false
                })
            })
            this.$eventBus.$emit("show-snackbar", {
                text: `Marked ${mangasWithNew.length} manga as read`,
                color: "success"
            })
        },
        openRandomManga() {
            if (this.allMangas.length === 0) return
            const randomIndex = Math.floor(Math.random() * this.allMangas.length)
            const manga = this.allMangas[randomIndex]
            if (manga.url) {
                browser.tabs.create({ url: manga.url })
            }
        }
    }
}
</script>

<style scoped>
.quick-actions-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.fab-main {
    z-index: 1001;
}

.fab-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 8px;
}

.fab-action-btn {
    transition: transform 0.2s, opacity 0.2s;
}

.fab-action-btn:hover {
    transform: scale(1.1);
}
</style>
