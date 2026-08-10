import { useMemo } from 'react'
import { FormSelect } from './FormField'
import { buildCountryOptions } from '../data/countries'

/**
 * Searchable country picker. Emits the same `{ target: { name, value } }` event shape as
 * {@link FormSelect}, so it's a drop-in replacement for a plain country {@link FormField}.
 *
 * `frequentCountries` is the tenant's usage ranking (most-used first); pass it so the countries the
 * user actually works with float to the top of the list.
 */
export default function CountrySelectField({ value, frequentCountries, ...props }) {
    const options = useMemo(() => buildCountryOptions(value, frequentCountries), [value, frequentCountries])
    return <FormSelect value={value} options={options} searchable {...props} />
}
