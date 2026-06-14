<template>
    <Teleport to="body">
        <Transition name="amr-dialog">
            <div v-if="modelValue" class="amr-dialog-overlay" @click.self="closeOnBackdrop && close()">
                <div class="amr-dialog" :class="sizeClass" :style="dialogStyle" role="dialog" aria-modal="true">
                    <div v-if="$slots.header || title" class="amr-dialog__header">
                        <slot name="header">
                            <h3 class="amr-dialog__title">{{ title }}</h3>
                        </slot>
                        <button v-if="showClose" class="amr-dialog__close" @click="close" aria-label="Close">✕</button>
                    </div>
                    <div class="amr-dialog__content">
                        <slot></slot>
                    </div>
                    <div v-if="$slots.actions" class="amr-dialog__actions">
                        <slot name="actions"></slot>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script>
/**
 * AmrDialog - Lightweight modal dialog component
 *
 * Replaces Vuetify's v-dialog with a minimal implementation.
 *
 * Usage:
 *   <AmrDialog v-model="showDialog" title="Confirm Action">
 *       <p>Are you sure?</p>
 *       <template #actions>
 *           <AmrButton @click="showDialog = false">Cancel</AmrButton>
 *           <AmrButton variant="primary" @click="confirm">OK</AmrButton>
 *       </template>
 *   </AmrDialog>
 */
export default {
    name: "AmrDialog",
    emits: ["update:modelValue"],
    props: {
        modelValue: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            default: null
        },
        size: {
            type: String,
            default: "default",
            validator: v => ["small", "default", "large", "fullscreen"].includes(v)
        },
        width: {
            type: [String, Number],
            default: null
        },
        showClose: {
            type: Boolean,
            default: true
        },
        closeOnBackdrop: {
            type: Boolean,
            default: true
        },
        persistent: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        sizeClass() {
            return `amr-dialog--${this.size}`
        },
        dialogStyle() {
            if (this.width) {
                const w = typeof this.width === "number" ? `${this.width}px` : this.width
                return { width: w, maxWidth: w }
            }
            return null
        }
    },
    methods: {
        close() {
            if (!this.persistent) {
                this.$emit("update:modelValue", false)
            }
        }
    },
    watch: {
        modelValue(val) {
            if (val) {
                document.body.style.overflow = "hidden"
            } else {
                document.body.style.overflow = ""
            }
        }
    },
    beforeUnmount() {
        document.body.style.overflow = ""
    }
}
</script>

<style>
/* Dialog overlay (backdrop) */
.amr-dialog-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2500;
    padding: 16px;
}

/* Dialog container */
.amr-dialog {
    background-color: var(--amr-bg-surface, #ffffff);
    border-radius: 8px;
    box-shadow: 0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14);
    max-height: calc(100vh - 32px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* Size variants */
.amr-dialog--small {
    width: 300px;
    max-width: 90vw;
}
.amr-dialog--default {
    width: 500px;
    max-width: 90vw;
}
.amr-dialog--large {
    width: 800px;
    max-width: 90vw;
}
.amr-dialog--fullscreen {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    border-radius: 0;
}

/* Header */
.amr-dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--amr-border, #e0e0e0);
}

.amr-dialog__title {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    color: var(--amr-text-primary, #212121);
}

.amr-dialog__close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--amr-text-secondary, #757575);
    padding: 4px 8px;
    border-radius: 4px;
}

.amr-dialog__close:hover {
    background-color: var(--amr-bg-tertiary, #f5f5f5);
}

/* Content */
.amr-dialog__content {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
    color: var(--amr-text-primary, #212121);
}

/* Actions footer */
.amr-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
    border-top: 1px solid var(--amr-border, #e0e0e0);
}

/* Transition */
.amr-dialog-enter-active,
.amr-dialog-leave-active {
    transition: opacity 150ms ease;
}
.amr-dialog-enter-from,
.amr-dialog-leave-to {
    opacity: 0;
}
</style>
