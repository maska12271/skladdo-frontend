import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import StatusBadge from './StatusBadge'

const ORDER_STATUS_VALUES = ['NEW', 'IN_PROGRESS', 'CONFIRMED', 'SHIPPED', 'CLOSED', 'CANCELLED']

const MENU_W = 192

/**
 * A clickable status badge. When `onSelect` is provided the badge becomes a trigger
 * for a fixed-position dropdown listing all available statuses; picking one calls
 * onSelect(value). Renders a plain StatusBadge when read-only.
 */
export default function StatusPicker({
    status,
    onSelect,
    loading = false,
    statuses = ORDER_STATUS_VALUES,
}) {
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const triggerRef = useRef(null)
    const menuRef = useRef(null)

    useLayoutEffect(() => {
        if (!open) return
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        const MENU_H = statuses.length * 40 + 12
        const spaceBelow = window.innerHeight - rect.bottom
        const top = spaceBelow < MENU_H && rect.top > MENU_H ? rect.top - MENU_H - 4 : rect.bottom + 4
        let left = rect.left
        if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8
        setCoords({ top, left })
    }, [open, statuses.length])

    useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        const onPointerDown = (e) => {
            if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    if (!onSelect) return <StatusBadge status={status} />

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={loading}
                onClick={() => setOpen((v) => !v)}
                // The pill itself stays its own size; the button around it grows to a 44px tap target on
                // touch, since this is how a status is changed from a phone.
                className="inline-flex min-h-11 items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-60 lg:min-h-0"
            >
                <StatusBadge status={status} />
                {loading ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                ) : (
                    <ChevronDown
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {open && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_W, zIndex: 60 }}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800"
                >
                    {statuses.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                setOpen(false)
                                if (value !== status) onSelect(value)
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        >
                            <StatusBadge status={value} />
                            {value === status && (
                                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-teal-500" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </>
    )
}
