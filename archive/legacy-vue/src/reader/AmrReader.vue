<template>
    <div id="amrapp" :data-theme="themeAttr" class="amr-app">
        <!-- Global cover for loading when transition from a chapter to another one -->
        <div v-show="loading" class="amr-transition-cover" :style="{ backgroundColor: 'var(--amr-bg-primary)' }">
            <div class="amr-spinner-large"></div>
        </div>
        <!-- Global component to show confirmation dialogs, alert dialogs / other -->
        <WizDialog ref="wizdialog"></WizDialog>
        <!-- Global component to show bookmarks dialog -->
        <BookmarkPopup :mirror="mirror" ref="book"></BookmarkPopup>
        <!-- Popup displaying shortcuts -->
        <ShortcutsPopup ref="shortcuts"></ShortcutsPopup>
        <!-- Global always visible buttons -->
        <div class="d-flex flex-column fab-container" @mouseenter="fabHover = true" @mouseleave="fabHover = false">
            <!-- Button to open side drawer -->
            <AmrButton
                :class="['amr-fab-btn', { 'amr-fab-visible': fabHover || drawer }]"
                variant="danger"
                size="small"
                icon
                @click="drawer = !drawer">
                <AmrIcon :icon="icons.mdiMenu" />
            </AmrButton>
            <!-- Quick button to go to next chapter -->
            <AmrTooltip
                location="left"
                :text="
                    i18n('list_mg_act_next') +
                    ' ' +
                    (nextchapLoading ? i18n('reader_loading', Math.floor(nextchapProgress)) : '')
                ">
                <div class="amr-progress-btn mt-2" v-show="!lastChapter && nextchapLoading && !drawer && fabHover">
                    <svg class="amr-progress-ring" width="42" height="42">
                        <circle class="amr-progress-ring-bg" cx="21" cy="21" r="18" />
                        <circle
                            class="amr-progress-ring-fg amr-progress-green"
                            cx="21"
                            cy="21"
                            r="18"
                            :stroke-dasharray="113"
                            :stroke-dashoffset="113 - (nextchapProgress / 100) * 113" />
                    </svg>
                    <AmrButton size="small" icon class="amr-progress-inner text-green" @click.stop="goNextChapter">
                        <AmrIcon :icon="shouldInvertKeys ? icons.mdiChevronLeft : icons.mdiChevronRight" />
                    </AmrButton>
                </div>
                <div class="amr-progress-btn mt-2" v-show="!lastChapter && !nextchapLoading && !drawer && fabHover">
                    <svg class="amr-progress-ring amr-progress-spin" width="42" height="42">
                        <circle class="amr-progress-ring-bg" cx="21" cy="21" r="18" />
                        <circle
                            class="amr-progress-ring-fg amr-progress-red"
                            cx="21"
                            cy="21"
                            r="18"
                            stroke-dasharray="28 85" />
                    </svg>
                    <AmrButton size="small" icon class="amr-progress-inner text-red" @click.stop="goNextChapter">
                        <AmrIcon :icon="shouldInvertKeys ? icons.mdiChevronLeft : icons.mdiChevronRight" />
                    </AmrButton>
                </div>
            </AmrTooltip>
            <AmrTooltip location="left" :text="i18n('content_nav_last_chap')">
                <AmrButton size="small" class="mt-2" icon v-show="fabHover && !drawer && lastChapter" variant="warning">
                    <AmrIcon :icon="icons.mdiAlert" />
                </AmrButton>
            </AmrTooltip>
            <!-- Quick button to add a manga to reading list -->
            <AmrTooltip location="left" :text="i18n('content_nav_add_list')">
                <AmrButton
                    size="small"
                    class="mt-2 text-green"
                    icon
                    v-show="!mangaExists && options.addauto === 0 && fabHover && !drawer"
                    @click.stop="addManga">
                    <AmrIcon :icon="icons.mdiPlus" />
                </AmrButton>
            </AmrTooltip>
        </div>
        <!-- AMR Reader side bar -->
        <div v-show="drawer" class="amr-drawer-backdrop" @click="drawer = false"></div>
        <div
            :class="['amr-navigation-drawer', 'amr-drawer', backcolor(), { 'amr-drawer-open': drawer }]"
            ref="navdrawer">
            <div :class="['amr-card', backcolor()]">
                <!-- Manga Title -->
                <div class="amr-card-title amr-manga-title">
                    <div class="text-subtitle-1">
                        <AmrTooltip location="bottom" :text="i18n('reader_click_go_mirror')" v-if="mirrorDesc">
                            <a :href="mirrorDesc.home" target="_blank">
                                <img :src="mirrorDesc.mirrorIcon" />
                            </a>
                        </AmrTooltip>
                        <AmrTooltip location="bottom" :text="i18n('reader_click_go_manga')">
                            <a :href="manga.currentMangaURL" target="_blank">{{
                                mangaInfos && mangaInfos.displayName ? mangaInfos.displayName : manga.name
                            }}</a>
                        </AmrTooltip>
                    </div>
                </div>
                <!-- Chapters navigation -->
                <div class="amr-card-actions pa-0">
                    <div class="amr-row">
                        <div class="amr-col-12">
                            <div class="amr-toolbar amr-chapters-toolbar">
                                <div class="d-flex align-center py-1">
                                    <!-- Previous chapter button -->
                                    <AmrTooltip
                                        location="bottom"
                                        :text="
                                            shouldInvertKeys
                                                ? i18n('list_mg_act_next') +
                                                  ' ' +
                                                  (nextchapLoading
                                                      ? i18n('reader_loading', Math.floor(nextchapProgress))
                                                      : '')
                                                : i18n('list_mg_act_prev')
                                        ">
                                        <AmrButton
                                            class="select-btn"
                                            variant="text"
                                            size="small"
                                            v-show="shouldInvertKeys ? !lastChapter : !firstChapter"
                                            @click.stop="shouldInvertKeys ? goNextChapter() : goPreviousChapter()">
                                            <AmrIcon :icon="icons.mdiChevronLeft" />
                                        </AmrButton>
                                    </AmrTooltip>
                                    <!-- List of chapters -->
                                    <AmrSelect
                                        v-model="selchap"
                                        :items="chapters"
                                        itemTitle="title"
                                        itemValue="url"
                                        class="amr-chapter-select truncate"
                                        @update:modelValue="goToChapter" />
                                    <div class="amr-spacer"></div>
                                    <AmrTooltip
                                        location="bottom"
                                        :text="
                                            shouldInvertKeys
                                                ? i18n('list_mg_act_prev')
                                                : i18n('list_mg_act_next') +
                                                  ' ' +
                                                  (nextchapLoading
                                                      ? i18n('reader_loading', Math.floor(nextchapProgress))
                                                      : '')
                                        ">
                                        <!-- Next chapter button -->
                                        <AmrButton
                                            class="select-btn"
                                            variant="text"
                                            size="small"
                                            v-show="shouldInvertKeys ? !firstChapter : !lastChapter"
                                            @click.stop="shouldInvertKeys ? goPreviousChapter() : goNextChapter()">
                                            <AmrIcon :icon="icons.mdiChevronRight" />
                                        </AmrButton>
                                    </AmrTooltip>
                                </div>
                            </div>
                        </div>
                        <!-- Next chapter preloading progression bar -->
                        <div class="amr-col-12 amr-chapter-progress-cont">
                            <AmrTooltip location="bottom" :text="i18n('reader_loading', Math.floor(nextchapProgress))">
                                <div
                                    v-show="nextchapLoading"
                                    class="amr-progress-linear amr-floting-progress"
                                    :style="{ width: nextchapProgress + '%' }"></div>
                            </AmrTooltip>
                        </div>
                        <!-- Action buttons -->
                        <div class="amr-col-12 text-center pa-2">
                            <AmrMenu v-model="bookmarkMenuOpen" :closeOnContentClick="false">
                                <!-- Bookmarks button -->
                                <template #activator="{ open }">
                                    <AmrTooltip location="bottom" :text="i18n('content_nav_click_bm')" class="ml-1">
                                        <AmrButton
                                            icon
                                            :class="bookstate.booked ? 'amr-btn-yellow' : 'amr-btn-yellow-light'"
                                            @click="open">
                                            <AmrIcon :icon="icons.mdiStar" />
                                        </AmrButton>
                                    </AmrTooltip>
                                </template>
                                <!-- Menu displayed when bookmarks button activate -->
                                <div class="amr-card amr-bookmark-menu">
                                    <div class="amr-card-title" v-if="bookstate.note">
                                        {{ i18n("reader_bookmarked_note", bookstate.note) }}
                                    </div>
                                    <div class="amr-card-actions">
                                        <AmrButton
                                            @click="handleBookmarkButtonClick"
                                            @mousedown.stop
                                            class="amr-btn-yellow">
                                            <AmrIcon :icon="icons.mdiStar" />&nbsp;{{
                                                bookstate.booked
                                                    ? i18n("reader_bookmark_update")
                                                    : i18n("reader_bookmark_create")
                                            }}
                                        </AmrButton>
                                        <div class="amr-spacer"></div>
                                        <AmrTooltip location="bottom" :text="i18n('reader_open_bookmarks_tab')">
                                            <AmrButton icon @click="openBookmarksTab" variant="primary">
                                                <AmrIcon :icon="icons.mdiOpenInNew" />
                                            </AmrButton>
                                        </AmrTooltip>
                                    </div>
                                    <div class="amr-card-text">
                                        <div v-if="bookedScans.length === 0">
                                            {{ i18n("reader_no_bookmarked_scans") }}
                                        </div>
                                        <div v-else class="amr-bookmarked-scans-cont">
                                            <div class="amr-row-dense">
                                                <div
                                                    class="amr-col-4 amr-bookmarked-scan"
                                                    v-for="(scan, i) in bookedScans"
                                                    :key="i"
                                                    @click.stop="$refs.reader.goScan(scan.page)">
                                                    <AmrTooltip location="bottom" :text="scan.note" v-if="scan.note">
                                                        <Scan
                                                            :full="false"
                                                            :src="scan.url"
                                                            resize="container"
                                                            :bookmark="false" />
                                                    </AmrTooltip>
                                                    <Scan
                                                        v-else
                                                        :full="false"
                                                        :src="scan.url"
                                                        resize="container"
                                                        :bookmark="false" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AmrMenu>
                            <!-- Mark as latest chapter read button -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_mark_read')" class="ml-1">
                                <AmrButton icon variant="warning" v-show="showLatestRead" @click.stop="markAsLatest">
                                    <AmrIcon :icon="icons.mdiPageLast" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- Add to reading list button -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_add_list')" class="ml-1">
                                <AmrButton
                                    icon
                                    variant="success"
                                    v-show="!mangaExists && options.addauto === 0"
                                    @click.stop="addManga">
                                    <AmrIcon :icon="icons.mdiPlus" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- Remove from reading list button -->
                            <AmrTooltip location="bottom" :text="i18n('reader_delete_manga')" class="ml-1">
                                <AmrButton icon variant="danger" v-show="mangaExists" @click.stop="deleteManga">
                                    <AmrIcon :icon="icons.mdiDelete" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- Pause following updates on manga -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_stopfollow')" class="ml-1">
                                <AmrButton
                                    icon
                                    variant="primary"
                                    @click.stop="markMangaReadTop(1)"
                                    v-show="mangaExists && mangaInfos && mangaInfos.read === 0">
                                    <AmrIcon :icon="icons.mdiPause" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- Follow updates on manga -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_follow')" class="ml-1">
                                <AmrButton
                                    icon
                                    variant="primary"
                                    @click.stop="markMangaReadTop(0)"
                                    v-show="mangaExists && mangaInfos && mangaInfos.read === 1">
                                    <AmrIcon :icon="icons.mdiPlay" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- Reload all scan errors -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_reload')" class="ml-1">
                                <AmrButton icon variant="danger" @click.stop="reloadErrors">
                                    <AmrIcon :icon="icons.mdiReplay" />
                                </AmrButton>
                            </AmrTooltip>
                            <!-- download chapter button -->
                            <AmrTooltip location="bottom" :text="i18n('content_nav_downlaod')" class="ml-1">
                                <AmrButton icon variant="danger" @click.stop="DownloadChapter">
                                    <div v-if="zip" class="amr-spinner-small"></div>
                                    <AmrIcon v-else :icon="icons.mdiDownloadOutline" />
                                </AmrButton>
                            </AmrTooltip>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Display options -->
            <div :class="['amr-card', backcolor(1)]">
                <div class="amr-card-title">
                    <div class="amr-row-dense">
                        <div class="amr-col-12">
                            <!-- Display book checkbox -->
                            <AmrSwitch v-model="book" :label="i18n('option_read_book')" class="pb-1" />
                            <span>
                                <AmrTooltip location="top" :text="i18n('reader_book_offset_description')">
                                    <!-- Book offset button -->
                                    <AmrSwitch
                                        :disabled="!book"
                                        v-show="displayBookOffsetButton"
                                        @click="offsetBook"
                                        :label="i18n('reader_book_offset')"
                                        class="pb-1" />
                                </AmrTooltip>
                            </span>
                        </div>
                        <div class="amr-col-12">
                            <div class="amr-divider"></div>
                        </div>
                        <div class="amr-col-12">
                            <!-- Display full chapter checkbox -->
                            <AmrSwitch v-model="fullchapter" :label="i18n('option_read_fullchapter')" class="pb-1" />
                        </div>
                        <div class="amr-col-12">
                            <!-- Webtoon Mode checkbox -->
                            <AmrSwitch
                                v-model="webtoonMode"
                                :label="i18n('option_read_webtoon')"
                                class="pb-1"
                                :disabled="!fullchapter" />
                        </div>
                        <div class="amr-col-12">
                            <div class="amr-divider"></div>
                        </div>
                        <div class="amr-col-12">
                            <!-- Scale Up Image checkbox -->
                            <AmrSwitch v-model="scaleUp" :label="i18n('option_read_scaleup')" class="pb-1" />
                        </div>
                    </div>
                    <div class="amr-row-dense">
                        <!-- Reading direction -->
                        <div class="amr-col-12 text-center mt-2">
                            <div class="amr-btn-toggle">
                                <AmrTooltip location="bottom" :text="i18n('option_read_book_ltr')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': direction === 'ltr' }"
                                        @click="direction = 'ltr'">
                                        <AmrIcon :icon="icons.mdiArrowRight" />
                                    </AmrButton>
                                </AmrTooltip>
                                <AmrTooltip location="bottom" :text="i18n('option_read_book_rtl')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': direction === 'rtl' }"
                                        @click="direction = 'rtl'">
                                        <AmrIcon :icon="icons.mdiArrowLeft" />
                                    </AmrButton>
                                </AmrTooltip>
                            </div>
                        </div>
                        <!-- Resize mode -->
                        <div class="amr-col-12 text-center">
                            <div class="amr-btn-toggle">
                                <AmrTooltip location="bottom" :text="i18n('option_read_resize_w')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': resize === 'width' }"
                                        @click="resize = 'width'">
                                        <AmrIcon :icon="icons.mdiArrowExpandHorizontal" />
                                    </AmrButton>
                                </AmrTooltip>
                                <AmrTooltip location="bottom" :text="i18n('option_read_resize_h')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': resize === 'height' }"
                                        v-show="!fullchapter"
                                        @click="resize = 'height'">
                                        <AmrIcon :icon="icons.mdiArrowExpandVertical" />
                                    </AmrButton>
                                </AmrTooltip>
                                <AmrTooltip location="bottom" :text="i18n('option_read_resize_c')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': resize === 'container' }"
                                        v-show="!fullchapter"
                                        @click="resize = 'container'">
                                        <AmrIcon :icon="icons.mdiArrowExpandAll" />
                                    </AmrButton>
                                </AmrTooltip>
                                <AmrTooltip location="bottom" :text="i18n('option_read_resize_n')">
                                    <AmrButton
                                        variant="text"
                                        :class="{ 'amr-btn-active': resize === 'none' }"
                                        @click="resize = 'none'">
                                        <AmrIcon :icon="icons.mdiBorderNoneVariant" />
                                    </AmrButton>
                                </AmrTooltip>
                            </div>
                        </div>
                        <!-- Zoom Value -->
                        <div class="amr-col-12 text-center mt-2" v-if="showMaxWidth">
                            <div class="amr-zoom-row">
                                <AmrIcon :icon="icons.mdiMinus" @click="zoomOut" class="amr-zoom-icon" />
                                <AmrSlider v-model="maxWidthValueStore" :min="10" :max="100" class="amr-zoom-slider" />
                                <AmrIcon :icon="icons.mdiPlus" @click="zoomIn" class="amr-zoom-icon" />
                            </div>
                        </div>
                        <div class="amr-col-12 mt-2" style="min-height: 40px !important" v-else></div>
                        <div class="amr-col-12 text-center mt-2">
                            <AmrTooltip
                                location="top"
                                :text="!darkreader ? i18n('reader_button_dark') : i18n('reader_button_light')">
                                <AmrButton
                                    icon
                                    @click="toggleDark"
                                    :class="darkreader ? 'amr-btn-light' : 'amr-btn-dark'"
                                    class="ma-0">
                                    <AmrIcon :icon="icons.mdiBrightness6" />
                                </AmrButton>
                            </AmrTooltip>
                            <AmrTooltip
                                location="top"
                                :text="
                                    !fullscreen
                                        ? i18n('reader_button_fullscreen')
                                        : i18n('reader_button_exit_fullscreen')
                                ">
                                <AmrButton icon @click="toggleFullScreen" class="ma-0">
                                    <AmrIcon :icon="fullscreen ? icons.mdiFullscreenExit : icons.mdiFullscreen" />
                                </AmrButton>
                            </AmrTooltip>
                            <AmrTooltip location="top" :text="i18n('reader_zoom_show')">
                                <AmrButton
                                    icon
                                    @click="showMaxWidth = !showMaxWidth"
                                    class="ma-0"
                                    :disabled="['height', 'none'].includes(resize)">
                                    <AmrIcon :icon="icons.mdiMagnify" />
                                </AmrButton>
                            </AmrTooltip>
                            <AmrTooltip location="top" :text="i18n('reader_shortcuts_tooltip')">
                                <AmrButton icon @click="openShortcuts" class="ma-0">
                                    <AmrIcon :icon="icons.mdiKeyboard" />
                                </AmrButton>
                            </AmrTooltip>
                            <AmrTooltip location="top" :text="i18n('reader_button_tips')">
                                <AmrButton icon @click="displayTips" variant="primary" class="ma-0">
                                    <AmrIcon :icon="icons.mdiLightbulbOn" />
                                </AmrButton>
                            </AmrTooltip>
                        </div>
                        <div class="amr-col-12 text-center mt-2">
                            <AmrTooltip location="top" :text="i18n('reader_button_saveoptions')">
                                <AmrButton
                                    icon
                                    @click="saveOptionsAsDefault(false)"
                                    variant="primary"
                                    v-if="layoutDiffFromOptions"
                                    class="ma-0">
                                    <AmrIcon :icon="icons.mdiContentSave" />
                                </AmrButton>
                                <AmrButton v-else icon disabled class="select-btn" />
                            </AmrTooltip>
                            <AmrTooltip location="top" :text="i18n('reader_button_resetoptions')">
                                <AmrButton
                                    icon
                                    @click="resetOptionsToDefault"
                                    variant="primary"
                                    v-if="layoutDiffFromOptions"
                                    class="ma-0">
                                    <AmrIcon :icon="icons.mdiReload" />
                                </AmrButton>
                                <AmrButton v-else icon disabled class="select-btn" />
                            </AmrTooltip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <SocialBar v-show="drawer" />
        <!-- End AMR Reader Side bar -->
        <main class="amr-main">
            <Reader
                ref="reader"
                :mirror="mirror"
                :book="book"
                :direction="direction"
                :invertKeys="invertKeys"
                :fullchapter="fullchapter"
                :resize="resize"
                :drawer="drawer"
                :webtoonMode="webtoonMode"
                :maxWidthValue="maxWidthValue"
                :scaleUp="scaleUp"
                :shouldInvertKeys="shouldInvertKeys" />
        </main>
    </div>
