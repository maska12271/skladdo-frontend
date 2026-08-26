import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'

/**
 * The app's own date control, replacing `<input type="date">`.
 *
 * The native one was the last piece of unstyled browser chrome in the forms: its calendar is drawn by the
 * OS, ignores the app's theme and language, and on Windows renders a `dd.mm.yyyy` mask with spinner arrows
 * that looks nothing like the fields around it. This is the same two halves the native control has — a
 * typed value and a picker — drawn by the app.
 *
 * Values in and out are ISO `yyyy-MM-dd`, exactly as the native input reported them, so callers,
 * validation and the API payloads are unchanged.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** ISO string → local `Date` at midnight. Parsing it with `new Date(iso)` would read it as UTC and, in a
 *  negative-offset timezone, land on the previous day. */
function fromIso(value) {
    const m = ISO.exec(String(value ?? '').trim())
    if (!m) return null
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(date.getTime()) ? null : date
}

function toIso(date) {
    if (!date) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * Which order the locale writes day, month and year in, and what it puts between them — read off `Intl`
 * rather than kept as a per-language table, so a fourth language needs no entry here. Drives both the
 * text the field shows and the text it accepts.
 */
function localePattern(locale) {
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
        // A day and month that cannot be confused for each other, so the order read back is unambiguous.
        .formatToParts(new Date(2026, 10, 22))
    const order = parts.filter((p) => p.type !== 'literal').map((p) => p.type)
    const separator = parts.find((p) => p.type === 'literal' && /\S/.test(p.value))?.value ?? '.'
    return {
        order: order.length === 3 ? order : ['day', 'month', 'year'],
        separator: separator.trim() || '.',
    }
}

/** Monday in most of Europe, Sunday in the US. `getWeekInfo` is the only place the browser knows this. */
function firstDayOfWeek(locale) {
    try {
        const info = new Intl.Locale(locale).getWeekInfo?.()
        // Intl counts Monday as 1 and Sunday as 7; `Date.getDay()` counts Sunday as 0.
        return info?.firstDay === 7 ? 0 : (info?.firstDay ?? 1)
    } catch {
        return 1
    }
}

function formatForInput(date, { order, separator }) {
    if (!date) return ''
    const pad = (n) => String(n).padStart(2, '0')
    const parts = { day: pad(date.getDate()), month: pad(date.getMonth() + 1), year: String(date.getFullYear()) }
    return order.map((key) => parts[key]).join(separator)
}

/**
 * Reads back what someone typed. Accepts the locale's own order, and ISO as well — a four-digit group
 * first can only be a year, and people paste ISO dates out of spreadsheets.
 */
function parseTyped(text, { order }) {
    const groups = String(text).trim().split(/[^0-9]+/).filter(Boolean)
    if (groups.length !== 3) return null

    let day
    let month
    let year
    if (groups[0].length === 4) {
        ;[year, month, day] = groups.map(Number)
    } else {
        const named = Object.fromEntries(order.map((key, i) => [key, Number(groups[i])]))
        ;({ day, month, year } = named)
    }
    if (!day || !month || !year) return null
    // Two-digit years the way every spreadsheet reads them.
    if (year < 100) year += year < 70 ? 2000 : 1900

    const date = new Date(year, month - 1, day)
    // Rejects the 31st of a 30-day month rather than silently rolling it into the next one.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
    return date
}

export default function DateField({
    id,
    name,
    value,
    onChange,
    min,
    max,
    required = false,
    disabled = false,
    placeholder,
    inputClassName = '',
    ...props
}) {
    const { t, i18n } = useTranslation()
    const locale = i18n.resolvedLanguage || i18n.language || 'en'
    const pattern = useMemo(() => localePattern(locale), [locale])

    const selected = fromIso(value)
    const minDate = fromIso(min)
    const maxDate = fromIso(max)

    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState(null)
    const [pickingMonth, setPickingMonth] = useState(false)
    // Which month the calendar is showing, which is not the same as what is selected: paging through
    // months must not change the value, and an empty field still has to open somewhere.
    const [visible, setVisible] = useState(() => startOfDay(selected ?? new Date()))
    // What is in the box while it is being typed in. `null` means "show the value", so an edit elsewhere
    // (a form reset, a linked field) reaches the field instead of being masked by a stale draft.
    const [draft, setDraft] = useState(null)

    const wrapRef = useRef(null)
    const panelRef = useRef(null)

    const emit = (iso) => onChange?.({ target: { name, value: iso } })

    // Opening resets the view. Done here rather than in an effect watching `open`, so that paging
    // through months afterwards survives any unrelated re-render.
    const openPanel = () => {
        setPickingMonth(false)
        setVisible(startOfDay(selected ?? new Date()))
        setOpen(true)
    }

    // Positioned against the viewport in a portal, like CustomSelect's panel: inside a modal body the
    // calendar is taller than the space below the field, and an absolutely positioned one was either
    // clipped by the scrolling body or pushed off the bottom of a phone.
    const updateCoords = () => {
        const el = wrapRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const gap = 4
        const margin = 8
        const height = panelRef.current?.offsetHeight ?? 330
        const width = Math.min(310, window.innerWidth - margin * 2)

        const spaceBelow = window.innerHeight - rect.bottom - margin
        const openUp = spaceBelow < height && rect.top - margin > spaceBelow

        let left = rect.left
        left = Math.min(left, window.innerWidth - margin - width)
        left = Math.max(left, margin)

        setCoords(openUp
            ? { left, bottom: window.innerHeight - rect.top + gap, width }
            : { left, top: rect.bottom + gap, width })
    }

    // Re-measured when the panel changes height (the month grid is shorter than the day grid).
    useLayoutEffect(() => {
        if (open) updateCoords()
    }, [open, pickingMonth, visible])

    useEffect(() => {
        if (!open) return undefined
        const reposition = () => updateCoords()
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
        }
        const onPointerDown = (event) => {
            if (wrapRef.current?.contains(event.target)) return
            if (panelRef.current?.contains(event.target)) return
            setOpen(false)
        }
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        return () => {
            window.removeEventListener('scroll', reposition, true)
            window.removeEventListener('resize', reposition)
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
        }
    }, [open])

    const outOfRange = (date) => (minDate && date < minDate) || (maxDate && date > maxDate)

    const pick = (date) => {
        if (outOfRange(date)) return
        setDraft(null)
        emit(toIso(date))
        setOpen(false)
    }

    /** Typing is committed on blur, not per keystroke — a half-typed "1.1" is not a date yet. */
    const commitDraft = () => {
        if (draft == null) return
        const text = draft.trim()
        setDraft(null)
        if (text === '') {
            if (value) emit('')
            return
        }
        const parsed = parseTyped(text, pattern)
        // Unparseable input falls back to whatever was there, the same as the native control does.
        if (parsed && !outOfRange(parsed)) emit(toIso(parsed))
    }

    const text = draft ?? formatForInput(selected, pattern)

    return (
        <div className="relative" ref={wrapRef}>
            <input
                id={id}
                name={name}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={disabled}
                required={required}
                value={text}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        commitDraft()
                        setOpen(false)
                    }
                }}
                placeholder={placeholder || pattern.order.map((k) => (k === 'year' ? 'yyyy' : k === 'month' ? 'mm' : 'dd')).join(pattern.separator)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`w-full rounded-xl border border-slate-300 py-2.5 pl-3.5 pr-10 transition-colors placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 ${inputClassName}`}
                {...props}
            />
            <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openPanel())}
                aria-label={t('datePicker.open')}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600 disabled:opacity-60 dark:hover:text-slate-200"
            >
                <Calendar className="h-4 w-4" />
            </button>

            {open && !disabled &&
                createPortal(
                    <div
                        ref={panelRef}
                        role="dialog"
                        aria-label={t('datePicker.open')}
                        style={{
                            position: 'fixed',
                            left: coords?.left ?? -9999,
                            width: coords?.width ?? 310,
                            ...(coords && 'bottom' in coords ? { bottom: coords.bottom } : { top: coords?.top ?? 0 }),
                        }}
                        className="z-[200] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                    >
                        <CalendarPanel
                            locale={locale}
                            visible={visible}
                            setVisible={setVisible}
                            pickingMonth={pickingMonth}
                            setPickingMonth={setPickingMonth}
                            selected={selected}
                            outOfRange={outOfRange}
                            onPick={pick}
                            onClear={() => {
                                setDraft(null)
                                emit('')
                                setOpen(false)
                            }}
                            clearable={!required && Boolean(value)}
                        />
                    </div>,
                    document.body,
                )}
        </div>
    )
}

