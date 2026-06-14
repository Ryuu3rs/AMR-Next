<template>
    <div v-if="showOverlay" class="perf-overlay">
        <v-chip size="x-small" color="info" variant="flat" class="perf-chip">
            <v-icon size="12" start>mdi-memory</v-icon>
            {{ memoryUsage }}
        </v-chip>
        <v-chip size="x-small" color="warning" variant="flat" class="perf-chip ml-1">
            <v-icon size="12" start>mdi-cpu-64-bit</v-icon>
            {{ cpuUsage }}
        </v-chip>
        <v-chip size="x-small" color="success" variant="flat" class="perf-chip ml-1">
            <v-icon size="12" start>mdi-clock-outline</v-icon>
            {{ uptime }}
        </v-chip>
    </div>
</template>

<script>
import debug from "../../shared/debug"
import { debug as coreDebug } from "../../core/debug"

// Performance overlay enabled state - can be toggled like debug mode
const PERF_OVERLAY_ENABLED = false

function isPerfOverlayEnabled() {
    // Check file constant first
    if (PERF_OVERLAY_ENABLED) return true

    // Check window global (can be set from browser console)
    if (typeof window !== "undefined" && window.AMR_PERF_OVERLAY) return true

    // Check URL parameter
    if (typeof window !== "undefined" && window.location) {
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get("perf") === "true") return true
    }

    // Also show if debug mode is enabled
    if (debug.isEnabled()) return true

    return false
}

// Store component instance for live toggle
let perfOverlayInstance = null

// Expose toggle functions globally
if (typeof window !== "undefined") {
    window.enableAMRPerfOverlay = () => {
        window.AMR_PERF_OVERLAY = true
        if (perfOverlayInstance) {
            perfOverlayInstance.enableOverlay()
        }
        coreDebug.ui.info("PERF Performance overlay enabled")
    }
    window.disableAMRPerfOverlay = () => {
        window.AMR_PERF_OVERLAY = false
        if (perfOverlayInstance) {
            perfOverlayInstance.disableOverlay()
        }
        coreDebug.ui.info("PERF Performance overlay disabled")
    }
}

export default {
    name: "PerformanceOverlay",
    data() {
        return {
            memoryUsage: "-- MB",
            cpuUsage: "--%",
            uptime: "0s",
            startTime: Date.now(),
            updateInterval: null,
            showOverlay: false
        }
    },
    mounted() {
        perfOverlayInstance = this
        this.showOverlay = isPerfOverlayEnabled()
        if (this.showOverlay) {
            this.startUpdating()
        }
    },
    beforeUnmount() {
        perfOverlayInstance = null
        this.stopUpdating()
    },
    methods: {
        enableOverlay() {
            this.showOverlay = true
            this.startUpdating()
        },
        disableOverlay() {
            this.showOverlay = false
            this.stopUpdating()
        },
        startUpdating() {
            if (!this.updateInterval) {
                this.updateStats()
                this.updateInterval = setInterval(() => this.updateStats(), 1000)
            }
        },
        stopUpdating() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval)
                this.updateInterval = null
            }
        },
        updateStats() {
            // Update memory usage
            if (performance.memory) {
                // Chrome/Edge only - Firefox doesn't support performance.memory
                const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
                const totalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
                this.memoryUsage = `${usedMB}/${totalMB} MB`
            } else {
                // Firefox fallback - estimate from DOM
                this.memoryUsage = this.estimateMemory()
            }

            // Update uptime
            const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000)
            if (uptimeSec < 60) {
                this.uptime = `${uptimeSec}s`
            } else if (uptimeSec < 3600) {
                this.uptime = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
            } else {
                const h = Math.floor(uptimeSec / 3600)
                const m = Math.floor((uptimeSec % 3600) / 60)
                this.uptime = `${h}h ${m}m`
            }

            // Estimate CPU from frame timing (rough approximation)
            this.estimateCPU()
        },
        estimateMemory() {
            // Rough estimate based on DOM size
            const elements = document.querySelectorAll("*").length
            const estimateMB = Math.round(elements * 0.01) // ~10KB per element estimate
            return `~${estimateMB} MB (${elements} nodes)`
        },
        estimateCPU() {
            // Use requestAnimationFrame to estimate load
            const start = performance.now()
            requestAnimationFrame(() => {
                const frameTime = performance.now() - start
                // 16.67ms = 60fps = 0% idle, higher = more busy
                const loadPercent = Math.min(100, Math.round((frameTime / 16.67) * 100))
                this.cpuUsage = `${loadPercent > 100 ? ">100" : loadPercent}%`
            })
        }
    }
}
</script>

<style scoped>
.perf-overlay {
    display: flex;
    align-items: center;
    margin-left: 12px;
    opacity: 0.85;
}

.perf-chip {
    font-size: 10px !important;
    height: 20px !important;
    font-family: monospace;
}
</style>