</template>

<script>
import browser from "webextension-polyfill"
import { i18nmixin } from "../mixins/i18n-mixin"

import pageData from "./state/pagedata"
import options from "./state/options"
import bookmarks from "./state/bookmarks"

import { saveAs, Util } from "./helpers/util"
import * as dialogs from "./helpers/dialogs"
import ChapterLoader from "./helpers/ChapterLoader"
import { scansProvider } from "./helpers/ScansProvider"
import EventBus from "./helpers/EventBus"
import mimedb from "mime-db"
import Reader from "./components/Reader"
import Scan from "./components/Scan"
import WizDialog from "./components/WizDialog"
import BookmarkPopup from "./components/BookmarkPopup"
import ShortcutsPopup from "./components/ShortcutsPopup"
import SocialBar from "./components/SocialBar"
import AmrIcon from "./components/AmrIcon"
import AmrButton from "./components/AmrButton"
import AmrSwitch from "./components/AmrSwitch"
import AmrSlider from "./components/AmrSlider"
import AmrSelect from "./components/AmrSelect"
import AmrMenu from "./components/AmrMenu"
import AmrTooltip from "./components/AmrTooltip"
import {
    mdiMenu,
    mdiChevronRight,
    mdiChevronLeft,
    mdiAlert,
    mdiPlus,
    mdiMinus,
    mdiStar,
    mdiOpenInNew,
    mdiPageLast,
    mdiDelete,
    mdiPause,
    mdiPlay,
    mdiReplay,
    mdiDownloadOutline,
    mdiBookOpenPageVariant,
    mdiArrowRight,
    mdiArrowLeft,
    mdiArrowExpandHorizontal,
    mdiArrowExpandVertical,
    mdiArrowExpandAll,
    mdiBorderNoneVariant,
    mdiPlusCircle,
    mdiMinusCircle,
    mdiContentSave,
    mdiReload,
    mdiBrightness6,
    mdiFullscreen,
    mdiFullscreenExit,
    mdiKeyboard,
    mdiLightbulbOn,
    mdiMagnify
} from "@mdi/js"
import { THINSCAN } from "../shared/Options"
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js"
import { debug } from "../core/debug"

