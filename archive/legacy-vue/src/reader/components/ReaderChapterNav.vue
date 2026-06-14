<template>
    <div class="amr-chapter-nav-row">
        <div class="amr-chapters-toolbar">
            <div class="amr-chapter-nav-content">
                <!-- Previous chapter button -->
                <AmrTooltip :text="prevTooltip" location="bottom">
                    <AmrButton
                        class="select-btn"
                        size="small"
                        v-show="shouldInvertKeys ? !lastChapter : !firstChapter"
                        @click.stop="onPrevClick">
                        <AmrIcon :icon="icons.mdiChevronLeft" />
                    </AmrButton>
                </AmrTooltip>
                <!-- List of chapters -->
                <AmrSelect
                    :modelValue="selchap"
                    :items="chapters"
                    itemTitle="title"
                    itemValue="url"
                    class="amr-chapter-select truncate"
                    @update:modelValue="$emit('go-to-chapter', $event)" />
                <div class="amr-spacer"></div>
                <!-- Next chapter button -->
                <AmrTooltip :text="nextTooltip" location="bottom">
                    <AmrButton
                        class="select-btn"
                        size="small"
                        v-show="shouldInvertKeys ? !firstChapter : !lastChapter"
                        @click.stop="onNextClick">
                        <AmrIcon :icon="icons.mdiChevronRight" />
                    </AmrButton>
                </AmrTooltip>
            </div>
        </div>
        <!-- Next chapter preloading progression bar -->
        <div class="amr-chapter-progress-cont">
            <AmrTooltip :text="i18n('reader_loading', Math.floor(nextchapProgress))" location="bottom">
                <div
                    v-show="nextchapLoading"
                    class="amr-progress-linear"
                    :style="{ width: nextchapProgress + '%' }"></div>
            </AmrTooltip>
        </div>
    </div>
</template>

<script>
import i18nmixin from "../../mixins/i18n-mixin"
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js"
import AmrTooltip from "./AmrTooltip"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrSelect from "./AmrSelect"

export default {
    name: "ReaderChapterNav",
    mixins: [i18nmixin],
    components: { AmrTooltip, AmrButton, AmrIcon, AmrSelect },
    props: {
        chapters: { type: Array, required: true },
        selchap: { type: String, default: null },
        firstChapter: { type: Boolean, required: true },
        lastChapter: { type: Boolean, required: true },
        shouldInvertKeys: { type: Boolean, required: true },
        nextchapLoading: { type: Boolean, required: true },
        nextchapProgress: { type: Number, required: true }
    },
    data: () => ({
        icons: { mdiChevronLeft, mdiChevronRight }
    }),
    computed: {
        prevTooltip() {
            if (this.shouldInvertKeys) {
                return (
                    this.i18n("list_mg_act_next") +
                    " " +
                    (this.nextchapLoading ? this.i18n("reader_loading", Math.floor(this.nextchapProgress)) : "")
                )
            }
            return this.i18n("list_mg_act_prev")
        },
        nextTooltip() {
            if (this.shouldInvertKeys) {
                return this.i18n("list_mg_act_prev")
            }
            return (
                this.i18n("list_mg_act_next") +
                " " +
                (this.nextchapLoading ? this.i18n("reader_loading", Math.floor(this.nextchapProgress)) : "")
            )
        }
    },
    methods: {
        onPrevClick() {
            if (this.shouldInvertKeys) {
                this.$emit("go-next-chapter")
            } else {
                this.$emit("go-previous-chapter")
            }
        },
        onNextClick() {
            if (this.shouldInvertKeys) {
                this.$emit("go-previous-chapter")
            } else {
                this.$emit("go-next-chapter")
            }
        }
    }
}
</script>

<style data-amr="true">
.amr-chapter-nav-row {
    width: 100%;
}

.amr-chapters-toolbar {
    z-index: 8;
    background-color: var(--amr-surface);
    padding: 4px 8px;
}

.amr-chapter-nav-content {
    display: flex;
    align-items: center;
    gap: 4px;
}

.amr-spacer {
    flex: 1;
}

.amr-chapter-progress-cont {
    width: 100%;
    height: 3px;
    background-color: rgba(0, 0, 0, 0.1);
}

.amr-progress-linear {
    height: 3px;
    background-color: #c62828;
    transition: width 0.3s ease;
}

.amr-chapter-select {
    flex: 1;
    max-width: 200px;
}

.truncate {
    width: 180px;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

.select-btn::before {
    display: none !important;
}
</style>
