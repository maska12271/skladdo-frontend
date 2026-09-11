import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { MapPin, Loader2 } from 'lucide-react'
import { apiGet } from '../api/client'

/** Field label with a red asterisk when required — mirrors FormField's label. */
function FieldLabel({ id, label, required }) {
    return (
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
            {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
    )
}

/**
 * Text field with address typeahead. As the user types (debounced, min 3 chars) it queries the
 * backend address-suggestion endpoint and shows a dropdown; picking a suggestion fills the field with
 * the full address. The user can always keep typing a free-form address. The `onChange` is shaped like
 * a native event (`{ target: { name, value } }`) so it's a drop-in for the existing FormField usage.
 *
 * Pass `onSelectParts` where the address is stored in pieces (client, company settings): picking a
 * suggestion then reports `{ street, city, postalCode, country }` so the sibling inputs fill themselves.
 * Without it the field behaves exactly as before and emits the whole line — which is what the fields
 * that still store an address as free text (manufacturers, warehouses, delivery) want.
 *
 * The dropdown is rendered in a portal with fixed positioning so it is never clipped by a scrolling
 * modal body (mirrors CustomSelect).
 */
export default function AddressAutocompleteField({
    id,
    label,
    name,
    value,
    onChange,
    onSelectParts,
    placeholder = '',
    required = false,
    className = '',
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [suggestions, setSuggestions] = useState([])
    const [loading, setLoading] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [coords, setCoords] = useState(null)

    const inputRef = useRef(null)
    const panelRef = useRef(null)
    const debounceRef = useRef(null)
    const requestRef = useRef(0) // guards against out-of-order responses

    const emit = (v) => onChange({ target: { name, value: v } })

    const runSearch = (raw) => {
        const query = (raw || '').trim()
        if (query.length < 3) {
            setSuggestions([])
            setLoading(false)
            setOpen(false)
            return
        }
        const reqId = ++requestRef.current
        setLoading(true)
        apiGet(`/address/suggest?q=${encodeURIComponent(query)}`)
            .then((res) => {
                if (reqId !== requestRef.current) return // a newer keystroke superseded this one
                setSuggestions(Array.isArray(res) ? res : [])
                setActiveIndex(-1)
                setOpen(true)
            })
            .catch(() => {
                if (reqId === requestRef.current) setSuggestions([])
            })
            .finally(() => {
                if (reqId === requestRef.current) setLoading(false)
            })
    }

    const handleInput = (e) => {
        const v = e.target.value
        emit(v)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => runSearch(v), 300)
    }

    const handleSelect = (s) => {
        // In structured mode the parts drive the form and the street is this input's own value; the
        // caller fills city/postal code/country from the same pick.
        if (onSelectParts) {
            emit(s.street || s.address)
            onSelectParts({
                street: s.street || s.address || '',
                city: s.city || '',
                postalCode: s.postalCode || '',
                country: s.country || '',
            })
        } else {
            emit(s.address)
        }
        setSuggestions([])
        setOpen(false)
        requestRef.current++ // ignore any in-flight response
    }

    const handleKeyDown = (e) => {
        if (!open || suggestions.length === 0) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => (i + 1) % suggestions.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault()
            handleSelect(suggestions[activeIndex])
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    // --- Dropdown positioning (portal + fixed, mirrors CustomSelect) -----------------------------
    const updateCoords = () => {
        const el = inputRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const gap = 4
        const margin = 8
        const preferred = 288
        const spaceBelow = window.innerHeight - r.bottom - margin
        const spaceAbove = r.top - margin
        const openUp = spaceBelow < preferred && spaceAbove > spaceBelow
        const maxHeight = Math.max(160, Math.min(preferred, openUp ? spaceAbove : spaceBelow))
        if (openUp) {
            setCoords({ left: r.left, bottom: window.innerHeight - r.top + gap, width: r.width, maxHeight, openUp })
        } else {
            setCoords({ left: r.left, top: r.bottom + gap, width: r.width, maxHeight, openUp })
        }
    }

    useLayoutEffect(() => {
        if (open) updateCoords()
    }, [open, suggestions.length, loading])

    useEffect(() => {
        if (!open) return
        const reposition = () => updateCoords()
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        return () => {
            window.removeEventListener('scroll', reposition, true)
            window.removeEventListener('resize', reposition)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onDown = (e) => {
            if (inputRef.current?.contains(e.target)) return
            if (panelRef.current?.contains(e.target)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), [])

    const showPanel = open && coords && (loading || suggestions.length > 0)

    return (
        <div className={`space-y-2 ${className}`}>
            <FieldLabel id={id} label={label} required={required} />
            <div className="relative">
                <input
                    id={id}
                    name={name}
                    ref={inputRef}
                    type="text"
                    value={value || ''}
                    onChange={handleInput}
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
                    onKeyDown={handleKeyDown}
                    required={required}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                </span>
            </div>

            {showPanel &&
                createPortal(
                    <div
                        ref={panelRef}
                        style={{
                            position: 'fixed',
                            left: coords.left,
                            width: coords.width,
                            maxHeight: coords.maxHeight,
                            ...(coords.openUp ? { bottom: coords.bottom } : { top: coords.top }),
                        }}
                        className="z-[200] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
                    >
                        <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                            {suggestions.length === 0 && loading && (
                                <li className="px-3 py-2 text-sm text-slate-400">{t('address.searching')}</li>
                            )}
                            {suggestions.map((s, i) => (
                                <li
                                    key={`${s.address}-${i}`}
                                    role="option"
                                    aria-selected={i === activeIndex}
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        handleSelect(s)
                                    }}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                                        i === activeIndex
                                            ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                            : 'text-slate-700 dark:text-slate-200'
                                    }`}
                                >
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    <span className="flex-1">
                                        {s.address}
                                        {s.postalCode && <span className="ml-1 text-slate-400">· {s.postalCode}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>,
                    document.body,
                )}
        </div>
    )
}