/** Possible values for resize (readable), the stored value is the corresponding index */
const resize_values = ["width", "height", "container", "none"]

// DISABLED: Memory watcher was part of debugging infrastructure that relied on
// the log buffer, which has been disabled due to causing performance issues.
// See memory-leak-analysis.txt for details.
// To re-enable, set AMR_MEMWATCH=1 in environment AND re-enable log buffer.
const MEMWATCH_ENABLED = false // Disabled - was: process.env.AMR_MEMWATCH === "1" || process.env.NODE_ENV === "development"
const MEMWATCH_INTERVAL_MS = 30000 // Increased from 15s to reduce overhead if re-enabled
const MEMWATCH_HEAP_MB_THRESHOLD = 250
const MEMWATCH_SCAN_THRESHOLD = 60

export default {
    mixins: [i18nmixin],

    props: {
        mirror: Object
    },

    data: () => ({
        zip: false,
        drawer: false /* Display the side drawer or not */,
        loading: false /* Display the loading cover */,
        fabHover: false /* FAB button hover state */,

        chapters: [] /* List of chapters */,
        selchap: null /* Current chapter */,
        mirrorDesc: null /* Current mirror description */,

        direction: options.readingDirection === 0 ? "ltr" : "rtl" /* Reading from left to right or right to left */,
        invertKeys: options.invertKeys === 1 /* Invert keys in right to left mode */,
        book: true /* Do we display side by side pages */,
        resize: "width" /* Mode of resize : width, height, container */,
        fullchapter: true /* Do we display whole chapter or just current page */,
        scaleUp: options.scaleUp === 1 /* Does the image scale up larger than its native size */,
        webtoonMode: options.webtoonDefault === 1 /* Removes whitespace between images for webtoons */,

        mangaExists: null /* Does manga exists in reading list */,
        mangaInfos: null /* specific manga information (layout state, read top, latest read chapter) */,

        displayBookOffsetButton: false /* This button will offset the chapter in book mode if there is a title page. Only display after chapter loads */,

        nextChapterLoader:
            null /* A ChapterLoader object holding metadata (and optionally scans) for the next chapter */,
        nextchapProgress: 0 /* Progression of next chapter preloading (metadata only by default) */,
        preloadNextInProgress: false /* Internal flag to avoid running preloadNextChapter concurrently */,

        bookstate: bookmarks.state /* bookmarks state */,
        thinscan: options.thinscan /* top telling that the chapter is containing thin scans (height >= 3 * width) */,

        darkreader: options.darkreader === 1 /* Top for using dark background */,
        options:
            options /* Make it reactive so update to local options object will be reflected in computed properties */,
        fullscreen:
            !!document.fullscreenElement /* fullscreen window state - use standard API instead of deprecated window.fullScreen */,

        chaploaded: false /* Top telling if all scans have been loaded */,
        pageData: pageData.state /* reactive data from pageData */,

        showMaxWidth: false /* Show the max width */,
        maxWidthValue: 100,
        maxWidthTimeout: null,

        bookmarkMenuOpen: false /* State of bookmark menu */,

        // Reading time tracking
        sessionStartTime: null /* Timestamp when reading session started */,
        chaptersReadInSession: 0 /* Number of chapters read in this session */,

        // Memory debug watcher (temporary, for leak investigation)
        memoryWatchInterval: null,
        memoryDumpTriggered: false,

        // EventBus handlers (stored for cleanup)
        amrEventHandlers: null,

        // Fullscreen change handler (stored for cleanup)
        fullscreenChangeHandler: null,

        icons: {
            mdiMenu,
            mdiChevronRight,
            mdiChevronLeft,
            mdiAlert,
            mdiPlus,
            mdiStar,
            mdiOpenInNew,
            mdiPageLast,
            mdiDelete,
            mdiPause,
            mdiPlay,
            mdiReplay,
            mdiDownloadOutline,
            mdiBookOpenPageVariant,
            mdiArrowRight,
            mdiArrowLeft,
            mdiArrowExpandHorizontal,
            mdiArrowExpandVertical,
            mdiArrowExpandAll,
            mdiBorderNoneVariant,
            mdiPlusCircle,
            mdiMinus,
            mdiMinusCircle,
            mdiContentSave,
            mdiReload,
            mdiBrightness6,
            mdiFullscreen,
            mdiFullscreenExit,
            mdiKeyboard,
            mdiLightbulbOn,
            mdiMagnify
        }
    }),
    created() {
        this.util = new Util(this.mirror)
        /** Start reading session timer */
        this.sessionStartTime = Date.now()
        /** Register keys */
        this.handlekeys()
        /** Check if manga exists */
        this.checkExists()
        /** Load current manga informations */
        this.loadMangaInformations().then(() => {
            /* retrieve current page if current chapter was the last opened */
            if (
                this.mangaInfos &&
                this.util.matchChapUrl(this.pageData.currentChapterURL, this.mangaInfos.currentChapter) &&
                this.mangaInfos.currentScanUrl
            ) {
                // set current page to last currentScanUrl
                EventBus.$emit("go-to-scanurl", this.mangaInfos.currentScanUrl)
            }
        })
        /** Load current bar state (drawer visible or not) */
        this.loadBarState()

        /** Listen to global bus events - store handlers for cleanup */
        this.amrEventHandlers = {
            openBookmarks: obj => {
                this.$refs.book.open(obj)
            },
            thinScan: () => {
                this.handleThinScan()
            },
            goNextChapter: () => {
                this.goNextChapter()
            },
            goPreviousChapter: () => {
                this.goPreviousChapter()
            },
            temporaryDialog: obj => {
                this.$refs.wizdialog.temporary(obj.message, obj.duration)
            },
            pagesLoaded: () => {
                this.displayBookOffsetButton = true
            },
            chapterLoaded: () => {
                this.chaploaded = true
                if (options.prefetch == 1) {
                    this.preloadNextChapter()
                }
                if (options.markwhendownload === 1) {
                    this.consultManga()
                }
            }
        }

        EventBus.$on("open-bookmarks", this.amrEventHandlers.openBookmarks)
        EventBus.$on("thin-scan", this.amrEventHandlers.thinScan)
        EventBus.$on("go-next-chapter", this.amrEventHandlers.goNextChapter)
        EventBus.$on("go-previous-chapter", this.amrEventHandlers.goPreviousChapter)
        EventBus.$on("temporary-dialog", this.amrEventHandlers.temporaryDialog)
        EventBus.$on("pages-loaded", this.amrEventHandlers.pagesLoaded)
        EventBus.$on("chapter-loaded", this.amrEventHandlers.chapterLoaded)
    },
    mounted() {
        /* Load chapters list */
        this.loadChapters()
        /* Load mirror */
        this.loadMirror()

        /** Handle first time reader is opened */
        this.handleFirstTime()
        /** Handle tips */
        dialogs.handleTips(this.$refs.wizdialog, false, this.util)
        /** Handle help us dialogs once in a while */
        dialogs.handleHelps(this.$refs.wizdialog, this.util)

        // mark manga as read
        if (options.markwhendownload === 0) {
            this.consultManga()
        }

        // Record reading time when page is closed
        window.addEventListener("beforeunload", this.recordReadingSession)

        // Listen for fullscreen changes to update state properly (replaces deprecated window.fullScreen)
        this.fullscreenChangeHandler = () => {
            this.fullscreen = !!document.fullscreenElement
        }
        document.addEventListener("fullscreenchange", this.fullscreenChangeHandler)

        // Start memory watcher (temporary debug tool to help detect leaks)
        if (MEMWATCH_ENABLED && typeof window !== "undefined") {
            if (!this.memoryWatchInterval) {
                this.memoryWatchInterval = window.setInterval(() => {
                    try {
                        this.checkMemoryAndMaybeDump()
                    } catch (e) {
                        debug.reader.warn("MEMWATCH checkMemoryAndMaybeDump failed", e)
                    }
                }, MEMWATCH_INTERVAL_MS)
            }
        }
    },
    beforeUnmount() {
        // Clean up window event listener
        window.removeEventListener("beforeunload", this.recordReadingSession)
        // Record reading session when component unmounts
        this.recordReadingSession()

        // Clean up fullscreen change listener
        if (this.fullscreenChangeHandler) {
            document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler)
            this.fullscreenChangeHandler = null
        }

        // Clean up EventBus listeners to prevent memory leaks
        if (this.amrEventHandlers) {
            EventBus.$off("open-bookmarks", this.amrEventHandlers.openBookmarks)
            EventBus.$off("thin-scan", this.amrEventHandlers.thinScan)
            EventBus.$off("go-next-chapter", this.amrEventHandlers.goNextChapter)
            EventBus.$off("go-previous-chapter", this.amrEventHandlers.goPreviousChapter)
            EventBus.$off("temporary-dialog", this.amrEventHandlers.temporaryDialog)
            EventBus.$off("pages-loaded", this.amrEventHandlers.pagesLoaded)
            EventBus.$off("chapter-loaded", this.amrEventHandlers.chapterLoaded)
            this.amrEventHandlers = null
        }

        // Clean up keyboard event listeners (registered in handlekeys)
        if (this.amrKeydownHandler) {
            window.removeEventListener("keydown", this.amrKeydownHandler, true)
        }
        if (this.amrKeyupHandler) {
            window.removeEventListener("keyup", this.amrKeyupHandler, true)
        }
        if (this.amrKeypressHandler) {
            window.removeEventListener("keypress", this.amrKeypressHandler, true)
        }

        // Clean up chapter loaders to release image memory
        if (this.nextChapterLoader) {
            try {
                this.deleteChapterLoader({ chaploader: this.nextChapterLoader })
            } catch (e) {
                debug.reader.warn("beforeUnmount - error deleting nextChapterLoader:", e)
            }
            this.nextChapterLoader = null
        }
        if (window["__current_chapterloader__"]) {
            try {
                this.deleteChapterLoader({ chaploader: window["__current_chapterloader__"] })
            } catch (e) {
                debug.reader.warn("beforeUnmount - error deleting __current_chapterloader__:", e)
            }
            window["__current_chapterloader__"] = null
        }

        // Clean up scansProvider state
        scansProvider.cleanup()

        // Stop memory watcher interval
        if (this.memoryWatchInterval) {
            clearInterval(this.memoryWatchInterval)
            this.memoryWatchInterval = null
        }
    },
    watch: {
        /** Change resize value if passing from !fullchapter to fullchapter (height and container are no more available) */
        fullchapter(nVal, oVal) {
            if (nVal && !oVal) {
                if (["height", "container"].includes(this.resize)) {
                    this.resize = "width"
                }
            }
        },
        /** Keep drawer state */
        drawer(nVal, oVal) {
            browser.runtime.sendMessage({
                action: "setBarState",
                barstate: nVal ? 1 : 0
            })
        },
        /**
         * Update the specific layout value for the current manga
         */
        layoutValue(nVal, oVal) {
            // check if nVal <> options val ; if not reset layout to undefined
            const optVal =
                this.options.scaleUp * 10000 +
                this.options.displayBook * 1000 +
                this.options.readingDirection * 100 +
                this.options.displayFullChapter * 10 +
                this.options.resizeMode
            if (optVal === nVal) {
                nVal = undefined
            }
            // Update current value only if manga is in reading list
            if (this.mangaExists) {
                browser.runtime.sendMessage({
                    action: "setLayoutMode",
                    url: this.pageData.currentMangaURL,
                    layout: nVal,
                    language: this.pageData.language,
                    mirror: this.mirror.mirrorName
                })
            }
        },
        /** hide zoom slider if resize method isn't compatible */
        resize(nVal) {
            if (["height", "none"].includes(nVal)) this.showMaxWidth = false
        },
        webtoonMode(nVal, oVal) {
            if (this.mangaExists) {
                browser.runtime.sendMessage({
                    action: "setWebtoonMode",
                    url: this.pageData.currentMangaURL,
                    webtoon: nVal,
                    language: this.pageData.language,
                    mirror: this.mirror.mirrorName
                })
            }
        }
    },
    computed: {
        console: () => console,
        // Current manga informations retrieved from implementation
        manga() {
            return this.pageData
        },
        /** True if latest published chapter */
        lastChapter() {
            if (this.selchap === null || this.chapters.length === 0) return true
            return this.chapters.findIndex(el => el.url === this.selchap) === 0
        },
        /** Next chapter url */
        nextChapter() {
            if (this.selchap === null) return
            if (this.lastChapter) return
            const cur = this.chapters.findIndex(el => el.url === this.selchap)
            return this.chapters[cur - 1].url
        },
        /** True if first published chapter */
        firstChapter() {
            if (this.selchap === null || this.chapters.length === 0) return true
            return this.chapters.findIndex(el => el.url === this.selchap) === this.chapters.length - 1
        },
        /** The layout value for this manga, a value containing all specific reading options */
        layoutValue() {
            const cbook = this.book ? 1 : 0,
                cdirection = this.direction === "ltr" ? 0 : 1,
                cfullchapter = this.fullchapter ? 1 : 0,
                cresize = resize_values.findIndex(r => r === this.resize),
                cscaleup = this.scaleUp ? 1 : 0

            return 10000 * cscaleup + 1000 * cbook + 100 * cdirection + 10 * cfullchapter + cresize
        },
        /** can you mark this chapter as latest read */
        showLatestRead() {
            return (
                this.mangaExists &&
                this.mangaInfos &&
                !this.util.matchChapUrl(this.mangaInfos.lastchapter, this.pageData.currentChapterURL)
            )
        },
        /** list of bookmarked scans urls */
        bookedScans() {
            // Guard: $refs.reader may not be available during initial render
            if (!this.$refs.reader || !this.$refs.reader.getPageIndexFromScanUrl) {
                return []
            }
            return this.bookstate.scans
                .filter(sc => sc.booked)
                .map(sc => {
                    sc.page = this.$refs.reader.getPageIndexFromScanUrl(sc.url)
                    return sc
                })
        },
        layoutDiffFromOptions() {
            if (this.book !== (this.options.displayBook === 1)) return true
            if (this.direction !== (this.options.readingDirection === 0 ? "ltr" : "rtl")) return true
            if (this.fullchapter !== (this.options.displayFullChapter === 1)) return true
            if (this.resize !== resize_values[this.options.resizeMode]) return true
            if (this.scaleUp !== (this.options.scaleUp === 1)) return true
            return false
        },
        maxWidthValueStore: {
            get() {
                return this.maxWidthValue
            },
            set(val) {
                if (this.maxWidthValue === val) return
                this.maxWidthValue = val
                if (this.maxWidthTimeout) clearTimeout(this.maxWidthTimeout)
                this.maxWidthTimeout = setTimeout(() => {
                    browser.runtime.sendMessage({
                        action: "setZoomMode",
                        url: this.pageData.currentMangaURL,
                        zoom: val,
                        language: this.pageData.language,
                        mirror: this.mirror.mirrorName
                    })
                }, 2000)
            }
        },
        /* Tells if we have a prepared ChapterLoader for the next chapter
           We now only preload metadata (infos + image URLs) to avoid loading all
           next-chapter images into memory in advance. When nextChapterLoader is
           non-null and points to a valid chapter, goNextChapter() will reuse it. */
        nextchapLoading() {
            return !!(
                this.nextChapterLoader &&
                this.nextChapterLoader.isAChapter &&
                this.nextChapterLoader.images &&
                this.nextChapterLoader.images.length > 0
            )
        },
        /**
         * If UI buttons and keys should be flipped
         */
        shouldInvertKeys() {
            return this.direction === "rtl" && this.invertKeys && !this.fullchapter
        },
        /**
         * Theme attribute for CSS custom properties
         * Returns 'dark' or 'light' based on darkreader state
         */
        themeAttr() {
            return this.darkreader ? "dark" : "light"
        }
    },
    components: {
        Reader,
        Scan,
        WizDialog,
        BookmarkPopup,
        ShortcutsPopup,
        SocialBar,
        AmrIcon,
        AmrButton,
        AmrSwitch,
        AmrSlider,
        AmrSelect,
        AmrMenu,
        AmrTooltip
    },
    methods: {
        /** Return drawer background color class (uses CSS custom properties now) */
        backcolor(light = 0) {
            // Map light values to CSS custom property classes
            const lightMap = ["amr-bg-drawer", "amr-bg-drawer-1", "amr-bg-drawer-2", "amr-bg-drawer-3"]
            return lightMap[light] || "amr-bg-drawer"
        },
        /** Record reading session duration to statistics */
        recordReadingSession() {
            if (!this.sessionStartTime) return
            const duration = Math.floor((Date.now() - this.sessionStartTime) / 1000) // duration in seconds
            if (duration > 5) {
                // Only record if session was longer than 5 seconds
                browser.runtime.sendMessage({
                    action: "recordReadingTime",
                    duration: duration,
                    mirror: this.mirror?.mirrorName,
                    chaptersRead: this.chaptersReadInSession
                })
            }
            // Reset to prevent double recording
            this.sessionStartTime = null
        },
        /**
         * Temporary memory watcher for debugging leaks in the reader.
         * Uses performance.memory when available (Chrome/Chromium) and falls
         * back to a heuristic based on scans count in Firefox.
         */
        checkMemoryAndMaybeDump() {
            try {
                let usedMb = null
                const perf = typeof performance !== "undefined" ? performance : null
                if (perf && perf.memory && typeof perf.memory.usedJSHeapSize === "number") {
                    usedMb = perf.memory.usedJSHeapSize / (1024 * 1024)
                }

                const scansState = scansProvider.state || {}
                const totalScans =
                    Array.isArray(scansState.scans) && scansState.scans.length ? scansState.scans.length : 0
                const loadedScans = typeof scansState.loaded === "number" ? scansState.loaded : 0

                const overHeap = usedMb !== null && usedMb >= MEMWATCH_HEAP_MB_THRESHOLD
                const overScans = totalScans >= MEMWATCH_SCAN_THRESHOLD

                // Log a lightweight heartbeat so we can see in the console
                // that MEMWATCH is actually running and what it sees. This
                // only logs a few times to avoid flooding the buffer.
                if (!this.memoryDumpTriggered) {
                    this.memoryWatchTickCount = (this.memoryWatchTickCount || 0) + 1
                    const tick = this.memoryWatchTickCount
                    if (tick <= 5 || tick % 10 === 0) {
                        debug.reader.debug("MEMWATCH tick", {
                            tick,
                            usedMb,
                            totalScans,
                            loadedScans,
                            overHeap,
                            overScans
                        })
                    }
                }

                if ((overHeap || overScans) && !this.memoryDumpTriggered) {
                    this.memoryDumpTriggered = true
                    debug.reader.warn(
                        "MEMWATCH Threshold exceeded, triggering log dump. heapMb=",
                        usedMb,
                        "totalScans=",
                        totalScans,
                        "loadedScans=",
                        loadedScans
                    )
                    const globalAny = globalThis
                    if (globalAny && typeof globalAny.__amrDebugDumpLogs === "function") {
                        const reason =
                            usedMb !== null
                                ? `auto-threshold-${usedMb.toFixed(1)}MB`
                                : `auto-threshold-scans-${totalScans}`
                        globalAny.__amrDebugDumpLogs(reason)
                    } else {
                        debug.reader.warn("MEMWATCH __amrDebugDumpLogs not available; skipping automatic dump.")
                    }
                }
            } catch (e) {
                debug.reader.error("MEMWATCH checkMemoryAndMaybeDump failed", e)
            }
        },
        /** Inform background that current chapter has been read (will update reading state and eventually add manga to list) */
        async consultManga(force) {
            await this.util.consultManga(force)
            await this.loadMangaInformations() // reload last chapter read
            // Increment chapters read in this session
            this.chaptersReadInSession++
        },
        /** Decrement Zoom value */
        zoomOut() {
            this.maxWidthValueStore = Math.max(10, this.maxWidthValueStore - 5)
        },
        /** Increment Zoom value */
        zoomIn() {
            this.maxWidthValueStore = Math.min(100, this.maxWidthValueStore + 5)
        },
        /** Check if current manga is in reading list */
        async checkExists() {
            this.mangaExists = await this.util.mangaExists()
        },
        /** Load the state of the side bar (hidden / shown) */
        async loadBarState() {
            const barState = await browser.runtime.sendMessage({ action: "barState" })
            if (barState) {
                this.drawer = parseInt(barState.barVis) === 1
            }
        },
        /** Load current manga preferences (layout mode, read top, latest read chapter) */
        async loadMangaInformations() {
            //Get specific informations for currentManga (layout mode, reading mode, lastest read chapter)
            let cbook = -1,
                cdirection = -1,
                cfullchapter = -1,
                cresize = -1,
                cscaleup = -1
            const specific = await browser.runtime.sendMessage({
                action: "mangaInfos",
                url: this.pageData.currentMangaURL,
                mirror: this.mirror.mirrorName,
                language: this.pageData.language
            })
            // Save returned manga informations in state
            this.mangaInfos = specific
            if (specific) this.mangaExists = true
            // Compute current layout
            if (specific && specific.layout) {
                // check specific layout for the current manga
                let l = specific.layout
                cscaleup = Math.floor(l / 10000)
                l -= 10000 * cscaleup
                cbook = Math.floor(l / 1000)
                l -= 1000 * cbook
                cdirection = Math.floor(l / 100)
                l -= 100 * cdirection
                cfullchapter = Math.floor(l / 10)
                l -= 10 * cfullchapter
                cresize = l
            }
            //If not use default options mode
            if (cscaleup === -1) cscaleup = this.options.scaleUp
            if (cbook === -1) cbook = this.options.displayBook
            if (cdirection === -1) cdirection = this.options.readingDirection
            if (cfullchapter === -1) cfullchapter = this.options.displayFullChapter
            if (cresize === -1) cresize = this.options.resizeMode
            // Set current layout
            this.scaleUp = cscaleup === 1
            this.book = cbook === 1
            this.direction = cdirection === 0 ? "ltr" : "rtl"
            this.fullchapter = cfullchapter === 1
            this.resize = resize_values[cresize]

            /** Set webtoon and zoom option */
            if (specific) {
                this.webtoonMode = specific.webtoon || false
                this.maxWidthValue = specific.zoom || 100
            }
        },
        /** Load mirror description (containing icon and home page) */
        async loadMirror() {
            this.mirrorDesc = await browser.runtime.sendMessage({
                action: "mirrorInfos",
                name: this.mirror.mirrorName
            })
        },
        /** Load chapters list for current manga */
        async loadChapters() {
            debug.reader.debug(
                "loadChapters called for:",
                this.pageData.currentMangaURL,
                "mirror:",
                this.mirror?.mirrorName
            )

            let alreadyLoadedListChaps = null
            // try to get list chap from background (already loaded in local db)
            try {
                alreadyLoadedListChaps = await browser.runtime.sendMessage({
                    action: "getListChaps",
                    url: this.pageData.currentMangaURL,
                    mirror: this.mirror?.mirrorName,
                    language: this.pageData.language
                })
                debug.reader.debug(
                    "loadChapters - alreadyLoadedListChaps:",
                    alreadyLoadedListChaps
                        ? Array.isArray(alreadyLoadedListChaps)
                            ? alreadyLoadedListChaps.length + " chapters"
                            : typeof alreadyLoadedListChaps
                        : "null/undefined"
                )
            } catch (e) {
                debug.reader.debug("loadChapters - getListChaps error:", e)
            }

            if (alreadyLoadedListChaps && alreadyLoadedListChaps.length > 0) {
                debug.reader.debug(
                    "loadChapters - using cached chapters, count:",
                    alreadyLoadedListChaps.length,
                    "first raw:",
                    JSON.stringify(alreadyLoadedListChaps[0])?.substring(0, 200)
                )
                this.chapters = alreadyLoadedListChaps.map(arr => {
                    return { url: arr[1], title: arr[0] }
                })
                debug.reader.debug(
                    "loadChapters - chapters mapped, count:",
                    this.chapters.length,
                    "first mapped:",
                    JSON.stringify(this.chapters[0])?.substring(0, 200)
                )
            } else {
                let list = []
                // we need to load chapters using background page
                // Try to fetch manga page HTML in content script context (bypasses Cloudflare)
                let htmlContent = undefined
                debug.reader.debug(
                    "loadChapters - no cached chapters, fetching manga page HTML from:",
                    this.pageData.currentMangaURL
                )
                try {
                    let response
                    // Use a timeout so we don't hang forever if the site never
                    // responds or streams content without ending. In that case we
                    // fall back to letting the background page fetch the HTML.
                    if (typeof AbortController !== "undefined") {
                        const controller = new AbortController()
                        const timeoutMs = 30000 // Increased from 15s to 30s for slow connections
                        const timeoutId = setTimeout(() => {
                            try {
                                controller.abort()
                            } catch (abortError) {
                                // Ignore abort errors – we only care that the
                                // promise settles so we can fall back.
                            }
                        }, timeoutMs)
                        try {
                            response = await fetch(this.pageData.currentMangaURL, {
                                signal: controller.signal
                            })
                        } finally {
                            clearTimeout(timeoutId)
                        }
                    } else {
                        // Older environments without AbortController – just
                        // perform a normal fetch.
                        response = await fetch(this.pageData.currentMangaURL)
                    }
                    debug.reader.debug("loadChapters - fetch response status:", response.status, response.ok)
                    if (response.ok) {
                        debug.reader.debug("loadChapters - calling response.text()...")
                        // FIXED: Add timeout to response.text() to prevent infinite hang
                        // Some sites stream content slowly or never finish
                        const textTimeoutMs = 15000 // 15 second timeout for reading body
                        const textPromise = response.text()
                        const textTimeout = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error("response.text() timeout")), textTimeoutMs)
                        })
                        try {
                            htmlContent = await Promise.race([textPromise, textTimeout])
                            debug.reader.debug("loadChapters - fetched HTML length:", htmlContent?.length)
                        } catch (textErr) {
                            debug.reader.debug("loadChapters - response.text() failed:", textErr?.message)
                            htmlContent = undefined
                        }
                    } else {
                        debug.reader.debug("loadChapters - fetch response not OK, status:", response.status)
                    }
                } catch (e) {
                    if (e && e.name === "AbortError") {
                        debug.reader.debug("loadChapters - fetch aborted after timeout")
                    } else {
                        debug.reader.debug("loadChapters - failed to fetch manga page HTML:", e)
                    }
                }
                debug.reader.debug(
                    "loadChapters - sending loadListChaps with htmlContent:",
                    htmlContent ? htmlContent.length + " chars" : "undefined"
                )
                try {
                    list = await browser.runtime.sendMessage({
                        action: "loadListChaps",
                        mirror: this.mirror.mirrorName,
                        url: this.pageData.currentMangaURL,
                        language: this.pageData.language,
                        htmlContent: htmlContent
                    })
                    debug.reader.debug(
                        "loadChapters - loadListChaps response:",
                        list ? (Array.isArray(list) ? list.length + " items" : typeof list) : "null/undefined"
                    )
                } catch (e) {
                    debug.reader.debug("loadChapters - loadListChaps error:", e)
                    list = []
                }
                if (list && typeof list === "object" && !Array.isArray(list)) {
                    // case of returned list is an object keys are languages and values are list of mangas
                    const langs = Object.keys(list || {})
                    debug.reader.debug(
                        "loadChapters - multi-language chapter list object",
                        "availableLangs=",
                        langs,
                        "requestedLang=",
                        this.manga?.language
                    )

                    // Try requested language first, but only if it has non-empty chapters
                    let langKey = null
                    if (
                        this.manga?.language &&
                        Array.isArray(list[this.manga.language]) &&
                        list[this.manga.language].length > 0
                    ) {
                        langKey = this.manga.language
                    }

                    // Fallback: use first available language with non-empty chapters
                    if (!langKey) {
                        langKey = langs.find(k => Array.isArray(list[k]) && list[k].length > 0) || null
                    }

                    if (langKey && Array.isArray(list[langKey]) && list[langKey].length > 0) {
                        this.chapters = list[langKey].map(arr => {
                            return { url: arr[1], title: arr[0] }
                        })
                        debug.reader.debug(
                            "loadChapters - using language list",
                            langKey,
                            "count=",
                            this.chapters.length,
                            langKey !== this.manga?.language ? "(fallback)" : "(requested)"
                        )
                    } else {
                        // No valid language found with chapters
                        this.chapters = []
                        debug.reader.debug("loadChapters - no chapters found in multi-language list, using empty list")
                    }
                } else if (Array.isArray(list) && list.length > 0) {
                    // normal use case, one language
                    this.chapters = list.map(arr => {
                        return { url: arr[1], title: arr[0] }
                    })
                    // Store chapters to database so popup can access them
                    debug.reader.debug(
                        "loadChapters - storing",
                        list.length,
                        "chapters to database for manga:",
                        this.pageData.currentMangaURL
                    )
                    try {
                        await browser.runtime.sendMessage({
                            action: "storeListChaps",
                            url: this.pageData.currentMangaURL,
                            mirror: this.mirror.mirrorName,
                            listChaps: list
                        })
                    } catch (e) {
                        debug.reader.debug("loadChapters - failed to store chapters:", e)
                    }
                } else {
                    // no chapters
                    this.chapters = []
                }
            }
            this.chapters.forEach(chap => {
                if (this.util.matchChapUrl(this.pageData.currentChapterURL, chap.url)) {
                    this.selchap = chap.url
                    pageData.add("currentChapter", chap.title)
                    return false
                }
            })
            if (!this.nextchapLoading && this.chaploaded) {
                // chapters list loading took longer than scans loading... o_O but possible...
                // Preload next chapter
                if (options.prefetch == 1) {
                    this.preloadNextChapter()
                }
            }
        },
        /** Change updating mode for this manga (1 : stop updating, 0 : check updates) */
        async markMangaReadTop(nTop) {
            await this.util.markMangaReadTop(nTop)
            this.loadMangaInformations()
        },
        /** Mark current chapter as latest read in reading list */
        async markAsLatest() {
            if (
                await this.$refs.wizdialog.confirm(
                    this.i18n("content_nav_mark_read"),
                    this.i18n("content_nav_mark_read_confirm")
                )
            ) {
                await this.util.markAsLatest()
                this.loadMangaInformations()
            }
        },
        /** Add the current manga to reading list */
        async addManga() {
            await this.consultManga(true)
            this.mangaExists = true
        },
        /** Remove the current manga from reading list */
        async deleteManga() {
            if (
                await this.$refs.wizdialog.confirm(
                    this.i18n("list_mg_act_delete"),
                    this.i18n("list_mg_delete_question", this.manga.name, this.mirror.mirrorName)
                )
            ) {
                browser.runtime.sendMessage({
                    action: "deleteManga",
                    key: this.mangaInfos.key
                })
                this.mangaExists = false
            }
        },
        /** Try to delete a chapter loader scans from RAM. Will be effectively deleted later by garbage collector */
        deleteChapterLoader(obj) {
            // encapsulate chaploader in object to be able to delete it in sctrict mode
            if (obj.chaploader) {
                // Clean up the scansProvider/scansLoader to release image references
                if (obj.chaploader.scansProvider) {
                    // Clear each scan's image reference
                    for (const scan of obj.chaploader.scansProvider.scans) {
                        if (scan && scan.scan) {
                            scan.scan.src = ""
                            scan.scan = null
                        }
                    }
                    obj.chaploader.scansProvider.scans.length = 0
                    obj.chaploader.scansProvider.onloadchapter = null
                    obj.chaploader.scansProvider.onloadscan = null
                    delete obj.chaploader.scansProvider
                }
                if (obj.chaploader.scansLoader) delete obj.chaploader.scansLoader
                delete obj.chaploader
            }
        },
        /**
         * Switch the current loaded chapter in the reader to another one
         *  - url : the url of the chapter to load
         */
        async loadChapterInReader(url) {
            // add a covering loader
            this.loading = true
            debug.reader.debug("Change Reader chapter : load chapter " + url)
            const chap = new ChapterLoader(url, this.mirror)
            await chap.checkAndLoadInfos() // get is a chapter ?, infos (current manga, chapter) and scans urls
            this.loadChapterInReaderUsingChapterLoader(chap)
        },
        /**
         * Switch the current loaded chapter in the reader to another one
         *  - chapterloader : the chapterloader to load in reader
         */
        async loadChapterInReaderUsingChapterLoader(chapterloader) {
            // delete references to the old chapter loader
            if (window["__current_chapterloader__"] && window["__current_chapterloader__"].url !== chapterloader.url) {
                try {
                    this.deleteChapterLoader({ chaploader: window["__current_chapterloader__"] })
                } catch (e) {
                    debug.reader.warn(
                        "loadChapterInReaderUsingChapterLoader - error deleting __current_chapterloader__:",
                        e
                    )
                }
            }
            if (this.nextChapterLoader && this.nextChapterLoader.url !== chapterloader.url) {
                try {
                    this.deleteChapterLoader({ chaploader: this.nextChapterLoader }) // delete loaded next chapter reference if not navigating to this one
                } catch (e) {
                    debug.reader.warn("loadChapterInReaderUsingChapterLoader - error deleting nextChapterLoader:", e)
                }
            }

            //keep a reference to the one loading
            window["__current_chapterloader__"] = chapterloader

            // reinitialize state of the reader
            this.loading = true
            this.nextChapterLoader = null
            this.nextchapProgress = 0
            this.thinscan = options.thinscan
            this.chaploaded = false
            // change current chapter --> do it now, if not, loadInReader will trigger nextChapterLoad and it will be the current one...
            this.selchap = chapterloader.url
            this.chapters.forEach(chap => {
                if (this.util.matchChapUrl(this.selchap, chap.url)) {
                    pageData.add("currentChapter", chap.title) // actualize chapter name in pageData from chapters list
                    return false
                }
            })

            const done = chapterloader.loadInReader(options)
            if (!done) {
                // loading chapter failed
                // reload chapter so it will be the first time and the restorePage will work properly
                window.location.href = chapterloader.url
            } else {
                // that worked ! scans state and bookmarks state are correctly initialized with new chapter data, pageData with manga url, name and current chapter url too, we now need to tweak the ui

                // prevent pushState from triggering AMR reload
                window["__AMR_IS_LOADING_CHAPTER__"] = true
                // update window history so navigation bar has the right url
                {
                    var chapUrl = new URL(chapterloader.url)
                    // pushState throws if we don't preserve host and protocol
                    chapUrl.host = window.location.host
                    chapUrl.protocol = window.location.protocol

                    window.history.pushState({ title: chapterloader.title }, chapterloader.title, chapUrl.toString())
                }
                // reinitialize all $data props so everything goes well
                this.loadMangaInformations()

                // Reader
                const reader = this.$refs.reader
                reader.originalTitle = chapterloader.title
                document.title = chapterloader.title
                reader.goScan(0)
                window.scroll(0, 0)

                /** Handle help us dialogs once in a while */
                dialogs.handleHelps(this.$refs.wizdialog, this.util)

                // mark manga as read
                if (options.markwhendownload === 0) {
                    this.consultManga()
                }
            }
            this.loading = false
        },
        /** Go read a specific chapter */
        goToChapter() {
            if (this.selchap === null) return
            const cur = this.chapters.findIndex(el => el.url === this.selchap)
            this.loadChapterInReader(this.chapters[cur].url)
        },
        /** Go to next chapter */
        goNextChapter() {
            if (this.lastChapter) {
                // display an alert because there is no next chapter
                this.$refs.wizdialog.temporary(this.i18n("content_nav_last_chap"), 1000, { important: true })
            }
            if (!this.nextChapter) return
            if (!this.options.smoothNavigation) {
                window.location.href = this.nextChapter
            } else if (this.nextchapLoading) {
                this.loadChapterInReaderUsingChapterLoader(this.nextChapterLoader)
            } else {
                this.loadChapterInReader(this.nextChapter)
            }
        },
        /** Go to previous chapter */
        goPreviousChapter() {
            if (this.selchap === null) return false
            if (this.firstChapter) {
                // display an alert because there is no previous chapter
                this.$refs.wizdialog.temporary(this.i18n("reader_alert_firstchapter"), 1000, { important: true })
                return
            }
            const cur = this.chapters.findIndex(el => el.url === this.selchap)
            if (!this.options.smoothNavigation) {
                window.location.href = this.chapters[cur + 1].url
            } else {
                this.loadChapterInReader(this.chapters[cur + 1].url)
            }
        },
        /** Preloads the next chapter scans */
        async preloadNextChapter() {
            if (!this.nextChapter) {
                return
            }
            // Avoid running multiple concurrent preloads
            if (this.preloadNextInProgress) {
                this.util?.debug && this.util.debug("preloadNextChapter already in progress, skipping")
                return
            }
            this.preloadNextInProgress = true
            this.nextchapProgress = 0
            try {
                this.util.debug("Preloading next chapter metadata (no images) " + this.nextChapter)
                // Instantiate a temporary chapter loader for the next chapter
                const loader = new ChapterLoader(this.nextChapter, this.mirror)
                await loader.checkAndLoadInfos() // get is a chapter ?, infos (current manga, chapter) and scans urls
                if (!loader.isAChapter) {
                    this.util.debug("preloadNextChapter: next URL is not recognized as a chapter")
                    // Do not keep a loader around if it is not a valid chapter
                    this.nextChapterLoader = null
                    this.nextchapProgress = 0
                } else {
                    // We only keep metadata (infos + image URLs) and avoid loading all
                    // images into memory ahead of time. Actual image loading will
                    // occur when the user navigates to the next chapter.
                    this.nextChapterLoader = loader
                    this.nextchapProgress = 100
                    this.util.debug(
                        "preloadNextChapter: metadata loaded for next chapter with " +
                            (loader.images ? loader.images.length : 0) +
                            " images (no image prefetch)"
                    )
                }
            } catch (e) {
                debug.reader.error("preloadNextChapter failed", e)
                this.nextChapterLoader = null
                this.nextchapProgress = 0
            } finally {
                this.preloadNextInProgress = false
            }
        },
        /** Handle key shortcuts */
        handlekeys() {
            const registerKeys = e => {
                // Removed deprecated window.event fallback - modern browsers always pass event as parameter
                const t = e.target || e.srcElement
                const prevent = () => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.stopImmediatePropagation()
                }
                if (!((t.type && t.type === "text") || (t.nodeName && t.nodeName.toLowerCase() === "textarea"))) {
                    if (!e.shiftKey && !e.altKey) {
                        if (e.which === 66) {
                            //b
                            // previous chapter
                            this.goPreviousChapter()
                            prevent()
                        }
                        if (e.which === 78) {
                            //n
                            // next chapter
                            this.goNextChapter()
                            prevent()
                        }
                        if (e.which === 112) {
                            //F1
                            this.openShortcuts()
                            prevent()
                        }
                    }
                    if (e.shiftKey && !e.altKey) {
                        // Go to next chapter
                        if (e.which === 39 || e.which === 68) {
                            // shift + d or shift + right arrow
                            this.shouldInvertKeys ? this.goPreviousChapter() : this.goNextChapter()
                            prevent()
                        }
                        // Go to previous chapter
                        if (e.which === 37 || e.which === 65) {
                            // shift + a or shift + left arrow
                            this.shouldInvertKeys ? this.goNextChapter() : this.goPreviousChapter()
                            prevent()
                        }
                        // Toggle drawer
                        if (e.which === 77) {
                            // shift + m
                            this.drawer = !this.drawer
                            prevent()
                        }
                        // Switch resizes mode
                        if (e.which === 67) {
                            // shift + c
                            if (!this.fullchapter) this.resize = "container"
                            prevent()
                        }
                        if (e.which === 87) {
                            // shift + w
                            this.resize = "width"
                            prevent()
                        }
                        if (e.which === 72) {
                            // shift + h
                            if (!this.fullchapter) this.resize = "height"
                            prevent()
                        }
                        // Switch fullchapter
                        if (e.which === 70) {
                            // shift + f
                            this.fullchapter = !this.fullchapter
                            prevent()
                        }
                        // Switch book
                        if (e.which === 66) {
                            // shift + b
                            this.book = !this.book
                            prevent()
                        }
                        // Switch direction
                        if (e.which === 68) {
                            // shift + d
                            this.direction = this.direction === "ltr" ? "rtl" : "ltr"
                            prevent()
                        }
                        // Add manga to reading list
                        if (e.which === 107 || e.which === 187) {
                            // shift + '+'
                            if (!this.mangaExists && this.options.addauto === 0) this.addManga()
                            prevent()
                        }
                        // Remove manga from reading list
                        if (e.which === 109 || e.which === 54) {
                            // shift + '-'
                            if (this.mangaExists) this.deleteManga()
                            prevent()
                        }
                        // Pause / Play notifications on manga
                        if (e.which === 80) {
                            // shift + p
                            if (this.mangaExists && this.mangaInfos) {
                                if (this.mangaInfos.read === 1) this.markMangaReadTop(0)
                                else this.markMangaReadTop(1)
                                prevent()
                            }
                        }
                        // Mark current chapter as latest read
                        if (e.which === 76) {
                            // shift + l
                            if (this.showLatestRead) this.markAsLatest()
                            prevent()
                        }
                        // Reload all errored scans
                        if (e.which === 82) {
                            // alt + r
                            this.reloadErrors()
                            prevent()
                        }
                    }
                    if (e.altKey && !e.shiftKey) {
                        // Toggle fullscreen
                        if (e.which === 70) {
                            // alt + f
                            this.toggleFullScreen()
                            prevent()
                        }
                    }
                    if (e.altKey && !e.shiftKey) {
                        // Display current manga name, chapter name and progression in the manga
                        if (e.which === 67) {
                            // alt + c
                            let chapName = "",
                                chapPos = 0
                            if (this.selchap !== null && this.chapters.length !== 0) {
                                const chap = this.chapters.findIndex(el => el.url === this.selchap)
                                if (chap >= 0) {
                                    chapName = this.chapters[chap].title
                                    chapPos = this.chapters.length - chap
                                }
                            }

                            let str = "**" + this.manga.name + "**\n"
                            str += (chapName === "" ? this.i18n("reader_display_chapname_none") : chapName) + "\n"
                            if (this.chapters.length > 0) {
                                str += this.i18n(
                                    "reader_display_chap_progression",
                                    chapPos,
                                    this.chapters.length,
                                    Math.floor((chapPos / this.chapters.length) * 100)
                                )
                            }

                            this.$refs.wizdialog.temporary(str, 2000)
                            prevent()
                        }
                    }
                    if (e.shiftKey && e.altKey) {
                        // Jump to last chapter
                        if (e.which === 39 || e.which === 68) {
                            // alt + shift + d or alt + shift + right arrow
                            this.selchap = this.chapters[0].url
                            this.goToChapter()
                            prevent()
                        }
                        // Jump to first chapter
                        if (e.which === 37 || e.which === 65) {
                            // alt + shift + a or alt + shift + left arrow
                            this.selchap = this.chapters[this.chapters.length - 1].url
                            this.goToChapter()
                            prevent()
                        }
                        // Go to random chapter
                        if (e.which === 82) {
                            // alt + shift + r
                            this.selchap = this.chapters[Math.floor(Math.random() * this.chapters.length)].url
                            this.goToChapter()
                            prevent()
                        }
                    }
                }
            }
            // Store references for cleanup in beforeUnmount
            this.amrKeydownHandler = registerKeys
            window.addEventListener("keydown", this.amrKeydownHandler, true)

            //disable default websites shortcuts
            const stopProp = e => e.stopImmediatePropagation()
            this.amrKeyupHandler = stopProp
            this.amrKeypressHandler = stopProp
            window.addEventListener("keyup", this.amrKeyupHandler, true)
            window.addEventListener("keypress", this.amrKeypressHandler, true)
        },
        /** Open shortcuts popup */
        openShortcuts() {
            this.$refs.shortcuts.open()
        },
        /** Handle bookmark button click - separate method for event handling */
        handleBookmarkButtonClick(event) {
            debug.reader.debug("handleBookmarkButtonClick() called", event)
            event.stopPropagation()
            event.preventDefault()
            this.bookmarkChapter()
        },
        /** Open popup to bookmark chapter with note */
        bookmarkChapter() {
            debug.reader.debug("bookmarkChapter() called")
            // Close the menu first
            this.bookmarkMenuOpen = false
            // Use nextTick to ensure menu is closed before opening dialog
            this.$nextTick(() => {
                debug.reader.debug("this.$refs.book:", this.$refs.book)
                if (this.$refs.book) {
                    this.$refs.book.open()
                } else {
                    debug.reader.error("BookmarkPopup ref not found!")
                }
            })
        },
        /** Open AMR bookmarks in a new tab */
        openBookmarksTab() {
            browser.runtime.sendMessage({
                action: "opentab",
                url: "/pages/bookmarks/bookmarks.html"
            })
        },
        /** Save current layout options as the default ones */
        async saveOptionsAsDefault(force = false) {
            if (!force) {
                if (
                    !(await this.$refs.wizdialog.confirm(
                        this.i18n("reader_save_options_title"),
                        this.i18n("reader_save_options_confirm")
                    ))
                ) {
                    return
                }
            }
            this.options.displayBook = this.book ? 1 : 0
            this.options.readingDirection = this.direction === "ltr" ? 0 : 1
            this.options.displayFullChapter = this.fullchapter ? 1 : 0
            this.options.resizeMode = resize_values.findIndex(val => val === this.resize)
            this.options.scaleUp = this.scaleUp ? 1 : 0
            this.util.saveOption("displayBook", this.options.displayBook)
            this.util.saveOption("readingDirection", this.options.readingDirection)
            this.util.saveOption("displayFullChapter", this.options.displayFullChapter)
            this.util.saveOption("resizeMode", this.options.resizeMode)
            this.util.saveOption("scaleUp", this.options.scaleUp)
            if (!force) this.$refs.wizdialog.temporary(this.i18n("action_done"))
        },
        /** Reset current layout options to the default ones */
        resetOptionsToDefault() {
            this.book = this.options.displayBook === 1
            this.direction = this.options.readingDirection === 0 ? "ltr" : "rtl"
            this.fullchapter = this.options.displayFullChapter === 1
            this.resize = resize_values[this.options.resizeMode]
            this.scaleUp = this.options.scaleUp === 1
            this.$refs.wizdialog.temporary(this.i18n("action_done"))
        },
        offsetBook() {
            EventBus.$emit("offset-book")
        },
        /** Toggle dark / light theme and save option */
        toggleDark() {
            this.darkreader = !this.darkreader
            // Vuetify 3: use theme.global.name to toggle theme
            this.$vuetify.theme.global.name = this.darkreader ? "dark" : "light"
            this.util.saveOption("darkreader", this.darkreader ? 1 : 0)
        },
        /** Display tips popup */
        displayTips() {
            dialogs.handleTips(this.$refs.wizdialog, true)
        },
        /** Toggle full screen mode */
        toggleFullScreen() {
            if (this.fullscreen) {
                /** Exit full screen mode */
                if (document.exitFullscreen) {
                    document.exitFullscreen()
                } else if (document.mozCancelFullScreen) {
                    /* Firefox */
                    document.mozCancelFullScreen()
                } else if (document.webkitExitFullscreen) {
                    /* Chrome, and Opera */
                    document.webkitExitFullscreen()
                }
            } else {
                /** Request full screen mode */
                const elem = document.documentElement
                if (elem.requestFullscreen) {
                    elem.requestFullscreen()
                } else if (elem.mozRequestFullScreen) {
                    /* Firefox */
                    elem.mozRequestFullScreen()
                } else if (elem.webkitRequestFullscreen) {
                    /* Chrome, and Opera */
                    elem.webkitRequestFullscreen()
                }
            }
            this.fullscreen = !this.fullscreen
        },
        /** Called on reader's creation, display a welcome message first time reader is opened */
        async handleFirstTime() {
            const isfirst = await this.util.getStorage("reader_firsttime")
            if (!isfirst) {
                // Button to set default layout with preferde choice : long strip
                const butlongstrip = {
                    title: this.i18n("reader_firsttime_but_longstrip"),
                    color: "primary",
                    click: ({ agree }) => {
                        this.fullchapter = true
                        this.resize = "width"
                        this.book = window.innerWidth >= 1200 // display as a book is screen is wide enough
                        this.saveOptionsAsDefault(true)
                        agree()
                    }
                }
                // Button to set default layout with preferde choice : single page
                const butsingle = {
                    title: this.i18n("reader_firsttime_but_single"),
                    color: "primary",
                    click: ({ agree }) => {
                        this.fullchapter = false
                        this.resize = window.innerHeight >= 800 ? "container" : "width" // resize container if screen is tall enough
                        this.book = window.innerWidth >= 1200 // display as a book is screen is wide enough
                        this.saveOptionsAsDefault(true)
                        agree()
                    }
                }
                await this.$refs.wizdialog.open(
                    this.i18n("reader_firsttime_title"),
                    this.i18n("reader_firsttime_description"),
                    {
                        cancel: false,
                        buttons: [butlongstrip, butsingle],
                        important: true
                    }
                )
                await this.util.setStorage("reader_firsttime", "true")
            }
        },
        /** Called when a thin scan (height >= 3 * width) is detected */
        async handleThinScan() {
            if (
                this.thinscan === THINSCAN.no_adjust ||
                (!this.book && !["height", "container"].includes(this.resize))
            ) {
                return // parameters are already adapted for thin scans
            }

            if (this.thinscan === THINSCAN.adjust) {
                return this.adjustThinScan()
            }

            // Must be asking user
            const modalResult = await this.$refs.wizdialog.yesno(
                this.i18n("reader_thinscan_title"),
                this.i18n("reader_thinscan_description")
            )

            if (modalResult) {
                this.adjustThinScan()
                this.thinscan = THINSCAN.adjust
            } else {
                this.thinscan = THINSCAN.no_adjust
            }
        },
        adjustThinScan() {
            this.book = false
            if (["height", "container"].includes(this.resize)) {
                this.resize = "width"
            }
        },
        reloadErrors() {
            EventBus.$emit("reload-all-errors")
        },
        async DownloadChapter() {
            this.zip = true
            const DOWNLOAD_TIMEOUT = 60000 // 60 second timeout per image

            try {
                const seriesName =
                    this.mangaInfos && this.mangaInfos.displayName ? this.mangaInfos.displayName : this.manga.name
                const chapterName = this.pageData.currentChapter
                const urls = this.$refs.reader.scansState.scans.map(ele => ele.scan.currentSrc)

                if (!urls || urls.length === 0) {
                    this.$refs.wizdialog.temporary(
                        this.i18n("reader_download_no_images") || "No images to download",
                        3000
                    )
                    this.zip = false
                    return
                }

                const blobWriter = new BlobWriter("application/zip")
                const zipWriter = new ZipWriter(blobWriter)

                for (const [i, url] of urls.entries()) {
                    let ext = "jpg"

                    // Fetch with timeout
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)

                    try {
                        const resp = await fetch(url, { signal: controller.signal })
                        clearTimeout(timeoutId)

                        if (!resp.ok) {
                            debug.reader.warn(`Failed to fetch image ${i + 1}: ${resp.status}`)
                            continue
                        }

                        const content = await resp.blob()
                        const mime = content.type
                        if (mime.indexOf("image") > -1) {
                            if (mimedb[mime] && mimedb[mime].extensions) {
                                ext = mimedb[mime].extensions[0]
                            } else {
                                const match = url.match(/(\.\w{2,4})(?![^?])/)
                                if (match) {
                                    ext = match[1].replace(".", "")
                                }
                            }
                        }
                        const name = `${String(i + 1).padStart(3, "0")}.${ext}`
                        await zipWriter.add(name, new BlobReader(content))
                    } catch (fetchError) {
                        clearTimeout(timeoutId)
                        if (fetchError.name === "AbortError") {
                            debug.reader.warn(`Timeout fetching image ${i + 1}: ${url}`)
                        } else {
                            debug.reader.warn(`Error fetching image ${i + 1}: ${fetchError.message}`)
                        }
                        // Continue with next image instead of failing completely
                    }
                }

                const blob = await zipWriter.close()

                if (blob.size === 0) {
                    this.$refs.wizdialog.temporary(
                        this.i18n("reader_download_failed") || "Download failed - no images could be fetched",
                        3000
                    )
                } else {
                    saveAs(blob, `${seriesName} - ${chapterName}.cbz`)
                    this.$refs.wizdialog.temporary(this.i18n("action_done") || "Download complete", 2000)
                }
            } catch (error) {
                debug.reader.error("Download failed:", error)
                this.$refs.wizdialog.temporary(
                    this.i18n("reader_download_error") || `Download error: ${error.message}`,
                    3000
                )
            } finally {
                this.zip = false
            }
        }
    }
}
</script>

