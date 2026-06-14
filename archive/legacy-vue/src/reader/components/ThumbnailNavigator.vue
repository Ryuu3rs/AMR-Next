<template>
    <div class="amr-thumbs-scrollable">
        <!-- Lightweight thumbnails: no Page/Scan components, just clickable page-number pills -->
        <AmrTooltip
            v-for="(scans, i) in thumbnails"
            :key="i"
            :text="displayPageScansIndexes(scans.index)"
            location="top">
            <div
                :class="['amr-pages-page-cont', { current: scans.index === currentPage }]"
                @click.stop="goScan(scans.index)">
                <span class="amr-thumb-label">{{ scans.index + 1 }}</span>
            </div>
        </AmrTooltip>
    </div>
</template>
<script>
import AmrTooltip from "./AmrTooltip"

export default {
    name: "ThumbnailNavigator",
    components: { AmrTooltip },
    props: {
        currentPage: {},
        direction: String,
        displayPageScansIndexes: Function,
        goScan: Function,
        invertKeys: Boolean,
        pages: Array,
        shouldInvertKeys: Boolean
    },
    computed: {
        /**
         * Memoized thumbnails array (Performance Fix H)
         * Computed property instead of method - only recalculates when pages or shouldInvertKeys changes
         */
        thumbnails() {
            const res = new Array(this.pages.length)

            for (let i = 0; i < this.pages.length; i++) {
                res[i] = {
                    index: i,
                    page: this.pages[i]
                }
            }

            return this.shouldInvertKeys ? res.reverse() : res
        }
    }
}
</script>
<style data-amr="true">
/** Pages navigator */
.amr-thumbs-scrollable {
    /* navigator container is horizontally scrollable for long chapters */
    overflow: hidden;
    white-space: nowrap;
}

.amr-pages-page-cont {
    margin: 0 5px;
    display: inline-block;
    padding: 4px 10px;
    background-color: #424242;
    border-radius: 12px;
    opacity: 0.9;
    cursor: pointer;
    vertical-align: middle;
    color: #fff;
    font-size: 12px;
    line-height: 1;
}

.amr-pages-page-cont:hover {
    background-color: #ef5350;
}

.amr-pages-page-cont.current {
    background-color: #ff7043;
}

.amr-thumb-label {
    display: inline-block;
    min-width: 18px;
    text-align: center;
}
</style>
