/**
 * Mirror Diagnostics Utility
 *
 * Tests mirror sites to determine their status:
 * - WORKING: Site is accessible and functional
 * - PERMANENT_FAILURE: 404, DNS failure, site no longer exists
 * - TEMPORARY_FAILURE: 403 (Cloudflare), rate limiting, API changes
 * - NEEDS_INVESTIGATION: NetworkError, CORS issues, SSL problems
 */

export interface MirrorDiagnosticResult {
    mirrorName: string
    domain: string
    homeUrl: string
    status: "WORKING" | "PERMANENT_FAILURE" | "TEMPORARY_FAILURE" | "NEEDS_INVESTIGATION"
    statusCode?: number
    errorType?: string
    errorMessage?: string
    responseTime?: number
    testedAt: string
    recommendation: string
}

export interface DiagnosticReport {
    generatedAt: string
    totalMirrorsTested: number
    summary: {
        working: number
        permanentFailures: number
        temporaryFailures: number
        needsInvestigation: number
    }
    results: MirrorDiagnosticResult[]
}

/**
 * Categorizes an error into failure types
 */
export function categorizeError(
    error: Error | string,
    statusCode?: number
): { status: MirrorDiagnosticResult["status"]; errorType: string; recommendation: string } {
    const errorMessage = typeof error === "string" ? error : error.message

    // Check status codes first
    if (statusCode) {
        if (statusCode === 404) {
            return {
                status: "PERMANENT_FAILURE",
                errorType: "HTTP_404",
                recommendation: "Manga page no longer exists. Remove from list or migrate to another mirror."
            }
        }
        if (statusCode === 403) {
            return {
                status: "TEMPORARY_FAILURE",
                errorType: "HTTP_403_BLOCKED",
                recommendation: "Site is blocking requests (Cloudflare/WAF). May need updated headers or CORS handling."
            }
        }
        if (statusCode >= 500) {
            return {
                status: "TEMPORARY_FAILURE",
                errorType: `HTTP_${statusCode}_SERVER_ERROR`,
                recommendation: "Server error. May be temporary. Retry later."
            }
        }
    }

    // Check error message patterns
    if (errorMessage.includes("NetworkError") || errorMessage.includes("network")) {
        // NetworkError can be CORS, SSL, or actual network issues
        if (errorMessage.includes("CORS") || errorMessage.includes("cross-origin")) {
            return {
                status: "TEMPORARY_FAILURE",
                errorType: "CORS_ERROR",
                recommendation: "CORS policy blocking requests. May need proxy or header updates."
            }
        }
        return {
            status: "NEEDS_INVESTIGATION",
            errorType: "NETWORK_ERROR",
            recommendation: "Network error. Could be CORS, SSL, firewall, or site is down. Needs manual testing."
        }
    }

    if (errorMessage.includes("DNS") || errorMessage.includes("NXDOMAIN") || errorMessage.includes("not resolve")) {
        return {
            status: "PERMANENT_FAILURE",
            errorType: "DNS_FAILURE",
            recommendation: "Domain no longer exists. Remove all manga from this mirror."
        }
    }

    if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        return {
            status: "TEMPORARY_FAILURE",
            errorType: "TIMEOUT",
            recommendation: "Request timed out. Site may be slow or overloaded. Retry later."
        }
    }

    if (errorMessage.includes("SSL") || errorMessage.includes("certificate")) {
        return {
            status: "TEMPORARY_FAILURE",
            errorType: "SSL_ERROR",
            recommendation: "SSL certificate issue. May be temporary or site configuration problem."
        }
    }

    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return {
            status: "TEMPORARY_FAILURE",
            errorType: "RATE_LIMITED",
            recommendation: "Rate limited. Reduce request frequency."
        }
    }

    // Default - needs investigation
    return {
        status: "NEEDS_INVESTIGATION",
        errorType: "UNKNOWN_ERROR",
        recommendation: "Unknown error. Requires manual investigation."
    }
}

