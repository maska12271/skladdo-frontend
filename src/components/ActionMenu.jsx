import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'

// Wide enough for the longest action labels in every locale — et/ru run far wider than en, and a menu item
// that has to wrap looks broken next to the ones that don't. The widest today ("Корректировать остаток")
// renders at 179px, which with the item's padding, icon and gap needs 248.
const MENU_WIDTH = 248

/**
 * A compact "..." trigger that opens a dropdown listing row actions.
 *
 * actions: Array<{
 *   key?: string,
 *   label: string,
 *   icon?: React component,
 *   onClick?: () => void,
 *   danger?: boolean,
 *   disabled?: boolean,
 * } | false | null>
 *
 * The menu is rendered with position: fixed so it is never clipped by the
 * table's overflow containers.
 */
export default function ActionMenu({ actions = [], buttonLabel, emptyLabel }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const triggerRef = useRef(null)
    const menuRef = useRef(null)

    const visibleActions = actions.filter(Boolean)

    useLayoutEffect(() => {
        if (!open) return
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return

        const margin = 8
        const estimatedHeight = visibleActions.length * 44 + 12
        const spaceBelow = window.innerHeight - rect.bottom
        const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight

        let left = rect.right - MENU_WIDTH
        const maxLeft = window.innerWidth - MENU_WIDTH - margin
        if (left > maxLeft) left = maxLeft
        if (left < margin) left = margin

        const top = openUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4
        setCoords({ top, left })
    }, [open, visibleActions.length])

    useEffect(() => {
        if (!open) return

        const close = () => setOpen(false)
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
        }
        const onPointerDown = (event) => {
            if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
                return
            }
            setOpen(false)
        }

        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)

        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    if (visibleActions.length === 0) {
        return emptyLabel ? <span className="text-xs text-slate-400">{emptyLabel}</span> : null
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={buttonLabel || t('common.actions')}
                // 44px on touch, the original 36 back at `lg`. This is the primary per-row action on a
                // phone, where it is the only way into view/edit/delete.
                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition lg:h-9 lg:w-9 ${
                    open
                        ? 'border-teal-500 bg-teal-50 text-teal-600 dark:border-teal-500 dark:bg-teal-500/10 dark:text-teal-300'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
                    className="z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800"
                >
                    {visibleActions.map((action) => {
                        const Icon = action.icon
                        return (
                            <button
                                key={action.key || action.label}
                                type="button"
                                role="menuitem"
                                disabled={action.disabled}
                                onClick={() => {
                                    setOpen(false)
                                    action.onClick?.()
                                }}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    action.danger
                                        ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60'
                                }`}
                            >
                                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                                <span>{action.label}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </>
    )
}
