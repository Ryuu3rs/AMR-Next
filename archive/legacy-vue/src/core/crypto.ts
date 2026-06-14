/**
 * AMR Crypto Module - Native Web Crypto wrapper
 *
 * Provides crypto-js compatible API using native SubtleCrypto.
 * This eliminates the crypto-js dependency (~15KB).
 *
 * NOTE: For now, we keep crypto-js for backwards compatibility with
 * existing mirrors that use its specific PBKDF2 key derivation.
 * This module provides utilities that CAN use native crypto when possible.
 *
 * Usage:
 *   import { aesDecrypt, base64Decode, hexDecode } from '@/core/crypto'
 */

import { debug } from "./debug"

// ============ Encoding Utilities ============

/** Decode base64 string to Uint8Array */
export function base64Decode(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

/** Encode Uint8Array to base64 string */
export function base64Encode(bytes: Uint8Array): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

/** Decode hex string to Uint8Array */
export function hexDecode(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
}

/** Encode Uint8Array to hex string */
export function hexEncode(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
}

/** Convert string to UTF-8 Uint8Array */
export function utf8Encode(str: string): Uint8Array {
    return new TextEncoder().encode(str)
}

/** Convert UTF-8 Uint8Array to string */
export function utf8Decode(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes)
}

// ============ Native AES (for future use) ============

/**
 * AES-CBC decrypt using native SubtleCrypto
 * This is for when we have raw key bytes and IV, NOT password-based decryption.
 */
export async function aesDecryptNative(
    ciphertext: Uint8Array,
    keyBytes: Uint8Array,
    iv: Uint8Array
): Promise<Uint8Array> {
    try {
        const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "AES-CBC" }, false, [
            "decrypt"
        ])

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: iv.buffer as ArrayBuffer },
            key,
            ciphertext.buffer as ArrayBuffer
        )

        return new Uint8Array(decrypted)
    } catch (error) {
        debug.crypto.error("AES decrypt failed", error)
        throw error
    }
}

/**
 * AES-CBC encrypt using native SubtleCrypto
 */
export async function aesEncryptNative(
    plaintext: Uint8Array,
    keyBytes: Uint8Array,
    iv: Uint8Array
): Promise<Uint8Array> {
    try {
        const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "AES-CBC" }, false, [
            "encrypt"
        ])

        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-CBC", iv: iv.buffer as ArrayBuffer },
            key,
            plaintext.buffer as ArrayBuffer
        )

        return new Uint8Array(encrypted)
    } catch (error) {
        debug.crypto.error("AES encrypt failed", error)
        throw error
    }
}

// ============ Random bytes ============

/** Generate cryptographically secure random bytes */
export function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return bytes
}

// ============ SHA-256 hash ============

/** Compute SHA-256 hash of data */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer)
    return new Uint8Array(hash)
}
