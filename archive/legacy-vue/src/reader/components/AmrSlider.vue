<template>
    <div class="amr-slider" :class="{ 'amr-slider--disabled': disabled }">
        <label v-if="label" class="amr-slider__label">{{ label }}</label>
        <div class="amr-slider__container">
            <input
                type="range"
                class="amr-slider__input"
                :value="modelValue"
                :min="min"
                :max="max"
                :step="step"
                :disabled="disabled"
                @input="$emit('update:modelValue', Number($event.target.value))" />
            <span v-if="showValue" class="amr-slider__value">{{ modelValue }}{{ valueSuffix }}</span>
        </div>
    </div>
</template>

<script>
/**
 * AmrSlider - Lightweight range slider component
 *
 * Replaces Vuetify's v-slider with native HTML range input.
 *
 * Usage:
 *   <AmrSlider v-model="zoom" :min="10" :max="100" />
 *   <AmrSlider v-model="volume" label="Volume" show-value value-suffix="%" />
 */
export default {
    name: "AmrSlider",
    emits: ["update:modelValue"],
    props: {
        /**
         * Bound value (v-model)
         */
        modelValue: {
            type: Number,
            default: 50
        },
        /**
         * Minimum value
         */
        min: {
            type: Number,
            default: 0
        },
        /**
         * Maximum value
         */
        max: {
            type: Number,
            default: 100
        },
        /**
         * Step increment
         */
        step: {
            type: Number,
            default: 1
        },
        /**
         * Label text
         */
        label: {
            type: String,
            default: null
        },
        /**
         * Show current value
         */
        showValue: {
            type: Boolean,
            default: false
        },
        /**
         * Suffix for value display (e.g., "%")
         */
        valueSuffix: {
            type: String,
            default: ""
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
.amr-slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
}

.amr-slider--disabled {
    opacity: 0.5;
}

.amr-slider__label {
    font-size: 12px;
    color: var(--amr-text-secondary, #757575);
}

.amr-slider__container {
    display: flex;
    align-items: center;
    gap: 8px;
}

.amr-slider__input {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--amr-bg-tertiary, #e0e0e0);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.amr-slider__input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--amr-primary, #1976d2);
    border-radius: 50%;
    cursor: pointer;
    transition: transform 150ms ease;
}

.amr-slider__input::-webkit-slider-thumb:hover {
    transform: scale(1.2);
}

.amr-slider__input::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--amr-primary, #1976d2);
    border: none;
    border-radius: 50%;
    cursor: pointer;
}

.amr-slider__input:focus-visible {
    outline: 2px solid var(--amr-primary, #1976d2);
    outline-offset: 2px;
}

.amr-slider__value {
    min-width: 40px;
    text-align: right;
    font-size: 12px;
    color: var(--amr-text-secondary, #757575);
}
</style>
