<template>
    <svg class="amr-icon" :class="sizeClass" :style="colorStyle" viewBox="0 0 24 24" role="img" aria-hidden="true">
        <path :d="icon" fill="currentColor" />
    </svg>
</template>

<script>
/**
 * AmrIcon - Lightweight SVG icon component
 *
 * Replaces Vuetify's v-icon with a minimal implementation.
 * Uses the same @mdi/js icon paths.
 *
 * Usage:
 *   <AmrIcon :icon="mdiMenu" />
 *   <AmrIcon :icon="mdiMenu" size="small" color="red" />
 *   <AmrIcon :icon="mdiMenu" :size="32" />
 */
export default {
    name: "AmrIcon",
    props: {
        /**
         * SVG path data from @mdi/js
         */
        icon: {
            type: String,
            required: true
        },
        /**
         * Icon size - can be 'small', 'default', 'large', 'x-large' or a number (pixels)
         */
        size: {
            type: [String, Number],
            default: "default"
        },
        /**
         * Icon color - CSS color value or CSS variable
         */
        color: {
            type: String,
            default: null
        }
    },
    computed: {
        sizeClass() {
            if (typeof this.size === "number") {
                return null // Use inline style instead
            }
            const sizeMap = {
                small: "amr-icon--small",
                default: "",
                large: "amr-icon--large",
                "x-large": "amr-icon--xlarge"
            }
            return sizeMap[this.size] || ""
        },
        colorStyle() {
            const styles = {}

            // Handle numeric size
            if (typeof this.size === "number") {
                styles.width = `${this.size}px`
                styles.height = `${this.size}px`
            }

            // Handle color
            if (this.color) {
                styles.color = this.color
            }

            return styles
        }
    }
}
</script>

<style>
/* Base icon styles */
.amr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    transition: color var(--amr-transition-fast, 150ms ease);
}

/* Size variants */
.amr-icon--small {
    width: 18px;
    height: 18px;
}

.amr-icon--large {
    width: 32px;
    height: 32px;
}

.amr-icon--xlarge {
    width: 48px;
    height: 48px;
}
</style>
