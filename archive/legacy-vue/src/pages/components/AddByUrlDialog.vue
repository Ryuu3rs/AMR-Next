<template>
    <v-dialog v-model="dialogOpen" max-width="500" persistent>
        <v-card>
            <v-card-title class="d-flex align-center">
                <v-icon start>mdi-link-plus</v-icon>
                Add Manga by URL
            </v-card-title>
            <v-card-text>
                <p class="text-body-2 mb-4">
                    Paste a manga or chapter URL from a supported site. This is useful for sites with Cloudflare
                    protection where search doesn't work.
                </p>
                <v-text-field
                    v-model="url"
                    label="Manga or Chapter URL"
                    placeholder="https://example.com/manga/title"
                    variant="outlined"
                    density="comfortable"
                    :error-messages="errorMessage"
                    :loading="loading"
                    :disabled="loading"
                    autofocus
                    @keyup.enter="addManga" />
                <v-alert v-if="detectedMirror" type="info" variant="tonal" density="compact" class="mt-2">
                    <template v-slot:prepend>
                        <v-avatar size="24" class="mr-2">
                            <v-img :src="detectedMirror.icon" />
                        </v-avatar>
                    </template>
                    Detected: <strong>{{ detectedMirror.name }}</strong>
                </v-alert>
                <v-alert v-if="successMessage" type="success" variant="tonal" density="compact" class="mt-2">
                    {{ successMessage }}
                </v-alert>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="close" :disabled="loading">Cancel</v-btn>
                <v-btn color="primary" variant="flat" @click="addManga" :loading="loading" :disabled="!url || loading">
                    Add Manga
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script>
import browser from "webextension-polyfill"
import { matchDomainRule } from "../../shared/utils"
import { debug } from "../../core/debug"

export default {
    name: "AddByUrlDialog",
    props: {
        modelValue: {
            type: Boolean,
            default: false
        }
    },
    emits: ["update:modelValue", "manga-added"],
    data() {
        return {
            url: "",
            loading: false,
            errorMessage: "",
            successMessage: ""
        }
    },
    computed: {
        dialogOpen: {
            get() {
                return this.modelValue
            },
            set(value) {
                this.$emit("update:modelValue", value)
            }
        },
        detectedMirror() {
            if (!this.url) return null
            try {
                const urlObj = new URL(this.url)
                let hostname = urlObj.host
                if (hostname.startsWith("www.")) {
                    hostname = hostname.substring(4)
                }
                const mirrors = this.$store?.state?.mirrors?.all || []
                for (const mir of mirrors) {
                    if (mir.activated && mir.domains && !mir.disabled) {
                        for (const domain of mir.domains) {
                            if (matchDomainRule({ domain, urlHostname: hostname })) {
                                return { name: mir.mirrorName, icon: mir.mirrorIcon }
                            }
                        }
                    }
                }
            } catch {
                // Invalid URL
            }
            return null
        }
    },
    watch: {
        modelValue(newVal) {
            if (newVal) {
                this.url = ""
                this.errorMessage = ""
                this.successMessage = ""
            }
        }
    },
    methods: {
        close() {
            this.dialogOpen = false
        },
        async addManga() {
            if (!this.url || this.loading) return
            this.loading = true
            this.errorMessage = ""
            this.successMessage = ""

            try {
                if (!this.detectedMirror) {
                    this.errorMessage = "URL not recognized. Make sure it's from a supported manga site."
                    return
                }

                // Send message to background to add manga by URL
                const result = await browser.runtime.sendMessage({
                    action: "addMangaByUrl",
                    url: this.url,
                    mirrorName: this.detectedMirror.name
                })

                if (result?.success) {
                    if (result.isUpdate) {
                        this.successMessage = `Updated "${result.mangaName}" - chapter list refreshed!`
                    } else {
                        this.successMessage = `Added "${result.mangaName}" to your library!`
                    }
                    this.$emit("manga-added", result)
                    setTimeout(() => this.close(), 1500)
                } else {
                    this.errorMessage = result?.error || "Failed to add manga. Please try again."
                }
            } catch (e) {
                debug.ui.error("Error adding manga by URL:", e)
                this.errorMessage = e.message || "An error occurred. Please try again."
            } finally {
                this.loading = false
            }
        }
    }
}
</script>
