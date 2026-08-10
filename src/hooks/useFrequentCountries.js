import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import { safeArray } from '../utils/format'

/**
 * Fetches the tenant's country usage ranking (most-used first) for a given entity, so the country
 * picker can float the countries the user actually works with to the top.
 *
 * @param {string|null} entity - API collection, e.g. 'manufacturers' or 'clients'. Pass a falsy
 *   value to skip fetching (e.g. a modal that only sometimes shows a country field).
 * @returns {string[]} country names ordered most-used first (empty until loaded / on error).
 */
export function useFrequentCountries(entity) {
    const [countries, setCountries] = useState([])

    useEffect(() => {
        if (!entity) return
        let active = true
        apiGet(`/${entity}/countries`)
            .then((data) => active && setCountries(safeArray(data)))
            .catch(() => {}) // ordering is a nicety; the full list still works without it
        return () => {
            active = false
        }
    }, [entity])

    return countries
}
