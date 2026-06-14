<template>
    <v-card
        v-if="shouldShow"
        v-intersect="{
            handler: onIntersect,
            options: {
                threshold: 0,
                // add virtual margin so items are rendered outside of viewport
                rootMargin: '190px 0px 190px 0px' // 38px = 1 row height
            }
        }"
        :class="[color(3, true), 'amr-manga-row', { 'amr-noupdates': manga.update === 0, 'compact-card': compact }]">
        <v-row :class="[isDarkText ? 'dark-text' : 'light-text', compact ? 'py-0' : 'py-1']" align="center" no-gutters>
            <!-- Checkbox for multi-select -->
            <v-col cols="auto" class="pr-1" v-if="selectable">
                <v-checkbox v-model="selected" hide-details density="compact" class="shrink mt-0"></v-checkbox>
            </v-col>

            <!-- Mirror icon + Manga name -->
            <v-col cols="3" lg="4" class="d-flex align-center">
                <!-- + / - icon if group of mangas  -->
                <v-icon v-if="isInGroup && isFirst" size="small" @click="emitExpand()" class="mr-1">
                    {{ groupExpanded ? "mdi-minus" : "mdi-plus" }}
                </v-icon>

                <!-- Mirror icon -->
                <v-tooltip location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <!-- Orphaned manga - show warning icon -->
                        <v-icon v-if="manga.orphaned" size="small" v-bind="props" class="mr-1" color="warning">
                            mdi-alert
                        </v-icon>
                        <!-- Normal mirror icon -->
                        <img
                            v-else-if="isMirrorEnabled && !manga.updateError"
                            class="m-icon mr-1"
                            width="16"
                            height="16"
                            :src="mirror.mirrorIcon"
                            v-bind="props" />
                        <v-icon v-else size="small" v-bind="props" class="mr-1">mdi-cancel</v-icon>
                    </template>
                    <span>
                        <!-- Orphaned manga tooltip -->
                        <span v-if="manga.orphaned" class="d-flex flex-column">
                            <strong>{{ i18n("list_manga_orphaned_title") }}</strong>
                            <span>{{ manga.orphanedReason || i18n("list_manga_orphaned_default_reason") }}</span>
                            <span class="text-caption mt-1">{{ i18n("list_manga_orphaned_action") }}</span>
                        </span>
                        <span v-else-if="isMirrorEnabled && !manga.updateError">{{ mirror.mirrorName }}</span>
                        <span v-else-if="isMirrorEnabled && manga.updateError">{{
                            i18n(
                                `manga_update_error_code_${
                                    manga.updateErrorCode in [1, 2] ? manga.updateErrorCode : "other"
                                }`,
                                manga.mirror
                            )
                        }}</span>
                        <span v-else>{{ i18n("list_mirror_disabled_tooltip", manga.mirror) }}</span>
                    </span>
                </v-tooltip>

                <!-- Manga name with truncation and tooltip -->
                <v-tooltip location="top">
                    <template v-slot:activator="{ props }">
                        <div class="ml-1 d-flex">
                            <span class="amr-manga-title" v-bind="props" @click="openManga">
                                {{ truncatedName }}
                            </span>
                        </div>
                    </template>
                    {{ fullMangaName }}
                </v-tooltip>
            </v-col>
            <!-- Timer off icon if manga stopped updating - fixed width -->
            <v-col cols="auto" class="d-flex align-center status-icons">
                <v-tooltip v-if="manga.update === 0" location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <v-icon size="small" v-bind="props" class="mr-1">mdi-timer-off</v-icon>
                    </template>
                    <span>{{ i18n("list_stopped_updating") }}</span>
                </v-tooltip>
                <!-- Display last update time -->
                <v-tooltip
                    v-if="options.displastup === 1 && manga.upts != 0 && timeUpdated < 50"
                    location="top"
                    content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <span class="text-caption mr-1" v-bind="props">
                            <span v-if="timeUpdated > 0">{{ timeUpdated }}</span>
                            <v-icon size="small">mdi-calendar-clock</v-icon>
                        </span>
                    </template>
                    <span v-if="timeUpdated === 0">{{ i18n("list_calendar_today") }}</span>
                    <span v-else>{{ i18n("list_calendar_days_found", timeUpdated) }}</span>
                </v-tooltip>
            </v-col>

            <!-- Chapter info - always visible with fixed width -->
            <v-col class="px-1 chapter-col">
                <div v-if="listChaps.length" class="d-flex align-center">
                    <!-- Progress indicator -->
                    <v-tooltip v-if="showProgress" location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-progress-circular
                                v-bind="props"
                                :color="isDarkText ? 'grey-darken-2' : 'white'"
                                :model-value="progress > 90 && progress < 100 ? 90 : progress"
                                :size="18"
                                :width="2"
                                class="mr-2" />
                        </template>
                        <span>{{ i18n("list_progress_reading", progress, absoluteProgress) }}</span>
                    </v-tooltip>

                    <!-- Chapter select dropdown -->
                    <v-select
                        v-model="selValue"
                        :items="chapsForSelect"
                        @update:model-value="playChap($event)"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="chapter-select flex-grow-1"
                        :menu-props="{ auto: true }"
                        :disabled="!chapsForSelect.length">
                        <template v-slot:selection="{ item }">
                            <div class="d-flex align-center text-truncate">
                                <Flag v-if="manga.language" :value="manga.language" class="mr-1" />
                                <span class="text-truncate text-body-2">{{ item.title }}</span>
                            </div>
                        </template>
                    </v-select>
                </div>
                <div v-else class="d-flex align-center justify-center" style="height: 32px">
                    <v-progress-linear
                        v-if="isMirrorEnabled && refreshing"
                        :indeterminate="true"
                        height="3"
                        color="primary"></v-progress-linear>
                    <span v-else-if="!isMirrorEnabled" class="text-caption">{{
                        i18n("list_mirror_disabled", manga.mirror)
                    }}</span>
                    <v-tooltip v-else-if="loadError === 'cloudflare'" location="top">
                        <template v-slot:activator="{ props }">
                            <span
                                v-bind="props"
                                class="text-caption text-warning d-flex align-center cursor-pointer"
                                @click="openManga">
                                <v-icon size="small" class="mr-1">mdi-shield-alert</v-icon>
                                Click to open
                            </span>
                        </template>
                        <span>Site is protected. Click to open manga page and load chapters.</span>
                    </v-tooltip>
                    <span v-else-if="loadError === 'error'" class="text-caption text-error">
                        <v-icon size="small" class="mr-1">mdi-alert-circle</v-icon>
                        Failed to load
                    </span>
                    <span v-else class="text-caption text-grey">Loading...</span>
                </div>
            </v-col>

            <!-- Action buttons - always visible with fixed positions -->
            <v-col cols="auto" class="d-flex align-center justify-end action-buttons">
                <!-- Mark as read - fixed width slot -->
                <div class="action-btn-slot">
                    <v-tooltip v-if="manga.hasNew && listChaps.length" location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-btn
                                v-bind="props"
                                icon
                                size="x-small"
                                variant="text"
                                :color="buttonColor"
                                @click="markAsRead()">
                                <v-icon size="small">mdi-eye</v-icon>
                            </v-btn>
                        </template>
                        <span>{{ i18n("list_mg_act_read") }}</span>
                    </v-tooltip>
                </div>

                <!-- Previous chapter - fixed width slot -->
                <div class="action-btn-slot">
                    <v-tooltip
                        v-if="listChaps.length && posInChapList < listChaps.length - 1"
                        location="top"
                        content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-btn
                                v-bind="props"
                                icon
                                size="x-small"
                                variant="text"
                                :color="buttonColor"
                                @click="play(-1)">
                                <v-icon size="small">mdi-chevron-left</v-icon>
                            </v-btn>
                        </template>
                        <span>{{ i18n("list_mg_act_prev") }}</span>
                    </v-tooltip>
                </div>

                <!-- Play current chapter -->
                <v-tooltip v-if="isMirrorEnabled" location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <v-btn v-bind="props" icon size="small" variant="flat" color="primary" @click="play(0)">
                            <v-icon>mdi-play</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("list_mg_act_cur") }}</span>
                </v-tooltip>

                <!-- Next chapter - fixed width slot -->
                <div class="action-btn-slot">
                    <v-tooltip v-if="listChaps.length && posInChapList > 0" location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-btn
                                v-bind="props"
                                icon
                                size="x-small"
                                variant="text"
                                :color="buttonColor"
                                @click="play(1)">
                                <v-icon size="small">mdi-chevron-right</v-icon>
                            </v-btn>
                        </template>
                        <span>{{ i18n("list_mg_act_next") }}</span>
                    </v-tooltip>
                </div>

                <!-- Latest chapter - fixed width slot -->
                <div class="action-btn-slot">
                    <v-tooltip v-if="isMirrorEnabled && listChaps.length" location="top" content-class="icon-ttip">
                        <template v-slot:activator="{ props }">
                            <v-btn
                                v-bind="props"
                                icon
                                size="x-small"
                                variant="text"
                                :color="buttonColor"
                                @click="play(Infinity)">
                                <v-icon size="small">mdi-page-last</v-icon>
                            </v-btn>
                        </template>
                        <span>{{ i18n("list_mg_act_latest") }}</span>
                    </v-tooltip>
                </div>

                <!-- Find on Other Mirrors - prominent button for orphaned/error manga -->
                <v-tooltip v-if="manga.orphaned || manga.updateError" location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <v-btn
                            v-bind="props"
                            icon
                            size="x-small"
                            variant="text"
                            color="warning"
                            @click="searchElsewhere()">
                            <v-icon size="small">mdi-magnify-plus</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("list_mg_act_find_mirror") }}</span>
                </v-tooltip>

                <!-- Quick Category Menu -->
                <v-menu v-if="categories.length" location="bottom" :close-on-content-click="false" max-height="250">
                    <template v-slot:activator="{ props }">
                        <v-btn
                            v-bind="props"
                            icon
                            size="x-small"
                            variant="text"
                            :color="manga.cats && manga.cats.length ? 'primary' : buttonColor">
                            <v-icon size="small">{{
                                manga.cats && manga.cats.length ? "mdi-folder" : "mdi-folder-outline"
                            }}</v-icon>
                            <v-tooltip activator="parent" location="top">
                                {{ i18n("list_details_cats") || "Categories" }}
                            </v-tooltip>
                        </v-btn>
                    </template>
                    <v-list density="compact" class="py-0">
                        <v-list-item
                            v-for="(item, index) of categories"
                            :key="index"
                            @click="hasCategory(item.name) ? deleteCategory(item.name) : addCategory(item.name)">
                            <template v-slot:prepend>
                                <v-checkbox
                                    density="compact"
                                    :model-value="hasCategory(item.name)"
                                    hide-details
                                    class="mr-2"></v-checkbox>
                            </template>
                            <v-list-item-title>{{ item.name }}</v-list-item-title>
                        </v-list-item>
                        <v-divider v-if="categories.length"></v-divider>
                        <v-list-item @click="openCategoryManager">
                            <template v-slot:prepend>
                                <v-icon size="small" class="mr-2">mdi-plus</v-icon>
                            </template>
                            <v-list-item-title class="text-caption">{{
                                i18n("list_cat_manage") || "Manage categories..."
                            }}</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>

                <!-- Quick Add Category (when no categories exist) -->
                <v-tooltip v-else location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <v-btn
                            v-bind="props"
                            icon
                            size="x-small"
                            variant="text"
                            :color="buttonColor"
                            @click="openCategoryManager">
                            <v-icon size="small">mdi-folder-plus-outline</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("list_cat_add") || "Create category" }}</span>
                </v-tooltip>

                <!-- Delete manga -->
                <v-tooltip location="top" content-class="icon-ttip">
                    <template v-slot:activator="{ props }">
                        <v-btn
                            v-bind="props"
                            icon
                            size="x-small"
                            variant="text"
                            color="error"
                            @click="deleteManga = true">
                            <v-icon size="small">mdi-delete</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("list_mg_act_delete") }}</span>
                </v-tooltip>

                <!-- More options menu -->
                <v-btn icon size="x-small" variant="text" :color="buttonColor" @click="expanded = !expanded">
                    <v-icon size="small">mdi-dots-vertical</v-icon>
                </v-btn>
            </v-col>
        </v-row>

        <!-- Delete manga dialog -->
        <v-dialog v-model="deleteManga" max-width="500px">
            <v-card>
                <v-card-title>
                    <h3>{{ i18n("list_mg_delete_question", manga.name, manga.mirror) }}</h3>
                </v-card-title>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="blue-darken-1" elevation="1" @click="deleteManga = false">{{
                        i18n("button_no")
                    }}</v-btn>
                    <v-btn color="blue-darken-1" elevation="1" @click="trash()">{{ i18n("button_yes") }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Expanded options row -->
        <v-row v-if="expanded" dense class="mt-1">
            <!-- Categories Menu -->
            <v-col :cols="submenu_col" class="d-flex justify-center" v-if="categories.length">
                <v-menu location="end" :close-on-content-click="false" max-height="196">
                    <template v-slot:activator="{ props }">
                        <v-btn :color="color(-1)" v-bind="props" size="x-small">
                            {{ i18n("list_details_cats") }}
                            <v-icon end size="x-small"> mdi-menu-down </v-icon>
                        </v-btn>
                    </template>
                    <v-list :bg-color="color(1)" density="compact" class="py-0">
                        <v-list-item
                            v-for="(item, index) of categories"
                            :key="index"
                            :style="index < categories.length - 1 ? 'border-bottom: 1px solid rgb(0 0 0 / 10%);' : ''"
                            :class="isDarkText ? 'dark-text' : 'light-text'"
                            @click="hasCategory(item.name) ? deleteCategory(item.name) : addCategory(item.name)">
                            <v-list-item-title>
                                {{ item.name }}
                            </v-list-item-title>
                            <template v-slot:append>
                                <v-checkbox
                                    density="compact"
                                    :model-value="hasCategory(item.name)"
                                    hide-details></v-checkbox>
                            </template>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-col>
            <!-- Updates Menu -->
            <v-col :cols="submenu_col" class="d-flex justify-center">
                <v-menu location="end" :close-on-content-click="false" max-height="196">
                    <template v-slot:activator="{ props }">
                        <v-btn :color="color(-1)" v-bind="props" size="x-small">
                            {{ i18n("options_gen_updates") }}
                            <v-icon end size="x-small"> mdi-menu-down </v-icon>
                        </v-btn>
                    </template>
                    <v-list
                        :bg-color="color(1)"
                        density="compact"
                        class="py-0"
                        :class="isDarkText ? 'dark-text' : 'light-text'">
                        <!-- un/follow updates -->
                        <v-list-item link @click="toggleFollow()">
                            <v-list-item-title v-if="manga.read === 0">
                                <v-icon size="small" start> mdi-bell-off-outline </v-icon>
                                {{ i18n("list_details_act_stop_follow") }}
                            </v-list-item-title>
                            <v-list-item-title v-else>
                                <v-icon size="small" start> mdi-bell-alert-outline </v-icon>
                                {{ i18n("list_details_act_follow") }}
                            </v-list-item-title>
                        </v-list-item>
                        <!-- start/stop updates -->
                        <v-list-item link @click="toggleUpdate()">
                            <v-list-item-title v-if="manga.update === 1">
                                <v-icon size="small" start> mdi-timer-off-outline </v-icon>
                                {{ i18n("list_details_act_stop_updating") }}
                            </v-list-item-title>
                            <v-list-item-title v-else>
                                <v-icon size="small" start> mdi-timer-outline </v-icon>
                                {{ i18n("list_details_act_restart_updating") }}
                            </v-list-item-title>
                        </v-list-item>
                        <!-- refresh manga chapter list -->
                        <v-list-item link @click="refreshMangaNow()">
                            <v-list-item-title>
                                <v-icon size="small" start :class="loader"> mdi-refresh </v-icon>
                                {{ i18n("refresh_chapters") }}
                            </v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-col>
            <!-- More actions Menu -->
            <v-col :cols="submenu_col" class="d-flex justify-center">
                <v-menu location="end" :close-on-content-click="false" max-height="196">
                    <template v-slot:activator="{ props }">
                        <v-btn :color="color(-1)" v-bind="props" size="x-small">
                            {{ i18n("list_details_more_actions") }}
                            <v-icon end size="x-small"> mdi-menu-down </v-icon>
                        </v-btn>
                    </template>
                    <v-list
                        :bg-color="color(1)"
                        density="compact"
                        class="py-0"
                        :class="isDarkText ? 'dark-text' : 'light-text'">
                        <!-- search this manga elsewhere -->
                        <v-list-item link @click="searchElsewhere()">
                            <v-list-item-title>
                                <v-icon size="small" start> mdi-text-search </v-icon>
                                {{ i18n("list_details_act_search") }}
                            </v-list-item-title>
                        </v-list-item>
                        <!-- Reset manga read status -->
                        <v-list-item link @click="resetManga()">
                            <v-list-item-title>
                                <v-icon size="small" start> mdi-restart </v-icon>
                                {{ i18n("list_details_act_reset") }}
                            </v-list-item-title>
                        </v-list-item>
                        <!-- Rename manga -->
                        <v-list-item link @click="renameManga()">
                            <v-list-item-title>
                                <v-icon size="x-small" start :class="loader"> mdi-pencil-outline </v-icon>
                                {{ i18n("list_details_rename_manga") }}
                            </v-list-item-title>
                        </v-list-item>
                        <!-- Reset manga name -->
                        <v-list-item link @click="resetName()" v-if="manga.displayName && manga.displayName !== ''">
                            <v-list-item-title>
                                <v-icon size="x-small" start :class="loader"> mdi-pencil-off-outline </v-icon>
                                {{ i18n("list_details_reset_name") }}
                            </v-list-item-title>
                        </v-list-item>

                        <!-- Copy manga JSON -->
                        <v-list-item link @click="copyMangaDebug()">
                            <v-list-item-title>
                                <v-icon size="x-small" start :class="loader">mdi-clipboard-outline </v-icon>
                                Debug
                            </v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-col>

            <!-- Manage manga bookmarks -->
            <v-col :cols="submenu_col" class="d-flex justify-center" v-if="bookmarks.length">
                <v-menu location="end" :close-on-content-click="false" max-height="196">
                    <template v-slot:activator="{ props }">
                        <v-btn :color="color(-1)" v-bind="props" size="x-small">
                            {{ i18n("list_details_books") }}
                            <v-icon end size="x-small"> mdi-bookmark-multiple-outline </v-icon>
                        </v-btn>
                    </template>
                    <v-list
                        :bg-color="color(1)"
                        density="compact"
                        class="py-0"
                        :class="isDarkText ? 'dark-text' : 'light-text'">
                        <!-- search this manga elsewhere -->
                        <v-list-item
                            link
                            v-for="(item, index) of bookmarks"
                            :key="index"
                            :style="index < bookmarks.length - 1 ? 'border-bottom: 1px solid rgb(0 0 0 / 10%);' : ''"
                            :class="isDarkText ? 'dark-text' : 'light-text'"
                            @click="openBookmark(item.chapUrl)">
                            <v-list-item-title>
                                {{
                                    item.type === "scan"
                                        ? i18n("bookmarks_scan_title", item.chapName, item.scanName)
                                        : i18n("bookmarks_chapter_title", item.chapName)
                                }}
                            </v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </v-col>
        </v-row>
    </v-card>
</template>

<script>
import i18n from "../../amr/i18n"
import browser from "webextension-polyfill"
import { chapPath, darkText, getColor, mangaKey } from "../../shared/utils"
import { debugLog, debugWarn, debugError } from "../../shared/debug"
import Flag from "./Flag"

// Request queue to throttle chapter loading - shared across all Manga components
// This prevents flooding the background script with too many simultaneous requests
let requestQueue = Promise.resolve()
const REQUEST_DELAY_MS = 100 // 100ms delay between requests

export default {
    data() {
        return {
            // current state of other grouped mangas panel
            expanded: false,
            // delete manga popup state
            deleteManga: false,
            selectable: false, // Should we show the multi select checkbox
            selected: false,
            canOpenTab: true, // This is used for a timer to hopefully eliminate weird duping issue
            refreshing: false,
            displayChapterSelectMenu: false,
            displayActionMenu: false,
            lazyLoad: false,
            listChaps: [],
            loadError: null // Error message when chapter loading fails (e.g., Cloudflare 403)
        }
    },
    // property to load the component with --> the manga it represents
    props: [
        // the manga to display
        "manga",
        // is part of a group of mangas
        "isInGroup",
        // if manga is first of the group
        "isFirst",
        // is the group currently expanded
        "groupExpanded",
        "groupIndex",
        // compact mode for high-density view
        "compact"
    ],
    computed: {
        shouldShow: function () {
            let show = true

            if (this.isInGroup && !this.isFirst && !this.groupExpanded) {
                show = false
            }

            return show
        },
        // current selected value
        selValue: function () {
            return chapPath(this.manga.lastChapterReadURL)
        },
        // AMR options
        options: function () {
            return this.$store.state.options
        },
        // mirror for current chapter
        mirror: function () {
            const found = this.$store.state.mirrors.all.find(mir => mir.mirrorName === this.manga.mirror)
            if (!found) {
                debugLog(
                    "Manga.vue mirror not found for:",
                    this.manga.mirror,
                    "available mirrors:",
                    this.$store.state.mirrors.all.map(m => m.mirrorName)
                )
            } else {
                debugLog(
                    "Manga.vue mirror found:",
                    found.mirrorName,
                    "icon:",
                    found.mirrorIcon ? found.mirrorIcon.substring(0, 50) + "..." : "NO ICON",
                    "manga.updateError:",
                    this.manga.updateError,
                    "isMirrorEnabled:",
                    found && !found.disabled
                )
            }
            return found
        },
        isMirrorEnabled: function () {
            // const mirror = this.$store.state.mirrors.all.find(
            //     mir => mir.mirrorName === this.manga.mirror
            // )

            return this.mirror && !this.mirror.disabled
        },
        // format chapters list to be displayed
        chapsForSelect: function () {
            return this.listChaps.map(arr => {
                return { value: chapPath(arr[1]), title: arr[0], url: arr[1] }
            })
        },
        showProgress: function () {
            return this.options.disppercentage
        },
        // calculate reading progress
        progress: function () {
            return Math.floor((1 - this.posInChapList / this.listChaps.length) * 100)
        },
        absoluteProgress: function () {
            return `${this.listChaps.length - this.posInChapList}/${this.listChaps.length}`
        },
        // position of current chapter in chapters list
        posInChapList() {
            return this.chapsForSelect.findIndex(el => el.value === this.selValue)
        },
        // number of days since last chapter has been published
        timeUpdated() {
            const nbdays = Math.floor((Date.now() - this.manga.upts) / (1000 * 60 * 60 * 24))
            return nbdays
        },
        // list of languages
        languages() {
            const alllangs = this.manga.languages === undefined ? [] : this.manga.languages.split(",")
            return alllangs.filter(lang => {
                const keylang = mangaKey({
                    url: this.manga.url,
                    mirror: this.manga.mirror,
                    language: lang,
                    rootState: this.$store
                })
                return this.$store.state.mangas.all.findIndex(m => m.key === keylang) === -1
            })
        },
        title_lg_col() {
            let cols = 11
            if (this.options.displastup === 1 && this.manga.upts != 0 && this.timeUpdated < 50) {
                cols = 10
            }
            if (this.isInGroup) {
                cols = 10
            }
            if (this.manga.update === 0) {
                cols = cols - 1
            }
            return cols
        },
        title_sm_col() {
            let cols = 10
            if (this.options.displastup === 1 && this.manga.upts != 0 && this.timeUpdated < 50) {
                cols = cols - 2
            }
            if (this.isInGroup) {
                cols = cols - 1
            }
            if (this.manga.update === 0) {
                cols = cols - 2
            }
            return cols
        },
        submenu_col() {
            if (this.categories.length && this.bookmarks.length) {
                return "3"
            } else {
                return "4"
            }
        },
        isDarkText: function () {
            return darkText(this.manga, this.manga.hasNew, this.options)
        },
        // Color for action buttons - uses theme-aware colors
        buttonColor: function () {
            // In dark theme, use white. In light theme (isDarkText), use dark grey for visibility
            return this.isDarkText ? "grey-darken-4" : "white"
        },
        // Full manga name for tooltip
        fullMangaName: function () {
            const name =
                this.manga.displayName && this.manga.displayName !== "" ? this.manga.displayName : this.manga.name
            return name || "Unknown Manga"
        },
        // Truncated manga name (max 40 chars with ellipsis)
        truncatedName: function () {
            const name = this.fullMangaName || ""
            const maxLength = 40
            if (name.length > maxLength) {
                return name.substring(0, maxLength) + "..."
            }
            return name
        },
        categories() {
            return this.options.categoriesStates.filter(cat => cat.type !== "native" && cat.type != "language")
        },
        loader() {
            if (this.refreshing) {
                return "custom-loader"
            }
            return ""
        },
        // bookmarks for this group
        bookmarks: function () {
            return this.$store.state.bookmarks.all.filter(bm => {
                const key = mangaKey({ url: bm.url, rootState: this.$store })
                return this.manga.key.indexOf(key) >= 0
            })
        }
    },
    methods: {
        /**
         * Load chapters for this manga - called when visible via intersection observer
         */
        async loadChapters() {
            if (this.listChaps.length > 0 || this.refreshing) {
                return // Already loaded or loading
            }

            // Clear any previous error
            this.loadError = null

            // First try to get chapters from the store (no network request)
            const mangaFromStore = this.$store.state.mangas.all.find(manga => manga.key === this.manga.key)

            if (
                mangaFromStore &&
                mangaFromStore.listChaps &&
                Array.isArray(mangaFromStore.listChaps) &&
                mangaFromStore.listChaps.length > 0
            ) {
                this.listChaps = mangaFromStore.listChaps
                debugLog("Loaded chapters from store:", this.manga?.name, this.listChaps.length)
            } else if (this.isMirrorEnabled) {
                // If not in store, fetch from mirror using the throttled queue
                this.refreshing = true
                debugLog("Queuing chapter fetch for:", this.manga?.name, this.manga?.mirror)

                // Use request queue to throttle - prevents flooding background script
                requestQueue = requestQueue.then(async () => {
                    try {
                        const loadedChaps = await browser.runtime.sendMessage({
                            action: "loadListChaps",
                            url: this.manga.url,
                            mirror: this.manga.mirror
                        })
                        debugLog("loadListChaps response:", this.manga?.name, loadedChaps?.length || 0, "chapters")
                        if (loadedChaps && loadedChaps.length > 0) {
                            this.listChaps = loadedChaps
                            // Update the store and persist to IndexedDB
                            this.$store.commit("updateMangaListChaps", {
                                key: this.manga.key,
                                listChaps: loadedChaps
                            })
                            // Persist to IndexedDB so other pages (dashboard) don't re-fetch
                            const mangaToUpdate = this.$store.state.mangas.all.find(m => m.key === this.manga.key)
                            if (mangaToUpdate) {
                                this.$store.dispatch("findAndUpdateManga", mangaToUpdate)
                            }
                        } else {
                            // No chapters returned - could be Cloudflare protection or site issue
                            debugWarn("No chapters returned for:", this.manga?.name)
                            this.loadError = "cloudflare"
                        }
                    } catch (e) {
                        debugError("Failed to load chapters for", this.manga?.name, e)
                        // Check if it's a network/Cloudflare error
                        const errorMsg = e?.message || String(e)
                        if (errorMsg.includes("403") || errorMsg.includes("Failed to load")) {
                            this.loadError = "cloudflare"
                        } else {
                            this.loadError = "error"
                        }
                    } finally {
                        this.refreshing = false
                    }
                    // Add delay before next request
                    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS))
                })
            }
        },

        async onIntersect(entries, observer) {
            // Guard against empty or undefined entries
            if (!entries || !entries.length || !entries[0]) {
                return
            }

            const isIntersecting = entries[0].isIntersecting
            this.lazyLoad = isIntersecting

            // Try to load chapters if entering viewport and not already loaded
            if (isIntersecting && this.listChaps.length === 0) {
                await this.loadChapters()
            }
        },
        i18n: (message, ...args) => i18n(message, ...args),
        /**
         * Return the right color for this manga, depending if it updates (you can stop following udates for a manga), if it has unread chapters or not
         */
        color: function (light, invertable = false) {
            if (this.options.alternateColors && invertable) {
                const odd = (this.groupIndex + 1) % 2 == 1
                light += odd ? -2 : 1
            }
            return getColor(this.manga, this.manga.hasNew, this.options, light)
        },
        /** get the real url from the value (url path used in select) in the manga list */
        urlFromValue: function (val) {
            return this.listChaps.find(arr => chapPath(arr[1]) === val)[1]
        },
        /**
         * Mark last chapter as read
         */
        markAsRead() {
            // Guard against empty listChaps
            if (!this.listChaps || this.listChaps.length === 0 || !this.listChaps[0]) {
                debugWarn("markAsRead called but no chapters loaded for:", this.manga?.name)
                return
            }
            const mg = {
                url: this.manga.url,
                mirror: this.manga.mirror,
                lastChapterReadName: this.listChaps[0][0],
                lastChapterReadURL: this.listChaps[0][1],
                name: this.manga.name,
                language: this.manga.language
            }
            browser.runtime.sendMessage({ action: "readManga", ...mg })
            this.$store.dispatch("autoExportReadStatus", mg, { root: true })
        },
        /**
         * Reset manga reading to first chapter for the group of mangas
         */
        resetManga() {
            browser.runtime.sendMessage({
                action: "resetManga",
                url: this.manga.url,
                language: this.manga.language
            })
        },
        /**
         * Toggle following manga updates for this group
         */
        toggleFollow: function () {
            browser.runtime.sendMessage({
                action: "markMangaReadTop",
                url: this.manga.url,
                language: this.manga.language,
                updatesamemangas: true,
                read: this.manga.read == 1 ? 0 : 1
            })
        },
        /**
         * Stop updating (looking for new chapters) mangas in this group
         */
        toggleUpdate: function () {
            browser.runtime.sendMessage({
                action: "markMangaUpdateTop",
                url: this.manga.url,
                language: this.manga.language,
                updatesamemangas: true,
                update: this.manga.update == 1 ? 0 : 1
            })
        },
        /**
         * Refresh manga chapter list
         */
        refreshMangaNow: function () {
            this.refreshing = true
            browser.runtime.sendMessage({
                action: "refreshMangas",
                manga: this.manga
            })
            setTimeout(() => (this.refreshing = false), 2000)
        },
        /**
         * Open search panel with search field prefilled with manga name
         */
        searchElsewhere: function () {
            this.$emit("search-request", this.manga.name)
        },
        /**
         * Open a chapter in new tab
         */
        play(which) {
            // Guard against empty listChaps
            if (!this.listChaps || this.listChaps.length === 0) {
                debugWarn("play called but no chapters loaded for:", this.manga?.name)
                return
            }
            let pos
            if (which === Infinity) pos = 0
            else {
                pos = this.posInChapList - which // order of chapters is reversed
                if (pos < 0) pos = 0
                else if (pos >= this.listChaps.length) pos = this.listChaps.length - 1
            }
            // Guard against invalid position
            if (!this.listChaps[pos] || !this.listChaps[pos][1]) {
                debugWarn("play: invalid chapter position", pos, "for:", this.manga?.name)
                return
            }
            browser.runtime.sendMessage({
                action: "opentab",
                url: this.listChaps[pos][1]
            })
        },
        /**
         * Opens a chapter from select
         */
        playChap(chapterValue) {
            browser.runtime.sendMessage({ action: "opentab", url: this.urlFromValue(chapterValue) })
        },
        /**
         * Opens manga main page
         */
        openManga() {
            browser.runtime.sendMessage({ action: "opentab", url: this.manga.url })
        },
        /**
         * Deletes a manga
         */
        async trash() {
            browser.runtime.sendMessage({ action: "deleteManga", key: this.manga.key })
            this.deleteManga = false
        },
        /** Read a manga in another language */
        async readMangaInLang(lang) {
            await browser.runtime.sendMessage({
                action: "readManga",
                url: this.manga.url,
                mirror: this.manga.mirror,
                name: this.manga.name,
                language: lang
            })
        },
        deleteCategory: function (cat) {
            browser.runtime.sendMessage({
                action: "removeCategoryFromManga",
                key: this.manga.key,
                name: cat
            })
        },
        addCategory: function (cat) {
            browser.runtime.sendMessage({
                action: "addCategoryToManga",
                key: this.manga.key,
                name: cat
            })
        },
        hasCategory: function (cat) {
            return this.manga.cats.includes(cat)
        },
        /**
         * Open category manager in options page
         */
        openCategoryManager: function () {
            browser.runtime.sendMessage({
                action: "opentab",
                url: browser.runtime.getURL("/pages/options/options.html#categories")
            })
        },
        /**
         * Open bookmark in a new tab (the chapter corresponding to bookmark)
         */
        openBookmark: function (bm) {
            browser.runtime.sendMessage({ action: "opentab", url: bm })
        },
        emitExpand() {
            this.$emit("expand-group")
        },
        /**
         * Emit the event for renaming this manga
         */
        renameManga() {
            this.$emit("rename-manga", this.manga)
        },
        resetName() {
            browser.runtime.sendMessage({
                action: "setDisplayName",
                key: this.manga.key,
                displayName: ""
            })
        },
        copyMangaDebug() {
            const manga = JSON.stringify(this.manga, null, 2)
            if (navigator.clipboard) {
                navigator.clipboard.writeText(manga)
            } else {
                console.info(manga)
            }
        },
        setOpenTrue() {
            this.canOpenTab = true
        }
    },
    watch: {
        lazyLoad(newValue, oldValue) {
            if (newValue === oldValue) return
            if (newValue) {
                this.displayChapterSelectMenu = true
                this.displayActionMenu = true
            } else {
                this.displayChapterSelectMenu = false
                this.displayActionMenu = false
            }
        },
        selected(newValue) {
            if (newValue) this.$eventBus.$emit("multi-manga:select-manga", this.manga.key)
            else this.$eventBus.$emit("multi-manga:deselect-manga", this.manga.key)
        },
        shouldShow(newValue) {
            if (newValue && this.selected) {
                this.selected = false
            }
        }
    },
    async created() {
        // Note: Don't load chapters here - use intersection observer (onIntersect) instead
        // This prevents flooding the background script with 100+ simultaneous requests
        // Only load chapters from store if already available (no network request)
        const mangaFromStore = this.$store.state.mangas.all.find(manga => manga.key === this.manga.key)
        if (
            mangaFromStore &&
            mangaFromStore.listChaps &&
            Array.isArray(mangaFromStore.listChaps) &&
            mangaFromStore.listChaps.length > 0
        ) {
            this.listChaps = mangaFromStore.listChaps
        }

        this.$eventBus.$on("multi-manga:open-latest:" + this.manga.key, () => {
            if (!this.canOpenTab) return
            if (this.isMirrorEnabled) {
                this.play(0)
            }
            this.canOpenTab = false
            setTimeout(this.setOpenTrue, 500)
        })
        this.$eventBus.$on("multi-manga:open-first-new:" + this.manga.key, () => {
            if (!this.canOpenTab) return
            if (this.isMirrorEnabled && this.posInChapList > 0) {
                this.play(1)
            }
            this.canOpenTab = false
            setTimeout(this.setOpenTrue, 500)
        })
        this.$eventBus.$on("multi-manga:show-multiselect", () => {
            this.selectable = true
            this.selected = false
        })
        this.$eventBus.$on("multi-manga:hide-multiselect", () => {
            this.selectable = false
            this.selected = false
        })
        this.$eventBus.$on("multi-manga:select-all", () => {
            if (this.shouldShow && !this.selected) this.selected = true
        })
        this.$eventBus.$on("multi-manga:select-unread", () => {
            if (this.shouldShow && !this.selected && this.posInChapList > 0) this.selected = true
        })
        this.$eventBus.$on("multi-manga:deselect-all", () => {
            if (this.selected) this.selected = false
        })
    },
    beforeUnmount() {
        // Clean up EventBus listeners to prevent memory leaks
        this.$eventBus.$off("multi-manga:open-latest:" + this.manga.key)
        this.$eventBus.$off("multi-manga:open-first-new:" + this.manga.key)
        this.$eventBus.$off("multi-manga:show-multiselect")
        this.$eventBus.$off("multi-manga:hide-multiselect")
        this.$eventBus.$off("multi-manga:select-all")
        this.$eventBus.$off("multi-manga:select-unread")
        this.$eventBus.$off("multi-manga:deselect-all")
    },
    // Name of the component
    name: "Manga",
    components: { Flag }
}
</script>

