import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

// Dedupes concurrent/repeat requests for the same key within a page session (e.g. a product table
// re-rendering the same thumbnails on every filter/sort change). Presigned URLs are short-lived, so
// this is intentionally in-memory only — never persisted, never reused across a full page reload.
const cache = new Map()

function resolve(key) {
    if (!cache.has(key)) {
        cache.set(key, apiGet(`/upload/presign?key=${encodeURIComponent(key)}`).then((r) => r.url))
    }
    return cache.get(key)
}

/**
 * Resolves a stored S3 key to a fetchable (presigned, time-limited) URL for rendering. An
 * already-absolute value (http(s):// or data:) is returned as-is, so callers migrating from the old
 * permanent-URL scheme need no special-casing.
 *
 * @param {string|null|undefined} key
 * @returns {string|null} the resolved URL, or null until it loads / when there is no key.
 */
export function usePresignedUrl(key) {
    const [url, setUrl] = useState(null)

    useEffect(() => {
        if (!key) {
            setUrl(null)
            return
        }
        if (key.startsWith('http') || key.startsWith('data:')) {
            setUrl(key)
            return
        }
        let active = true
        resolve(key)
            .then((resolved) => active && setUrl(resolved))
            .catch(() => active && setUrl(null))
        return () => {
            active = false
        }
    }, [key])

    return url
}
