// Common units offered in unit pickers across the app. Units are still stored as free text, so
// buildUnitOptions preserves any legacy/custom value by prepending it when it isn't already listed.
export const UNIT_VALUES = [
    'pcs', 'set', 'pair', 'box', 'pack', 'pallet',
    'kg', 'g', 't',
    'l', 'ml',
    'm', 'cm', 'mm', 'm²', 'm³',
    'h', 'day',
]

export function buildUnitOptions(current, { allowEmpty = false } = {}) {
    const values = [...UNIT_VALUES]
    if (current && !values.includes(current)) {
        values.unshift(current)
    }
    const options = values.map((u) => ({ value: u, label: u }))
    if (allowEmpty) {
        options.unshift({ value: '', label: '—' })
    }
    return options
}
