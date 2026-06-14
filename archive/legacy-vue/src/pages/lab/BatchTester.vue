<template>
    <v-card class="batch-tester">
        <v-card-title class="d-flex align-center">
            <v-icon start>mdi-flask-outline</v-icon>
            Batch Mirror Testing
            <v-spacer></v-spacer>
            <v-chip v-if="isRunning" color="primary" variant="flat" size="small">
                <v-progress-circular size="14" width="2" indeterminate class="mr-2"></v-progress-circular>
                Testing...
            </v-chip>
        </v-card-title>

        <v-card-text>
            <!-- Loading State -->
            <div v-if="loading" class="text-center py-8">
                <v-progress-circular indeterminate size="48" color="primary"></v-progress-circular>
                <div class="mt-4 text-body-1">Loading mirrors...</div>
            </div>

            <!-- Empty State -->
            <v-alert v-else-if="mirrors.length === 0" type="warning" variant="tonal" class="mb-4">
                <v-icon start>mdi-alert</v-icon>
                No mirrors available. Make sure mirror list is loaded.
            </v-alert>

            <template v-else>
                <!-- Selection Controls -->
                <v-row class="mb-4">
                    <v-col cols="12" md="6">
                        <v-text-field
                            v-model="searchFilter"
                            label="Filter mirrors"
                            prepend-inner-icon="mdi-magnify"
                            clearable
                            density="compact"
                            hide-details
                            variant="outlined"></v-text-field>
                    </v-col>
                    <v-col cols="12" md="6">
                        <v-select
                            v-model="categoryFilter"
                            :items="categories"
                            label="Filter by category"
                            clearable
                            density="compact"
                            hide-details
                            variant="outlined"></v-select>
                    </v-col>
                </v-row>

                <!-- Quick Selection Buttons -->
                <div class="d-flex flex-wrap gap-2 mb-4">
                    <v-btn size="small" variant="outlined" @click="selectAll" :disabled="isRunning">
                        <v-icon start>mdi-checkbox-multiple-marked</v-icon>
                        Select All ({{ filteredMirrors.length }})
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="selectNone" :disabled="isRunning">
                        <v-icon start>mdi-checkbox-multiple-blank-outline</v-icon>
                        Select None
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="selectFirst(10)" :disabled="isRunning">
                        First 10
                    </v-btn>
                    <v-btn size="small" variant="outlined" @click="selectFirst(25)" :disabled="isRunning">
                        First 25
                    </v-btn>
                    <v-btn
                        size="small"
                        variant="outlined"
                        @click="selectFailed"
                        :disabled="isRunning || results.length === 0">
                        <v-icon start color="error">mdi-alert-circle</v-icon>
                        Failed Only
                    </v-btn>
                </div>

                <!-- Mirror Selection List -->
                <v-card variant="outlined" class="mb-4 mirror-list-card">
                    <v-virtual-scroll :items="filteredMirrors" height="250" item-height="48">
                        <template v-slot:default="{ item }">
                            <v-list-item :key="item.mirrorName" density="compact">
                                <template v-slot:prepend>
                                    <v-checkbox
                                        v-model="selectedMirrors"
                                        :value="item.mirrorName"
                                        hide-details
                                        density="compact"
                                        :disabled="isRunning"></v-checkbox>
                                </template>
                                <v-list-item-title class="d-flex align-center">
                                    <img :src="item.mirrorIcon" :alt="item.mirrorName" class="mirror-icon mr-2" />
                                    {{ item.mirrorName }}
                                    <v-chip
                                        v-if="getResultStatus(item.mirrorName)"
                                        size="x-small"
                                        class="ml-2"
                                        :color="getStatusColor(getResultStatus(item.mirrorName))">
                                        {{ getResultStatus(item.mirrorName) }}
                                    </v-chip>
                                </v-list-item-title>
                                <template v-slot:append>
                                    <v-progress-circular
                                        v-if="testingMirrors.includes(item.mirrorName)"
                                        size="20"
                                        width="2"
                                        indeterminate
                                        color="primary"></v-progress-circular>
                                    <v-icon v-else-if="getResultStatus(item.mirrorName) === 'WORKING'" color="success">
                                        mdi-check-circle
                                    </v-icon>
                                    <v-icon
                                        v-else-if="getResultStatus(item.mirrorName) === 'PERMANENT_FAILURE'"
                                        color="error">
                                        mdi-close-circle
                                    </v-icon>
                                    <v-icon v-else-if="getResultStatus(item.mirrorName)" color="warning">
                                        mdi-alert
                                    </v-icon>
                                </template>
                            </v-list-item>
                        </template>
                    </v-virtual-scroll>
                </v-card>

                <!-- Test Configuration -->
                <v-row class="mb-4">
                    <v-col cols="12" md="6">
                        <v-text-field
                            v-model="testSearchQuery"
                            label="Test search query"
                            placeholder="naruto"
                            prepend-inner-icon="mdi-magnify"
                            density="compact"
                            variant="outlined"
                            :disabled="isRunning"
                            hint="Search term used for testing getMangaList"
                            persistent-hint></v-text-field>
                    </v-col>
                    <v-col cols="12" md="6">
                        <v-slider
                            v-model="concurrentTests"
                            :min="1"
                            :max="10"
                            :step="1"
                            label="Concurrent tests"
                            thumb-label
                            density="compact"
                            :disabled="isRunning"></v-slider>
                    </v-col>
                </v-row>
            </template>
        </v-card-text>

        <!-- Action Buttons -->
        <v-card-actions class="px-4 pb-4">
            <v-btn
                color="primary"
                variant="flat"
                @click="startBatchTest"
                :disabled="selectedMirrors.length === 0 || isRunning || !testSearchQuery">
                <v-icon start>mdi-play</v-icon>
                Start Testing ({{ selectedMirrors.length }})
            </v-btn>
            <v-btn v-if="isRunning" color="error" variant="outlined" @click="stopTests">
                <v-icon start>mdi-stop</v-icon>
                Stop
            </v-btn>
            <v-spacer></v-spacer>
            <v-btn v-if="results.length > 0" variant="outlined" @click="$emit('view-results', results)">
                <v-icon start>mdi-file-document</v-icon>
                View Report
            </v-btn>
        </v-card-actions>
    </v-card>
