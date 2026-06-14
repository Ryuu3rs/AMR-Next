<template>
    <div class="amr-select" :class="{ 'amr-select--disabled': disabled }">
        <label v-if="label" class="amr-select__label">{{ label }}</label>
        <select
            class="amr-select__input"
            :value="modelValue"
            :disabled="disabled"
            @change="$emit('update:modelValue', $event.target.value)">
            <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
            <option v-for="item in normalizedItems" :key="item.value" :value="item.value">
                {{ item.title }}
            </option>
        </select>
        <span class="amr-select__arrow">▼</span>
    </div>
</template>

<script>
/**
 * AmrSelect - Lightweight select dropdown component
 *
 * Replaces Vuetify's v-select with native HTML select.
 *
 * Usage:
 *   <AmrSelect v-model="selected" :items="['Option 1', 'Option 2']" />
 *   <AmrSelect v-model="chapter" :items="chapters" item-title="name" item-value="url" />
 */
export default {
    name: "AmrSelect",
    emits: ["update:modelValue"],
    props: {
        /**
         * Bound value (v-model)
         */
        modelValue: {
            type: [String, Number, Object],
            default: null
        },
        /**
         * Array of items (strings or objects)
         */
        items: {
            type: Array,
            default: () => []
        },
        /**
         * Property name for item title (when items are objects)
         */
        itemTitle: {
            type: String,
            default: "title"
        },
        /**
         * Property name for item value (when items are objects)
         */
        itemValue: {
            type: String,
            default: "value"
        },
        /**
         * Label text
         */
        label: {
            type: String,
            default: null
        },
        /**
         * Placeholder text
         */
        placeholder: {
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
    },
    computed: {
        /**
         * Normalize items to { title, value } format
         */
        normalizedItems() {
            return this.items.map(item => {
                if (typeof item === "string" || typeof item === "number") {
                    return { title: item, value: item }
                }
                return {
                    title: item[this.itemTitle] ?? item.title ?? item.name ?? String(item),
                    value: item[this.itemValue] ?? item.value ?? item
                }
            })
        }
    }
}
</script>

<style>
.amr-select {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
    width: 100%;
}

.amr-select--disabled {
    opacity: 0.5;
}

.amr-select__label {
    font-size: 12px;
    color: var(--amr-text-secondary, #757575);
}

.amr-select__input {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    padding: 8px 32px 8px 12px;
    font-size: 14px;
    color: var(--amr-text-primary, #212121);
    background-color: var(--amr-bg-surface, #ffffff);
    border: 1px solid var(--amr-border, #e0e0e0);
    border-radius: 4px;
    cursor: pointer;
    outline: none;
    transition: border-color 150ms ease;
}

.amr-select__input:hover:not(:disabled) {
    border-color: var(--amr-primary, #1976d2);
}

.amr-select__input:focus {
    border-color: var(--amr-primary, #1976d2);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
}

.amr-select__arrow {
    position: absolute;
    right: 12px;
    bottom: 10px;
    font-size: 10px;
    color: var(--amr-text-secondary, #757575);
    pointer-events: none;
}

/* Dark theme adjustments */
#amrapp[data-theme="dark"] .amr-select__input {
    background-color: var(--amr-bg-secondary);
    border-color: var(--amr-border);
}
</style>
