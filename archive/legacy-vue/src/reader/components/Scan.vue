<template>
    <td
        :class="{ xs6: !full, xs12: full, 'res-w': resizeW(), 'res-h': resizeH(), 'scale-up': scaleUp }"
        class="scanContainer"
        :colspan="full ? 2 : 1">
        <!-- Progress while loading -->
        <div class="amr-scan-loading" v-show="loading">
            <div class="amr-spinner"></div>
        </div>
        <!-- Copy image warning dialog -->
        <AmrDialog v-model="copyImageToClipboardWarning" :width="400">
            <div class="amr-scan-warning-text">{{ i18n("reader_context_menu_copy_img_warning_dialog") }}</div>
            <template #actions>
                <AmrButton variant="primary" @click="copyImageToClipboardWarning = false">
                    {{ i18n("button_close") }}
                </AmrButton>
            </template>
        </AmrDialog>
        <!-- The Scan container ! -->
        <div ref="scanDiv" class="amr-scan" v-show="!loading && !error" @contextmenu="show"></div>
        <!-- Context menu -->
        <div
            v-if="showMenu"
            class="amr-context-menu"
            :style="{ left: x + 'px', top: y + 'px' }"
            @click="showMenu = false">
            <div class="amr-context-menu-item" @click="bookmarkScan">
                {{
                    scanbooked ? i18n("reader_context_menu_manage_bookmark") : i18n("reader_context_menu_add_bookmark")
                }}
            </div>
            <div
                class="amr-context-menu-item"
                v-clipboard="src"
                v-clipboard:success="copySuccess"
                v-clipboard:error="copyError">
                {{ i18n("reader_context_menu_copy_url") }}
            </div>
            <div class="amr-context-menu-item" @click="copyIMG">
                {{ i18n("reader_context_menu_copy_img") }}
            </div>
            <div class="amr-context-menu-item" @click="reloadScan(true)">
                {{ i18n("reader_context_menu_reload_image") }}
            </div>
            <div class="amr-context-menu-item" @click="downloadImage">
                {{ i18n("reader_context_menu_download_image") }}
            </div>
        </div>
        <div v-if="showMenu" class="amr-context-menu-backdrop" @click="showMenu = false"></div>
        <!-- Error try to reload button -->
        <div class="amr-scan-error" v-if="error && !loading">
            <AmrTooltip text="Click to try reloading scan" location="bottom">
                <AmrButton icon size="large" variant="primary" @click="reloadScan" :data-src="src">
                    <AmrIcon :icon="icons.mdiImageBroken" />
                </AmrButton>
            </AmrTooltip>
        </div>
        <!-- Snackbar -->
        <div v-if="snackbarShow" :class="['amr-snackbar', 'amr-snackbar-' + snackbarColor]">
            {{ snackbarText }}
        </div>
    </td>
</template>

<script>
import bookmarks from "../state/bookmarks"
import { scansProvider } from "../helpers/ScansProvider"
import EventBus from "../helpers/EventBus"
// Note: scansProvider.getScanByUrl() is used for O(1) lookups (Performance Fix A)
import i18n from "../../amr/i18n"
import { i18nmixin } from "../../mixins/i18n-mixin"
import { mdiImageBroken } from "@mdi/js"
import { isFirefox } from "../../shared/utils"
import { saveAs } from "../helpers/util"
import { debug } from "../../core/debug"
import AmrDialog from "./AmrDialog"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrTooltip from "./AmrTooltip"

