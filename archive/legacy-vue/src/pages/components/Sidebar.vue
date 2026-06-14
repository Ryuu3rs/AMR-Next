<template>
    <v-navigation-drawer v-model="drawer" :rail="rail" :permanent="!isMobile" class="dashboard-sidebar">
        <!-- Rail Toggle -->
        <template v-slot:prepend>
            <v-list-item class="px-2 rail-toggle-container">
                <v-btn icon variant="text" size="small" @click="rail = !rail" class="rail-toggle-btn">
                    <v-icon>{{ rail ? "mdi-chevron-right" : "mdi-chevron-left" }}</v-icon>
                    <v-tooltip activator="parent" location="right">
                        {{ rail ? "Expand sidebar" : "Collapse sidebar" }}
                    </v-tooltip>
                </v-btn>
            </v-list-item>
        </template>

        <!-- Quick Stats -->
        <v-list density="compact" nav>
            <v-list-subheader v-if="!rail">{{ i18n("sidebar_quick_stats") || "Quick Stats" }}</v-list-subheader>

            <v-list-item
                :title="rail ? '' : i18n('sidebar_total_manga') || 'Total Manga'"
                :subtitle="rail ? '' : String(totalManga)">
                <template v-slot:prepend>
                    <v-icon color="primary">mdi-book-multiple</v-icon>
                </template>
                <template v-slot:append v-if="!rail">
                    <v-chip size="x-small" color="primary">{{ totalManga }}</v-chip>
                </template>
            </v-list-item>

            <v-list-item
                :title="rail ? '' : i18n('sidebar_unread') || 'Unread'"
                :subtitle="rail ? '' : String(unreadCount)">
                <template v-slot:prepend>
                    <v-icon color="success">mdi-book-open-page-variant</v-icon>
                </template>
                <template v-slot:append v-if="!rail">
                    <v-chip size="x-small" color="success">{{ unreadCount }}</v-chip>
                </template>
            </v-list-item>

            <v-list-item
                :title="rail ? '' : i18n('sidebar_reading') || 'Reading'"
                :subtitle="rail ? '' : String(readingCount)">
                <template v-slot:prepend>
                    <v-icon color="info">mdi-book-clock</v-icon>
                </template>
                <template v-slot:append v-if="!rail">
                    <v-chip size="x-small" color="info">{{ readingCount }}</v-chip>
                </template>
            </v-list-item>
        </v-list>

        <v-divider></v-divider>

        <!-- Categories Filter -->
        <v-list density="compact" nav>
            <v-list-subheader v-if="!rail">{{ i18n("sidebar_categories") || "Categories" }}</v-list-subheader>

            <v-list-item
                v-for="cat in categories"
                :key="cat.name"
                :active="selectedCategory === cat.name"
                @click="selectCategory(cat.name)"
                :title="rail ? '' : cat.name">
                <template v-slot:prepend>
                    <v-icon :color="cat.color || 'grey'">mdi-folder</v-icon>
                </template>
                <template v-slot:append v-if="!rail">
                    <v-chip size="x-small">{{ cat.count || 0 }}</v-chip>
                </template>
            </v-list-item>

            <v-list-item
                v-if="categories.length === 0"
                :title="rail ? '' : i18n('sidebar_no_categories') || 'No categories'">
                <template v-slot:prepend>
                    <v-icon color="grey">mdi-folder-outline</v-icon>
                </template>
            </v-list-item>
        </v-list>

        <v-divider></v-divider>

        <!-- Mirror Filter -->
        <v-list density="compact" nav>
            <v-list-subheader v-if="!rail">{{ i18n("sidebar_mirrors") || "Mirrors" }}</v-list-subheader>

            <v-list-item
                v-for="mirror in topMirrors"
                :key="mirror.name"
                :active="selectedMirror === mirror.name"
                @click="selectMirror(mirror.name)"
                :title="rail ? '' : mirror.name">
                <template v-slot:prepend>
                    <img v-if="mirror.icon" :src="mirror.icon" width="20" height="20" class="mr-2" />
                    <v-icon v-else color="grey">mdi-web</v-icon>
                </template>
                <template v-slot:append v-if="!rail">
                    <v-chip size="x-small">{{ mirror.count }}</v-chip>
                </template>
            </v-list-item>
        </v-list>
    </v-navigation-drawer>
</template>

<script>
import i18n from "../../amr/i18n"
import { mapGetters } from "vuex"

export default {
    name: "Sidebar",
    props: {
        modelValue: { type: Boolean, default: true }
    },
    emits: ["update:modelValue", "filter-category", "filter-mirror"],
    data() {
        return {
            rail: false,
            selectedCategory: null,
            selectedMirror: null
        }
    },
    computed: {
        ...mapGetters(["countMangas", "allMangas"]),
        drawer: {
            get() {
                return this.modelValue
            },
            set(val) {
                this.$emit("update:modelValue", val)
            }
        },
        isMobile() {
            return this.$vuetify?.display?.smAndDown || false
        },
        totalManga() {
            return this.countMangas || 0
        },
        unreadCount() {
            return this.allMangas?.filter(m => m.read === 0)?.length || 0
        },
        readingCount() {
            return this.allMangas?.filter(m => m.read === 1 && m.lastChapterReadURL)?.length || 0
        },
        categories() {
            const cats = this.$store.state.options?.categoriesStates || []
            return cats.map(cat => ({
                name: cat.name,
                color: cat.color,
                count: this.allMangas?.filter(m => m.cats?.includes(cat.name))?.length || 0
            }))
        },
        topMirrors() {
            const mirrorCounts = {}
            this.allMangas?.forEach(m => {
                mirrorCounts[m.mirror] = (mirrorCounts[m.mirror] || 0) + 1
            })
            const mirrors = this.$store.state.mirrors?.all || []
            return Object.entries(mirrorCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => {
                    const mir = mirrors.find(m => m.mirrorName === name)
                    return { name, count, icon: mir?.mirrorIcon }
                })
        }
    },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        selectCategory(name) {
            this.selectedCategory = this.selectedCategory === name ? null : name
            this.$emit("filter-category", this.selectedCategory)
        },
        selectMirror(name) {
            this.selectedMirror = this.selectedMirror === name ? null : name
            this.$emit("filter-mirror", this.selectedMirror)
        }
    }
}
</script>

<style scoped>
.dashboard-sidebar {
    border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.rail-toggle-container {
    display: flex;
    justify-content: flex-end;
    padding: 8px 4px !important;
}

.rail-toggle-btn {
    margin-left: auto;
}
</style>