<style lang="css" scoped data-amr="true">
.group {
    display: flex;
    flex: 1;
    justify-content: space-evenly;
}

.dark-text,
.dark-text * {
    color: #424242 !important;
}

.dark-text :deep(.v-icon) {
    color: #424242 !important;
}

.light-text,
.light-text * {
    color: #fafafa !important;
}

.light-text :deep(.v-icon) {
    color: #fafafa !important;
}

/* Force dark grey icons for ALL action buttons regardless of text color class */
.action-buttons .v-btn--variant-text :deep(.v-icon) {
    color: #424242 !important;
    opacity: 0.9;
}

/* Error buttons should stay red */
.action-buttons .v-btn--variant-text.text-error :deep(.v-icon) {
    color: rgb(var(--v-theme-error)) !important;
}

/* Fixed width slots for navigation buttons to prevent layout shift */
.action-btn-slot {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.amr-manga-title {
    font-weight: bold;
    cursor: pointer;
    max-width: 300px !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
}

.amr-manga-title-cont .select-checkbox {
    display: inline-flex;
    height: 20px;
}

.empty-icon {
    width: 22px;
}

.padding-group {
    width: 16px;
}

.back-card {
    height: 100% !important;
}

.amr-prog-cont {
    margin-left: 0px;
}

.amr-manga-waiting {
    margin-top: 7px;
}

.amr-manga-row {
    height: auto !important;
    padding: 6px 10px !important;
    border-radius: 4px !important;
    margin-bottom: 4px;
    border: 1px solid rgba(0, 0, 0, 0.12) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
}

.v-theme--dark .amr-manga-row {
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
}

/* Compact mode styles */
.compact-card.amr-manga-row {
    padding: 2px 6px !important;
    margin-bottom: 2px;
    border-radius: 2px !important;
}

.compact-card .amr-manga-title {
    font-size: 0.85rem;
}

.compact-card .chapter-select :deep(.v-field) {
    min-height: 24px !important;
}

.compact-card .action-btn-slot {
    width: 22px;
    height: 22px;
}

/* Status icons column - fixed width */
.status-icons {
    min-width: 60px;
    max-width: 60px;
    justify-content: flex-end;
}

/* Chapter column - fixed width for consistent layout */
.chapter-col {
    min-width: 200px;
    max-width: 280px;
    flex: 0 0 auto !important;
}

.chapter-select {
    max-width: 100%;
    width: 100%;
}

.chapter-select :deep(.v-field) {
    min-height: 28px !important;
    padding: 0 8px !important;
}

.chapter-select :deep(.v-field__input) {
    padding: 4px 0 !important;
    min-height: 28px !important;
}

.chapter-select :deep(.v-select__selection) {
    margin: 0 !important;
}

/* Action buttons container - fixed width */
.action-buttons {
    min-width: 200px;
    flex: 0 0 auto !important;
}

.det-sel-wrapper {
    display: inline-block;
    position: relative;
}

.det-sel-wrapper:after {
    content: "▼";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    font-size: 0.75rem;
    line-height: 19px;
    padding: 1px 5px;
    pointer-events: none;
    z-index: 1;
}

.det-sel-wrapper select {
    -moz-appearance: none;
    -webkit-appearance: none;
    -ms-appearance: none;
    appearance: none;
    display: inline-block;
    outline: none;
    border-style: none;
    border-radius: 2px !important;
    position: relative;
    padding: 2px 4px;
    padding-right: 15px;
    color: white;
    font-size: 1rem;
}

.amr-list-actions .v-icon.v-icon {
    font-size: 22px;
}

.chap-title {
    font-size: 13px;
    max-width: 600px !important;
}

.amr-noupdates {
    opacity: 0.75;
}

.min-h-26 {
    min-height: 26px;
}

.add {
    color: rgba(0, 0, 255, 0.3) !important;
}

@media screen and (max-width: 1263px) {
    .m-icon {
        margin-left: 2px !important;
        margin-right: 2px !important;
    }
}

@media screen and (min-width: 1264px) {
    .m-icon {
        margin-left: 4px !important;
    }
}

.custom-loader {
    animation: loader 1s infinite;
}

@-moz-keyframes loader {
    from {
        transform: rotate(0);
    }

    to {
        transform: rotate(360deg);
    }
}

@-webkit-keyframes loader {
    from {
        transform: rotate(0);
    }

    to {
        transform: rotate(360deg);
    }
}

@-o-keyframes loader {
    from {
        transform: rotate(0);
    }

    to {
        transform: rotate(360deg);
    }
}

@keyframes loader {
    from {
        transform: rotate(0);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
<style lang="css">
.v-text-field.v-text-field--solo.v-input--dense > .v-input__control {
    min-height: 26px !important;
}
</style>
