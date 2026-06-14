/**
 * Mock for webextension-polyfill
 * Provides stub implementations for browser extension APIs used in tests
 */

const storage = {
    local: {
        _data: {},
        get: async keys => {
            if (typeof keys === "string") {
                return { [keys]: storage.local._data[keys] }
            }
            if (Array.isArray(keys)) {
                const result = {}
                keys.forEach(key => {
                    result[key] = storage.local._data[key]
                })
                return result
            }
            return { ...storage.local._data }
        },
        set: async items => {
            Object.assign(storage.local._data, items)
        },
        remove: async keys => {
            const keysArray = Array.isArray(keys) ? keys : [keys]
            keysArray.forEach(key => {
                delete storage.local._data[key]
            })
        },
        clear: async () => {
            storage.local._data = {}
        }
    },
    sync: {
        _data: {},
        get: async keys => {
            if (typeof keys === "string") {
                return { [keys]: storage.sync._data[keys] }
            }
            if (Array.isArray(keys)) {
                const result = {}
                keys.forEach(key => {
                    result[key] = storage.sync._data[key]
                })
                return result
            }
            return { ...storage.sync._data }
        },
        set: async items => {
            Object.assign(storage.sync._data, items)
        },
        remove: async keys => {
            const keysArray = Array.isArray(keys) ? keys : [keys]
            keysArray.forEach(key => {
                delete storage.sync._data[key]
            })
        },
        clear: async () => {
            storage.sync._data = {}
        }
    }
}

const runtime = {
    sendMessage: async message => {
        return Promise.resolve({})
    },
    onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false
    },
    getURL: path => `chrome-extension://mock-extension-id/${path}`,
    id: "mock-extension-id"
}

const tabs = {
    query: async () => [],
    create: async options => ({ id: 1, ...options }),
    update: async (tabId, options) => ({ id: tabId, ...options }),
    sendMessage: async () => ({})
}

const i18n = {
    getMessage: (key, substitutions) => {
        if (substitutions) {
            return `${key}: ${JSON.stringify(substitutions)}`
        }
        return key
    },
    getUILanguage: () => "en"
}

const alarms = {
    create: () => {},
    clear: async () => true,
    get: async () => null,
    getAll: async () => [],
    onAlarm: {
        addListener: () => {},
        removeListener: () => {}
    }
}

const notifications = {
    create: async () => "notification-id",
    clear: async () => true,
    onClicked: {
        addListener: () => {},
        removeListener: () => {}
    }
}

export default {
    storage,
    runtime,
    tabs,
    i18n,
    alarms,
    notifications
}

export { storage, runtime, tabs, i18n, alarms, notifications }
