import globals from "globals"
import svelte from "eslint-plugin-svelte"
import tseslint from "typescript-eslint"

// Globals injected by WXT auto-imports and the WebExtension runtime.
const wxtGlobals = {
    browser: "readonly",
    chrome: "readonly",
    defineBackground: "readonly",
    defineContentScript: "readonly",
    defineUnlistedScript: "readonly"
}

export default tseslint.config(
    {
        ignores: [
            "**/.output/**",
            "**/.wxt/**",
            "**/node_modules/**",
            "**/dist/**",
            "archive/**",
            "tooling/source-probe/output/**",
            "tooling/browser-tests/runner/**"
        ]
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,mts,js,mjs}"],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node, ...wxtGlobals }
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "no-empty": ["error", { allowEmptyCatch: true }]
        }
    },
    ...svelte.configs["flat/recommended"],
    {
        files: ["**/*.svelte"],
        languageOptions: {
            parserOptions: { parser: tseslint.parser },
            globals: { ...globals.browser, ...wxtGlobals }
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "off",
            // Opinionated style/perf rules — not correctness. Revisit later:
            // each-key would mean keying ~18 list blocks; the SvelteSet/SvelteMap
            // rule conflicts with our reassign-to-trigger-reactivity pattern.
            "svelte/require-each-key": "off",
            "svelte/prefer-svelte-reactivity": "off"
        }
    }
)
