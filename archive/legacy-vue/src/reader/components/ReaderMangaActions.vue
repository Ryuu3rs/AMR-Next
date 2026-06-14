<template>
    <div class="amr-manga-actions">
        <!-- Bookmarks menu -->
        <AmrMenu location="bottom">
            <template #activator="{ open }">
                <AmrTooltip :text="i18n('content_nav_click_bm')" location="bottom">
                    <AmrButton icon :class="bookstate.booked ? 'amr-btn-yellow' : 'amr-btn-yellow-light'" @click="open">
                        <AmrIcon :icon="icons.mdiStar" />
                    </AmrButton>
                </AmrTooltip>
            </template>
            <div class="amr-bookmark-menu-card">
                <div v-if="bookstate.note" class="amr-bookmark-menu-title">
                    {{ i18n("reader_bookmarked_note", bookstate.note) }}
                </div>
                <div class="amr-bookmark-menu-actions">
                    <AmrButton @click="$emit('bookmark-chapter')" :class="bookstate.booked ? 'amr-btn-yellow' : ''">
                        {{ bookstate.booked ? i18n("reader_update_bookmark") : i18n("reader_add_bookmark") }}
                    </AmrButton>
                    <AmrButton @click="$emit('open-bookmarks-tab')">
                        <AmrIcon :icon="icons.mdiOpenInNew" size="16" />
                        {{ i18n("reader_open_bookmarks") }}
                    </AmrButton>
                </div>
            </div>
        </AmrMenu>
        <!-- Mark as latest read button -->
        <AmrTooltip v-if="showLatestRead" :text="i18n('content_nav_mark_read')" location="bottom">
            <AmrButton icon class="amr-btn-blue" @click="$emit('mark-as-latest')">
                <AmrIcon :icon="icons.mdiPageLast" />
            </AmrButton>
        </AmrTooltip>
        <!-- Delete manga button -->
        <AmrTooltip v-if="mangaExists" :text="i18n('list_mg_act_delete')" location="bottom">
            <AmrButton icon variant="error" @click="$emit('delete-manga')">
                <AmrIcon :icon="icons.mdiDelete" />
            </AmrButton>
        </AmrTooltip>
        <!-- Pause/Play updates button -->
        <AmrTooltip
            v-if="mangaExists && mangaInfos"
            :text="mangaInfos.read === 1 ? i18n('list_mg_act_resume') : i18n('list_mg_act_stop')"
            location="bottom">
            <AmrButton
                icon
                :class="mangaInfos.read === 1 ? 'amr-btn-orange' : 'amr-btn-green'"
                @click="$emit('toggle-read-top')">
                <AmrIcon :icon="mangaInfos.read === 1 ? icons.mdiPause : icons.mdiPlay" />
            </AmrButton>
        </AmrTooltip>
        <!-- Reload errors button -->
        <AmrTooltip :text="i18n('reader_reload_errors')" location="bottom">
            <AmrButton icon class="amr-btn-blue" @click="$emit('reload-errors')">
                <AmrIcon :icon="icons.mdiReplay" />
            </AmrButton>
        </AmrTooltip>
        <!-- Download chapter button -->
        <AmrTooltip :text="i18n('reader_download_chapter')" location="bottom">
            <AmrButton icon class="amr-btn-blue" :loading="zip" @click="$emit('download-chapter')">
                <AmrIcon :icon="icons.mdiDownloadOutline" />
            </AmrButton>
        </AmrTooltip>
    </div>
</template>

<script>
import i18nmixin from "../../mixins/i18n-mixin"
import {
    mdiStar,
    mdiOpenInNew,
    mdiPageLast,
    mdiDelete,
    mdiPause,
    mdiPlay,
    mdiReplay,
    mdiDownloadOutline
} from "@mdi/js"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrTooltip from "./AmrTooltip"
import AmrMenu from "./AmrMenu"

export default {
    name: "ReaderMangaActions",
    mixins: [i18nmixin],
    components: { AmrButton, AmrIcon, AmrTooltip, AmrMenu },
    props: {
        bookstate: { type: Object, required: true },
        darkreader: { type: Boolean, required: true },
        showLatestRead: { type: Boolean, required: true },
        mangaExists: { type: Boolean, default: null },
        mangaInfos: { type: Object, default: null },
        zip: { type: Boolean, default: false }
    },
    data: () => ({
        icons: {
            mdiStar,
            mdiOpenInNew,
            mdiPageLast,
            mdiDelete,
            mdiPause,
            mdiPlay,
            mdiReplay,
            mdiDownloadOutline
        }
    })
}
</script>

<style data-amr="true">
.amr-manga-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 8px;
}

.amr-bookmark-menu-card {
    background-color: var(--amr-surface);
    padding: 12px;
    border-radius: 4px;
    min-width: 200px;
}

.amr-bookmark-menu-title {
    font-size: 14px;
    margin-bottom: 8px;
    color: var(--amr-text-primary);
}

.amr-bookmark-menu-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.amr-btn-yellow {
    background-color: #ffeb3b !important;
    color: #424242 !important;
}

.amr-btn-yellow-light {
    background-color: #fff9c4 !important;
    color: #424242 !important;
}

.amr-btn-blue {
    background-color: #2196f3 !important;
    color: white !important;
}

.amr-btn-green {
    background-color: #4caf50 !important;
    color: white !important;
}

.amr-btn-orange {
    background-color: #ff9800 !important;
    color: white !important;
}
</style>
