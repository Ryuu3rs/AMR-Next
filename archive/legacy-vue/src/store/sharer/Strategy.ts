export interface SharedMutation {
    type: string
    payload: unknown
}

export interface ShareStrategy {
    share: (message: SharedMutation) => void
    addEventListener: (fn: (data: SharedMutation) => void) => string | void
    close?: () => void
}
