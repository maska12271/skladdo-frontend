import { describe, it, expect } from 'vitest'
import { buildHeaderResolver, remapToCanonical, exportColumnsFromFields } from './spreadsheet'
import i18n from '../i18n'

/**
 * Import/export is entirely client-side — there is no backend endpoint to test it through, which is why
 * these are unit tests rather than the API-driven checks used everywhere else in the test pass.
 *
 * The behaviour that carries the most risk is **header matching across languages**: a file exported by a
 * colleague running the UI in Estonian must import for someone running it in English. That is a real
 * workflow in this product's market, and it silently degrades to "no columns matched" rather than failing
 * loudly, so it is worth pinning per language rather than trusting one spot check.
 */

/** A miniature schema mirroring the real PRODUCT_FIELDS shape, incl. an aliasKey and a non-exportable id. */
const FIELDS = [
    { key: 'id', labelKey: 'common.id', importable: false, value: (r) => r.id },
    { key: 'name', labelKey: 'common.name', required: true, value: (r) => r.name },
    { key: 'price', labelKey: 'common.price', value: (r) => r.price },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], value: (r) => (r.active ? 'Active' : 'Inactive') },
]

const resolver = () => buildHeaderResolver(FIELDS, i18n)

describe('buildHeaderResolver', () => {
    it('matches a header written in any supported language, whatever the UI language is', () => {
        const resolve = resolver()
        for (const lng of ['en', 'et', 'ru']) {
            const t = i18n.getFixedT(lng)
            expect(resolve(t('common.name')), `name in ${lng}`).toBe('name')
            expect(resolve(t('common.price')), `price in ${lng}`).toBe('price')
        }
    })

    it('is insensitive to casing and surrounding whitespace', () => {
        const resolve = resolver()
        const name = i18n.getFixedT('en')('common.name')
        expect(resolve(name.toUpperCase())).toBe('name')
        expect(resolve(`  ${name.toLowerCase()}  `)).toBe('name')
        expect(resolve(name.replace(/ /g, '   '))).toBe('name')
    })

    it('accepts the canonical key itself, so a machine-written file imports', () => {
        const resolve = resolver()
        expect(resolve('name')).toBe('name')
        expect(resolve('price')).toBe('price')
    })

    it('resolves a field aliasKey as well as its own label', () => {
        const resolve = resolver()
        const t = i18n.getFixedT('en')
        expect(resolve(t('common.status'))).toBe('status')
        expect(resolve(t('common.active')), 'aliasKey').toBe('status')
    })

    it('returns null for an unrecognised header rather than guessing', () => {
        const resolve = resolver()
        expect(resolve('Not A Column')).toBeNull()
        expect(resolve('')).toBeNull()
        expect(resolve(null)).toBeNull()
        expect(resolve(undefined)).toBeNull()
    })

    /**
     * The real round trip: export in one language, re-import while the UI is in another. This is the
     * case the whole multilingual design exists for.
     */
    it('round-trips an Estonian-headed export into an English session', () => {
        const et = i18n.getFixedT('et')
        const exported = [et('common.name'), et('common.price')]
        const resolve = resolver()
        expect(exported.map(resolve)).toEqual(['name', 'price'])
    })
})

describe('remapToCanonical', () => {
    it('re-keys records to canonical keys and reports which fields were present', () => {
        const t = i18n.getFixedT('et')
        const headers = [t('common.name'), t('common.price'), 'Unknown Column']
        const records = [
            { [t('common.name')]: 'Widget', [t('common.price')]: '4.50', 'Unknown Column': 'ignored' },
        ]

        const { records: out, presentKeys } = remapToCanonical(headers, records, resolver())

        expect(out).toEqual([{ name: 'Widget', price: '4.50' }])
        expect([...presentKeys].sort()).toEqual(['name', 'price'])
        expect(presentKeys.has('status'), 'absent column not reported present').toBe(false)
    })

    it('substitutes an empty string for a missing cell rather than undefined', () => {
        const headers = ['name', 'price']
        const { records } = remapToCanonical(headers, [{ name: 'Widget' }], resolver())
        expect(records[0]).toEqual({ name: 'Widget', price: '' })
    })

    it('returns no records for a file whose headers match nothing', () => {
        const { records, presentKeys } = remapToCanonical(['Nope'], [{ Nope: 'x' }], resolver())
        expect(presentKeys.size).toBe(0)
        expect(records).toEqual([{}])
    })
})

describe('exportColumnsFromFields', () => {
    it('localises headers to the active language and keeps schema order', () => {
        const t = i18n.getFixedT('ru')
        const columns = exportColumnsFromFields(FIELDS, t)
        expect(columns.map((c) => c.header)).toEqual([
            t('common.id'), t('common.name'), t('common.price'), t('common.status'),
        ])
    })

    it('uses each field value extractor, falling back to the raw key', () => {
        const t = i18n.getFixedT('en')
        const columns = exportColumnsFromFields(FIELDS, t)
        const row = { id: 7, name: 'Widget', price: 4.5, active: false }
        expect(columns.map((c) => c.value(row))).toEqual([7, 'Widget', 4.5, 'Inactive'])
    })

    it('omits fields marked exportable: false', () => {
        const t = i18n.getFixedT('en')
        const columns = exportColumnsFromFields([...FIELDS, { key: 'secret', labelKey: 'common.name', exportable: false }], t)
        expect(columns).toHaveLength(FIELDS.length)
    })
})
