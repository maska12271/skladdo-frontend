import i18n from '../i18n'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

// Registered by AuthContext so the client can force a logout when the token is rejected.
let unauthorizedHandler = null

// Registered by ToastProvider so every failed request surfaces an error notification.
let errorHandler = null

export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler
}

export function setErrorHandler(handler) {
    errorHandler = handler
}

function reportError(message) {
    if (errorHandler) errorHandler(message)
}

function getToken() {
    return localStorage.getItem('token')
}

// Which translated fallback to show when a response has no usable `{error}` body (e.g. a proxy
// error page). Backend errors normally arrive already translated via the Accept-Language header;
// these cover the gaps so the user never sees a raw status code or HTML.
const STATUS_FALLBACK_KEYS = {
    400: 'errors.badRequest',
    403: 'errors.forbidden',
    404: 'errors.notFound',
    409: 'errors.conflict',
    429: 'errors.tooManyRequests',
    500: 'errors.serverError',
    502: 'errors.unavailable',
    503: 'errors.unavailable',
    504: 'errors.unavailable',
}

// Every request advertises the user's chosen language so the backend can localise error messages.
function buildHeaders(extra = {}) {
    const token = getToken()
    return {
        'Accept-Language': i18n.resolvedLanguage || i18n.language || 'en',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    }
}

// fetch rejects (server unreachable / offline) before any response exists.
function networkError(suppressErrorToast) {
    const message = i18n.t('errors.network')
    if (!suppressErrorToast) reportError(message)
    return new Error(message)
}

// 401: drive a logout/redirect. No error toast — the session-expired flow is the notification.
function sessionExpiredError() {
    if (unauthorizedHandler) unauthorizedHandler()
    return new Error(i18n.t('errors.sessionExpired'))
}

async function notOkError(response, suppressErrorToast) {
    const message = await extractError(response)
    if (!suppressErrorToast) reportError(message)
    return new Error(message)
}

async function extractError(response) {
    let text = ''
    try {
        text = await response.text()
    } catch {
        // Body already consumed or unreadable — fall through to the status-based message.
    }
    if (text) {
        try {
            const parsed = JSON.parse(text)
            const message = parsed.error || parsed.message
            if (message) return message
        } catch {
            // Non-JSON body (e.g. a gateway error page): prefer a clean status message over raw HTML.
        }
    }
    return statusFallback(response.status)
}

function statusFallback(status) {
    const key = STATUS_FALLBACK_KEYS[status]
    return key ? i18n.t(key) : i18n.t('errors.requestFailed', { status })
}

async function request(path, options = {}) {
    // `suppressErrorToast` lets bulk callers (e.g. CSV import) handle failures per-row
    // instead of firing a global error toast for every failed request.
    // `skipAuthRedirect` lets the login call treat its own 401 (bad credentials) as a normal error
    // instead of a session-expiry logout — the two are indistinguishable by status code alone.
    const { suppressErrorToast = false, skipAuthRedirect = false, headers: customHeaders, ...fetchOptions } = options

    let response
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            headers: buildHeaders({ 'Content-Type': 'application/json', ...(customHeaders || {}) }),
            ...fetchOptions,
        })
    } catch {
        throw networkError(suppressErrorToast)
    }

    if (response.status === 401 && !skipAuthRedirect) {
        throw sessionExpiredError()
    }

    if (!response.ok) {
        throw await notOkError(response, suppressErrorToast)
    }

    if (response.status === 204) {
        return null
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    if (!text) {
        return null
    }

    if (contentType.includes('application/json')) {
        return JSON.parse(text)
    }

    return text
}

export function apiGet(path) {
    return request(path)
}

export function apiPost(path, body, options = {}) {
    return request(path, {
        method: 'POST',
        body: JSON.stringify(body),
        ...options,
    })
}

export function apiPut(path, body, options = {}) {
    return request(path, {
        method: 'PUT',
        body: JSON.stringify(body),
        ...options,
    })
}

export function apiPatch(path, body) {
    return request(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
    })
}

export function apiDelete(path) {
    return request(path, {
        method: 'DELETE',
    })
}

/**
 * Fetches a binary resource (e.g. a generated invoice PDF) and returns it as a Blob, applying the same
 * auth-header and 401/error handling as {@link request}. Unlike the JSON helpers it never tries to parse
 * the body.
 */
export async function apiDownload(path) {
    let response
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            headers: buildHeaders(),
        })
    } catch {
        throw networkError(false)
    }

    if (response.status === 401) {
        throw sessionExpiredError()
    }

    if (!response.ok) {
        throw await notOkError(response, false)
    }

    return response.blob()
}

/**
 * Posts a JSON body and returns the response as a Blob (e.g. a generated PDF preview), applying the same
 * auth-header and 401/error handling as {@link request}. Never tries to parse the body.
 */
export async function apiDownloadPost(path, body) {
    let response
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: buildHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
        })
    } catch {
        throw networkError(false)
    }

    if (response.status === 401) {
        throw sessionExpiredError()
    }

    if (!response.ok) {
        throw await notOkError(response, false)
    }

    return response.blob()
}

export async function apiUpload(path, formData) {
    let response
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            // No Content-Type: the browser sets the multipart boundary for FormData.
            headers: buildHeaders(),
            body: formData,
        })
    } catch {
        throw networkError(false)
    }

    if (response.status === 401) {
        throw sessionExpiredError()
    }

    if (!response.ok) {
        throw await notOkError(response, false)
    }

    return response.json()
}
