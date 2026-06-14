<template>
    <div class="amr-shortcuts-container">
        <div v-for="(item, i) in items" :key="i" class="amr-shortcut-line">
            <div class="amr-shortcut-keys">
                <div class="amr-shortcut" v-for="(shortcut, s) in item.keys" :key="s">
                    <div class="amr-shortcut-key" v-for="(key, k) in shortcut" :key="k">
                        {{ key }}
                    </div>
                </div>
            </div>
            <div class="amr-shortcut-desc">
                {{ i18n(item.i18n) }}
            </div>
        </div>
    </div>
</template>

<script>
import { i18nmixin } from "../../mixins/i18n-mixin"

export default {
    mixins: [i18nmixin],
    props: {
        items: Array
    },
    name: "Shortcuts"
}
</script>

<style data-amr="true">
.amr-shortcuts-container {
    padding: 0;
}

.amr-shortcut-line {
    display: flex;
    align-items: center;
    padding: 4px 0;
}

.amr-shortcut-keys {
    flex: 0 0 33.33%;
    text-align: right;
    padding-right: 12px;
}

.amr-shortcut-desc {
    flex: 0 0 66.67%;
}

.amr-shortcut {
    display: inline-block;
    background-color: #aaa;
    padding: 2px 1px;
    border-radius: 2px;
    margin: 2px;
    line-height: 0;
}

.amr-shortcut-key {
    display: inline-block;
    background-color: #424242;
    color: white;
    font-size: 1.1rem;
    padding: 2px 5px;
    min-width: 19px;
    border-radius: 2px;
    margin: 0px 1px;
    text-align: center;
    line-height: 1.5;
}
</style>
