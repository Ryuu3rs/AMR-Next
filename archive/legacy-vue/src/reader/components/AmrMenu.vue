<template>
    <div class="amr-menu-wrapper" ref="wrapper">
        <!-- Activator slot -->
        <div class="amr-menu-activator" @click="toggle" ref="activator">
            <slot name="activator" :props="{ onClick: toggle }"></slot>
        </div>
        <!-- Menu content -->
        <Teleport to="body">
            <Transition name="amr-menu">
                <div
                    v-if="isOpen"
                    class="amr-menu"
                    :class="locationClass"
                    :style="menuStyle"
                    ref="menu"
                    @click="closeOnClick && close()">
                    <slot></slot>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script>
/**
 * AmrMenu - Lightweight dropdown menu component
 *
 * Replaces Vuetify's v-menu with a minimal implementation.
 *
 * Usage:
 *   <AmrMenu>
 *       <template #activator="{ props }">
 *           <AmrButton v-bind="props">Open Menu</AmrButton>
 *       </template>
 *       <div class="amr-menu-item" @click="action1">Option 1</div>
 *       <div class="amr-menu-item" @click="action2">Option 2</div>
 *   </AmrMenu>
 */
export default {
    name: "AmrMenu",
    emits: ["update:modelValue"],
    props: {
        modelValue: {
            type: Boolean,
            default: undefined
        },
        location: {
            type: String,
            default: "bottom",
            validator: v => ["top", "bottom", "left", "right"].includes(v)
        },
        closeOnClick: {
            type: Boolean,
            default: true
        },
        offset: {
            type: Number,
            default: 4
        }
    },
    data() {
        return {
            internalOpen: false,
            position: { top: 0, left: 0 }
        }
    },
    computed: {
        isOpen() {
            return this.modelValue !== undefined ? this.modelValue : this.internalOpen
        },
        locationClass() {
            return `amr-menu--${this.location}`
        },
        menuStyle() {
            return {
                top: `${this.position.top}px`,
                left: `${this.position.left}px`
            }
        }
    },
    methods: {
        toggle() {
            if (this.isOpen) {
                this.close()
            } else {
                this.open()
            }
        },
        open() {
            this.updatePosition()
            if (this.modelValue !== undefined) {
                this.$emit("update:modelValue", true)
            } else {
                this.internalOpen = true
            }
            document.addEventListener("click", this.handleOutsideClick)
            document.addEventListener("keydown", this.handleEscape)
        },
        close() {
            if (this.modelValue !== undefined) {
                this.$emit("update:modelValue", false)
            } else {
                this.internalOpen = false
            }
            document.removeEventListener("click", this.handleOutsideClick)
            document.removeEventListener("keydown", this.handleEscape)
        },
        updatePosition() {
            this.$nextTick(() => {
                const activator = this.$refs.activator
                if (!activator) return
                const rect = activator.getBoundingClientRect()
                const offset = this.offset

                switch (this.location) {
                    case "bottom":
                        this.position = { top: rect.bottom + offset, left: rect.left }
                        break
                    case "top":
                        this.position = { top: rect.top - offset, left: rect.left }
                        break
                    case "left":
                        this.position = { top: rect.top, left: rect.left - offset }
                        break
                    case "right":
                        this.position = { top: rect.top, left: rect.right + offset }
                        break
                }
            })
        },
        handleOutsideClick(e) {
            if (!this.$refs.wrapper?.contains(e.target) && !this.$refs.menu?.contains(e.target)) {
                this.close()
            }
        },
        handleEscape(e) {
            if (e.key === "Escape") this.close()
        }
    },
    beforeUnmount() {
        document.removeEventListener("click", this.handleOutsideClick)
        document.removeEventListener("keydown", this.handleEscape)
    }
}
</script>

<style>
.amr-menu-wrapper {
    display: inline-block;
    position: relative;
}
.amr-menu-activator {
    display: inline-block;
}

.amr-menu {
    position: fixed;
    background-color: var(--amr-bg-surface, #ffffff);
    border-radius: 4px;
    box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14),
        0 3px 14px 2px rgba(0, 0, 0, 0.12);
    z-index: 2400;
    min-width: 150px;
    max-height: 300px;
    overflow-y: auto;
    padding: 8px 0;
}

.amr-menu-item {
    padding: 8px 16px;
    cursor: pointer;
    color: var(--amr-text-primary, #212121);
    transition: background-color 100ms ease;
}

.amr-menu-item:hover {
    background-color: var(--amr-bg-tertiary, #f5f5f5);
}

/* Transition */
.amr-menu-enter-active,
.amr-menu-leave-active {
    transition: opacity 100ms ease, transform 100ms ease;
}
.amr-menu-enter-from,
.amr-menu-leave-to {
    opacity: 0;
    transform: scale(0.95);
}
</style>
