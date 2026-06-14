<template>
    <!-- Manage manga categories -->
    <div style="position: fixed; z-index: 10; top: 30%; left: 35%" class="pr-4" v-show="selectable">
        <v-card elevation="12" class="pa-3" ref="draggableContainer">
            <v-row class="mb-3 bg-secondary" @mousedown="dragMouseDown">
                <v-btn class="ml-auto no-bg-hover" @click="unselect()" variant="text" size="x-small">
                    <v-icon color="gray"> mdi-close </v-icon>
                </v-btn>
            </v-row>
            <div class="d-flex align-center my-3">
                <v-chip color="gray" label size="small">
                    {{ selected.length + "/" + total }}
                </v-chip>
                <v-tooltip location="top">
                    <template v-slot:activator="{ props }">
                        <v-btn variant="text" size="x-small" class="no-bg-hover" v-bind="props" @click="selectAll()">
                            <v-icon color="gray" start> mdi-checkbox-multiple-marked-outline </v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("button_multi_manga_select_all") }}</span>
                </v-tooltip>
                <v-tooltip location="top">
                    <template v-slot:activator="{ props }">
                        <v-btn variant="text" size="x-small" class="no-bg-hover" v-bind="props" @click="clearSelect()">
                            <v-icon color="gray" start> mdi-close-box-multiple-outline </v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("button_multi_manga_unselect_all") }}</span>
                </v-tooltip>
                <v-tooltip location="top">
                    <template v-slot:activator="{ props }">
                        <v-btn variant="text" size="x-small" class="no-bg-hover" v-bind="props" @click="selectUnread()">
                            <v-icon color="gray" start> mdi-playlist-check </v-icon>
                        </v-btn>
                    </template>
                    <span>{{ i18n("button_multi_manga_select_unread") }}</span>
                </v-tooltip>
            </div>
            <v-row>
                <v-col cols="12" lg="6">
                    <v-btn
                        @click="openLatest()"
                        :disabled="!selected.length || selected.length > 15"
                        variant="outlined"
                        size="small"
                        color="info">
                        {{ i18n("button_multi_manga_open_latest") }}
                    </v-btn>
                    <v-btn
                        @click="openNew()"
                        :disabled="!selected.length || selected.length > 15"
                        variant="outlined"
                        size="small"
                        color="info">
                        {{ i18n("button_multi_manga_open_new") }}
                    </v-btn>
                </v-col>
                <v-divider />
                <v-col cols="12" lg="6">
                    <v-select
                        :items="categories"
                        density="compact"
                        variant="outlined"
                        v-model="selectedCategory"
                        item-title="name"
                        item-value="name"
                        :label="i18n('list_multi_action_select_category')"></v-select>
                    <!-- Actions buttons -->
                    <div v-if="selectedCategory">
                        <v-btn @click="addCategory()" class="bg-green" size="small">
                            {{ i18n("button_add") }}
                        </v-btn>
                        <v-btn @click="deleteCategory()" class="bg-red" size="small">
                            {{ i18n("button_remove") }}
                        </v-btn>
                    </div>
                </v-col>
            </v-row>
            <v-divider class="my-2" />
            <v-row>
                <v-col cols="12">
                    <div class="text-caption text-grey mb-2">Quick Actions</div>
                    <v-btn
                        @click="markAllRead()"
                        :disabled="!selected.length"
                        variant="outlined"
                        size="small"
                        color="success"
                        class="mr-2 mb-2">
                        <v-icon start size="small">mdi-check-all</v-icon>Mark Read
                    </v-btn>
                    <v-btn
                        @click="refreshSelected()"
                        :disabled="!selected.length"
                        variant="outlined"
                        size="small"
                        color="primary"
                        class="mr-2 mb-2">
                        <v-icon start size="small">mdi-refresh</v-icon>Refresh
                    </v-btn>
                    <v-btn
                        @click="confirmDelete()"
                        :disabled="!selected.length"
                        variant="outlined"
                        size="small"
                        color="error"
                        class="mb-2">
                        <v-icon start size="small">mdi-delete</v-icon>Delete
                    </v-btn>
                </v-col>
            </v-row>
            <!-- Delete Confirmation Dialog -->
            <v-dialog v-model="deleteDialog" max-width="400">
                <v-card>
                    <v-card-title class="text-h6">Confirm Delete</v-card-title>
                    <v-card-text
                        >Are you sure you want to delete {{ selected.length }} manga(s)? This cannot be
                        undone.</v-card-text
                    >
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
                        <v-btn color="error" variant="flat" @click="deleteSelected()">Delete</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
        </v-card>
    </div>