/** The panel's two views: a month of days, and — behind the header — a year of months. */
function CalendarPanel({
    locale, visible, setVisible, pickingMonth, setPickingMonth,
    selected, outOfRange, onPick, onClear, clearable,
}) {
    const { t } = useTranslation()
    const today = startOfDay(new Date())

    const monthNames = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
        return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2026, m, 1)))
    }, [locale])

    const weekdayNames = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
        const first = firstDayOfWeek(locale)
        // 2026-11-01 is a Sunday, so adding the weekday index lands on that weekday.
        return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 10, 1 + ((first + i) % 7))))
    }, [locale])

    const title = useMemo(
        () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visible),
        [locale, visible],
    )

    // Six rows always, so the panel does not change height as you page through months.
    const days = useMemo(() => {
        const first = new Date(visible.getFullYear(), visible.getMonth(), 1)
        const offset = (first.getDay() - firstDayOfWeek(locale) + 7) % 7
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
        return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    }, [visible, locale])

    const step = (delta) => setVisible((current) => (pickingMonth
        ? new Date(current.getFullYear() + delta, current.getMonth(), 1)
        : new Date(current.getFullYear(), current.getMonth() + delta, 1)))

    const navButton = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'

    return (
        <>
            <div className="mb-2 flex items-center justify-between gap-1">
                <button type="button" onClick={() => step(-1)} aria-label={t('datePicker.previous')} className={navButton}>
                    <ChevronLeft className="h-4 w-4" />
                </button>
                {/* The header is the way into the month grid — no second control, and no year dropdown to
                    open a dropdown from inside a dropdown. */}
                <button
                    type="button"
                    onClick={() => setPickingMonth((v) => !v)}
                    className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-sm font-semibold capitalize hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    {pickingMonth ? visible.getFullYear() : title}
                </button>
                <button type="button" onClick={() => step(1)} aria-label={t('datePicker.next')} className={navButton}>
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {pickingMonth ? (
                <div className="grid grid-cols-3 gap-1">
                    {monthNames.map((label, month) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => {
                                setVisible(new Date(visible.getFullYear(), month, 1))
                                setPickingMonth(false)
                            }}
                            className={`rounded-lg py-2.5 text-sm font-medium capitalize transition ${
                                visible.getMonth() === month
                                    ? 'bg-teal-600 text-white'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-slate-400">
                        {weekdayNames.map((label) => <span key={label} className="py-1">{label}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                        {days.map((day) => {
                            const isSelected = selected && day.getTime() === selected.getTime()
                            const isToday = day.getTime() === today.getTime()
                            const otherMonth = day.getMonth() !== visible.getMonth()
                            const blocked = outOfRange(day)
                            return (
                                <button
                                    key={day.getTime()}
                                    type="button"
                                    disabled={blocked}
                                    onClick={() => onPick(day)}
                                    aria-current={isToday ? 'date' : undefined}
                                    className={`h-9 rounded-lg text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30 ${
                                        isSelected
                                            ? 'bg-teal-600 font-semibold text-white'
                                            : isToday
                                                ? 'font-semibold text-teal-700 ring-1 ring-inset ring-teal-500 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10'
                                                : otherMonth
                                                    ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800'
                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {day.getDate()}
                                </button>
                            )
                        })}
                    </div>
                </>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => onPick(today)}
                    disabled={outOfRange(today)}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-40 dark:text-teal-400 dark:hover:bg-teal-500/10"
                >
                    {t('datePicker.today')}
                </button>
                {clearable && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        {t('datePicker.clear')}
                    </button>
                )}
            </div>
        </>
    )
}
