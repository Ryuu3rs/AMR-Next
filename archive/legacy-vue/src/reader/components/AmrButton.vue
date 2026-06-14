<template>
    <button
        class="amr-btn"
        :class="buttonClasses"
        :style="buttonStyle"
        :disabled="disabled || loading"
        :type="type"
        @click="$emit('click', $event)">
        <span v-if="loading" class="amr-btn__loader">
            <span class="amr-spinner amr-spinner--btn"></span>
        </span>
        <span v-else class="amr-btn__content">
            <slot></slot>
        </span>
    </button>
</template>

<script>
/**
 * AmrButton - Lightweight button component
 *
 * Replaces Vuetify's v-btn with a minimal implementation.
 *
 * Usage:
 *   <AmrButton @click="doSomething">Click me</AmrButton>
 *   <AmrButton variant="primary" icon>
 *       <AmrIcon :icon="mdiMenu" />
 *   </AmrButton>
 *   <AmrButton size="small" variant="error">Delete</AmrButton>
 */
export default {
    name: "AmrButton",
    emits: ["click"],
    props: {
        /**
         * Button variant/color
         */
        variant: {
            type: String,
            default: "default",
            validator: v => ["default", "primary", "success", "warning", "error", "info"].includes(v)
        },
        /**
         * Button size
         */
        size: {
            type: String,
            default: "default",
            validator: v => ["small", "default", "large"].includes(v)
        },
        /**
         * Icon-only button (circular)
         */
        icon: {
            type: Boolean,
            default: false
        },
        /**
         * Disabled state
         */
        disabled: {
            type: Boolean,
            default: false
        },
        /**
         * Loading state (shows spinner)
         */
        loading: {
            type: Boolean,
            default: false
        },
        /**
         * Custom color (CSS color value)
         */
        color: {
            type: String,
            default: null
        },
        /**
         * Button type attribute
         */
        type: {
            type: String,
            default: "button"
        },
        /**
         * Elevation level (0-3)
         */
        elevation: {
            type: [Number, String],
            default: 1
        }
    },
    computed: {
        buttonClasses() {
            const classes = []

            // Variant
            if (this.variant !== "default") {
                classes.push(`amr-btn--${this.variant}`)
            }

            // Size
            if (this.size !== "default") {
                classes.push(`amr-btn--${this.size}`)
            }

            // Icon button
            if (this.icon) {
                classes.push("amr-btn--icon")
            }

            // Elevation
            const elev = parseInt(this.elevation, 10)
            if (elev > 0 && elev <= 3) {
                classes.push(`amr-btn--elevation-${elev}`)
            }

            // Loading
            if (this.loading) {
                classes.push("amr-btn--loading")
            }

            return classes
        },
        buttonStyle() {
            if (this.color) {
                return {
                    backgroundColor: this.color,
                    color: "white"
                }
            }
            return null
        }
    }
}
</script>

<style>
/* Button spinner */
.amr-spinner--btn {
    width: 18px;
    height: 18px;
    border-width: 2px;
}

/* Elevation variants */
.amr-btn--elevation-1 {
    box-shadow: var(--amr-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.12));
}
.amr-btn--elevation-2 {
    box-shadow: var(--amr-shadow-md, 0 3px 6px rgba(0, 0, 0, 0.15));
}
.amr-btn--elevation-3 {
    box-shadow: var(--amr-shadow-lg, 0 10px 20px rgba(0, 0, 0, 0.15));
}

/* Loading state */
.amr-btn--loading {
    position: relative;
    pointer-events: none;
}

.amr-btn__loader {
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Large size */
.amr-btn--large {
    padding: 12px 24px;
    font-size: 16px;
    min-width: 48px;
    min-height: 48px;
}
</style>
