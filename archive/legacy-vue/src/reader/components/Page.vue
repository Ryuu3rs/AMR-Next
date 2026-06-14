<template>
    <tr>
        <!-- Displayed when one scan in page -->
        <!-- CRITICAL FIX: Use scan URL as key to force component recreation when scan changes
             This prevents Vue from reusing Scan components with different src props -->
        <Scan
            :key="scans[0].src"
            :full="true"
            :src="scans[0].src"
            :name="scans[0].name"
            :resize="resize"
            v-if="scans.length === 1"
            :bookmark="bookmark"
            :scaleUp="scaleUp" />

        <!-- Displayed when two scans in page -->
        <Scan
            :key="scans[direction === 'ltr' ? 0 : 1].src"
            :full="false"
            :src="scans[direction === 'ltr' ? 0 : 1].src"
            :name="scans[direction === 'ltr' ? 0 : 1].name"
            :resize="resize"
            class="amr-left-page"
            v-if="scans.length === 2"
            :bookmark="bookmark"
            :scaleUp="scaleUp" />
        <Scan
            :key="scans[direction === 'ltr' ? 1 : 0].src"
            :full="false"
            :src="scans[direction === 'ltr' ? 1 : 0].src"
            :name="scans[direction === 'ltr' ? 1 : 0].name"
            :resize="resize"
            class="amr-right-page"
            v-if="scans.length === 2"
            :bookmark="bookmark"
            :scaleUp="scaleUp" />
    </tr>
</template>

<script>
import Scan from "./Scan"
import EventBus from "../helpers/EventBus"
import { debug } from "../../core/debug"

export default {
    data() {
        return {
            inViewport: false, // true if page or part of page is visible in viewport
            topInViewport: false, // true if top border of page is visible in viewport
            atTop: false, // true if top border is sticked on top of viewport
            bottomInViewport: false, // true if bottom border of page is visible in viewport
            atBottom: false, // true if bottom border is sticked on bottom of viewport
            visibleProportion: 0 // total height in viewport
        }
    },
    props: {
        index: Number /* Index of the page */,
        scans: Array /* List of scans to display */,
        direction: {
            /* Direction of reading */ type: String,
            default: "ltr"
        },
        resize: String /* Resize mode */,
        autoLoad: {
            /* Automatically start loading scans, if not, we need to call loadScan */ type: Boolean,
            default: true
        },
        bookmark: {
            /* Allow to bookmark scans */ type: Boolean,
            default: true
        },
        scaleUp: {
            type: Boolean,
            default: false
        },
        webtoonMode: {
            /* Removes whitespace between images */ type: Boolean,
            default: false
        }
    },
    name: "Page",
    components: { Scan },
    created() {
        debug.reader.trace("Page.created index:", this.index)

        /**
         * Listen for centralized viewport check events (Performance Fix B)
         * Instead of each Page having its own scroll listener, Reader.vue
         * broadcasts a throttled event that all Pages listen to
         */
        EventBus.$on("check-viewport", this.checkInViewPort)
    },
    mounted() {
        debug.reader.trace("Page.mounted index:", this.index)
        // first set in viewport values
        this.$nextTick(() => this.checkInViewPort())
    },
    beforeUnmount() {
        debug.reader.trace("Page.beforeUnmount index:", this.index)
        // Clean up EventBus listener (Performance Fix B)
        EventBus.$off("check-viewport", this.checkInViewPort)
    },
    methods: {
        /**
         * Check which part of the page is in viewport (in height)
         *
         * CRITICAL PERFORMANCE FIX: Replaced DOM traversal loop with getBoundingClientRect()
         * Old code used while(el.offsetParent) which traversed up the DOM tree on EVERY call.
         * With 100 pages × 10 calls/second = 1000 DOM traversals per second.
         * New code uses getBoundingClientRect() which is much faster (single browser API call).
         */
        checkInViewPort() {
            // Use getBoundingClientRect for fast position calculation
            const rect = this.$el.getBoundingClientRect()
            const viewportHeight = window.innerHeight

            // Calculate positions relative to viewport
            const top = rect.top
            const bottom = rect.bottom
            const height = rect.height

            // Check viewport states
            this.inViewport = top < viewportHeight && bottom > 0
            this.bottomInViewport = bottom <= viewportHeight
            this.atBottom = Math.floor(bottom) === Math.floor(viewportHeight)
            this.topInViewport = top >= 0
            this.atTop = Math.floor(top) === 0

            /* Compute visible proportion */
            if (this.bottomInViewport && this.topInViewport) {
                // Fully visible
                this.visibleProportion = height
            } else if (!this.bottomInViewport && this.topInViewport) {
                // Top visible, bottom cut off
                this.visibleProportion = viewportHeight - top
            } else if (this.bottomInViewport && !this.topInViewport) {
                // Bottom visible, top cut off
                this.visibleProportion = bottom
            } else {
                // Viewport is inside the page (page is taller than viewport)
                this.visibleProportion = viewportHeight
            }

            if (this.visibleProportion > viewportHeight / 2) {
                this.$emit("become-current", { index: this.index })
            }
        }
    }
}
</script>

<style data-amr="true">
.amr-scan-container td.amr-right-page {
    text-align: left;
    padding-left: 4px;
}

td.amr-right-page .amr-scan {
    text-align: left;
}

.amr-scan-container td.amr-left-page {
    text-align: right;
    padding-right: 4px;
}

td.amr-left-page .amr-scan {
    text-align: right;
}
</style>
