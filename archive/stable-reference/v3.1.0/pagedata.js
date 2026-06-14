import { reactive } from "vue"

/**
 * Encapsulate data collected from mirror implementation to be retrieved everywhere
 * State is wrapped in reactive() for Vue 3 reactivity
 */
export default {
    state: reactive({}),
    load(object) {
        for (const key in object) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
                this.state[key] = object[key]
            }
        }
    },
    add(key, value) {
        this.state[key] = value /* Properties added to pageData are reactive in Vue components */
    }
}
