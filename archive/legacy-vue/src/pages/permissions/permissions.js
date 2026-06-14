import { createApp } from "vue"
import { createVuetify } from "vuetify"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"
import App from "./App.vue"
import store from "../../store"
import "vuetify/styles"

const init = async function () {
    // Load options in store before everything
    await store.dispatch("getStateFromReference", {
        module: "options",
        mutation: "extendOptions"
    })

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
    app.config.globalProperties.$store = store
    app.use(store)
    app.use(vuetify)
    app.mount("#app")
}
init()
