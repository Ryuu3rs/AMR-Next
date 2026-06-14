<template>
    <div class="amr-page-next-prev">
        <div class="amr-page-nav-toolbar">
            <!-- Backward button -->
            <AmrTooltip
                :text="i18n(shouldInvertKeys ? 'reader_go_next_scan' : 'reader_go_previous_scan')"
                location="bottom">
                <AmrButton v-show="showBackwardButton" icon class="btn-huge" @click.stop="goPreviousScan">
                    <AmrIcon :icon="icons.mdiChevronLeft" />
                </AmrButton>
            </AmrTooltip>
            <!-- Current scan infos -->
            <div class="amr-page-nav-info">
                {{
                    i18n(
                        "reader_page_progression",
                        currentPage + 1,
                        pages.length,
                        pages.length > 0 ? Math.floor(((currentPage + 1) / pages.length) * 100) : 0
                    )
                }}
            </div>
            <!-- Forward button -->
            <AmrTooltip
                :text="i18n(shouldInvertKeys ? 'reader_go_previous_scan' : 'reader_go_next_scan')"
                location="bottom">
                <AmrButton v-show="showForwardButton" icon class="btn-huge" @click.stop="goNextScan">
                    <AmrIcon :icon="icons.mdiChevronRight" />
                </AmrButton>
            </AmrTooltip>
        </div>
    </div>
</template>
<script>
import { mdiChevronRight, mdiChevronLeft } from "@mdi/js"
import AmrTooltip from "./AmrTooltip"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"

export default {
    name: "PageNavigator",
    components: { AmrTooltip, AmrButton, AmrIcon },
    data: () => ({
        icons: { mdiChevronRight, mdiChevronLeft }
    }),
    props: {
        currentPage: {},
        firstScan: Boolean,
        goNextScan: Function,
        goPreviousScan: Function,
        i18n: Function,
        lastScan: Boolean,
        pages: Array,
        shouldInvertKeys: Boolean
    },
    computed: {
        showBackwardButton() {
            return this.shouldInvertKeys ? !this.lastScan : !this.firstScan
        },
        showForwardButton() {
            return this.shouldInvertKeys ? !this.firstScan : !this.lastScan
        }
    }
}
</script>
<style data-amr="true">
/** Pages navigator */
.amr-page-next-prev {
    max-width: 400px;
    margin: 8px auto !important;
}

.amr-page-nav-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: rgba(66, 66, 66, 0.8);
    padding: 5px 10px;
    border-radius: 5px;
}

.amr-page-nav-info {
    font-size: 16px;
    font-weight: 500;
    color: white;
    padding: 0 12px;
}

.amr-page-next-prev .title {
    margin: 0px auto;
}
</style>