</template>

<script>
import browser from "webextension-polyfill"
import { categorizeError, createSuccessResult, createFailureResult } from "../../shared/MirrorDiagnostics"

export default {
    name: "BatchTester",
    emits: ["view-results", "test-complete"],
    data() {
        return {
            searchFilter: "",
            categoryFilter: null,
            selectedMirrors: [],
            testSearchQuery: "naruto",
            concurrentTests: 3,
            isRunning: false,
            stopRequested: false,
            testingMirrors: [],
            results: [],
            loading: true
        }
    },
    async mounted() {
        // Ensure mirrors are loaded
        if (!this.$store.state.mirrors?.all?.length) {
            await this.$store.dispatch("updateMirrorsLists")
        }
        this.loading = false
        console.log("[BatchTester] Mirrors loaded:", this.mirrors.length)
    },
    computed: {
        mirrors() {
            const allMirrors = this.$store.state.mirrors?.all || []
            return allMirrors.filter(m => !m.disabled).sort((a, b) => a.mirrorName.localeCompare(b.mirrorName))
        },
        filteredMirrors() {
            let filtered = this.mirrors
            if (this.searchFilter) {
                const search = this.searchFilter.toLowerCase()
                filtered = filtered.filter(m => m.mirrorName.toLowerCase().includes(search))
            }
            if (this.categoryFilter) {
                filtered = filtered.filter(m => m.abstract === this.categoryFilter)
            }
            return filtered
        },
        categories() {
            const cats = new Set()
            this.mirrors.forEach(m => {
                if (m.abstract) cats.add(m.abstract)
            })
            return ["Individual", ...Array.from(cats).sort()]
        }
    },
    methods: {
        selectAll() {
            this.selectedMirrors = this.filteredMirrors.map(m => m.mirrorName)
        },
        selectNone() {
            this.selectedMirrors = []
        },
        selectFirst(n) {
            this.selectedMirrors = this.filteredMirrors.slice(0, n).map(m => m.mirrorName)
        },
        selectFailed() {
            const failedMirrors = this.results.filter(r => r.status !== "WORKING").map(r => r.mirrorName)
            this.selectedMirrors = failedMirrors
        },
        getResultStatus(mirrorName) {
            const result = this.results.find(r => r.mirrorName === mirrorName)
            return result ? result.status : null
        },
        getStatusColor(status) {
            switch (status) {
                case "WORKING":
                    return "success"
                case "PERMANENT_FAILURE":
                    return "error"
                case "TEMPORARY_FAILURE":
                    return "warning"
                case "NEEDS_INVESTIGATION":
                    return "info"
                default:
                    return "grey"
            }
        },
        async startBatchTest() {
            this.isRunning = true
            this.stopRequested = false
            this.results = []

            const queue = [...this.selectedMirrors]
            const runTest = async mirrorName => {
                if (this.stopRequested) return

                this.testingMirrors.push(mirrorName)
                const mirror = this.mirrors.find(m => m.mirrorName === mirrorName)
                const startTime = Date.now()

                try {
                    const result = await browser.runtime.sendMessage({
                        action: "lab",
                        torun: "search",
                        search: this.testSearchQuery,
                        mirror: mirrorName
                    })

                    const responseTime = Date.now() - startTime
                    const domain = mirror.domains?.[0] || ""
                    const homeUrl = mirror.home || ""

                    if (result && (Array.isArray(result) ? result.length > 0 : Object.keys(result).length > 0)) {
                        this.results.push(createSuccessResult(mirrorName, domain, homeUrl, responseTime))
                    } else {
                        this.results.push(createFailureResult(mirrorName, domain, homeUrl, "Empty search results"))
                    }
                } catch (error) {
                    const domain = mirror?.domains?.[0] || ""
                    const homeUrl = mirror?.home || ""
                    this.results.push(createFailureResult(mirrorName, domain, homeUrl, error))
                }

                this.testingMirrors = this.testingMirrors.filter(m => m !== mirrorName)
            }

            // Process queue with concurrency limit
            const workers = []
            for (let i = 0; i < this.concurrentTests; i++) {
                workers.push(
                    (async () => {
                        while (queue.length > 0 && !this.stopRequested) {
                            const mirrorName = queue.shift()
                            if (mirrorName) await runTest(mirrorName)
                        }
                    })()
                )
            }

            await Promise.all(workers)
            this.isRunning = false
            this.$emit("test-complete", this.results)
        },
        stopTests() {
            this.stopRequested = true
        }
    }
}
</script>

<style scoped>
.mirror-list-card {
    max-height: 300px;
}

.mirror-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
}

.gap-2 {
    gap: 8px;
}
</style>
