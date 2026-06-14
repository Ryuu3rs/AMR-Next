import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"
import path from "path"

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: "jsdom",
        include: ["tests/**/*.{test,spec}.{js,ts}"],
        exclude: ["node_modules", "dist"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "dist/", "tests/", "**/*.d.ts", "**/*.config.{js,ts}"]
        },
        setupFiles: ["./tests/setup.js"]
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "webextension-polyfill": path.resolve(__dirname, "./tests/mocks/webextension-polyfill.js")
        }
    }
})
