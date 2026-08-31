import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useSettings } from '../context/SettingsContext'
import { useAnchoredPanel } from '../hooks/useAnchoredPanel'
import { holidayKeyFor } from '../constants/holidays'

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
 * The company's chosen date formats, as the order and separator this field works in.
 *
 * Must stay in step with `DATE_PATTERNS` in `utils/format.js` (and the backend's
 * `CompanySettings.SUPPORTED_DATE_FORMATS`): a company that pins how dates are *written* everywhere
 * expects to type them the same way, and a field disagreeing with the table beside it is the kind of
 * thing nobody reports but everybody notices.
 */
const COMPANY_PATTERNS = {
    'dd.MM.yyyy': { order: ['day', 'month', 'year'], separator: '.' },
    'dd/MM/yyyy': { order: ['day', 'month', 'year'], separator: '/' },
    'MM/dd/yyyy': { order: ['month', 'day', 'year'], separator: '/' },
    'yyyy-MM-dd': { order: ['year', 'month', 'day'], separator: '-' },
}

/**
 * Which order the locale writes day, month and year in, and what it puts between them — read off `Intl`
 * rather than kept as a per-language table, so a fourth language needs no entry here. Used when the
 * company has expressed no preference, which is what this did before the setting existed.
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

/**
 * The weekday the grid starts on, in `Date.getDay()` terms (0 = Sunday).
 *
 * The company setting wins where it is set; otherwise the locale decides, which is what this did before
 * the setting existed — so an untouched company sees no change. The setting is stored ISO-style
 * (1 = Monday … 7 = Sunday), hence folding Sunday from 7 down to 0.
 */
function resolveFirstDay(companyFirstDay, locale) {
    const iso = Number(companyFirstDay)
    if (Number.isInteger(iso) && iso >= 1 && iso <= 7) {
        return iso === 7 ? 0 : iso
    }
    return firstDayOfWeek(locale)
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
    // `?? {}` because the field also renders outside the authenticated app (login, registration), where
    // there is no settings provider above it — there the locale decides, as it always did.
    const { firstDayOfWeek, dateFormat } = useSettings() ?? {}
    const pattern = useMemo(
        () => COMPANY_PATTERNS[dateFormat] ?? localePattern(locale),
        [dateFormat, locale],
    )
    const firstDay = resolveFirstDay(firstDayOfWeek, locale)

    const selected = fromIso(value)
    const minDate = fromIso(min)
    const maxDate = fromIso(max)

    const { open, setOpen, wrapRef, panelRef, measure, panelStyle } = useAnchoredPanel()
    const [pickingMonth, setPickingMonth] = useState(false)
    // Which month the calendar is showing, which is not the same as what is selected: paging through
    // months must not change the value, and an empty field still has to open somewhere.
    const [visible, setVisible] = useState(() => startOfDay(selected ?? new Date()))
    // What is in the box while it is being typed in. `null` means "show the value", so an edit elsewhere
    // (a form reset, a linked field) reaches the field instead of being masked by a stale draft.
    const [draft, setDraft] = useState(null)

    const emit = (iso) => onChange?.({ target: { name, value: iso } })

    // Opening resets the view. Done here rather than in an effect watching `open`, so that paging
    // through months afterwards survives any unrelated re-render.
    const openPanel = () => {
        setPickingMonth(false)
        setVisible(startOfDay(selected ?? new Date()))
        setOpen(true)
    }

    // Re-measured when the panel changes height (the month grid is shorter than the day grid).
    useLayoutEffect(() => {
        if (open) measure()
    }, [open, pickingMonth, visible, measure])

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
                        style={panelStyle}
                        className="z-[200] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                    >
                        <CalendarPanel
                            locale={locale}
                            firstDay={firstDay}
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
    locale, firstDay, visible, setVisible, pickingMonth, setPickingMonth,
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
        // 2026-11-01 is a Sunday, so adding the weekday index lands on that weekday.
        return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 10, 1 + ((firstDay + i) % 7))))
    }, [locale, firstDay])

    const title = useMemo(
        () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visible),
        [locale, visible],
    )

    // Six rows always, so the panel does not change height as you page through months.
    const days = useMemo(() => {
        const first = new Date(visible.getFullYear(), visible.getMonth(), 1)
        const offset = (first.getDay() - firstDay + 7) % 7
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
        return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    }, [visible, firstDay])

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
                    <div data-testid="datefield-weekdays" className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-slate-400">
                        {weekdayNames.map((label) => <span key={label} className="py-1">{label}</span>)}
                    </div>
                    <div data-testid="datefield-days" className="grid grid-cols-7 gap-0.5">
                        {days.map((day) => {
                            const isSelected = selected && day.getTime() === selected.getTime()
                            const isToday = day.getTime() === today.getTime()
                            const otherMonth = day.getMonth() !== visible.getMonth()
                            const blocked = outOfRange(day)
                            // A public holiday is still a perfectly pickable date — deliveries and
                            // deadlines land on them — so this only colours the day and names it on
                            // hover. Selection and "today" still win the styling: which day you picked
                            // matters more than which day is a holiday.
                            const holidayKey = holidayKeyFor(toIso(day))
                            const holidayName = holidayKey ? t(`holidays.${holidayKey}`) : undefined
                            return (
                                <button
                                    key={day.getTime()}
                                    type="button"
                                    disabled={blocked}
                                    onClick={() => onPick(day)}
                                    aria-current={isToday ? 'date' : undefined}
                                    title={holidayName}
                                    aria-label={holidayName ? `${day.getDate()} — ${holidayName}` : undefined}
                                    className={`h-9 rounded-lg text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30 ${
                                        isSelected
                                            ? 'bg-teal-600 font-semibold text-white'
                                            : isToday
                                                ? 'font-semibold text-teal-700 ring-1 ring-inset ring-teal-500 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10'
                                                : holidayKey
                                                    ? `font-medium hover:bg-rose-50 dark:hover:bg-rose-500/10 ${otherMonth ? 'text-rose-300 dark:text-rose-500/60' : 'text-rose-600 dark:text-rose-400'}`
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
