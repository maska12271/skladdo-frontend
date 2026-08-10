// Locale parity. The app ships three languages that are edited by hand in three separate files, so the
// failure mode is silent: a key added to en.js and forgotten in ru.js falls back to English at runtime,
// and a placeholder dropped from one translation renders as a blank where a number should be. Neither
// shows up in a build, a lint, or a click-through in the developer's own language.
//
// Stage 11 of the test pass. Node environment — these are plain object comparisons, no DOM needed.
import { describe, expect, it } from 'vitest'
import en from './locales/en'
import et from './locales/et'
import ru from './locales/ru'

const LOCALES = { en, et, ru }

/** Flattens a nested translation object to `a.b.c` → value, the shape i18next keys look like in calls. */
function flatten(obj, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            flatten(value, path, out)
        } else {
            out[path] = value
        }
    }
    return out
}

const flat = Object.fromEntries(Object.entries(LOCALES).map(([code, res]) => [code, flatten(res)]))

// i18next plural suffixes. A key `x_one` in English is the same message as `x_few` in Russian, so raw
// key-set comparison would report every plural as missing in both directions. Compare plural *stems*
// instead, and check the suffix sets separately per language below.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

const stems = (keys) => new Set(keys.map((k) => k.replace(PLURAL_SUFFIX, '')))

/** Extracts `{{name}}` interpolation placeholders from a translated string. */
function placeholders(value) {
    if (typeof value !== 'string') return new Set()
    return new Set(Array.from(value.matchAll(/\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g), (m) => m[1]))
}

/**
 * stem → union of placeholders across that stem's plural variants, built once per locale.
 * Comparing a key against the other locale by scanning all ~2500 entries each time is quadratic and
 * takes long enough to trip vitest's default timeout, so index up front.
 */
function placeholderIndex(flatLocale) {
    const index = new Map()
    for (const [key, value] of Object.entries(flatLocale)) {
        const stem = key.replace(PLURAL_SUFFIX, '')
        const set = index.get(stem) ?? new Set()
        for (const p of placeholders(value)) set.add(p)
        index.set(stem, set)
    }
    return index
}

const phIndex = Object.fromEntries(Object.entries(flat).map(([code, f]) => [code, placeholderIndex(f)]))

describe('locale key parity', () => {
    for (const code of ['et', 'ru']) {
        it(`${code} defines every key English defines`, () => {
            const missing = [...stems(Object.keys(flat.en))].filter((k) => !stems(Object.keys(flat[code])).has(k))
            expect(missing, `missing from ${code}.js`).toEqual([])
        })

        it(`${code} defines no key English does not`, () => {
            // A key that exists only in a translation is dead weight at best, and at worst a rename that
            // was applied to one file and not the others.
            const extra = [...stems(Object.keys(flat[code]))].filter((k) => !stems(Object.keys(flat.en)).has(k))
            expect(extra, `orphaned in ${code}.js`).toEqual([])
        })
    }
})

describe('placeholder parity', () => {
    // The Stage 11 "{{token}} scan": every placeholder in a translated string must also appear in the
    // English source. A placeholder present only in a translation is one nothing supplies a value for,
    // so i18next interpolates it to an empty string and the sentence loses its number.
    for (const code of ['et', 'ru']) {
        it(`${code} uses only placeholders the English string uses`, () => {
            const problems = []
            for (const [key, value] of Object.entries(flat[code])) {
                const stem = key.replace(PLURAL_SUFFIX, '')
                // Compare against every English plural variant of the same stem, since ru `_many` may
                // correspond to en `_other`.
                const allowed = phIndex.en.get(stem)
                if (!allowed) continue
                for (const p of placeholders(value)) {
                    if (!allowed.has(p)) problems.push(`${key}: {{${p}}}`)
                }
            }
            expect(problems, `placeholders in ${code}.js with no English counterpart`).toEqual([])
        })
    }

    it('English strings do not drop a placeholder a translation still carries', () => {
        // The mirror of the above, aimed at the other direction: an English string edited to remove a
        // variable while et/ru keep it. Reported per key so the fix is obvious.
        const problems = []
        for (const stem of phIndex.en.keys()) {
            const enPlaceholders = phIndex.en.get(stem)
            for (const code of ['et', 'ru']) {
                for (const p of phIndex[code].get(stem) ?? []) {
                    if (!enPlaceholders.has(p)) problems.push(`${code}/${stem}: {{${p}}}`)
                }
            }
        }
        expect(problems).toEqual([])
    })
})

describe('russian plural forms', () => {
    // Russian needs _one/_few/_many where English needs only _one/_other. A Russian plural key that
    // copied the English suffix set renders the wrong form for 2-4 and for 5+.
    const ruStems = new Set(
        Object.keys(flat.ru).filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, ''))
    )

    it('every pluralised Russian key defines _one, _few and _many', () => {
        const incomplete = []
        for (const stem of ruStems) {
            for (const suffix of ['one', 'few', 'many']) {
                if (!(`${stem}_${suffix}` in flat.ru)) incomplete.push(`${stem}_${suffix}`)
            }
        }
        expect(incomplete, 'Russian plural keys missing a required form').toEqual([])
    })

    it('finds at least one pluralised key, so the check above cannot pass vacuously', () => {
        expect(ruStems.size).toBeGreaterThan(0)
    })
})

describe('no untranslated leftovers', () => {
    it('no translated string is empty', () => {
        const empty = []
        for (const code of Object.keys(LOCALES)) {
            for (const [key, value] of Object.entries(flat[code])) {
                if (typeof value === 'string' && value.trim() === '') empty.push(`${code}/${key}`)
            }
        }
        expect(empty).toEqual([])
    })

    it('no et/ru string is a verbatim TODO marker', () => {
        const todo = []
        for (const code of ['et', 'ru']) {
            for (const [key, value] of Object.entries(flat[code])) {
                if (typeof value === 'string' && /^(TODO|FIXME|XXX)\b/i.test(value.trim())) todo.push(`${code}/${key}`)
            }
        }
        expect(todo).toEqual([])
    })
})