</template>

<script>
import i18n from "../../amr/i18n"
import { convertIcons } from "../../shared/utils"
import { debug } from "../../core/debug"

export default {
    name: "MultiMangaAction",
    data() {
        return {
            selectedCategory: "",
            deleteDialog: false,
            positions: {
                clientX: undefined,
                clientY: undefined,
                movementX: 0,
                movementY: 0
            }
        }
    },
    props: ["selected", "selectable", "total"],
    computed: {
        // AMR options
        options: function () {
            return this.$store.state.options
        },
        categories: function () {
            return this.options.categoriesStates.filter(cat => cat.type !== "native" && cat.type !== "language")
        }
    },
    methods: {
        i18n: (message, ...args) => i18n(message, ...args),
        convertIcons: str => convertIcons(str),
        addCategory: function () {
            for (const manga of this.selected) {
                this.$store.dispatch("addCategoryToManga", {
                    key: manga.key,
                    name: this.selectedCategory
                })
            }
            this.selectedCategory = ""
        },
        /**
         * Delete a category on this group of manga
         */
        deleteCategory: function () {
            for (const manga of this.selected) {
                this.$store.dispatch("removeCategoryFromManga", {
                    key: manga.key,
                    name: this.selectedCategory
                })
            }
            this.selectedCategory = ""
        },
        clearSelect: function () {
            this.$eventBus.$emit("multi-manga:deselect-all")
        },
        selectAll: function () {
            this.$eventBus.$emit("multi-manga:select-all")
        },
        selectUnread: function () {
            this.$eventBus.$emit("multi-manga:select-unread")
        },
        openLatest: function () {
            for (const manga of this.selected) {
                this.$eventBus.$emit("multi-manga:open-latest:" + manga.key)
            }
        },
        openNew: function () {
            for (const manga of this.selected) {
                this.$eventBus.$emit("multi-manga:open-first-new:" + manga.key)
            }
        },
        markAllRead: async function () {
            for (const manga of this.selected) {
                if (manga.listChaps && manga.listChaps.length > 0) {
                    const latestChapter = manga.listChaps[0]
                    await this.$store.dispatch("readManga", {
                        key: manga.key,
                        url: latestChapter[1],
                        lastChapterReadName: latestChapter[0],
                        lastChapterReadURL: latestChapter[1]
                    })
                }
            }
            this.clearSelect()
        },
        refreshSelected: function () {
            for (const manga of this.selected) {
                this.$eventBus.$emit("multi-manga:refresh:" + manga.key)
            }
        },
        confirmDelete: function () {
            this.deleteDialog = true
        },
        deleteSelected: async function () {
            for (const manga of this.selected) {
                await this.$store.dispatch("deleteManga", { key: manga.key })
            }
            this.deleteDialog = false
            this.clearSelect()
            this.$emit("unselect")
        },
        unselect: function () {
            this.$emit("unselect")
        },
        dragMouseDown: function (event) {
            debug.ui.trace("dragMouseDown refs:", this.$refs)
            event.preventDefault()
            // get the mouse cursor position at startup:
            this.positions.clientX = event.clientX
            this.positions.clientY = event.clientY
            document.onmousemove = this.elementDrag
            document.onmouseup = this.closeDragElement
        },
        elementDrag: function (event) {
            event.preventDefault()
            this.positions.movementX = this.positions.clientX - event.clientX
            this.positions.movementY = this.positions.clientY - event.clientY
            this.positions.clientX = event.clientX
            this.positions.clientY = event.clientY
            // set the element's new position:
            this.$refs.draggableContainer.$el.style.top =
                this.$refs.draggableContainer.$el.offsetTop - this.positions.movementY + "px"
            this.$refs.draggableContainer.$el.style.left =
                this.$refs.draggableContainer.$el.offsetLeft - this.positions.movementX + "px"
        },
        closeDragElement() {
            document.onmouseup = null
            document.onmousemove = null
        }
    }
}
</script>
