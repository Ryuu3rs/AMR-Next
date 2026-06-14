<template>
    <v-dialog v-model="show" max-width="900" scrollable>
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-btn icon @click="show = false">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-toolbar-title>
                    <v-icon start>mdi-file-document</v-icon>
                    Mirror Diagnostic Report
                </v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="activeTab = 'summary'">Summary</v-btn>
                <v-btn variant="text" @click="activeTab = 'details'">Details</v-btn>
                <v-btn variant="text" @click="activeTab = 'export'">Export</v-btn>
            </v-toolbar>

            <v-card-text class="pa-0">
                <!-- Summary Tab -->
                <div v-if="activeTab === 'summary'" class="pa-4">
                    <v-row class="mb-4">
                        <v-col cols="6" sm="3">
                            <v-card color="success" variant="tonal" class="text-center pa-3">
                                <div class="text-h4">{{ report.summary.working }}</div>
                                <div class="text-caption">Working</div>
                            </v-card>
                        </v-col>
                        <v-col cols="6" sm="3">
                            <v-card color="error" variant="tonal" class="text-center pa-3">
                                <div class="text-h4">{{ report.summary.permanentFailures }}</div>
                                <div class="text-caption">Permanent Failures</div>
                            </v-card>
                        </v-col>
                        <v-col cols="6" sm="3">
                            <v-card color="warning" variant="tonal" class="text-center pa-3">
                                <div class="text-h4">{{ report.summary.temporaryFailures }}</div>
                                <div class="text-caption">Temporary Failures</div>
                            </v-card>
                        </v-col>
                        <v-col cols="6" sm="3">
                            <v-card color="info" variant="tonal" class="text-center pa-3">
                                <div class="text-h4">{{ report.summary.needsInvestigation }}</div>
                                <div class="text-caption">Needs Investigation</div>
                            </v-card>
                        </v-col>
                    </v-row>

                    <!-- Health Bar -->
                    <div class="mb-4">
                        <div class="text-subtitle-2 mb-1">
                            Overall Health: {{ healthPercentage }}% ({{ report.summary.working }}/{{
                                report.totalMirrorsTested
                            }})
                        </div>
                        <v-progress-linear :model-value="healthPercentage" :color="healthColor" height="24" rounded>
                            <template v-slot:default>
                                <strong>{{ healthPercentage }}%</strong>
                            </template>
                        </v-progress-linear>
                    </div>

                    <!-- Quick Stats -->
                    <v-list density="compact">
                        <v-list-subheader>Test Information</v-list-subheader>
                        <v-list-item>
                            <v-list-item-title>Generated At</v-list-item-title>
                            <template v-slot:append>{{ formatDate(report.generatedAt) }}</template>
                        </v-list-item>
                        <v-list-item>
                            <v-list-item-title>Total Mirrors Tested</v-list-item-title>
                            <template v-slot:append>{{ report.totalMirrorsTested }}</template>
                        </v-list-item>
                        <v-list-item>
                            <v-list-item-title>Browser Version</v-list-item-title>
                            <template v-slot:append>{{ browserInfo }}</template>
                        </v-list-item>
                        <v-list-item>
                            <v-list-item-title>Extension Version</v-list-item-title>
                            <template v-slot:append>{{ extensionVersion }}</template>
                        </v-list-item>
                    </v-list>
                </div>

                <!-- Details Tab -->
                <div v-else-if="activeTab === 'details'" class="pa-4">
                    <v-text-field
                        v-model="detailsFilter"
                        label="Filter results"
                        prepend-inner-icon="mdi-magnify"
                        clearable
                        density="compact"
                        variant="outlined"
                        class="mb-4"></v-text-field>

                    <v-select
                        v-model="statusFilter"
                        :items="statusOptions"
                        label="Filter by status"
                        clearable
                        density="compact"
                        variant="outlined"
                        class="mb-4"></v-select>

                    <v-data-table
                        :headers="headers"
                        :items="filteredResults"
                        :items-per-page="10"
                        density="compact"
                        class="elevation-1">
                        <template v-slot:item.status="{ item }">
                            <v-chip :color="getStatusColor(item.status)" size="small">
                                {{ item.status }}
                            </v-chip>
                        </template>
                        <template v-slot:item.responseTime="{ item }">
                            {{ item.responseTime ? `${item.responseTime}ms` : "-" }}
                        </template>
                        <template v-slot:item.recommendation="{ item }">
                            <span class="text-caption">{{ item.recommendation }}</span>
                        </template>
                    </v-data-table>
                </div>

                <!-- Export Tab -->
                <div v-else-if="activeTab === 'export'" class="pa-4">
                    <v-row>
                        <v-col cols="12" md="6">
                            <v-card variant="outlined" class="pa-4">
                                <div class="text-subtitle-1 mb-3">
                                    <v-icon start>mdi-download</v-icon>
                                    Export Report
                                </div>
                                <v-btn block color="primary" variant="outlined" class="mb-2" @click="exportAsJSON">
                                    <v-icon start>mdi-code-json</v-icon>
                                    Download as JSON
                                </v-btn>
                                <v-btn block variant="outlined" class="mb-2" @click="copyToClipboard">
                                    <v-icon start>mdi-content-copy</v-icon>
                                    Copy to Clipboard
                                </v-btn>
                                <v-btn block variant="outlined" @click="exportAsText">
                                    <v-icon start>mdi-file-document</v-icon>
                                    Download as Text
                                </v-btn>
                            </v-card>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-card variant="outlined" class="pa-4">
                                <div class="text-subtitle-1 mb-3">
                                    <v-icon start>mdi-send</v-icon>
                                    Send Report to Developers
                                </div>
                                <v-alert type="info" density="compact" class="mb-3">
                                    <div class="text-caption">
                                        This will open a GitHub issue with the report data. You can review and edit
                                        before submitting.
                                    </div>
                                </v-alert>
                                <v-checkbox
                                    v-model="consentGiven"
                                    label="I consent to sharing this diagnostic data"
                                    density="compact"
                                    hide-details
                                    class="mb-3"></v-checkbox>
                                <v-btn block color="primary" :disabled="!consentGiven" @click="createGitHubIssue">
                                    <v-icon start>mdi-github</v-icon>
                                    Create GitHub Issue
                                </v-btn>
                            </v-card>
                        </v-col>
                    </v-row>

                    <!-- JSON Preview -->
                    <v-card variant="outlined" class="mt-4">
                        <v-card-title class="text-subtitle-2">
                            <v-icon start size="small">mdi-code-json</v-icon>
                            Report Preview
                        </v-card-title>
                        <v-card-text>
                            <pre class="json-preview">{{ formattedJSON }}</pre>
                        </v-card-text>
                    </v-card>
                </div>
            </v-card-text>

            <!-- Snackbar for copy notification -->
            <v-snackbar v-model="snackbar" :timeout="2000" color="success">
                {{ snackbarText }}
            </v-snackbar>
        </v-card>
    </v-dialog>
