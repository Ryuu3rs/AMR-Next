<template>
    <div>
        <!-- Categories and filters -->
        <v-row no-gutters>
            <v-col cols="12" class="d-flex align-center filter-container">
                <v-card class="hover-card">
                    <Categories :categories="categories" :static-cats="false" :delegate-delete="false" />
                </v-card>
                <!-- Filters -->
                <v-card class="hover-card d-flex">
                    <!-- Alphabetical -->
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="sort = 'az'"
                                :class="['amr-filter', { activated: sort === 'az' }]"
                                >mdi-sort-alphabetical-ascending</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_sort_alpha") }}</span>
                    </v-tooltip>
                    <!-- New first -->
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="sort = 'updates'"
                                :class="['amr-filter', { activated: sort === 'updates' }]"
                                >mdi-flash-auto</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_sort_new") }}</span>
                    </v-tooltip>
                    <!-- New w/ most unread -->
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="sort = 'updates-mostunread'"
                                :class="['amr-filter', { activated: sort === 'updates-mostunread' }]"
                                >mdi-flash</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_sort_new_most_unread") }}</span>
                    </v-tooltip>
                    <!-- Recently updated -->
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="sort = 'uptime'"
                                :class="['amr-filter', { activated: sort === 'uptime' }]"
                                >mdi-sort-calendar-ascending</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_sort_upts") }}</span>
                    </v-tooltip>
                    <!-- ascending/decending toggle -->
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="alpha_asc_desc = !alpha_asc_desc"
                                :class="['amr-filter', { activated: alpha_asc_desc }]"
                                >mdi-swap-vertical</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_asc_desc") }}</span>
                    </v-tooltip>
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="selectable = !selectable"
                                :class="['amr-filter', { activated: selectable }]"
                                >mdi-order-bool-ascending-variant</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_select_action") }}</span>
                    </v-tooltip>
                    <!-- Search Field -->
                    <v-menu location="bottom" :close-on-content-click="false" :persistent="true" v-model="showFilter">
                        <template #activator="{ props: searchMenuProps }">
                            <v-tooltip location="top">
                                <template #activator="{ props: searchTooltipProps }">
                                    <v-icon
                                        v-bind="{ ...searchMenuProps, ...searchTooltipProps }"
                                        :class="['amr-filter', { activated: showFilter }]">
                                        mdi-magnify
                                    </v-icon>
                                </template>
                                <span>{{ i18n("list_filter") }}</span>
                            </v-tooltip>
                        </template>
                        <v-card>
                            <v-row no-gutters class="pa-1">
                                <v-col cols="10">
                                    <v-text-field
                                        v-model="searchTextBuffer"
                                        :label="i18n('list_search_label')"
                                        density="compact"
                                        single-line
                                        variant="filled"
                                        rounded
                                        hide-details
                                        clearable
                                        autofocus>
                                        <template v-slot:prepend>
                                            <v-progress-circular
                                                v-if="searchLoading"
                                                indeterminate
                                                color="primary"
                                                size="20"
                                                width="2"
                                                class="ml-1"></v-progress-circular>
                                            <v-icon v-else color="primary">mdi-magnify</v-icon>
                                        </template>
                                    </v-text-field>
                                </v-col>
                                <v-col cols="2">
                                    <v-btn
                                        color="gray"
                                        @click="hideFilter()"
                                        class="no-bg-hover px-0 pr-2"
                                        variant="text">
                                        <v-icon class="ml-auto mb-5" size="small"> mdi-close </v-icon>
                                    </v-btn>
                                </v-col>
                            </v-row>
                        </v-card>
                    </v-menu>
                    <!-- Mirror select -->
                    <v-menu
                        location="top"
                        :close-on-content-click="false"
                        :persistent="true"
                        v-model="showMirrorSelection">
                        <template #activator="{ props: mirrorSelectionMenuProps }">
                            <v-tooltip location="top">
                                <template #activator="{ props: mirrorSelectionTooltipProps }">
                                    <v-icon
                                        v-bind="{ ...mirrorSelectionMenuProps, ...mirrorSelectionTooltipProps }"
                                        :class="['amr-filter', { activated: showMirrorSelection }]">
                                        mdi-image-multiple-outline
                                    </v-icon>
                                </template>
                                <span>{{ i18n("list_mirror_filter_icon") }}</span>
                            </v-tooltip>
                        </template>
                        <v-card>
                            <v-row no-gutters class="pt-1">
                                <v-col cols="10" class="pt-4 px-2">
                                    <v-select
                                        v-model="mirrorSelection"
                                        :items="usedMirrors"
                                        density="compact"
                                        :label="i18n('list_mirror_filter_label')"></v-select>
                                </v-col>
                                <v-col cols="1">
                                    <v-btn
                                        color="gray"
                                        @click="showMirrorSelection = false"
                                        class="no-bg-hover px-0 pr-1"
                                        variant="text">
                                        <v-icon class="ml-5 mb-5" size="small"> mdi-close </v-icon>
                                    </v-btn>
                                </v-col>
                            </v-row>
                            <v-row no-gutters> </v-row>
                        </v-card>
                    </v-menu>
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon
                                v-bind="props"
                                @click="showErrorsOnly = !showErrorsOnly"
                                :class="['amr-filter', { activated: showErrorsOnly }]"
                                >mdi-alert-outline</v-icon
                            >
                        </template>
                        <span>{{ i18n("list_select_action") }}</span>
                    </v-tooltip>
                    <!-- Smart Filters Menu -->
                    <v-menu location="bottom" :close-on-content-click="false" v-model="showSmartFilters">
                        <template #activator="{ props: smartFilterProps }">
                            <v-tooltip location="top">
                                <template #activator="{ props: smartFilterTooltipProps }">
                                    <v-icon
                                        v-bind="{ ...smartFilterProps, ...smartFilterTooltipProps }"
                                        :class="['amr-filter', { activated: activeSmartFilter !== 'none' }]">
                                        mdi-filter-variant
                                    </v-icon>
                                </template>
                                <span>Smart Filters</span>
                            </v-tooltip>
                        </template>
                        <v-card min-width="220">
                            <v-list density="compact">
                                <v-list-subheader>Smart Filters</v-list-subheader>
                                <v-list-item @click="setSmartFilter('none')" :active="activeSmartFilter === 'none'">
                                    <template v-slot:prepend><v-icon>mdi-filter-off</v-icon></template>
                                    <v-list-item-title>No Filter</v-list-item-title>
                                </v-list-item>
                                <v-list-item
                                    @click="setSmartFilter('newChapters')"
                                    :active="activeSmartFilter === 'newChapters'">
                                    <template v-slot:prepend><v-icon color="success">mdi-new-box</v-icon></template>
                                    <v-list-item-title>New Chapters</v-list-item-title>
                                    <template v-slot:append
                                        ><v-chip size="x-small" color="success">{{
                                            visNewMangas.length
                                        }}</v-chip></template
                                    >
                                </v-list-item>
                                <v-list-item
                                    @click="setSmartFilter('notRead30Days')"
                                    :active="activeSmartFilter === 'notRead30Days'">
                                    <template v-slot:prepend
                                        ><v-icon color="warning">mdi-clock-alert-outline</v-icon></template
                                    >
                                    <v-list-item-title>Not Read in 30 Days</v-list-item-title>
                                    <template v-slot:append
                                        ><v-chip size="x-small" color="warning">{{
                                            staleMangas.length
                                        }}</v-chip></template
                                    >
                                </v-list-item>
                                <v-list-item
                                    @click="setSmartFilter('completed')"
                                    :active="activeSmartFilter === 'completed'">
                                    <template v-slot:prepend><v-icon color="info">mdi-check-circle</v-icon></template>
                                    <v-list-item-title>Completed Series</v-list-item-title>
                                    <template v-slot:append
                                        ><v-chip size="x-small" color="info">{{
                                            completedMangas.length
                                        }}</v-chip></template
                                    >
                                </v-list-item>
                                <v-list-item
                                    @click="setSmartFilter('recentlyAdded')"
                                    :active="activeSmartFilter === 'recentlyAdded'">
                                    <template v-slot:prepend><v-icon color="primary">mdi-plus-circle</v-icon></template>
                                    <v-list-item-title>Recently Added (7 days)</v-list-item-title>
                                    <template v-slot:append
                                        ><v-chip size="x-small" color="primary">{{
                                            recentlyAddedMangas.length
                                        }}</v-chip></template
                                    >
                                </v-list-item>
                            </v-list>
                        </v-card>
                    </v-menu>
                </v-card>
                <v-card v-if="visMangas.length" class="hover-card">
                    <v-tooltip v-if="visNewMangas.length" location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon v-bind="props" @click="markAllAsRead()">mdi-eye</v-icon>
                        </template>
                        <span>{{ i18n("list_global_read") }}</span>
                    </v-tooltip>
                    <v-tooltip location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-icon v-bind="props" @click="deleteAll()">mdi-delete</v-icon>
                        </template>
                        <span>{{ i18n("list_global_delete") }}</span>
                    </v-tooltip>
                </v-card>
            </v-col>
        </v-row>
        <br />
        <!-- Stats Bar -->
        <v-row no-gutters class="mb-2">
            <v-col cols="12">
                <v-card class="pa-2 d-flex align-center justify-space-between" variant="tonal" density="compact">
                    <div class="d-flex align-center">
                        <v-chip size="small" color="primary" class="mr-2">
                            {{ filteredGroupedMangas.length }} {{ i18n("list_manga_count") || "manga" }}
                        </v-chip>
                        <v-chip v-if="visNewMangas.length > 0" size="small" color="success" class="mr-2">
                            {{ visNewMangas.length }} {{ i18n("list_with_updates") || "with updates" }}
                        </v-chip>
                        <v-chip v-if="searchText" size="small" color="info">
                            {{ i18n("list_search_results") || "filtered" }}
                        </v-chip>
                    </div>
                    <div class="text-caption text-medium-emphasis">
                        {{ i18n("list_scroll_hint") || "Scroll to load more" }}
                    </div>
                </v-card>
            </v-col>
        </v-row>
        <!-- Loading State -->
        <div v-if="!loaded" class="manga-skeleton-container">
            <v-skeleton-loader
                v-for="n in 5"
                :key="'skeleton-' + n"
                type="list-item-avatar-two-line"
                class="mb-2"></v-skeleton-loader>
        </div>
        <!-- Empty State -->
        <div v-else-if="filteredGroupedMangas.length === 0" class="text-center pa-4">
            <div v-if="allMangas.length > 0">
                <v-icon size="64" color="grey">mdi-magnify-remove-outline</v-icon>
                <p class="mt-2" v-html="i18n('list_no_manga_catstate_message')"></p>
            </div>
            <div v-else>
                <v-icon size="64" color="grey">mdi-book-open-page-variant-outline</v-icon>
                <p class="mt-2" v-html="convertIcons(i18n('list_no_manga_message'))"></p>
                <div class="d-flex justify-center align-center ga-3 flex-wrap">
                    <v-btn color="primary" variant="tonal" @click="importSamples()">
                        {{ i18n("list_import_samples") }}
                    </v-btn>
                    <span class="text-grey">or</span>
                    <v-btn color="secondary" variant="outlined" @click="triggerImportOwn">
                        <v-icon start>mdi-import</v-icon>
                        Import your own
                    </v-btn>
                </div>
                <!-- Hidden file input for importing own manga list -->
                <input
                    ref="importFileInput"
                    type="file"
                    accept=".json"
                    style="display: none"
                    @change="handleImportFile" />
            </div>
        </div>
        <!-- Manga List - Using standard rendering for reliability -->
        <div v-else class="manga-list-container" :style="{ maxHeight: virtualScrollHeight + 'px', overflowY: 'auto' }">
            <div
                v-for="item in filteredGroupedMangas"
                :key="item.key"
                :class="['manga-list-item', { compact: compactMode }]">
                <MangaGroup
                    :group="item"
                    :group-index="item.key"
                    :compact="compactMode"
                    @search-request="propagateSR"
                    @rename-manga="renameManga" />
            </div>
        </div>
        <v-dialog v-model="showDialog" max-width="500px">
            <v-card>
                <v-card-title>
                    <span class="text-h5" v-html="dialogTitle"></span>
                </v-card-title>
                <v-card-text>
                    <span v-html="dialogText"></span>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="blue-darken-1" variant="text" @click="showDialog = false">{{
                        i18n("button_no")
                    }}</v-btn>
                    <v-btn color="blue-darken-1" variant="text" @click="dialogAction">{{ i18n("button_yes") }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <v-dialog v-model="renameDialog" max-width="800px">
            <v-card>
                <v-card-title>{{ i18n("rename_dialog_title") }}</v-card-title>
                <v-card-text>
                    <v-row>
                        <v-col cols="12" md="6"> {{ i18n("rename_dialog_original") }} - {{ renameOrigial }} </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="renameInput" />
                        </v-col>
                    </v-row>
                </v-card-text>
                <v-card-actions>
                    <v-btn color="green" @click="renameMangaConfirm">{{ i18n("rename_dialog_button_confirm") }}</v-btn>
                    <v-btn color="red" @click="renameMangaCancel">{{ i18n("button_cancel") }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <MultiMangaAction
            :selected="selectedMangaExpanded"
            :selectable="selectable"
            :total="visMangas.length"
            v-on:unselect="selectable = false" />
    </div>
</template>
<script>
import i18n from "../../amr/i18n"
import { mapGetters } from "vuex"
import MangaGroup from "./MangaGroup"
import Categories from "./Categories"
import MultiMangaAction from "./MultiMangaAction"
import browser from "webextension-polyfill"
import { convertIcons, displayFilterCats, formatMangaName, hasNew } from "../../shared/utils"
import { debugLog } from "../../shared/debug"
import { debug } from "../../core/debug"

const default_sort = (a, b) => {
    const af = formatMangaName(a.displayName && a.displayName !== "" ? a.displayName : a.name),
        bf = formatMangaName(b.displayName && b.displayName !== "" ? b.displayName : b.name)
    let res = af === undefined ? -1 : af.localeCompare(bf)
    if (res === 0) {
        res = a.mirror === undefined ? -1 : a.mirror.localeCompare(b.mirror)
    }
    if (res === 0) {
        res = a.language === undefined ? -1 : a.language.localeCompare(b.language)
    }
    return res
}
const num_chapters_to_read_sort = (a, b) => {
    // Ensure listChaps is an array before accessing
    const aChaps = a.listChaps && Array.isArray(a.listChaps) ? a.listChaps : []
    const bChaps = b.listChaps && Array.isArray(b.listChaps) ? b.listChaps : []
    const af = aChaps.findIndex(ele => ele[1] == a.lastChapterReadURL)
    const bf = bChaps.findIndex(ele => ele[1] == b.lastChapterReadURL)
    if (bf - af == 0) {
        return default_sort(a, b)
    } else {
        return bf - af
    }
}
const sort_chapters_upts = (a, b) => {
    const af = a.upts,
        bf = b.upts
    if (bf - af == 0) {
        //this should never happen
        return default_sort(a, b)
    } else {
        return bf - af
    }
}
export default {
    data() {
        return {
            loaded: false,
            sort: this.$store.state.options.sortOrder, // sort mode for list (az : alphabetical, updates : mangas with updates first)
            showDialog: false, // do show dialog to ask smthg
            showFilter: false, // Show the text search
            showMirrorSelection: false, // Show mirror search selection
            dialogTitle: "", //title of opened dialog
            dialogText: "", // text of opened dialog
            renameDialog: false, // Show dialog for renaming manga
            renameOrigial: "", // Original manga name when renaming
            renameInput: "", // Text field for renaming manga
            renameKey: "", // Key of the manga we are going to rename
            selectable: false, // Toggle Manga List select behaviour
            dialogAction: () => {
                self.showDialog = false
            }, // action to take on yes in dialog
            searchText: "", // Text to search in list
            searchTextBuffer: "", // User input buffer for search
            searchTextTimeout: null, // timeout for search (works with buffer)
            searchLoading: false, // display a loading icon instead of a magnifying glass if user input is still in buffer
            watchSearchLoading: false, // does the search popup needs to wait for search to finish loading before closing
            mirrorSelection: i18n("list_page_all"),
            selectedManga: [],
            alpha_asc_desc: this.$store.state.options.alpha_asc_desc, // Toggle Manga List select behaviour
            searchMenu: false,
            showErrorsOnly: false,
            // Cache for memoized groupedMangas
            groupedMangasCache: null,
            groupedMangasCacheKey: null,
            // Compact mode for high-density view
            compactMode: this.$store.state.options.compactMode || false,
            // Smart filters
            showSmartFilters: false,
            activeSmartFilter: "none"
        }
    },
    watch: {
        sort: function (newValue) {
            this.$store.dispatch("setOption", { key: "sortOrder", value: newValue })
            // Invalidate cache when sort changes
            this.groupedMangasCache = null
        },

        searchTextBuffer: function (val) {
            clearTimeout(this.searchTextTimeout)

            // setup the timeout delay depending on the length of the search text
            let delay = 500
            if (val !== null) {
                if (val.length <= 1) delay = 500
                else if (val.length === 2) delay = 200
                else delay = 20
            }

            // do not bother showing the search loading indicator if the search delay is too small
            if (delay > 20 && !this.searchLoading) this.searchLoading = true

            // set the timeout for search
            this.searchTextTimeout = setTimeout(() => {
                if (this.searchLoading) this.searchLoading = false
                this.searchText = val
            }, delay)

            // add delay to close the search popup if requested
            if (this.watchSearchLoading) {
                this.watchSearchLoading = false
                setTimeout(
                    () => {
                        this.showFilter = false
                    },
                    delay > 20 ? delay - 100 : 0
                ) // failsafe, in this case delay should always be 500
            }
        },
        showMirrorSelection: function (newValue) {
            if (!newValue) {
                this.mirrorSelection = i18n("list_page_all")
            }
        },

        selectable: function (newValue) {
            if (newValue) this.$eventBus.$emit("multi-manga:show-multiselect")
            else this.$eventBus.$emit("multi-manga:hide-multiselect")
        },
        alpha_asc_desc: function (newValue) {
            this.$store.dispatch("setOption", { key: "alpha_asc_desc", value: newValue })
            // Invalidate cache when sort order changes
            this.groupedMangasCache = null
        }
    },
    computed: {
        // AMR options
        options: function () {
            return this.$store.state.options
        },
        // categories states
        categories: function () {
            return this.options.categoriesStates
        },
        mirrors: function () {
            return this.$store.state.mirrors.all
        },
        /**
         * Return all visible mangas
         */
        visMangas: function () {
            debugLog("visMangas computed - allMangas count:", this.allMangas.length)

            if (this.showErrorsOnly) {
                const result = this.allMangas.filter(mg => mg.updateError == 1)
                debugLog("visMangas (errors only):", result.length)
                return result
            }
            if (this.mirrorSelection !== i18n("list_page_all")) {
                const result = this.allMangas.filter(mg => mg.mirror == this.mirrorSelection)
                debugLog("visMangas (mirror filter):", result.length, "for mirror:", this.mirrorSelection)
                return result
            }

            const filtered = this.allMangas.filter(mg => {
                const visible = displayFilterCats(mg, this.options.categoriesStates, this.mirrors)
                if (!visible) {
                    debugLog("Manga filtered out by displayFilterCats:", mg.name, {
                        key: mg.key,
                        cats: mg.cats,
                        listChapsLength: mg.listChaps?.length || 0
                    })
                }
                return visible
            })
            debugLog("visMangas (category filter):", filtered.length, "of", this.allMangas.length)
            return filtered
        },
        /**
         * Returns a list of all mirrors that have series
         */
        usedMirrors: function () {
            return this.allMangas.reduce(
                (mirrors, manga) => {
                    const name = manga.mirror
                    if (name && !mirrors.includes(name)) {
                        mirrors.push(name)
                    }
                    return mirrors
                },
                ["All"]
            )
        },
        /**
         * Return all visible mangas having new chapters to read
         */
        visNewMangas: function () {
            return this.visMangas.filter(mg => hasNew(mg))
        },
        /**
         * Return mangas not read in 30 days
         */
        staleMangas: function () {
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
            return this.visMangas.filter(mg => {
                const lastRead = mg.lastChapterReadDate || mg.ts || 0
                return lastRead < thirtyDaysAgo
            })
        },
        /**
         * Return completed series (all chapters read)
         */
        completedMangas: function () {
            return this.visMangas.filter(
                mg => !hasNew(mg) && mg.listChaps && Array.isArray(mg.listChaps) && mg.listChaps.length > 0
            )
        },
        /**
         * Return mangas added in the last 7 days
         */
        recentlyAddedMangas: function () {
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
            return this.visMangas.filter(mg => {
                const addedDate = mg.addedDate || mg.ts || 0
                return addedDate > sevenDaysAgo
            })
        },
        /**
         * Apply smart filter to visMangas
         */
        smartFilteredMangas: function () {
            switch (this.activeSmartFilter) {
                case "newChapters":
                    return this.visNewMangas
                case "notRead30Days":
                    return this.staleMangas
                case "completed":
                    return this.completedMangas
                case "recentlyAdded":
                    return this.recentlyAddedMangas
                default:
                    return this.visMangas
            }
        },
        /**
         * Build mangas groups (by name) with memoization
         */
        groupedMangas: function () {
            // Create cache key based on manga count, sort settings, and smart filter
            const cacheKey = `${this.smartFilteredMangas.length}-${this.sort}-${this.alpha_asc_desc}-${this.options.groupmgs}-${this.activeSmartFilter}`

            // Return cached result if available
            if (this.groupedMangasCache && this.groupedMangasCacheKey === cacheKey) {
                return this.groupedMangasCache
            }

            // Filter out invalid manga entries before processing
            const validMangas = this.smartFilteredMangas.filter(manga => {
                const hasValidKey = manga.key && manga.key !== "_no_key_"
                const hasValidName = manga.name || manga.displayName
                return hasValidKey && hasValidName
            })

            const result = this.sortMangaList(validMangas).reduce((groups, manga) => {
                // make a copy of manga add a "hasNew" key and remove chapters
                const mangaCopy = Object.assign({}, manga)
                delete mangaCopy.listChaps
                mangaCopy.hasNew = hasNew(manga)

                // free memory early
                manga = null

                // get manga name, key or group key and group index
                const name =
                    mangaCopy.displayName && mangaCopy.displayName !== "" ? mangaCopy.displayName : mangaCopy.name
                const key = this.options.groupmgs === 0 ? mangaCopy.key : "group:" + formatMangaName(name)
                let index = groups.findIndex(group => group.key == key)

                // if group doesn't exist, create it
                if (index === -1) {
                    groups.push({ name, key, mangas: [] })
                    index = groups.findIndex(group => group.key == key)
                }

                // add manga to group
                groups[index].mangas.push(mangaCopy)

                // Ensure still updating manga are first in the group
                groups[index].mangas = groups[index].mangas.sort((a, b) => a.read - b.read)
                return groups
            }, [])

            // Cache the result
            this.groupedMangasCache = result
            this.groupedMangasCacheKey = cacheKey
            return result
        },

        /**
         * Filter grouped mangas by search text
         */
        filteredGroupedMangas: function () {
            if (!this.searchText) {
                return this.groupedMangas
            }
            const searchLower = this.searchText.toLowerCase()
            return this.groupedMangas.filter(
                group =>
                    group.name.toLowerCase().includes(searchLower) ||
                    group.mangas.some(
                        m =>
                            m.name.toLowerCase().includes(searchLower) ||
                            (m.displayName && m.displayName.toLowerCase().includes(searchLower)) ||
                            (m.mirror && m.mirror.toLowerCase().includes(searchLower))
                    )
            )
        },

        /**
         * Calculate scroll container height based on context
         */
        virtualScrollHeight: function () {
            // In popup, use smaller height; in dashboard/full page, use viewport-based height
            if (this.$isPopup) {
                return 400
            }
            // For dashboard, calculate based on viewport minus header/nav (approx 150px)
            const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800
            return Math.max(viewportHeight - 150, 400)
        },

        selectedMangaExpanded: function () {
            return this.allMangas
                .filter(manga => this.selectedManga.includes(manga.key))
                .map(manga => {
                    return {
                        key: manga.key,
                        name: manga.displayName && manga.displayName !== "" ? manga.displayName : manga.name,
                        mirror: manga.mirror
                    }
                })
        },
        ...mapGetters(["countMangas", "allMangas"])
    },
    name: "MangaList",
    components: { Categories, MangaGroup, MultiMangaAction },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        convertIcons: str => convertIcons(str),
        importSamples() {
            // we don't do this.$store.dispatch("importSamples"); because to load list of chapters, implementations rely on jQuery, which is not loaded in pages, rely on background page to do so
            browser.runtime.sendMessage({ action: "importSamples" })
        },
        markAllAsRead() {
            this.dialogTitle = i18n("list_global_read_title")
            this.dialogText = i18n("list_global_read_text", this.visNewMangas.length)
            const self = this
            this.dialogAction = () => {
                self.showDialog = false
                self.visNewMangas.forEach(async mg => {
                    // Ensure listChaps is an array before accessing
                    if (!mg.listChaps || !Array.isArray(mg.listChaps) || mg.listChaps.length === 0) {
                        return
                    }
                    const newMG = {
                        ...mg,
                        lastChapterReadName: mg.listChaps[0][0],
                        lastChapterReadURL: mg.listChaps[0][1]
                    }
                    await self.$store.dispatch("readManga", newMG)
                    await self.$store.dispatch("autoExportReadStatus", newMG, { root: true })
                })
            }
            this.showDialog = true
        },
        deleteAll() {
            this.dialogTitle = i18n("list_global_delete_title")
            this.dialogText = i18n("list_global_delete_text", this.visMangas.length)
            const self = this
            this.dialogAction = () => {
                self.showDialog = false
                self.visMangas.forEach(async mg => {
                    await self.$store.dispatch("deleteManga", {
                        key: mg.key
                    })
                })
            }
            this.showDialog = true
        },
        hideFilter: function (newValue) {
            if (!newValue) {
                this.searchTextBuffer = ""
                this.watchSearchLoading = true
            }
        },
        /**
         * Set active smart filter
         */
        setSmartFilter(filter) {
            this.activeSmartFilter = filter
            this.showSmartFilters = false
            // Invalidate cache when filter changes
            this.groupedMangasCache = null
        },
        /**
         * Propagate search request event from MangaGroup to parent
         */
        propagateSR(str) {
            this.$emit("search-request", str)
        },
        sortMangaList(items) {
            var cmp
            if (this.sort === "az") {
                cmp = default_sort
            } else if (this.sort === "updates-mostunread") {
                cmp = function (a, b) {
                    const ha = hasNew(a),
                        hb = hasNew(b)
                    // primary sort on manga amount of new chapters, secondary on alphabetical
                    return ha && hb
                        ? num_chapters_to_read_sort(a, b)
                        : ha === hb
                        ? default_sort(a, b)
                        : ha && !hb
                        ? -1
                        : 1
                }
            } else if (this.sort === "updates") {
                cmp = function (a, b) {
                    const ha = hasNew(a),
                        hb = hasNew(b)
                    // primary sort on manga has new chapter, secondary on alphabetical
                    return ha === hb ? default_sort(a, b) : ha && !hb ? -1 : 1
                }
            } else {
                cmp = function (a, b) {
                    const na = a.upts != 0,
                        nb = b.upts != 0
                    const ha = hasNew(a),
                        hb = hasNew(b)
                    // primary sort on manga when last chapter, secondary on number unread, tertiary on alphabetical
                    return na || nb
                        ? sort_chapters_upts(a, b)
                        : ha && hb
                        ? num_chapters_to_read_sort(a, b)
                        : ha === hb
                        ? default_sort(a, b)
                        : ha && !hb
                        ? -1
                        : 1
                }
            }
            const sortOption = this.$store.getters.options.alpha_asc_desc
            return items.sort((a, b) => (sortOption ? cmp(b, a) : cmp(a, b)))
        },
        /**
         * Pull up the dialog for renaming a manga
         */
        renameManga(manga) {
            this.renameKey = manga.key
            this.renameOrigial = manga.name
            this.renameInput = manga.displayName
            this.renameDialog = true
        },
        renameMangaConfirm() {
            browser.runtime.sendMessage({
                action: "setDisplayName",
                key: this.renameKey,
                displayName: this.renameInput
            })
            this.renameMangaCancel() // Why copy the logic when I need the same things?
        },
        /**
         * Cancel button action that resets the form / variables
         */
        renameMangaCancel() {
            this.renameOrigial = ""
            this.renameKey = ""
            this.renameInput = ""
            this.renameDialog = false
        },
        /**
         * Set compact mode for the manga list
         * @param {boolean} isCompact - Whether to enable compact mode
         */
        setCompactMode(isCompact) {
            this.compactMode = isCompact
            this.$store.dispatch("setOption", { key: "compactMode", value: isCompact })
        },
        /**
         * Trigger file input for importing manga list
         */
        triggerImportOwn() {
            this.$refs.importFileInput?.click()
        },
        /**
         * Handle file selection for import
         */
        handleImportFile(event) {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result)
                    this.processImportData(data)
                } catch (err) {
                    debug.ui.error("Failed to parse import file:", err)
                    alert("Invalid JSON file. Please select a valid AMR export file.")
                }
            }
            reader.readAsText(file)
            event.target.value = "" // Reset so same file can be selected again
        },
        /**
         * Process imported manga data
         */
        processImportData(data) {
            // Check if this is a valid AMR export
            if (data.mangas && Array.isArray(data.mangas)) {
                browser.runtime.sendMessage({
                    action: "importMangas",
                    importcat: "",
                    imports: data
                })
                alert(`Importing ${data.mangas.length} manga(s)...`)
            } else {
                alert("Invalid AMR export file. No manga list found.")
            }
        }
    },
    beforeUnmount() {
        clearInterval(this.searchTextTimeout)
        // Clean up EventBus listeners to prevent memory leaks
        this.$eventBus.$off("multi-manga:select-manga")
        this.$eventBus.$off("multi-manga:deselect-manga")
    },
    async created() {
        debugLog("MangaList created - starting initialization")

        // initialize state for store in popup from background
        await this.$store.dispatch("getStateFromReference", {
            module: "mangas",
            key: "all",
            mutation: "setMangas"
        })
        debugLog("Mangas loaded from background:", this.$store.state.mangas.all.length)

        // Log each manga's basic info (only in debug mode)
        this.$store.state.mangas.all.forEach(mg => {
            debugLog("Manga in store:", mg.name, {
                key: mg.key,
                mirror: mg.mirror,
                listChapsLength: mg.listChaps?.length || 0
            })
        })

        // initialize state for store in popup from background
        await this.$store.dispatch("getStateFromReference", {
            module: "bookmarks",
            key: "all",
            mutation: "setBookmarks"
        })
        debugLog("Bookmarks loaded:", this.$store.state.bookmarks.all.length)

        this.loaded = true
        debugLog("MangaList initialization complete")
        setTimeout(() => this.$emit("manga-loaded"), 1000)

        this.$eventBus.$on("multi-manga:select-manga", key => {
            if (!this.selectedManga.includes(key)) this.selectedManga.push(key)
        })

        this.$eventBus.$on("multi-manga:deselect-manga", key => {
            this.selectedManga = this.selectedManga.filter(k => k != key)
        })
    }
}
</script>
<style data-amr="true">
.amr-filter {
    color: #9e9e9e !important;
    cursor: pointer;
    transition: color 0.2s ease;
}

