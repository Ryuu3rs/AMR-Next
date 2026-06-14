<template>
    <label class="amr-switch" :class="{ 'amr-switch--disabled': disabled }">
        <input
            type="checkbox"
            class="amr-switch__input"
            :checked="modelValue"
            :disabled="disabled"
            @change="$emit('update:modelValue', $event.target.checked)" />
        <span class="amr-switch__track">
            <span class="amr-switch__thumb"></span>
        </span>
        <span v-if="label" class="amr-switch__label">{{ label }}</span>
        <slot></slot>
    </label>
</template>

<script>
/**
 * AmrSwitch - Lightweight toggle switch component
 *
 * Replaces Vuetify's v-switch with a minimal CSS-only implementation.
 *
 * Usage:
 *   <AmrSwitch v-model="isEnabled" label="Enable feature" />
 *   <AmrSwitch v-model="darkMode">Dark Mode</AmrSwitch>
 */
export default {
    name: "AmrSwitch",
    emits: ["update:modelValue"],
    props: {
        /**
         * Bound value (v-model)
         */
        modelValue: {
            type: Boolean,
            default: false
        },
        /**
         * Label text
         */
        label: {
            type: String,
            default: null
        },
        /**
         * Disabled state
         */
        disabled: {
            type: Boolean,
            default: false
        }
    }
}
</script>

<style>
/* Switch container */
.amr-switch {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
    gap: 8px;
    min-height: 32px;
}

.amr-switch--disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Hide native checkbox */
.amr-switch__input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
}

/* Track (the pill-shaped background) */
.amr-switch__track {
    position: relative;
    width: 36px;
    height: 20px;
    background-color: var(--amr-bg-tertiary, #e0e0e0);
    border-radius: 10px;
    transition: background-color 150ms ease;
    flex-shrink: 0;
}

/* Thumb (the circle that moves) */
.amr-switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    transition: transform 150ms ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Checked state */
.amr-switch__input:checked + .amr-switch__track {
    background-color: var(--amr-primary, #1976d2);
}

.amr-switch__input:checked + .amr-switch__track .amr-switch__thumb {
    transform: translateX(16px);
}

/* Focus state */
.amr-switch__input:focus-visible + .amr-switch__track {
    outline: 2px solid var(--amr-primary, #1976d2);
    outline-offset: 2px;
}

/* Label */
.amr-switch__label {
    color: var(--amr-text-primary, #212121);
    font-size: 14px;
}
</style>
