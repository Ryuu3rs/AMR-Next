import type { ExtensionMessage, ResponseFor } from "./messages"

export type ExtensionAPI = any

function resolveBrowserApi(): ExtensionAPI {
    if (typeof browser !== "undefined") return browser
    if (typeof chrome !== "undefined") return chrome
    return {
        runtime: {
            sendMessage: async () => {
                throw new Error("No extension runtime API detected")
            }
        }
    }
}

export const extensionApi = resolveBrowserApi()

export async function sendRuntimeMessage<TType extends ExtensionMessage["type"]>(
    message: Extract<ExtensionMessage, { type: TType }>
): Promise<ResponseFor<TType>> {
    return (await extensionApi.runtime.sendMessage(message)) as ResponseFor<TType>
}