.amr-filter:hover {
    color: #4caf50 !important;
}

.amr-filter.activated {
    color: #4caf50 !important;
}

.hover-card {
    margin: 0px 2px;
    padding: 0px 2px;
    display: inline-block;
    background-color: #f5f5f5;
}

.theme--dark .hover-card {
    background-color: #424242;
}

.hover-card i {
    font-size: 1.6rem;
    margin: 0px 2px;
}

.hover-card .tooltip {
    cursor: pointer;
}

.hover-card .filters-icon {
    margin: 0;
    font-size: 0.9rem;
}

.filter-container.v-icon {
    font-size: 20px;
}

.no-bg-hover::before {
    background-color: transparent !important;
}

/* Virtual Scroll Styles */
.manga-virtual-scroll {
    border-radius: 8px;
    background: transparent;
}

.manga-list-item {
    padding: 4px 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    transition: background-color 0.15s ease;
}

.manga-list-item:hover {
    background-color: rgba(0, 0, 0, 0.02);
}

.theme--dark .manga-list-item {
    border-bottom-color: rgba(255, 255, 255, 0.06);
}

.theme--dark .manga-list-item:hover {
    background-color: rgba(255, 255, 255, 0.02);
}

/* Skeleton loading */
.manga-skeleton-container {
    padding: 8px;
}

/* Stats bar chip styling */
.v-chip {
    font-weight: 500;
}

/* Compact mode styles */
.manga-virtual-scroll.compact-mode .manga-list-item {
    padding: 2px 8px;
}

.manga-list-item.compact {
    padding: 2px 4px;
}

.compact-mode .amr-manga-row {
    padding: 2px 4px !important;
}

.compact-mode .v-card {
    margin-bottom: 2px !important;
}
</style>
