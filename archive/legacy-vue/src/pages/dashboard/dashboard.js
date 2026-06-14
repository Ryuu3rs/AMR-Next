import "../popup/popup.css"

import { createApp } from "vue"
import { createVuetify } from "vuetify"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"
import Dashboard from "../components/Dashboard.vue"
import store from "../../store"
import { OptionStorage } from "../../shared/OptionStorage"
import { createEventBusPlugin } from "../../shared/EventBus"
import "vuetify/styles"

const init = async () => {
    // Load options in store before everything
    const optionStore = new OptionStorage()
    const options = await optionStore.getVueOptions()

    store.commit("extendOptions", options)

    document.documentElement.style["overflow-y"] = "auto"
    document.documentElement.style.fontSize = "16px"

    // Create Vuetify instance
    const vuetify = createVuetify({
        components,
        directives,
        theme: {
            defaultTheme: store.state.options.dark === 1 ? "dark" : "light"
        }
    })

    // Create Vue app
    const app = createApp(Dashboard)

    // Provide global properties
    app.config.globalProperties.$isPopup = false
    app.config.globalProperties.$store = store

    app.use(store)
    app.use(vuetify)
    app.use(createEventBusPlugin()) // Shared EventBus singleton
    app.mount("#app")
}
init()
