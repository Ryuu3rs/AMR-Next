module.exports = {
    extends: ["plugin:vue/vue3-essential", "plugin:vuetify/recommended", "prettier"],
    parser: "vue-eslint-parser",
    parserOptions: {
        parser: "@typescript-eslint/parser",
        ecmaVersion: "2022"
    },
    plugins: ["@typescript-eslint"],
    rules: {
        "prefer-const": "warn",
        // Allow single-word component names for existing components
        "vue/multi-word-component-names": "off",
        // Allow v-model with arguments (Vue 3 syntax)
        "vue/no-v-model-argument": "off"
    }
}
