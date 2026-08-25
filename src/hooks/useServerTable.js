import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { safeArray } from '../utils/format'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Drives a server-paginated table. Keeps page / size / sort / search / filters in the URL (so Back and
 * refresh restore the exact view), debounces the search text, and re-fetches whenever the effective
 * query changes. Returns `rows` (just the current page) plus `total` for DataTable's server mode.
 *
 * Filter values are arrays of strings, matching SearchFilters/CustomSelect. In the URL a filter is
 * stored comma-joined (`manufacturer=1,2`); the same shape is passed to `fetcher` as `filters`.
 *
 * @param {object}   opts
 * @param {string[]} opts.filterKeys        URL/query keys this table filters on, e.g. ['manufacturer','category','status']
 * @param {function} opts.fetcher           ({ page, size, sortBy, sortDir, q, filters }) => Promise<Page>
 * @param {string}   [opts.defaultSortBy='id']
 * @param {string}   [opts.defaultSortDir='desc']
 * @param {number}   [opts.defaultPageSize=10]
 */
export function useServerTable({
    filterKeys = [],
    fetcher,
    defaultSortBy = 'id',
    defaultSortDir = 'desc',
    defaultPageSize = 10,
}) {
    const [searchParams, setSearchParams] = useSearchParams()

    // The URL is the source of truth for all table state.
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Number(searchParams.get('size')) || defaultPageSize
    const sortBy = searchParams.get('sortBy') || defaultSortBy
    const sortDir = searchParams.get('sortDir') || defaultSortDir
    const q = searchParams.get('q') || ''

    const filters = {}
    for (const key of filterKeys) {
        const raw = searchParams.get(key)
        filters[key] = raw ? raw.split(',').filter(Boolean) : []
    }

    /**
     * The params as last written from here, so several updates in one tick compose.
     *
     * `setSearchParams((prev) => …)` looks like it would do this, but `prev` is the value from the last
     * *render* — so two calls in the same tick both start from the pre-click URL and the second silently
     * discards the first (F-016). Writing the result back here synchronously is what lets a control
     * change more than one param, e.g. clearing every filter at once.
     */
    const paramsRef = useRef(searchParams)
    // Resync for navigations that did not come from here: Back, a link, another component's write.
    useEffect(() => {
        paramsRef.current = searchParams
    }, [searchParams])

    // Writes a single query param (arrays comma-joined), dropping empties to keep the URL tidy.
    // Changing a filter, the search, or the page size resets pagination to page 1.
    const updateParam = useCallback((key, value, { resetPage = true } = {}) => {
        const next = new URLSearchParams(paramsRef.current)
        const serialized = Array.isArray(value) ? value.join(',') : value
        if (serialized) next.set(key, String(serialized))
        else next.delete(key)
        if (resetPage) next.delete('page')
        paramsRef.current = next
        setSearchParams(next, { replace: true })
    }, [setSearchParams])

    // Sort writes both params in ONE setSearchParams call. Two updateParam calls would now compose
    // correctly (see paramsRef above), but one write for one user action is still the clearer shape.
    const setSort = useCallback((nextSortBy, nextSortDir) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            if (nextSortBy && nextSortBy !== defaultSortBy) next.set('sortBy', nextSortBy)
            else next.delete('sortBy')
            if (nextSortDir && nextSortDir !== defaultSortDir) next.set('sortDir', nextSortDir)
            else next.delete('sortDir')
            // Re-sorting changes which records are on page 1, so an old page number is meaningless.
            next.delete('page')
            return next
        }, { replace: true })
    }, [setSearchParams, defaultSortBy, defaultSortDir])

    const setSearch = useCallback((value) => updateParam('q', value), [updateParam])
    const setFilter = useCallback((key, value) => updateParam(key, value), [updateParam])
    const setPage = useCallback((value) => updateParam('page', value > 1 ? value : '', { resetPage: false }), [updateParam])
    const setPageSize = useCallback((value) => updateParam('size', value === defaultPageSize ? '' : value), [updateParam, defaultPageSize])

    // Debounce the search text so typing fires one request, not one per keystroke. The input stays
    // responsive because `q` (and the URL) update immediately; only the fetch trails behind.
    const [debouncedQ, setDebouncedQ] = useState(q)
    useEffect(() => {
        const id = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(id)
    }, [q])

    const [rows, setRows] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    // Stable string of the filter values so the effect re-runs when a filter changes without
    // depending on the (identity-unstable) `filters` object.
    const filtersKey = filterKeys.map((k) => `${k}=${filters[k].join('|')}`).join('&')

    // Keep the latest fetcher in a ref so callers can pass an inline closure without retriggering.
    const fetcherRef = useRef(fetcher)
    useEffect(() => {
        fetcherRef.current = fetcher
    })

    // `reload()` bumps this to force a refetch after a create / edit / delete.
    const [reloadFlag, setReloadFlag] = useState(0)
    const reload = useCallback(() => setReloadFlag((n) => n + 1), [])

    useEffect(() => {
        let active = true
        setLoading(true)
        Promise.resolve(fetcherRef.current({ page, size: pageSize, sortBy, sortDir, q: debouncedQ, filters }))
            .then((res) => {
                if (!active) return
                setRows(safeArray(res))
                setTotal(typeof res?.totalElements === 'number' ? res.totalElements : safeArray(res).length)
            })
            .catch(() => {
                // The api client already surfaces an error toast; keep the previous rows visible.
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, sortBy, sortDir, debouncedQ, filtersKey, reloadFlag])

    return {
        rows,
        total,
        loading,
        page,
        pageSize,
        sortBy,
        sortDir,
        q,
        filters,
        setSearch,
        setFilter,
        setPage,
        setPageSize,
        setSort,
        reload,
    }
}
