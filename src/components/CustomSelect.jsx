import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'

/**
 * Reusable select with two modes:
 *  - single (default): pick one value; optional `searchable` filter box (e.g. picking a customer).
 *  - multiple: toggle several values; used by page filters (e.g. several statuses at once).
 *
 * The dropdown is rendered in a portal with fixed positioning so it is never clipped by a
 * scrolling modal body or filter bar.
 *
 * onChange receives the new value: a string (single) or an array of strings (multiple).
 */
export default function CustomSelect({
    options = [],
    value,
    onChange,
    multiple = false,
    searchable = false,
    placeholder,
    disabled = false,
    className = '',
    id,
    ariaLabel,
    onQuickCreate,
    quickCreateActions,
}) {
    const { t } = useTranslation()
    const resolvedPlaceholder = placeholder ?? t('select.placeholder')
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [coords, setCoords] = useState(null)
    // Whether the full list of selected labels fits the trigger; see the measuring effect below.
    const [labelsFit, setLabelsFit] = useState(true)
    const triggerRef = useRef(null)
    const panelRef = useRef(null)
    const searchRef = useRef(null)
    const labelBoxRef = useRef(null)
    const measureRef = useRef(null)

    const selectedValues = multiple ? (Array.isArray(value) ? value.map(String) : []) : []
    const isSelected = (v) =>
        multiple ? selectedValues.includes(String(v)) : String(value ?? '') === String(v)

    const filtered = useMemo(() => {
        if (!searchable || !query.trim()) return options
        const q = query.toLowerCase()
        // Match the visible label plus an optional `search` keyword string (e.g. a product's SKU),
        // so callers can keep the label clean while still searching by hidden fields.
        return options.filter((o) =>
            String(o.label).toLowerCase().includes(q) ||
            (o.search && String(o.search).toLowerCase().includes(q))
        )
    }, [options, query, searchable])

    const updateCoords = () => {
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const gap = 4
        const margin = 8 // keep a little breathing room from the viewport edge
        const preferred = 320 // ideal dropdown height before we start constraining
        const spaceBelow = window.innerHeight - r.bottom - margin
        const spaceAbove = r.top - margin

        // Open downward unless there isn't enough room and there's more space above.
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
    }, [open])

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
            if (triggerRef.current?.contains(e.target)) return
            if (panelRef.current?.contains(e.target)) return
            setOpen(false)
        }
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    useEffect(() => {
        if (open && searchable) {
            setQuery('')
            const t = setTimeout(() => searchRef.current?.focus(), 0)
            return () => clearTimeout(t)
        }
    }, [open, searchable])

    // The labels behind the current selection, in the order they were picked. A missing entry means the
    // option list has not caught up with the value yet (a filter restored from the URL before its
    // reference data loaded), in which case the count is the only honest thing to show.
    const selectedLabels = multiple
        ? selectedValues.map((v) => options.find((opt) => String(opt.value) === v)?.label).filter(Boolean)
        : []
    const allLabelsResolved = selectedLabels.length === selectedValues.length
    const joinedLabels = selectedLabels.join(', ')

    /**
     * Decides whether the joined labels fit, by comparing a hidden copy of the full text against the
     * space the visible label has.
     *
     * Measuring the *visible* element instead would oscillate: shrinking to "2 selected" makes the text
     * fit again, which would immediately expand it back. The hidden copy always holds the full string,
     * so the question it answers ("would this fit?") does not depend on the answer.
     */
    useLayoutEffect(() => {
        if (!multiple || selectedLabels.length < 2) {
            setLabelsFit(true)
            return
        }
        const measure = () => {
            const box = labelBoxRef.current
            const full = measureRef.current
            if (box && full) setLabelsFit(full.scrollWidth <= box.clientWidth)
        }
        measure()
        // The trigger is in a responsive grid, so its width changes without the selection changing.
        const observer = new ResizeObserver(measure)
        if (labelBoxRef.current) observer.observe(labelBoxRef.current)
        return () => observer.disconnect()
    }, [multiple, joinedLabels, selectedLabels.length])

    /**
     * What can be created without leaving the dropdown. `onQuickCreate` is the one-kind shorthand most
     * callers want; `quickCreateActions` (`[{ key, label, onSelect }]`) is for a picker that offers a
     * choice — the order line, where the same field sells either a product or a service and the user
     * should not have to guess which one a bare "create" would make.
     */
    const quickActions = quickCreateActions?.length
        ? quickCreateActions
        : onQuickCreate
            ? [{ key: 'default', label: null, onSelect: onQuickCreate }]
            : []

    const handleSelect = (opt) => {
        if (multiple) {
            const set = new Set(selectedValues)
            const key = String(opt.value)
            if (set.has(key)) set.delete(key)
            else set.add(key)
            onChange(Array.from(set))
        } else {
            onChange(opt.value)
            setOpen(false)
        }
    }

    let triggerLabel = resolvedPlaceholder
    let isPlaceholder = true
    if (multiple) {
        if (selectedValues.length > 0) {
            isPlaceholder = false
            // Name what is selected while it fits, and only fall back to counting it when it doesn't -
            // "Active, Low stock" tells you what you filtered by; "2 selected" makes you open the menu.
            triggerLabel = allLabelsResolved && (selectedLabels.length === 1 || labelsFit)
                ? joinedLabels
                : t('select.selectedCount', { count: selectedValues.length })
        }
    } else {
        const o = options.find((opt) => String(opt.value) === String(value ?? ''))
        if (o) {
            triggerLabel = o.label
            isPlaceholder = false
        }
    }

    return (
        <>
            <button
                type="button"
                id={id}
                ref={triggerRef}
                onClick={() => !disabled && setOpen((o) => !o)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                className={`relative flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left outline-none focus:border-teal-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 ${className}`}
            >
                <span
                    ref={labelBoxRef}
                    className={`min-w-0 flex-1 truncate ${isPlaceholder ? 'text-slate-400 dark:text-slate-500' : ''}`}
                >
                    {triggerLabel}
                </span>
                {/* Off-layout copy of the full text, kept mounted so the measurement above stays valid
                    whichever version is currently on screen. `invisible` rather than `hidden`: it still
                    needs a box to measure. */}
                {multiple && selectedLabels.length > 1 && (
                    <span
                        ref={measureRef}
                        aria-hidden="true"
                        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
                    >
                        {joinedLabels}
                    </span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && coords &&
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
                        {searchable && (
                            <div className="shrink-0 border-b border-slate-200 p-2 dark:border-slate-800">
                                <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-slate-800">
                                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                                    <input
                                        ref={searchRef}
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={t('common.search')}
                                        className="w-full bg-transparent text-sm outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                            {filtered.length === 0 && (
                                <li className="px-3 py-2 text-sm text-slate-400">{t('select.noMatches')}</li>
                            )}
                            {filtered.map((opt) => {
                                const selected = isSelected(opt.value)
                                return (
                                    <li
                                        key={String(opt.value)}
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => handleSelect(opt)}
                                        className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                                            selected
                                                ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        {multiple && (
                                            <span
                                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                    selected
                                                        ? 'border-teal-600 bg-teal-600 text-white'
                                                        : 'border-slate-300 dark:border-slate-600'
                                                }`}
                                            >
                                                {selected && <Check className="h-3 w-3" />}
                                            </span>
                                        )}
                                        <span className="flex-1 truncate">{opt.label}</span>
                                        {!multiple && selected && <Check className="h-4 w-4 shrink-0 text-teal-600" />}
                                    </li>
                                )
                            })}
                        </ul>

                        {multiple && selectedValues.length > 0 && (
                            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {t('select.selectedCount', { count: selectedValues.length })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onChange([])}
                                    className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                                >
                                    {t('select.clear')}
                                </button>
                            </div>
                        )}

                        {quickActions.length > 0 && (
                            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800">
                                {quickActions.map((action) => (
                                    <button
                                        key={action.key}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            setOpen(false)
                                            action.onSelect(query.trim())
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/20"
                                    >
                                        <span className="text-base leading-none font-semibold">+</span>
                                        <span className="truncate">
                                            {action.label
                                                // Named action (several kinds to choose between): the kind
                                                // leads, so the two rows are told apart at a glance.
                                                ? (query.trim() ? `${action.label}: “${query.trim()}”` : action.label)
                                                : (query.trim() ? t('select.createNamed', { name: query.trim() }) : t('select.createNew'))}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>,
                    document.body,
                )}
        </>
    )
}