/**
 * Creates a diagnostic result for a successful test
 */
export function createSuccessResult(
    mirrorName: string,
    domain: string,
    homeUrl: string,
    responseTime: number
): MirrorDiagnosticResult {
    return {
        mirrorName,
        domain,
        homeUrl,
        status: "WORKING",
        responseTime,
        testedAt: new Date().toISOString(),
        recommendation: "Mirror is working correctly."
    }
}

/**
 * Creates a diagnostic result for a failed test
 */
export function createFailureResult(
    mirrorName: string,
    domain: string,
    homeUrl: string,
    error: Error | string,
    statusCode?: number
): MirrorDiagnosticResult {
    const { status, errorType, recommendation } = categorizeError(error, statusCode)
    return {
        mirrorName,
        domain,
        homeUrl,
        status,
        statusCode,
        errorType,
        errorMessage: typeof error === "string" ? error : error.message,
        testedAt: new Date().toISOString(),
        recommendation
    }
}

/**
 * Generates a summary report from diagnostic results
 */
export function generateReport(results: MirrorDiagnosticResult[]): DiagnosticReport {
    const summary = {
        working: 0,
        permanentFailures: 0,
        temporaryFailures: 0,
        needsInvestigation: 0
    }

    results.forEach(result => {
        switch (result.status) {
            case "WORKING":
                summary.working++
                break
            case "PERMANENT_FAILURE":
                summary.permanentFailures++
                break
            case "TEMPORARY_FAILURE":
                summary.temporaryFailures++
                break
            case "NEEDS_INVESTIGATION":
                summary.needsInvestigation++
                break
        }
    })

    return {
        generatedAt: new Date().toISOString(),
        totalMirrorsTested: results.length,
        summary,
        results
    }
}

/**
 * Formats a diagnostic report as a readable string for console/UI display
 */
export function formatReportAsText(report: DiagnosticReport): string {
    const lines: string[] = []

    lines.push("=".repeat(60))
    lines.push("MIRROR DIAGNOSTICS REPORT")
    lines.push(`Generated: ${report.generatedAt}`)
    lines.push("=".repeat(60))
    lines.push("")
    lines.push("SUMMARY")
    lines.push("-".repeat(30))
    lines.push(`Total Mirrors Tested: ${report.totalMirrorsTested}`)
    lines.push(`✅ Working: ${report.summary.working}`)
    lines.push(`❌ Permanent Failures: ${report.summary.permanentFailures}`)
    lines.push(`⚠️ Temporary Failures: ${report.summary.temporaryFailures}`)
    lines.push(`🔍 Needs Investigation: ${report.summary.needsInvestigation}`)
    lines.push("")

    // Group results by status
    const groups = {
        "❌ PERMANENT FAILURES (Remove/Migrate)": report.results.filter(r => r.status === "PERMANENT_FAILURE"),
        "⚠️ TEMPORARY FAILURES (May be fixable)": report.results.filter(r => r.status === "TEMPORARY_FAILURE"),
        "🔍 NEEDS INVESTIGATION": report.results.filter(r => r.status === "NEEDS_INVESTIGATION"),
        "✅ WORKING": report.results.filter(r => r.status === "WORKING")
    }

    for (const [groupName, results] of Object.entries(groups)) {
        if (results.length === 0) continue

        lines.push("")
        lines.push(groupName)
        lines.push("-".repeat(50))

        for (const result of results) {
            lines.push(`  ${result.mirrorName}`)
            lines.push(`    Domain: ${result.domain}`)
            if (result.errorType) {
                lines.push(`    Error: ${result.errorType}`)
            }
            if (result.statusCode) {
                lines.push(`    HTTP Status: ${result.statusCode}`)
            }
            lines.push(`    Recommendation: ${result.recommendation}`)
            lines.push("")
        }
    }

    return lines.join("\n")
}
