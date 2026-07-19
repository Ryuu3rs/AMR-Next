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
            "tooling/source-health/output/**",
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
            // Opinionated style/perf rules - not correctness. Revisit later:
            // each-key would mean keying ~18 list blocks; the SvelteSet/SvelteMap
            // rule conflicts with our reassign-to-trigger-reactivity pattern.
            "svelte/require-each-key": "off",
            "svelte/prefer-svelte-reactivity": "off"
        }
    },
    {
        // Closes the "sortKey 0" bug class permanently: a sortKey must never fall
        // back to a literal 0 (0 sorts before Chapter 1 AND clobbers reading
        // progress). It must come from parseChapterNumber / assignListSortKeys /
        // UNNUMBERED_SORT_KEY instead. See packages/source-sdk/src/chapter-numbering.ts.
        files: ["packages/sources/src/**/*.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "Property[key.name='sortKey'] > LogicalExpression:matches([operator='||'], [operator='??']) > Literal[value=0]",
                    message:
                        "sortKey must come from parseChapterNumber/assignListSortKeys/UNNUMBERED_SORT_KEY, never a 0 fallback"
                }
            ]
        }
    }
)
