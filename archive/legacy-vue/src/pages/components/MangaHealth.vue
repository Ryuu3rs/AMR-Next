<template>
    <v-card>
        <v-card-title class="d-flex align-center">
            <v-icon start color="warning">mdi-alert-circle</v-icon>
            {{ i18n("manga_health_title") || "Manga Health Check" }}
            <v-spacer></v-spacer>
            <v-btn icon variant="text" @click="$emit('close')">
                <v-icon>mdi-close</v-icon>
            </v-btn>
        </v-card-title>

        <v-card-text>
            <v-alert v-if="!problemMangas.length" type="success" variant="tonal" class="mb-4">
                {{ i18n("manga_health_all_good") || "All manga are healthy! No issues detected." }}
            </v-alert>

            <template v-else>
                <v-alert type="warning" variant="tonal" class="mb-4">
                    {{
                        i18n("manga_health_issues_found", problemMangas.length) ||
                        `Found ${problemMangas.length} manga
                    with issues`
                    }}
                </v-alert>

                <v-virtual-scroll
                    :items="problemMangas"
                    :height="Math.min(problemMangas.length * 72, 400)"
                    item-height="72"
                    class="problem-list">
                    <template v-slot:default="{ item: manga }">
                        <v-list-item :key="manga.key" class="mb-1">
                            <template v-slot:prepend>
                                <v-icon :color="getStatusColor(manga)" class="mr-2">
                                    {{ getStatusIcon(manga) }}
                                </v-icon>
                            </template>

                            <v-list-item-title class="font-weight-medium">
                                {{ manga.displayName || manga.name }}
                            </v-list-item-title>

                            <v-list-item-subtitle>
                                <span class="text-caption">{{ manga.mirror }}</span>
                                <span class="mx-1">•</span>
                                <span class="text-caption" :class="getStatusColor(manga) + '--text'">
                                    {{ getStatusText(manga) }}
                                </span>
                            </v-list-item-subtitle>

                            <template v-slot:append>
                                <v-btn
                                    size="small"
                                    variant="tonal"
                                    color="primary"
                                    class="mr-2"
                                    :title="
                                        i18n('manga_health_find_tooltip') ||
                                        'Search for this manga on other mirror sites'
                                    "
                                    @click="searchElsewhere(manga)">
                                    <v-icon start size="small">mdi-magnify</v-icon>
                                    Find
                                </v-btn>
                                <v-btn
                                    size="small"
                                    variant="tonal"
                                    color="error"
                                    :title="
                                        i18n('manga_health_delete_tooltip') ||
                                        'Remove this manga from your reading list'
                                    "
                                    @click="confirmDelete(manga)">
                                    <v-icon start size="small">mdi-delete</v-icon>
                                    Delete
                                </v-btn>
                            </template>
                        </v-list-item>
                    </template>
                </v-virtual-scroll>
            </template>
        </v-card-text>

        <v-card-actions v-if="problemMangas.length">
            <v-spacer></v-spacer>
            <v-tooltip location="top">
                <template v-slot:activator="{ props }">
                    <v-btn v-bind="props" color="error" variant="tonal" @click="confirmDeleteAll">
                        <v-icon start>mdi-delete-sweep</v-icon>
                        Delete All Problem Manga
                    </v-btn>
                </template>
                <span>Remove all {{ problemMangas.length }} problem manga from your reading list</span>
            </v-tooltip>
        </v-card-actions>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="deleteDialog" max-width="400">
            <v-card>
                <v-card-title>{{ i18n("manga_health_confirm_delete") || "Confirm Delete" }}</v-card-title>
                <v-card-text>
                    {{ deleteMessage }}
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn variant="text" @click="deleteDialog = false">
                        {{ i18n("cancel") || "Cancel" }}
                    </v-btn>
                    <v-btn color="error" variant="tonal" @click="executeDelete">
                        {{ i18n("delete") || "Delete" }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-card>
</template>

<script>
import i18n from "../../amr/i18n"

export default {
    name: "MangaHealth",
    emits: ["close", "search-request"],
    data() {
        return {
            deleteDialog: false,
            deleteMessage: "",
            mangaToDelete: null,
            deleteAll: false
        }
    },
    computed: {
        problemMangas() {
            const mangas = this.$store.state.mangas.all || []
            return mangas.filter(m => m.orphaned || m.updateError === 1)
        }
    },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        getStatusColor(manga) {
            if (manga.orphaned) return "warning"
            if (manga.updateError) return "error"
            return "grey"
        },
        getStatusIcon(manga) {
            if (manga.orphaned) return "mdi-alert"
            if (manga.updateError) return "mdi-close-circle"
            return "mdi-help-circle"
        },
        getStatusText(manga) {
            if (manga.orphaned)
                return manga.orphanedReason || this.i18n("manga_health_orphaned") || "Mirror unavailable"
            if (manga.updateError) return this.i18n("manga_health_update_error") || "Update failed"
            return this.i18n("manga_health_unknown") || "Unknown issue"
        },
        searchElsewhere(manga) {
            this.$emit("search-request", manga.name)
        },
        confirmDelete(manga) {
            this.mangaToDelete = manga
            this.deleteAll = false
            this.deleteMessage =
                this.i18n("manga_health_delete_confirm", manga.displayName || manga.name) ||
                `Are you sure you want to delete "${manga.displayName || manga.name}"?`
            this.deleteDialog = true
        },
        confirmDeleteAll() {
            this.mangaToDelete = null
            this.deleteAll = true
            this.deleteMessage =
                this.i18n("manga_health_delete_all_confirm", this.problemMangas.length) ||
                `Are you sure you want to delete all ${this.problemMangas.length} problem manga?`
            this.deleteDialog = true
        },
        async executeDelete() {
            if (this.deleteAll) {
                for (const manga of this.problemMangas) {
                    await this.$store.dispatch("deleteManga", manga.key)
                }
            } else if (this.mangaToDelete) {
                await this.$store.dispatch("deleteManga", this.mangaToDelete.key)
            }
            this.deleteDialog = false
            this.mangaToDelete = null
            this.deleteAll = false
        }
    }
}
</script>
