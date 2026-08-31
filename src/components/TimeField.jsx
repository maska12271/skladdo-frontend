import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useSettings } from '../context/SettingsContext'
import { useAnchoredPanel } from '../hooks/useAnchoredPanel'

/**
 * The app's own time control, the sibling of {@code DateField} and built the same way: a typed value and
 * a picker, both drawn by the app rather than by the OS.
 *
 * <p>Values in and out are always 24-hour {@code HH:mm}, whatever the company reads on screen — the same
 * split {@code DateField} makes between its ISO value and its displayed text. Callers, validation and API
 * payloads therefore never have to know which clock the company is on.</p>
 *
 * <p>The panel offers minutes in five-minute steps, which is what a picker is for; anything finer is
 * typed. Offering all sixty makes the common case worse to serve a rare one.</p>
 */

const HHMM = /^(\d{1,2}):(\d{2})$/

const pad = (n) => String(n).padStart(2, '0')

/** `HH:mm` → minutes since midnight, or null. Rejects 25:00 rather than rolling it over. */
function fromValue(value) {
    const m = HHMM.exec(String(value ?? '').trim())
    if (!m) return null
    const hours = Number(m[1])
    const minutes = Number(m[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
}

const toValue = (total) => (total == null ? '' : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`)

/**
 * Whether the company reads a 12-hour clock. Driven by the same whitelist as `TIME_PATTERNS` in
 * `utils/format.js`, so the field a time is typed into matches every place it is later printed.
 */
const isTwelveHour = (timeFormat, locale) => {
    if (timeFormat === 'hh:mm a') return true
    if (timeFormat === 'HH:mm') return false
    // No company preference: ask the language, exactly as the display formatters fall back to it.
    try {
        return Boolean(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12)
    } catch {
        return false
    }
}

function formatForInput(total, twelveHour) {
    if (total == null) return ''
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (!twelveHour) return `${pad(hours)}:${pad(minutes)}`
    const h12 = hours % 12 === 0 ? 12 : hours % 12
    return `${h12}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`
}

/**
 * Reads back what someone typed, in either clock and forgivingly: "9", "9:30", "0930", "9.30", "9 pm",
 * "21:30". A bare number is an hour, which is how people type a time they mean on the hour.
 */
function parseTyped(text, twelveHour) {
    const raw = String(text).trim().toLowerCase()
    if (!raw) return null

    const pm = /\bp\.?m?\.?\b/.test(raw)
    const am = /\ba\.?m?\.?\b/.test(raw)
    const digits = raw.replace(/[^0-9]/g, '')
    if (!digits) return null

    let hours
    let minutes
    if (/[:.\s]/.test(raw.replace(/[ap]\.?m?\.?/g, '').trim()) && digits.length <= 4) {
        // Separated: the groups are hours and minutes as written.
        const groups = raw.replace(/[ap]\.?m?\.?/g, '').trim().split(/[^0-9]+/).filter(Boolean)
        hours = Number(groups[0])
        minutes = Number(groups[1] ?? 0)
    } else if (digits.length <= 2) {
        hours = Number(digits)
        minutes = 0
    } else {
        // "0930" / "930" — the last two digits are always the minutes.
        hours = Number(digits.slice(0, digits.length - 2))
        minutes = Number(digits.slice(-2))
    }

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
    if (minutes > 59) return null

    if (twelveHour || pm || am) {
        if (hours > 12) {
            // "13 pm" is a contradiction, but a 24-hour reading of it is unambiguous - take that.
            if (hours > 23) return null
        } else {
            if (pm && hours < 12) hours += 12
            if (am && hours === 12) hours = 0
        }
    }
    if (hours > 23) return null
    return hours * 60 + minutes
}

export default function TimeField({
    id,
    name,
    value,
    onChange,
    required = false,
    disabled = false,
    placeholder,
    minuteStep = 5,
    inputClassName = '',
    ...props
}) {
    const { t, i18n } = useTranslation()
    const locale = i18n.resolvedLanguage || i18n.language || 'en'
    // `?? {}` for the same reason as DateField: this can render outside the authenticated app.
    const { timeFormat } = useSettings() ?? {}
    const twelveHour = useMemo(() => isTwelveHour(timeFormat, locale), [timeFormat, locale])

    const selected = fromValue(value)

    const { open, setOpen, wrapRef, panelRef, measure, panelStyle } = useAnchoredPanel({
        estimatedHeight: 260,
        maxWidth: 230,
    })
    // What is in the box while it is being typed in; `null` means "show the value". Same contract as
    // DateField's draft, so an edit from elsewhere is never masked by a stale one.
    const [draft, setDraft] = useState(null)

    const emit = (next) => onChange?.({ target: { name, value: next } })

    // The panel's own height settles on the first paint; re-measure so a field near the bottom of a
    // modal flips above rather than being clipped.
    useLayoutEffect(() => {
        if (open) measure()
    }, [open, measure])

    const pick = (total) => {
        setDraft(null)
        emit(toValue(total))
        setOpen(false)
    }

    /** Committed on blur, not per keystroke — a half-typed "1" is not the time anybody meant yet. */
    const commitDraft = () => {
        if (draft == null) return
        const text = draft.trim()
        setDraft(null)
        if (text === '') {
            if (value) emit('')
            return
        }
        const parsed = parseTyped(text, twelveHour)
        // Unparseable input falls back to whatever was there, exactly as DateField does.
        if (parsed != null) emit(toValue(parsed))
    }

    const text = draft ?? formatForInput(selected, twelveHour)

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
                placeholder={placeholder || (twelveHour ? 'hh:mm am' : 'hh:mm')}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`w-full rounded-xl border border-slate-300 py-2.5 pl-3.5 pr-10 transition-colors placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 ${inputClassName}`}
                {...props}
            />
            <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => setOpen(!open)}
                aria-label={t('timePicker.open')}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600 disabled:opacity-60 dark:hover:text-slate-200"
            >
                <Clock className="h-4 w-4" />
            </button>

            {open && !disabled &&
                createPortal(
                    <div
                        ref={panelRef}
                        role="dialog"
                        aria-label={t('timePicker.open')}
                        style={panelStyle}
                        className="z-[200] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                    >
                        <ClockPanel
                            selected={selected}
                            twelveHour={twelveHour}
                            minuteStep={minuteStep}
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

/**
 * Two columns — hours, then minutes — rather than one long list of every time in the day. Picking either
 * keeps the other, so changing just the hour of an already-chosen time is one click.
 */
function ClockPanel({ selected, twelveHour, minuteStep, onPick, onClear, clearable }) {
    const { t } = useTranslation()

    const selectedHour = selected == null ? null : Math.floor(selected / 60)
    const selectedMinute = selected == null ? null : selected % 60

    const hours = Array.from({ length: 24 }, (_, h) => h)
    const minutes = useMemo(
        () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
        [minuteStep],
    )

    // Editing one half of a time nobody has chosen yet needs a base to sit on; the top of the hour is
    // the least surprising one.
    const base = selected ?? 0

    const hourLabel = (h) => {
        if (!twelveHour) return pad(h)
        const h12 = h % 12 === 0 ? 12 : h % 12
        return `${h12} ${h < 12 ? 'AM' : 'PM'}`
    }

    const cell = (active) => `w-full rounded-lg px-2 py-1.5 text-sm tabular-nums transition ${
        active
            ? 'bg-teal-600 font-semibold text-white'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
    }`

    return (
        <>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t('timePicker.hour')}
                    </p>
                    <div data-testid="timefield-hours" className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                        {hours.map((h) => (
                            <button
                                key={h}
                                type="button"
                                onClick={() => onPick(h * 60 + (selectedMinute ?? base % 60))}
                                className={cell(selectedHour === h)}
                            >
                                {hourLabel(h)}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t('timePicker.minute')}
                    </p>
                    <div data-testid="timefield-minutes" className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                        {minutes.map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => onPick(Math.floor(base / 60) * 60 + m)}
                                className={cell(selectedMinute === m)}
                            >
                                {pad(m)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => {
                        const now = new Date()
                        onPick(now.getHours() * 60 + now.getMinutes())
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-500/10"
                >
                    {t('timePicker.now')}
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
