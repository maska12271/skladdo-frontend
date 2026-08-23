import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost, setUnauthorizedHandler } from '../api/client'
import i18n from '../i18n'

const AuthContext = createContext(null)

const TOKEN_KEY = 'token'
const USER_KEY = 'user'
/**
 * The client company a warehouse account was last working in. Stepping into its own settings switches the
 * session home, but the client it works for has not changed — this is what lets the header keep saying so,
 * and what "back to work" returns to.
 */
const LAST_CLIENT_KEY = 'lastClientCompanyId'

const MANAGER_ROLES = ['OWNER', 'ADMINISTRATOR']

function readStoredUser() {
    try {
        const raw = localStorage.getItem(USER_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

/**
 * Switches the UI to the account's stored language. New users inherit the company's configured default,
 * so an invited user lands in the right language on their first sign-in rather than the browser's guess.
 * Accounts that never set one (or that predate the field) keep whatever the browser detected.
 */
function applyUserLanguage(user) {
    const language = user?.language
    if (language && i18n.resolvedLanguage !== language) {
        i18n.changeLanguage(language)
    }
}

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
    /**
     * True while a company swap is in flight. The route guards hold still instead of redirecting during
     * one: the page being left loses its permissions the instant the new session lands, and its
     * {@code <Navigate>} would rewrite the URL underneath the destination the user actually asked for.
     */
    const switchingRef = useRef(false)
    const [lastClientId, setLastClientId] = useState(() => {
        const stored = Number(localStorage.getItem(LAST_CLIENT_KEY))
        return Number.isFinite(stored) && stored > 0 ? stored : null
    })
    const [user, setUser] = useState(readStoredUser)
    // Companies this login can work in: its own, plus any client company reachable through an active
    // warehouse connection. One entry for everybody else, which is how the switcher knows to stay hidden.
    const [companies, setCompanies] = useState([])

    const persistUser = useCallback((nextUser) => {
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
        setUser(nextUser)
        applyUserLanguage(nextUser)
    }, [])

    // Merge a partial update into the current user (e.g. after the user edits their own email signature).
    const updateUser = useCallback((partial) => {
        setUser((prev) => {
            const next = { ...prev, ...partial }
            localStorage.setItem(USER_KEY, JSON.stringify(next))
            return next
        })
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(LAST_CLIENT_KEY)
        setToken(null)
        setUser(null)
        setLastClientId(null)
        setCompanies([])
    }, [])

    // Let the API client trigger a logout when the backend rejects the token (401).
    useEffect(() => {
        setUnauthorizedHandler(logout)
        return () => setUnauthorizedHandler(null)
    }, [logout])

    // Refresh the profile (and its permissions) from the server whenever a token is present, so
    // permission changes made by an admin take effect on the next load and sessions stored before
    // permissions existed get backfilled.
    useEffect(() => {
        if (!token) return
        let cancelled = false
        apiGet('/auth/me')
            .then((fresh) => {
                if (!cancelled && fresh) persistUser(fresh)
            })
            .catch(() => {
                /* 401 is handled by the unauthorized handler; ignore other transient errors. */
            })
        return () => {
            cancelled = true
        }
    }, [token, persistUser])

    // Keep the switcher's list in step with the session. Refreshed alongside the profile so a connection
    // accepted (or ended) elsewhere shows up on the next load without needing a sign-out.
    const refreshCompanies = useCallback(() => {
        apiGet('/auth/companies')
            .then((list) => setCompanies(Array.isArray(list) ? list : []))
            .catch(() => {
                /* Not worth surfacing: the switcher simply stays as it was. */
            })
    }, [])

    useEffect(() => {
        if (!token) return
        refreshCompanies()
    }, [token, refreshCompanies])

    // Store a fresh session (token + profile) and put the user into the authenticated state.
    const startSession = useCallback(({ token: newToken, user: newUser }) => {
        localStorage.setItem(TOKEN_KEY, newToken)
        localStorage.setItem(USER_KEY, JSON.stringify(newUser))
        if (newUser?.partnerSession === true && newUser.companyId) {
            localStorage.setItem(LAST_CLIENT_KEY, String(newUser.companyId))
            setLastClientId(newUser.companyId)
        }
        setToken(newToken)
        setUser(newUser)
        applyUserLanguage(newUser)
        return newUser
    }, [])

    /**
     * Swaps the session into another company this login can work in. The server mints a new token pinned
     * to it, so the whole app — every list, every permission check — is simply working in that company
     * from the next request on; no page needs to know a switch happened.
     */
    const switchCompany = useCallback(async (companyId) => {
        // Raised before anything changes and read by the route guards during render. A ref rather than
        // state on purpose: the new session and a state flag would land in the same React batch, so no
        // render would ever observe the flag, and releasing it a tick later loses to React's scheduler.
        // ProtectedLayout lowers it once a navigation has actually committed.
        switchingRef.current = true
        const response = await apiPost('/auth/switch-company', { companyId })
        const nextUser = startSession(response)
        refreshCompanies()
        return nextUser
    }, [startSession, refreshCompanies])

    const login = useCallback(async (email, password) => {
        // Suppress the global error toast (LoginPage renders the failure inline) and skip the session-
        // expiry redirect so a 401 for bad credentials surfaces "invalid email or password", not "session expired".
        const response = await apiPost('/auth/login', { email, password }, { suppressErrorToast: true, skipAuthRedirect: true })
        return startSession(response)
    }, [startSession])

    // Self-service signup: create the company + owner and sign the new owner straight in.
    const register = useCallback(async (payload) => {
        const response = await apiPost('/public/register', payload, { suppressErrorToast: true, skipAuthRedirect: true })
        return startSession(response)
    }, [startSession])

    const isAdmin = MANAGER_ROLES.includes(user?.role)

    // Standing in the account's *own* company, which `role` hides during a partner session. Governs the
    // few actions that are about the account itself rather than the data being worked in.
    const isHomeAdmin = MANAGER_ROLES.includes(user?.homeRole || user?.role)

    // Whether the current account may see monetary values. Managers always can; everyone else is
    // governed by their account flag (default true when unset, e.g. sessions stored before the flag).
    const canSeePrices = isAdmin || user?.canSeePrices !== false

    /**
     * Whether the current user may perform `action` ('canView' | 'canCreate' | 'canEdit' |
     * 'canDelete') on `module`. Owners and administrators are unrestricted.
     *
     * The account-type check comes first, and deliberately outranks that: a warehouse account owns no
     * catalogue, orders or tenders in its own company, so being its owner opens nothing. This mirrors the
     * order the server uses — without it the sidebar would offer pages every request 403s on.
     */
    const can = useCallback((module, action = 'canView') => {
        if (!user) return false
        if (user.companyType === 'WAREHOUSE' && user.partnerSession !== true) return false
        // A platform account is Skladdo itself and has no business data anywhere — not even a client to
        // switch into — so unlike a warehouse account this closes unconditionally.
        if (user.companyType === 'PLATFORM') return false
        if (MANAGER_ROLES.includes(user.role)) return true
        const flags = user.permissions?.[module]
        return Boolean(flags && flags[action])
    }, [user])

    // True while working inside a client company through a warehouse connection: access is capped at
    // warehouse staff there, however senior the account is in its own company.
    const isPartnerSession = user?.partnerSession === true

    // The account type chosen at signup. A warehouse account owns no catalogue, orders or tenders at all —
    // the server refuses them outright — so the app shows it its connected clients instead.
    const isWarehouseAccount = user?.companyType === 'WAREHOUSE'

    // Whether this account operates the platform itself, which is what opens the cross-tenant `/admin`
    // panel. Independent of `isAdmin`: that describes standing inside one company and grants nothing here.
    // The flag is only ever set by deployment configuration (app.platform-admin-emails), never through the
    // app, and every /api/admin endpoint re-checks it — so this drives navigation, not access.
    const isPlatformAdmin = user?.platformAdmin === true

    // Whether the login belongs to Skladdo's own shell company rather than to a customer. Distinct from
    // `isPlatformAdmin`, which is the capability: an operator whose account happens to live in a real
    // customer company still has business pages to see, and this is what says "there are none".
    const isPlatformCompany = user?.companyType === 'PLATFORM'

    const value = useMemo(() => ({
        token,
        user,
        isAuthenticated: Boolean(token),
        isAdmin,
        isHomeAdmin,
        canSeePrices,
        permissions: user?.permissions || {},
        can,
        login,
        register,
        logout,
        updateUser,
        companies,
        switchCompany,
        refreshCompanies,
        isPartnerSession,
        isWarehouseAccount,
        isPlatformAdmin,
        isPlatformCompany,
        lastClientId,
        switchingRef,
    }), [token, user, isAdmin, isHomeAdmin, canSeePrices, can, login, register, logout, updateUser,
        companies, switchCompany, refreshCompanies, isPartnerSession, isWarehouseAccount, isPlatformAdmin,
        isPlatformCompany, lastClientId])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    return useContext(AuthContext)
}

/**
 * Convenience hook returning the four access flags for a single module, e.g.
 * `const { canView, canCreate, canEdit, canDelete } = usePermissions('PRODUCTS')`.
 */
export function usePermissions(module) {
    const { can } = useAuth()
    return {
        canView: can(module, 'canView'),
        canCreate: can(module, 'canCreate'),
        canEdit: can(module, 'canEdit'),
        canDelete: can(module, 'canDelete'),
    }
}