</template>

<script>
import browser from "webextension-polyfill"
import { generateReport, formatReportAsText } from "../../shared/MirrorDiagnostics"

export default {
    name: "ErrorReportDialog",
    props: {
        modelValue: Boolean,
        results: { type: Array, default: () => [] }
    },
    emits: ["update:modelValue"],
    data() {
        return {
            activeTab: "summary",
            detailsFilter: "",
            statusFilter: null,
            consentGiven: false,
            snackbar: false,
            snackbarText: "",
            browserInfo: "",
            extensionVersion: "",
            headers: [
                { title: "Mirror", key: "mirrorName", sortable: true },
                { title: "Status", key: "status", sortable: true },
                { title: "Error Type", key: "errorType", sortable: true },
                { title: "Response Time", key: "responseTime", sortable: true },
                { title: "Recommendation", key: "recommendation", sortable: false }
            ],
            statusOptions: [
                { title: "Working", value: "WORKING" },
                { title: "Permanent Failure", value: "PERMANENT_FAILURE" },
                { title: "Temporary Failure", value: "TEMPORARY_FAILURE" },
                { title: "Needs Investigation", value: "NEEDS_INVESTIGATION" }
            ]
        }
    },
    computed: {
        show: {
            get() {
                return this.modelValue
            },
            set(val) {
                this.$emit("update:modelValue", val)
            }
        },
        report() {
            return generateReport(this.results)
        },
        healthPercentage() {
            if (this.report.totalMirrorsTested === 0) return 0
            return Math.round((this.report.summary.working / this.report.totalMirrorsTested) * 100)
        },
        healthColor() {
            if (this.healthPercentage >= 80) return "success"
            if (this.healthPercentage >= 50) return "warning"
            return "error"
        },
        filteredResults() {
            let results = this.report.results
            if (this.detailsFilter) {
                const filter = this.detailsFilter.toLowerCase()
                results = results.filter(
                    r => r.mirrorName.toLowerCase().includes(filter) || r.errorType?.toLowerCase().includes(filter)
                )
            }
            if (this.statusFilter) {
                results = results.filter(r => r.status === this.statusFilter)
            }
            return results
        },
        formattedJSON() {
            return JSON.stringify(this.getExportData(), null, 2)
        }
    },
    async mounted() {
        this.browserInfo = navigator.userAgent
        const manifest = browser.runtime.getManifest()
        this.extensionVersion = manifest.version || "Unknown"
    },
    methods: {
        formatDate(isoString) {
            return new Date(isoString).toLocaleString()
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
        getExportData() {
            return {
                ...this.report,
                metadata: {
                    browserInfo: this.browserInfo,
                    extensionVersion: this.extensionVersion,
                    platform: navigator.platform,
                    language: navigator.language
                }
            }
        },
        exportAsJSON() {
            const data = JSON.stringify(this.getExportData(), null, 2)
            const blob = new Blob([data], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `amr-mirror-report-${new Date().toISOString().split("T")[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
        },
        exportAsText() {
            const text = formatReportAsText(this.report)
            const blob = new Blob([text], { type: "text/plain" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `amr-mirror-report-${new Date().toISOString().split("T")[0]}.txt`
            a.click()
            URL.revokeObjectURL(url)
        },
        async copyToClipboard() {
            const data = JSON.stringify(this.getExportData(), null, 2)
            await navigator.clipboard.writeText(data)
            this.snackbarText = "Report copied to clipboard!"
            this.snackbar = true
        },
        createGitHubIssue() {
            const title = encodeURIComponent(
                `[Mirror Report] ${this.report.summary.permanentFailures} permanent, ${this.report.summary.temporaryFailures} temporary failures`
            )
            const failedMirrors = this.report.results
                .filter(r => r.status !== "WORKING")
                .map(r => `- **${r.mirrorName}**: ${r.status} - ${r.errorType || "Unknown"}`)
                .join("\n")
            const body = encodeURIComponent(`## Mirror Diagnostic Report

**Generated:** ${this.formatDate(this.report.generatedAt)}
**Extension Version:** ${this.extensionVersion}
**Browser:** ${this.browserInfo}

### Summary
- ✅ Working: ${this.report.summary.working}
- ❌ Permanent Failures: ${this.report.summary.permanentFailures}
- ⚠️ Temporary Failures: ${this.report.summary.temporaryFailures}
- 🔍 Needs Investigation: ${this.report.summary.needsInvestigation}

### Failed Mirrors
${failedMirrors}

<details>
<summary>Full JSON Report</summary>

\`\`\`json
${JSON.stringify(this.getExportData(), null, 2)}
\`\`\`

</details>`)

            const url = `https://github.com/all-mangas-reader/all-mangas-reader-2/issues/new?title=${title}&body=${body}&labels=mirror-issue`
            window.open(url, "_blank")
        }
    }
}
</script>

<style scoped>
.json-preview {
    background: rgba(0, 0, 0, 0.05);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    max-height: 300px;
    font-size: 11px;
    font-family: monospace;
}
</style>
