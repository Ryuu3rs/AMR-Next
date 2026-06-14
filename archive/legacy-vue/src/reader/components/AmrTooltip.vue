<template>
    <div class="amr-tooltip-wrapper" @mouseenter="show" @mouseleave="hide" @focus="show" @blur="hide">
        <slot></slot>
        <Transition name="amr-tooltip">
            <div v-if="isVisible" class="amr-tooltip" :class="locationClass" role="tooltip">
                <slot name="content">{{ text }}</slot>
            </div>
        </Transition>
    </div>
</template>

<script>
/**
 * AmrTooltip - Lightweight tooltip component
 *
 * Replaces Vuetify's v-tooltip with a minimal CSS-based implementation.
 *
 * Usage:
 *   <AmrTooltip text="Click to save">
 *       <AmrButton icon><AmrIcon :icon="mdiSave" /></AmrButton>
 *   </AmrTooltip>
 *
 *   <AmrTooltip location="bottom">
 *       <AmrButton>Hover me</AmrButton>
 *       <template #content>Custom <b>HTML</b> content</template>
 *   </AmrTooltip>
 */
export default {
    name: "AmrTooltip",
    props: {
        /**
         * Tooltip text content
         */
        text: {
            type: String,
            default: ""
        },
        /**
         * Position of tooltip relative to target
         */
        location: {
            type: String,
            default: "top",
            validator: v => ["top", "bottom", "left", "right"].includes(v)
        },
        /**
         * Delay before showing (ms)
         */
        delay: {
            type: Number,
            default: 200
        },
        /**
         * Disable the tooltip
         */
        disabled: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            isVisible: false,
            timeoutId: null
        }
    },
    computed: {
        locationClass() {
            return `amr-tooltip--${this.location}`
        }
    },
    methods: {
        show() {
            if (this.disabled) return
            this.timeoutId = setTimeout(() => {
                this.isVisible = true
            }, this.delay)
        },
        hide() {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId)
                this.timeoutId = null
            }
            this.isVisible = false
        }
    },
    beforeUnmount() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }
    }
}
</script>

<style>
.amr-tooltip-wrapper {
    display: inline-block;
    position: relative;
}

.amr-tooltip {
    position: absolute;
    background-color: rgba(33, 33, 33, 0.9);
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 2600;
    pointer-events: none;
}

/* Position variants */
.amr-tooltip--top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
}

.amr-tooltip--bottom {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
}

.amr-tooltip--left {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 8px;
}

.amr-tooltip--right {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 8px;
}

/* Transition */
.amr-tooltip-enter-active,
.amr-tooltip-leave-active {
    transition: opacity 150ms ease;
}

.amr-tooltip-enter-from,
.amr-tooltip-leave-to {
    opacity: 0;
}
</style>
