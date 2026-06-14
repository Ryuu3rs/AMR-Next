import "./popup.css"

import browser from "webextension-polyfill"
import { createApp } from "vue"
import { createVuetify } from "vuetify"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"
import App from "./App.vue"
import store from "../../store"
import { OptionStorage } from "../../shared/OptionStorage"
import { isFirefoxAndroid } from "../../shared/utils"
import { createEventBusPlugin } from "../../shared/EventBus"
import "vuetify/styles"

function isSmallDevice() {
    return isFirefoxAndroid() && window.innerWidth <= 700
}

const init = async () => {
    // Load options in store before everything
    const optionStore = new OptionStorage()
    const options = await optionStore.getVueOptions()

    store.commit("extendOptions", options)

    let popup = true
    if (window.location.href.indexOf("mode=tab") >= 0) {
        popup = false
    }

    /** Open in new tab if required */
    if (store.state.options.newTab === 1 && popup) {
        browser.runtime.sendMessage({
            action: "opentab",
            url: "/pages/popup/popup.html?mode=tab"
        })
        window.close()
    }
    if (popup && !isSmallDevice()) {
        document.body.classList.add("popup")
        document.documentElement.style.fontSize = "14px"
    } else {
        document.documentElement.style["overflow-y"] = "auto"
        document.documentElement.style.fontSize = "16px"
    }

    // Create Vuetify instance
    const vuetify = createVuetify({
        components,
        directives,
        theme: {
            defaultTheme: store.state.options.dark === 1 ? "dark" : "light"
        }
    })

    // Create Vue app
    const app = createApp(App)

    // Provide global properties
    app.config.globalProperties.$isPopup = popup
    app.config.globalProperties.$store = store

    app.use(store)
    app.use(vuetify)
    app.use(createEventBusPlugin()) // Shared EventBus singleton
    app.mount("#app")

    async function waitForPopup(retries = 10, delay = 50) {
        const wait = ms => new Promise(func => setTimeout(func, ms))

        if (window.innerWidth !== 0 && window.innerHeight !== 0) {
            return Promise.resolve()
        }

        if (retries <= 0) {
            return
        }

        await wait(delay)

        // retry
        return waitForPopup(retries - 1, delay)
    }

    await waitForPopup()

    if (popup && [348, 425].includes(window.innerWidth)) {
        browser.runtime.sendMessage({
            action: "opentab",
            url: "/pages/popup/popup.html?mode=tab"
        })
        window.close()
    }
}
init()
