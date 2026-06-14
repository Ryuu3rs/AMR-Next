<template>
    <AmrDialog v-model="dialog" :width="500">
        <template #header>
            <span class="amr-bookmark-title">{{ i18n("bookmark_popup_title") }}</span>
        </template>
        <div class="amr-bookmark-text">
            {{
                !scanName
                    ? i18n("bookmark_chapter_text", chapterName, mangaName, mirrorName)
                    : i18n("bookmark_chapter_scan", scanName, chapterName, mangaName, mirrorName)
            }}
        </div>
        <div class="amr-bookmark-note-container">
            <label class="amr-bookmark-note-label">{{ i18n("bookmark_popup_note") }}</label>
            <textarea class="amr-bookmark-textarea" v-model="note" rows="3"></textarea>
        </div>
        <template #actions>
            <AmrButton @click="cancel">{{ i18n("button_cancel") }}</AmrButton>
            <AmrButton v-show="alreadyBookmarked" variant="error" @click="deleteBookmark"
                >{{ i18n("button_delete") }}
            </AmrButton>
            <AmrButton variant="primary" @click="saveBookmark">{{ i18n("button_save") }}</AmrButton>
        </template>
    </AmrDialog>
</template>

<script>
import { i18nmixin } from "../../mixins/i18n-mixin"
import pageData from "../state/pagedata"
import bookmarks from "../state/bookmarks"
import { debug } from "../../core/debug"
import AmrDialog from "./AmrDialog"
import AmrButton from "./AmrButton"

export default {
    mixins: [i18nmixin],
    components: { AmrDialog, AmrButton },
    props: {
        mirror: Object
    },
    data() {
        return {
            resolve: null,
            reject: null,
            dialog: false /* state of the popup : opened / closed */,

            alreadyBookmarked: false /* true if object already bookmarked */,
            note: "" /* The note to add to the bookmark */,
            scanUrl: String /* The url of the scan. If null, bookmark the chapter */,
            scanName: String /* The name of the scan. */,

            pageData: pageData.state /* Set pageDate in state so it's reactive */
        }
    },
    computed: {
        /** Return the current mirror name */
        mirrorName() {
            return this.mirror.mirrorName
        },
        /** Return the current chapter name */
        chapterName() {
            return this.pageData.currentChapter
        },
        /** Return the current manga name */
        mangaName() {
            return this.pageData.name
        }
    },
    methods: {
        /** Open the bookmark dialog with options (default chapter, with scanUrl : corresponding scan) */
        open({ scanUrl } = {}) {
            debug.ui.debug("BookmarkPopup.open() called", { scanUrl })
            this.dialog = true
            this.scanUrl = scanUrl
            if (scanUrl) {
                const sc = bookmarks.getScan(scanUrl)
                this.note = sc.note
                this.scanName = sc.name
                this.alreadyBookmarked = sc.booked
            } else {
                this.note = bookmarks.state.note
                this.alreadyBookmarked = bookmarks.state.booked
                this.scanName = undefined
            }
            debug.ui.debug("BookmarkPopup dialog state:", this.dialog)
            return new Promise((resolve, reject) => {
                this.resolve = resolve
                this.reject = reject
            })
        },
        async saveBookmark() {
            await bookmarks.saveBookmark({
                note: this.note,
                scanName: this.scanName,
                scanUrl: this.scanUrl
            })
            this.agree()
        },
        async deleteBookmark() {
            await bookmarks.deleteBookmark({
                scanUrl: this.scanUrl
            })
            this.agree()
        },
        agree() {
            this.resolve(true)
            this.dialog = false
        },
        cancel() {
            this.resolve(false)
            this.dialog = false
        }
    }
}
</script>

<style data-amr="true">
.amr-bookmark-title {
    font-size: 20px;
    font-weight: 500;
    color: var(--amr-text-primary);
}

.amr-bookmark-text {
    margin-bottom: 16px;
    color: var(--amr-text-secondary);
}

.amr-bookmark-note-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.amr-bookmark-note-label {
    font-size: 12px;
    color: var(--amr-text-secondary);
}

.amr-bookmark-textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--amr-border);
    border-radius: 4px;
    background-color: var(--amr-surface);
    color: var(--amr-text-primary);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
}

.amr-bookmark-textarea:focus {
    outline: none;
    border-color: var(--amr-primary);
}
</style>
