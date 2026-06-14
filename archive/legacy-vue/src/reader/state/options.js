import { reactive } from "vue"

/**
 * Class to retrieve AMR options
 * Wrapped in reactive() for Vue 3 reactivity
 */
const options = reactive({
    __data__: null
})

/**
 * Get the raw options data
 */
options.get = function () {
    return this.__data__
}

/**
 * When scripts are loaded in page, AMR options are injected too
 * This function is called to initialize options
 * @param {*} object
 */
options.load = function (object) {
    Object.assign(this, object)
    this.__data__ = object
}

export default options
