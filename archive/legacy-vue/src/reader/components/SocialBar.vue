<template>
    <div class="amr-bottombar">
        <div class="amr-social-content">
            <!-- Always displayed links -->
            <AmrTooltip v-for="(soc, i) in social_direct" :key="i" :text="i18n(soc.tooltip)" location="top">
                <AmrButton icon @click.stop="opentab(soc.url)">
                    <AmrIcon :icon="soc.icon" />
                </AmrButton>
            </AmrTooltip>
            <!-- Social menu (only show if there are shared items) -->
            <AmrMenu v-if="social_shared.length > 0" location="top">
                <template #activator="{ open }">
                    <AmrTooltip :text="i18n('reader_social_all')" location="top">
                        <AmrButton icon @click="open">
                            <AmrIcon :icon="mdiShareVariant" />
                        </AmrButton>
                    </AmrTooltip>
                </template>
                <div class="amr-social-list">
                    <div v-for="(soc, i) in social_shared" :key="i" class="amr-social-list-item">
                        <AmrTooltip :text="i18n(soc.tooltip)" location="left">
                            <AmrButton icon @click="opentab(soc.url)">
                                <AmrIcon :icon="soc.icon" />
                            </AmrButton>
                        </AmrTooltip>
                    </div>
                </div>
            </AmrMenu>
        </div>
    </div>
</template>

<script>
import { i18nmixin } from "../../mixins/i18n-mixin"
import browser from "webextension-polyfill"
import { mdiShareVariant, mdiPatreon, mdiDiscord, mdiFacebook, mdiTwitter } from "@mdi/js"
import AmrTooltip from "./AmrTooltip"
import AmrButton from "./AmrButton"
import AmrIcon from "./AmrIcon"
import AmrMenu from "./AmrMenu"

export default {
    mixins: [i18nmixin],
    components: { AmrTooltip, AmrButton, AmrIcon, AmrMenu },
    data() {
        return {
            social_direct: [
                {
                    icon: mdiPatreon,
                    tooltip: "reader_social_patreon",
                    url: "https://www.patreon.com/allmangas",
                    color: "deep-orange-lighten-1"
                },
                {
                    icon: mdiDiscord,
                    tooltip: "reader_social_discord",
                    url: "https://discord.gg/bdzk9hR",
                    color: "indigo-lighten-2"
                }
            ],
            social_shared: [
                /*{
                    icon: mdiFacebook,
                    tooltip: "reader_social_facebook",
                    url: "https://www.facebook.com/allmangasreader/",
                    color: "blue darken-3"
                },
                {
                    icon: mdiTwitter,
                    tooltip: "reader_social_twitter",
                    url: "https://twitter.com/AllMangasReader",
                    color: "light-blue"
                }*/
            ],
            mdiShareVariant
        }
    },
    methods: {
        opentab(url) {
            browser.runtime.sendMessage({ action: "opentab", url: url })
        }
    }
}
</script>

<style data-amr="true">
.amr-bottombar {
    position: fixed;
    width: 300px;
    bottom: 0;
    right: 0;
    z-index: 7;
    background-color: var(--amr-surface);
}

.amr-social-content {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 8px;
}

.amr-social-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background-color: var(--amr-surface);
    border-radius: 4px;
}

.amr-social-list-item {
    padding: 0 3px;
}
</style>