export default {
    mixins: [i18nmixin],
    components: { AmrDialog, AmrButton, AmrIcon, AmrTooltip },
    data() {
        return {
            bookstate: bookmarks.state /* bookmarks state */,
            scansProvider: scansProvider.state /* scans Provider, where the HTMLImage is loaded */,
            showMenu: false,
            copyImageToClipboardWarning: false,
            x: 0,
            y: 0,
            snackbarShow: false,
            snackbarText: "",
            snackbarColor: "",
            snackbarTimeout: 3500,
            icons: { mdiImageBroken }
        }
    },
    props: {
        src: String /* source url of the scan */,
        name: String /* name of the scan (it's 1-based index) */,
        full: {
            /* is the scan displayed full page or half */ type: Boolean,
            default: false
        },
        resize: String /* resize mode (width, height, container, none) */,
        autoLoad: {
            /* Does the scan starts loading image automatically */ type: Boolean,
            default: true
        },
        bookmark: {
            /* Allow bookmarking */ type: Boolean,
            default: true
        },
        scaleUp: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        /* the scan (loaded through scansProvider) - O(1) lookup via Map (Performance Fix A)
         * CRITICAL FIX: Access scansProvider.state.scansMap directly so Vue can track reactivity.
         * Previously called scansProvider.getScanByUrl() which didn't establish proper dependency.
         */
        scan() {
            // Access the reactive Map directly to establish Vue dependency tracking
            return this.scansProvider.scansMap.get(this.src) || null
        },
        /* is currently loading */
        loading() {
            if (!this.scan) return true
            return this.scan.loading
        },
        /* is the scan rendering error */
        error() {
            if (!this.scan) return false
            return this.scan.error
        },
        /** we need to watch for loading, error and src and call the refreshing method once, so this property is here to detect changes for these three computed properties and call changes once */
        mixed() {
            return (this.loading ? "1" : "0") + (this.error ? "1" : "0") + this.src
        },
        /**
         * Combined bookmark data lookup (Performance Fix G + Critical Fix)
         *
         * CRITICAL PERFORMANCE FIX: Use Map for O(1) lookup instead of find()
         * Old code: this.bookstate.scans.find(sc => sc.url === this.src)
         * This was O(n) for each Scan component, accessed multiple times per render
         * For 100 scans × 3 accesses (bookmarkData, scanbooked, note) = 300 linear searches
         *
         * New code: Use scansMap.get() for O(1) lookup
         */
        bookmarkData() {
            return this.bookstate.scansMap.get(this.src) || null
        },
        /* is the scan bookmarked ? */
        scanbooked() {
            return this.bookmarkData?.booked || false
        },
        /* the bookmark note */
        note() {
            return this.bookmarkData?.note
        }
    },
    watch: {
        /* watch if loading, error or src changed, reload image */
        mixed() {
            this.$nextTick(() => this.insertScanInDOM())
        }
    },
    mounted() {
        /* Display image if already loaded */
        if (!this.loading) this.$nextTick(() => this.insertScanInDOM())
    },
    created() {
        debug.reader.trace("Scan.created src:", this.src?.substring(0, 50))
        /* Event from side bar to reload all errored scans */
        EventBus.$on("reload-all-errors", this.reloadScan)
    },
    beforeUnmount() {
        debug.reader.trace("Scan.beforeUnmount src:", this.src?.substring(0, 50))
        EventBus.$off("reload-all-errors", this.reloadScan)
    },
    methods: {
        setImgError: function (e) {
            this.snackbarText = i18n("reader_snackbar_img_error", e)
            this.snackbarColor = "error"
            this.snackbarShow = true
        },
        async copyIMG() {
            if (typeof ClipboardItem === "undefined" && isFirefox()) {
                this.copyImageToClipboardWarning = true
                return
            }

            if (!navigator.clipboard) {
                this.setImgError("navigator.clipboard is not supported")
                return
            }

            try {
                const url = this.scan.scan.currentSrc
                const response = await fetch(url)
                const blob = await response.blob()
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
                this.snackbarText = i18n("reader_snackbar_img_success")
                this.snackbarColor = "success"
                this.snackbarShow = true
            } catch (e) {
                this.setImgError(e)
            }
        },

        async downloadImage() {
            const url = this.scan.scan.currentSrc
            fetch(url)
                .then(async response => {
                    const blob = await response.blob()
                    const name = url.split("/").pop().split("#")[0].split("?")[0]
                    saveAs(blob, name)
                })
                .catch(e => debug.reader.error("Download image failed:", e))
        },
        /* check if we need to fit width */
        resizeW() {
            return ["width", "container"].includes(this.resize)
        },
        /* check if we need to fit height */
        resizeH() {
            return ["height", "container"].includes(this.resize)
        },
        /** Tell scansProvider to retry scan */
        reloadScan(force = false) {
            if (this.error || force) this.scan.load()
        },
        /**
         * Loads the scan, only called on nexttick so all computed properties have been refreshed
         * (Performance Fix F) - Only update DOM if image actually changed to avoid layout thrashing
         */
        insertScanInDOM() {
            /** Do not load image in DOM if image is still loading */
            if (this.loading) return

            const scanDiv = this.$refs.scanDiv
            if (!scanDiv) return

            const existingImg = scanDiv.querySelector("img")
            const image = this.scan?.scan

            // If there's an error or no underlying image yet, just remove any existing image
            if (this.error || !image) {
                if (existingImg) {
                    scanDiv.removeChild(existingImg)
                }
                return
            }

            // If the correct image is already in this container, nothing to do
            if (existingImg === image) {
                return
            }

            // Detach the image from any previous parent before reusing it
            if (image.parentNode && image.parentNode !== scanDiv) {
                image.parentNode.removeChild(image)
            }

            // Remove any existing different image in this container
            if (existingImg && existingImg !== image) {
                scanDiv.removeChild(existingImg)
            }

            // Append the scan image if it's not already attached to this container
            if (image.parentNode !== scanDiv) {
                scanDiv.appendChild(image)
            }
        },
        /** Open bookmarks dialog */
        bookmarkScan(e) {
            EventBus.$emit("open-bookmarks", { scanUrl: this.src })
            // e.stopPropagation();
        },
        show(e) {
            e.preventDefault()
            this.showMenu = false
            this.x = e.clientX
            this.y = e.clientY
            this.$nextTick(() => {
                this.showMenu = true
            })
        },
        copySuccess() {
            this.snackbarText = i18n("reader_snackbar_copyurl_success")
            this.snackbarColor = "success"
            this.snackbarShow = true
        },
        copyError() {
            this.snackbarText = i18n("reader_snackbar_copyurl_error")
            this.snackbarColor = "error"
            this.snackbarShow = true
        }
    }
}
</script>

