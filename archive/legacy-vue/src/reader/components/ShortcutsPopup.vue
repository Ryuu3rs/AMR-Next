<template>
    <AmrDialog v-model="dialog" :width="800" title="">
        <template #header>
            <div class="amr-shortcuts-header">{{ i18n("reader_shortcuts_title") }}</div>
        </template>
        <div class="amr-shortcuts-section-title">{{ i18n("reader_shortcuts_section_chapters") }}</div>
        <shortcuts :items="shortcuts_chapter" />
        <div class="amr-shortcuts-section-title">{{ i18n("reader_shortcuts_section_manga") }}</div>
        <shortcuts :items="shortcuts_manga" />
        <div class="amr-shortcuts-section-title">{{ i18n("reader_shortcuts_section_layout") }}</div>
        <shortcuts :items="shortcuts_layout" />
        <div class="amr-shortcuts-section-title">{{ i18n("reader_shortcuts_section_actions") }}</div>
        <shortcuts :items="shortcuts_actions" />
        <template #actions>
            <AmrButton @click="dialog = false">{{ i18n("button_close") }}</AmrButton>
        </template>
    </AmrDialog>
</template>

<script>
import Shortcuts from "./Shortcuts"
import AmrDialog from "./AmrDialog"
import AmrButton from "./AmrButton"
import { i18nmixin } from "../../mixins/i18n-mixin"

const alt = "Alt",
    shift = "Shift"
export default {
    mixins: [i18nmixin],
    components: { Shortcuts, AmrDialog, AmrButton },
    data() {
        return {
            dialog: false /* display or not dialog */,
            shortcuts_chapter: [
                // shortcuts linked to chapter navigation
                { keys: [["←↑↓→"], ["wasd"]], i18n: "reader_shortcut_arrows" },
                { keys: [["+"], ["-"]], i18n: "reader_shortcut_zoom" },
                { keys: [[alt, "s"]], i18n: "reader_shortcut_info_scan" },
                {
                    keys: [
                        [alt, "←"],
                        [alt, "→"],
                        [alt, "a"],
                        [alt, "d"]
                    ],
                    i18n: "reader_shortcut_first_last_scan"
                },
                { keys: [[alt, "r"]], i18n: "reader_shortcut_random_scan" },
                { keys: [[shift, "r"]], i18n: "reader_shortcut_reload_errors" },
                { keys: [["Space"]], i18n: "reader_shortcut_magic_scroll" }
            ],
            shortcuts_manga: [
                // shortcuts linked to manga navigation
                {
                    keys: [["b"], ["n"], [shift, "a"], [shift, "d"], [shift, "←"], [shift, "→"]],
                    i18n: "reader_shortcut_chapters_nextprevious"
                },
                { keys: [[alt, "c"]], i18n: "reader_shortcut_info_chapter" },
                {
                    keys: [
                        [alt, shift, "←"],
                        [alt, shift, "→"],
                        [alt, shift, "a"],
                        [alt, shift, "d"]
                    ],
                    i18n: "reader_shortcut_first_last_chapter"
                },
                { keys: [[alt, shift, "r"]], i18n: "reader_shortcut_random_chapter" }
            ],
            shortcuts_layout: [
                // shortcuts linked to layout options
                { keys: [[alt, "f"]], i18n: "reader_shortcut_toggle_fullscreen" },
                { keys: [[shift, "m"]], i18n: "reader_shortcut_layout_drawer" },
                {
                    keys: [
                        [shift, "w"],
                        [shift, "h"],
                        [shift, "c"]
                    ],
                    i18n: "reader_shortcut_layout_resize"
                },
                { keys: [[shift, "f"]], i18n: "reader_shortcut_layout_fullchapter" },
                { keys: [[shift, "b"]], i18n: "reader_shortcut_layout_book" },
                { keys: [[shift, "d"]], i18n: "reader_shortcut_layout_direction" }
            ],
            shortcuts_actions: [
                // shortcuts linked to manga actions
                { keys: [[shift, "+"]], i18n: "reader_shortcut_action_add" },
                { keys: [[shift, "-"]], i18n: "reader_shortcut_action_remove" },
                { keys: [[shift, "p"]], i18n: "reader_shortcut_action_play_pause" },
                { keys: [[shift, "l"]], i18n: "reader_shortcut_action_mark_latest" }
            ]
        }
    },
    methods: {
        open() {
            this.dialog = true
        }
    }
}
</script>

<style data-amr="true">
.amr-shortcuts-header {
    font-size: 18px;
    font-weight: 500;
    color: var(--amr-text-primary);
}

.amr-shortcuts-section-title {
    font-size: 16px;
    font-weight: 500;
    padding: 12px 0;
    color: var(--amr-text-primary);
}
</style>
