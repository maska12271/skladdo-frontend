import { useCallback, useState } from 'react'

/**
 * Which ordering each top-N widget is currently showing.
 *
 * The backend ranks every one of them twice - by turnover and by volume - and ships both tables, because
 * they are genuinely different lists: the client who spent the most is rarely the one who ordered most
 * often. This is only the choice of which to display.
 *
 * `VALUE` is the money table (revenue, spend). `VOLUME` counts the work instead: units sold for products
 * and services, orders placed for clients. An account that may not see the company's money is given the
 * volume table and no choice, which is the whole point of the flag - see `canSeeCompanyFinancials`.
 */
export const RANK_VALUE = 'value'
export const RANK_VOLUME = 'volume'

/** The widgets that carry the selector, and the ordering each starts on. */
const DEFAULT_METRICS = {
    topClients: RANK_VALUE,
    topProducts: RANK_VALUE,
    topServices: RANK_VALUE,
}

export const RANK_KEYS = Object.keys(DEFAULT_METRICS)

const STORAGE_PREFIX = 'dashboard-rank-metrics-v1'

function readStored(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey)
        const parsed = raw ? JSON.parse(raw) : null
        if (!parsed || typeof parsed !== 'object') return {}
        // Only keys we still ship, only values we still understand: a stored preference from an older
        // build must not be able to ask for a table that no longer exists.
        return Object.fromEntries(
            Object.entries(parsed).filter(([key, value]) =>
                key in DEFAULT_METRICS && (value === RANK_VALUE || value === RANK_VOLUME))
        )
    } catch {
        return {}
    }
}

/**
 * Each top-N widget's chosen ordering, persisted per user in localStorage - the same treatment, and the
 * same reasoning, as the grid layout in {@link useDashboardLayout}: it is a display preference for one
 * person on one browser, so it belongs beside their arrangement rather than on the account.
 *
 * `metricOf(key)` answers with the effective ordering rather than the stored one: when the money table is
 * not on offer it returns {@link RANK_VOLUME} whatever is saved, so a preference set while an account could
 * see turnover cannot resurrect it after the permission is taken away.
 */
export function useRankMetrics(userId, canSeeFinancials) {
    const storageKey = `${STORAGE_PREFIX}:${userId ?? 'anon'}`
    const [stored, setStored] = useState(() => readStored(storageKey))

    // Re-read during render rather than in an effect. The stored value is derived from the key, so an
    // effect would render one frame of the previous user's choices before correcting itself - and React
    // handles this case by restarting the render before anything is committed.
    const [loadedFor, setLoadedFor] = useState(storageKey)
    if (loadedFor !== storageKey) {
        setLoadedFor(storageKey)
        setStored(readStored(storageKey))
    }

    const metricOf = useCallback((key) => {
        if (!canSeeFinancials) return RANK_VOLUME
        return stored[key] || DEFAULT_METRICS[key] || RANK_VALUE
    }, [stored, canSeeFinancials])

    const setMetric = useCallback((key, metric) => {
        setStored((prev) => {
            const next = { ...prev, [key]: metric }
            try {
                localStorage.setItem(storageKey, JSON.stringify(next))
            } catch {
                /* storage unavailable — the choice simply won't outlive the page */
            }
            return next
        })
    }, [storageKey])

    return { metricOf, setMetric }
}