<style data-amr="true">
td.scanContainer.xs6 {
    width: 50%;
}

td.scanContainer.xs12 {
    width: 100%;
}

.scanContainer.res-w img {
    max-width: 100%;
}

.scanContainer.res-h img {
    max-height: 100vh;
}

.scanContainer.scale-up img {
    object-fit: contain;
}

.scanContainer.res-w.scale-up img {
    width: 100%;
}

.scanContainer.res-h.scale-up img {
    height: 100vh;
}

/* Positioning bookmark button */
.amr-scan {
    position: relative;
    text-align: center;
    transition: all 0.2s;
}

.amr-left-page.scale-up img {
    object-position: right;
}

.amr-right-page.scale-up img {
    object-position: left;
}

/* Loading spinner */
.amr-scan-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
}

.amr-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(244, 67, 54, 0.3);
    border-top-color: #f44336;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* Error state */
.amr-scan-error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
}

/* Context menu */
.amr-context-menu {
    position: fixed;
    z-index: 1000;
    background-color: var(--amr-surface);
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    min-width: 180px;
}

.amr-context-menu-item {
    padding: 10px 16px;
    cursor: pointer;
    color: var(--amr-text-primary);
}

.amr-context-menu-item:hover {
    background-color: var(--amr-hover);
}

.amr-context-menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
}

/* Snackbar */
.amr-snackbar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 4px;
    color: white;
    z-index: 1001;
    animation: fadeIn 0.3s ease;
}

.amr-snackbar-success {
    background-color: #4caf50;
}

.amr-snackbar-error {
    background-color: #f44336;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
}

.amr-scan-warning-text {
    padding: 16px 0;
    color: var(--amr-text-primary);
}
</style>
