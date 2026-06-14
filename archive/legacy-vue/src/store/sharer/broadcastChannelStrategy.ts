import { ShareStrategy, SharedMutation } from "./Strategy"

export default class BroadcastChannelStrategy implements ShareStrategy {
    private channel: globalThis.BroadcastChannel
    private messageHandler: ((e: MessageEvent) => void) | null = null

    static available(BroadcastChannelImpl = globalThis.BroadcastChannel) {
        return !(typeof BroadcastChannelImpl !== "function")
    }

    constructor({ key = "vuex-shared-mutations" }: { key?: string } = {}) {
        if (!BroadcastChannelStrategy.available(globalThis.BroadcastChannel)) {
            throw new Error("Broadcast strategy not available")
        }
        this.channel = new globalThis.BroadcastChannel(key)
    }

    addEventListener(fn: (data: SharedMutation) => void) {
        // Store reference to handler so we can remove it later
        this.messageHandler = (e: MessageEvent) => {
            fn(e.data as SharedMutation)
        }
        this.channel.addEventListener("message", this.messageHandler)
    }

    share(message: SharedMutation) {
        // Convert reactive Proxy objects to plain objects for structured cloning
        const plainMessage = JSON.parse(JSON.stringify(message))
        return this.channel.postMessage(plainMessage)
    }

    /**
     * Close the BroadcastChannel to prevent memory leaks
     * Should be called when the store is being destroyed
     */
    close() {
        if (this.messageHandler) {
            this.channel.removeEventListener("message", this.messageHandler)
            this.messageHandler = null
        }
        this.channel.close()
    }
}
