<template>
    <div class="amr-settings-container">
        <!-- Display mode switches -->
        <div class="amr-settings-row">
            <div class="amr-settings-col-6">
                <AmrSwitch
                    :modelValue="book"
                    @update:modelValue="$emit('update:book', $event)"
                    :label="i18n('reader_book_mode')" />
            </div>
            <div class="amr-settings-col-6">
                <AmrSwitch
                    :modelValue="fullchapter"
                    @update:modelValue="$emit('update:fullchapter', $event)"
                    :label="i18n('reader_full_chapter')" />
            </div>
        </div>
        <!-- Direction and scale switches -->
        <div class="amr-settings-row">
            <div class="amr-settings-col-6">
                <AmrSwitch
                    :modelValue="direction === 'rtl'"
                    @update:modelValue="$emit('update:direction', $event ? 'rtl' : 'ltr')"
                    :label="i18n('reader_rtl')" />
            </div>
            <div class="amr-settings-col-6">
                <AmrSwitch
                    :modelValue="scaleUp"
                    @update:modelValue="$emit('update:scaleUp', $event)"
                    :label="i18n('reader_scale_up')" />
            </div>
        </div>
        <!-- Webtoon mode -->
        <div class="amr-settings-row">
            <div class="amr-settings-col-12">
                <AmrSwitch
                    :modelValue="webtoonMode"
                    @update:modelValue="$emit('update:webtoonMode', $event)"
                    :label="i18n('reader_webtoon_mode')" />
            </div>
        </div>
        <!-- Resize mode buttons -->
        <div class="amr-settings-row amr-mt-2">
            <div class="amr-btn-toggle">
                <AmrTooltip :text="i18n('reader_resize_width')" location="bottom">
                    <AmrButton
                        :class="{ 'amr-btn-active': resize === 'width' }"
                        size="small"
                        @click="$emit('update:resize', 'width')">
                        <AmrIcon :icon="icons.mdiArrowExpandHorizontal" />
                    </AmrButton>
                </AmrTooltip>
                <AmrTooltip :text="i18n('reader_resize_height')" location="bottom">
                    <AmrButton
                        :class="{ 'amr-btn-active': resize === 'height' }"
                        size="small"
                        :disabled="fullchapter"
                        @click="$emit('update:resize', 'height')">
                        <AmrIcon :icon="icons.mdiArrowExpandVertical" />
                    </AmrButton>
                </AmrTooltip>
                <AmrTooltip :text="i18n('reader_resize_container')" location="bottom">
                    <AmrButton
                        :class="{ 'amr-btn-active': resize === 'container' }"
                        size="small"
                        :disabled="fullchapter"
                        @click="$emit('update:resize', 'container')">
                        <AmrIcon :icon="icons.mdiArrowExpandAll" />
                    </AmrButton>
                </AmrTooltip>
                <AmrTooltip :text="i18n('reader_resize_none')" location="bottom">
                    <AmrButton
                        :class="{ 'amr-btn-active': resize === 'none' }"
                        size="small"
                        @click="$emit('update:resize', 'none')">
                        <AmrIcon :icon="icons.mdiBorderNoneVariant" />
                    </AmrButton>
                </AmrTooltip>
            </div>
        </div>
        <!-- Zoom slider -->
        <div
            class="amr-settings-row amr-mt-2 amr-zoom-row"
            v-show="showMaxWidth && !['height', 'none'].includes(resize)">
            <AmrButton icon size="small" @click="$emit('zoom-out')">
                <AmrIcon :icon="icons.mdiMinusCircle" />
            </AmrButton>
            <AmrSlider
                :modelValue="maxWidthValue"
                @update:modelValue="$emit('update:maxWidthValue', $event)"
                :min="10"
                :max="100"
                class="amr-zoom-slider" />
            <AmrButton icon size="small" @click="$emit('zoom-in')">
                <AmrIcon :icon="icons.mdiPlusCircle" />
            </AmrButton>
        </div>
        <!-- Toggle zoom slider button -->
        <div class="amr-settings-row amr-mt-1 amr-center">
            <AmrButton
                icon
                size="small"
                @click="$emit('toggle-max-width')"
                :disabled="['height', 'none'].includes(resize)">
                <AmrIcon :icon="icons.mdiMagnify" />
            </AmrButton>
        </div>
    </div>
</template>

<script>
import i18nmixin from "../../mixins/i18n-mixin"
import {
    mdiArrowExpandHorizontal,
    mdiArrowExpandVertical,
    mdiArrowExpandAll,
    mdiBorderNoneVariant,
    mdiPlusCircle,
    mdiMinusCircle,
    mdiMagnify
} from "@mdi/js"
import AmrSwitch from "./AmrSwitch"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrTooltip from "./AmrTooltip"
import AmrSlider from "./AmrSlider"

export default {
    name: "ReaderSettings",
    mixins: [i18nmixin],
    components: { AmrSwitch, AmrButton, AmrIcon, AmrTooltip, AmrSlider },
    props: {
        book: { type: Boolean, required: true },
        fullchapter: { type: Boolean, required: true },
        direction: { type: String, required: true },
        scaleUp: { type: Boolean, required: true },
        webtoonMode: { type: Boolean, required: true },
        resize: { type: String, required: true },
        showMaxWidth: { type: Boolean, required: true },
        maxWidthValue: { type: Number, required: true }
    },
    data: () => ({
        icons: {
            mdiArrowExpandHorizontal,
            mdiArrowExpandVertical,
            mdiArrowExpandAll,
            mdiBorderNoneVariant,
            mdiPlusCircle,
            mdiMinusCircle,
            mdiMagnify
        }
    })
}
</script>

<style data-amr="true">
.amr-settings-container {
    padding: 8px;
}

.amr-settings-row {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
}

.amr-settings-col-6 {
    flex: 0 0 50%;
}

.amr-settings-col-12 {
    flex: 0 0 100%;
}

.amr-mt-1 {
    margin-top: 4px;
}

.amr-mt-2 {
    margin-top: 8px;
}

.amr-center {
    justify-content: center;
}

.amr-btn-toggle {
    display: flex;
    gap: 2px;
}

.amr-btn-toggle .amr-btn {
    border-radius: 0;
}

.amr-btn-toggle .amr-btn:first-child {
    border-radius: 4px 0 0 4px;
}

.amr-btn-toggle .amr-btn:last-child {
    border-radius: 0 4px 4px 0;
}

.amr-btn-active {
    background-color: var(--amr-primary) !important;
    color: white !important;
}

.amr-zoom-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.amr-zoom-slider {
    flex: 1;
}
</style>
