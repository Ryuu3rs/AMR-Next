<template>
    <div class="fab-container" @mouseenter="isHovering = true" @mouseleave="isHovering = false">
        <!-- Button to open side drawer -->
        <AmrButton
            :class="['amr-fab-menu', isHovering || drawer ? 'opacity-full' : 'opacity-transparent']"
            icon
            size="small"
            variant="error"
            @click="$emit('toggle-drawer')">
            <AmrIcon :icon="icons.mdiMenu" />
        </AmrButton>
        <!-- Quick button to go to next chapter (loading) -->
        <AmrTooltip
            :text="
                i18n('list_mg_act_next') +
                ' ' +
                (nextchapLoading ? i18n('reader_loading', Math.floor(nextchapProgress)) : '')
            "
            location="left">
            <div v-show="!lastChapter && nextchapLoading && !drawer && isHovering" class="amr-progress-circular mt-2">
                <svg class="amr-progress-svg" viewBox="0 0 42 42">
                    <circle class="amr-progress-track" cx="21" cy="21" r="18" fill="none" stroke-width="3" />
                    <circle
                        class="amr-progress-bar amr-progress-green"
                        cx="21"
                        cy="21"
                        r="18"
                        fill="none"
                        stroke-width="3"
                        :stroke-dasharray="113"
                        :stroke-dashoffset="113 - (nextchapProgress / 100) * 113" />
                </svg>
                <AmrButton icon size="small" class="amr-progress-btn text-green" @click.stop="$emit('go-next-chapter')">
                    <AmrIcon :icon="shouldInvertKeys ? icons.mdiChevronLeft : icons.mdiChevronRight" />
                </AmrButton>
            </div>
        </AmrTooltip>
        <!-- Quick button to go to next chapter (not loading) -->
        <AmrTooltip :text="i18n('list_mg_act_next')" location="left">
            <div
                v-show="!lastChapter && !nextchapLoading && !drawer && isHovering"
                class="amr-progress-circular amr-indeterminate mt-2">
                <svg class="amr-progress-svg" viewBox="0 0 42 42">
                    <circle
                        class="amr-progress-bar amr-progress-red"
                        cx="21"
                        cy="21"
                        r="18"
                        fill="none"
                        stroke-width="3" />
                </svg>
                <AmrButton icon size="small" class="amr-progress-btn text-red" @click.stop="$emit('go-next-chapter')">
                    <AmrIcon :icon="shouldInvertKeys ? icons.mdiChevronLeft : icons.mdiChevronRight" />
                </AmrButton>
            </div>
        </AmrTooltip>
        <!-- Last chapter warning -->
        <AmrTooltip :text="i18n('content_nav_last_chap')" location="left">
            <AmrButton v-show="isHovering && !drawer && lastChapter" icon size="small" class="mt-2 amr-btn-orange">
                <AmrIcon :icon="icons.mdiAlert" />
            </AmrButton>
        </AmrTooltip>
        <!-- Quick button to add a manga to reading list -->
        <AmrTooltip :text="i18n('content_nav_add_list')" location="left">
            <AmrButton
                v-show="!mangaExists && addauto === 0 && isHovering && !drawer"
                icon
                size="small"
                class="mt-2"
                variant="success"
                @click.stop="$emit('add-manga')">
                <AmrIcon :icon="icons.mdiPlus" />
            </AmrButton>
        </AmrTooltip>
    </div>
</template>

<script>
import i18nmixin from "../../mixins/i18n-mixin"
import { mdiMenu, mdiChevronRight, mdiChevronLeft, mdiAlert, mdiPlus } from "@mdi/js"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrTooltip from "./AmrTooltip"

export default {
    name: "ReaderFloatingButtons",
    mixins: [i18nmixin],
    components: { AmrButton, AmrIcon, AmrTooltip },
    props: {
        drawer: { type: Boolean, required: true },
        lastChapter: { type: Boolean, required: true },
        nextchapLoading: { type: Boolean, required: true },
        nextchapProgress: { type: Number, required: true },
        shouldInvertKeys: { type: Boolean, required: true },
        mangaExists: { type: Boolean, default: null },
        addauto: { type: Number, default: 0 }
    },
    data: () => ({
        isHovering: false,
        icons: {
            mdiMenu,
            mdiChevronRight,
            mdiChevronLeft,
            mdiAlert,
            mdiPlus
        }
    })
}
</script>

<style data-amr="true">
.fab-container {
    position: fixed;
    top: 15px;
    right: 15px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.opacity-full {
    opacity: 1;
}

.opacity-transparent {
    opacity: 0.7;
}

.mt-2 {
    margin-top: 8px;
}

.amr-progress-circular {
    position: relative;
    width: 42px;
    height: 42px;
}

.amr-progress-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
}

.amr-progress-track {
    stroke: rgba(255, 255, 255, 0.2);
}

.amr-progress-bar {
    transition: stroke-dashoffset 0.3s ease;
}

.amr-progress-green {
    stroke: #81c784;
}

.amr-progress-red {
    stroke: #c62828;
}

.amr-indeterminate .amr-progress-svg {
    animation: spin 1.5s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.amr-progress-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.text-green {
    color: #4caf50;
}

.text-red {
    color: #f44336;
}

.amr-btn-orange {
    background-color: #ff9800 !important;
    color: white !important;
}
</style>