<style data-amr="true">
#amrapp {
    width: 100%;
}

/** Drawer content below menu button */
.amr-drawer {
    padding-top: 36px;
    padding-bottom: 64px;
}

/** Center manga title */
.amr-manga-title div {
    margin-left: auto;
    margin-right: auto;
    text-align: center;
}

/** Align mirror icon */
.amr-manga-title img {
    vertical-align: middle;
}

/** Manga title link - using CSS custom properties for theming */
.amr-manga-title a {
    color: var(--amr-text-primary, #424242);
    text-decoration: none;
    vertical-align: middle;
    word-break: break-word;
    font-weight: bold;
}

/** So the dropdown can hover the rest... */
.amr-chapters-toolbar {
    z-index: 8;
    height: auto !important;
}

.opacity-full {
    opacity: 1;
}

.opacity-transparent {
    opacity: 0.7;
}

/** Floating buttons */
.fab-container {
    position: fixed;
    top: 15px;
    right: 15px;
    z-index: 10;
}

/** Scrollbars style (only works for chrome, firefox does not support that */
::-webkit-scrollbar {
    width: 10px;
}

::-webkit-scrollbar-thumb {
    background: var(--amr-scrollbar-thumb, #ddd);
}

::-webkit-scrollbar-track {
    background: var(--amr-scrollbar-track, #666);
}

/** Loading cover */
.amr-transition-cover {
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    position: fixed;
    opacity: 0.8;
    z-index: 42;
    /* Because when you search for a high z-index, 42 is always the right answer */
    text-align: center;
    display: block;
}

/* Large spinner for transition cover */
.amr-transition-cover .amr-spinner-large {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 128px;
    height: 128px;
    margin-top: -64px;
    margin-left: -64px;
}

/* truncate chapter text in select */
.truncate {
    width: 180px;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

/* disable hover effect for select buttons */
.select-btn::before {
    display: none !important;
}
</style>
