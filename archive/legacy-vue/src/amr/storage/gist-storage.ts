/**
 * GitHub Gist storage implementation
 * Uses GitHub Gist API for cloud synchronization
 */
import Storage from "./model-storage"
import { ThrottleError } from "./error/ToManyRequests"
import { SyncError } from "./error/SyncError"

/** Gist file structure */
interface GistFile {
    content: string
    truncated?: boolean
    raw_url?: string
}

/** Gist API response */
interface GistResponse {
    files: {
        "amr.json"?: GistFile
        [key: string]: GistFile | undefined
    }
}

/** Stored manga data */
export interface GistMangaData {
    key: string
    upts?: number
    [key: string]: unknown
}

/** Gist storage configuration */
export interface GistStorageConfig {
    gistSyncGitID: string
    gistSyncSecret: string
}

/** HTTP methods for Gist API */
type HttpMethod = "GET" | "PATCH"

/**
 * GitHub Gist storage implementation
 */
export default class GistStorage extends Storage {
    override name = "Gist"
    private gistSyncGitID: string
    private gistSyncSecret: string

    constructor(config: GistStorageConfig) {
        super(false)
        this.gistSyncGitID = config.gistSyncGitID
        this.gistSyncSecret = config.gistSyncSecret
        this.requests = 0
    }

    /**
     * Make an API request to GitHub
     */
    private async ax<T>(method: HttpMethod, path: string, data?: object): Promise<T> {
        await this.wait()
        const url = `https://api.github.com/${path}`
        const response = await fetch(url, this.getConfig(method, data))

        if (response.ok) {
            return response.json() as Promise<T>
        }

        if (response.headers.get("x-ratelimit-remaining") === "0") {
            const errorData = await response.json()
            const resetHeader = response.headers.get("x-ratelimit-reset")
            const timestamp = parseInt(resetHeader || "0") * 1000
            throw new ThrottleError((errorData as { message?: string }).message || "Rate limited", new Date(timestamp))
        }

        const type = response.headers.get("content-type")
        if (type === "text/html") {
            throw new SyncError(await response.text(), response)
        }

        const errorData = await response.json()
        throw new SyncError((errorData as { message?: string })?.message ?? "Failed to get error data", response)
    }

    /**
     * Get fetch configuration for API requests
     */
    private getConfig(method: HttpMethod, data?: object): RequestInit {
        return {
            body: data ? JSON.stringify(data) : undefined,
            method: method.toUpperCase(),
            headers: {
                accept: "application/vnd.github+json",
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-cache",
                authorization: `Bearer ${this.gistSyncSecret}`
            }
        }
    }

    async getAll(): Promise<GistMangaData[]> {
        if (!this.gistSyncGitID || !this.gistSyncSecret) {
            throw new Error("Missing credentials. Skipping update")
        }
        if (this.gistSyncSecret.length < 2) {
            throw new Error("Missing Secret. Skipping update")
        }

        const request = await this.ax<GistResponse>("GET", `gists/${this.gistSyncGitID}?cache=${Date.now()}`)
        const amr = request.files["amr.json"]

        if (amr) {
            if (amr.truncated && amr.raw_url) {
                return this.ax<GistMangaData[]>("GET", amr.raw_url)
            } else {
                return JSON.parse(amr.content) as GistMangaData[]
            }
        } else {
            await this.init()
            return this.getAll()
        }
    }

    async init(): Promise<GistMangaData[]> {
        await this.wait()
        const request = await this.ax<GistResponse>("PATCH", `gists/${this.gistSyncGitID}`, this.getFileStruct("[]"))
        return JSON.parse(request.files["amr.json"]!.content) as GistMangaData[]
    }

    async saveAll(content: GistMangaData[]): Promise<GistResponse> {
        await this.wait()
        // Remove unused variables before uploading
        const newArr = content.map(({ upts, ...rest }) => rest)
        return this.ax<GistResponse>("PATCH", `gists/${this.gistSyncGitID}`, this.getFileStruct(JSON.stringify(newArr)))
    }

    async delete(key: string, value: GistMangaData): Promise<void> {
        const data = await this.getAll()
        const updates = data.map(manga => (manga.key === key ? value : manga))
        await this.wait()

        this.ax<GistResponse>(
            "PATCH",
            `gists/${this.gistSyncGitID}`,
            this.getFileStruct(JSON.stringify(updates))
        ).catch(e => {
            if (e instanceof ThrottleError) {
                setTimeout(() => {
                    this.delete(key, value)
                }, e.getRetryAfterDate().getTime() - Date.now())
            }
            throw e
        })
    }

    private getFileStruct(content: string): { files: { "amr.json": { content: string } } } {
        return { files: { "amr.json": { content: content } } }
    }
}
