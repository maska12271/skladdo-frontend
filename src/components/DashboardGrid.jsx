import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, X } from 'lucide-react'
import { COLS, widgetMeta } from '../hooks/useDashboardLayout'
import { clamp, bottom, layoutMove, layoutResize, sameLayout } from '../utils/gridLayout'

const ROW_PX = 40 // height of one grid row in pixels (fine step so widgets size precisely)
const GAP = 16 // gap between cells in pixels
const NARROW = 700 // below this container width, fall back to a static stacked layout

const colWidth = (width) => (width - (COLS - 1) * GAP) / COLS
const xToPx = (x, cw) => x * (cw + GAP)
const yToPx = (y) => y * (ROW_PX + GAP)
const wToPx = (w, cw) => w * cw + (w - 1) * GAP
const hToPx = (h) => h * ROW_PX + (h - 1) * GAP

/**
 * Self-contained, dependency-free dashboard grid with a drag-and-drop feel. Widgets are absolutely
 * positioned on a 12-column grid and animate to their slots; in edit mode you drag a widget by its
 * title bar (it follows the cursor while a placeholder shows where it will land) and drag the corner
 * to resize. Collision/compaction math lives in utils/gridLayout. No external grid library (keeps it
 * React-19 / findDOMNode-free).
 */
export default function DashboardGrid({ items, editing, onChange, onRemove, renderContent, titleOf, actionOf, plainOf }) {
    const containerRef = useRef(null)
    const [width, setWidth] = useState(0)

    // Live refs so the window pointer-move handlers (which run after commit) never read stale
    // props/state. Synced in an effect rather than during render.
    const itemsRef = useRef(items)
    const widthRef = useRef(width)
    const onChangeRef = useRef(onChange)
    useEffect(() => {
        itemsRef.current = items
        widthRef.current = width
        onChangeRef.current = onChange
    })

    const gesture = useRef(null) // { type, key, base, offset/start..., cleanup }
    const [drag, setDrag] = useState(null) // { key, px, py } pixel position of the lifted widget
    const [activeKey, setActiveKey] = useState(null) // key being dragged/resized (rendered without transition)

    useLayoutEffect(() => {
        const el = containerRef.current
        if (!el) return
        // ResizeObserver fires once on observe() with the initial size, so no separate measure needed.
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Clean up listeners if we unmount mid-gesture.
    useEffect(() => () => gesture.current?.cleanup?.(), [])

    const handleMove = (ev) => {
        const g = gesture.current
        if (!g || !containerRef.current) return
        const cw = colWidth(widthRef.current)
        const rect = containerRef.current.getBoundingClientRect()

        if (g.type === 'drag') {
            const item = g.base.find((i) => i.key === g.key)
            const px = clamp(ev.clientX - rect.left - g.offsetX, 0, Math.max(0, rect.width - wToPx(item.w, cw)))
            const py = Math.max(0, ev.clientY - rect.top - g.offsetY)
            setDrag({ key: g.key, px, py })
            const gx = clamp(Math.round(px / (cw + GAP)), 0, COLS - item.w)
            const gy = Math.max(0, Math.round(py / (ROW_PX + GAP)))
            const next = layoutMove(g.base, g.key, gx, gy)
            if (!sameLayout(next, itemsRef.current)) onChangeRef.current(next)
        } else {
            const meta = widgetMeta(g.key)
            const w = clamp(g.startW + Math.round((ev.clientX - g.startX) / (cw + GAP)), meta.minW, COLS)
            const h = Math.max(meta.minH, g.startH + Math.round((ev.clientY - g.startY) / (ROW_PX + GAP)))
            const next = layoutResize(g.base, g.key, w, h)
            if (!sameLayout(next, itemsRef.current)) onChangeRef.current(next)
        }
    }

    const attachListeners = () => {
        const move = (ev) => handleMove(ev)
        const up = () => {
            gesture.current = null
            setDrag(null)
            setActiveKey(null)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
        gesture.current.cleanup = up
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
    }

    const startDrag = (e, key) => {
        if (!editing || width < NARROW) return
        e.preventDefault()
        const cw = colWidth(width)
        const item = itemsRef.current.find((i) => i.key === key)
        const rect = containerRef.current.getBoundingClientRect()
        gesture.current = {
            type: 'drag',
            key,
            base: itemsRef.current.map((i) => ({ ...i })),
            offsetX: e.clientX - rect.left - xToPx(item.x, cw),
            offsetY: e.clientY - rect.top - yToPx(item.y),
        }
        setActiveKey(key)
        setDrag({ key, px: xToPx(item.x, cw), py: yToPx(item.y) })
        attachListeners()
    }

    const startResize = (e, key) => {
        if (!editing || width < NARROW) return
        e.preventDefault()
        e.stopPropagation()
        const item = itemsRef.current.find((i) => i.key === key)
        gesture.current = {
            type: 'resize',
            key,
            base: itemsRef.current.map((i) => ({ ...i })),
            startX: e.clientX,
            startY: e.clientY,
            startW: item.w,
            startH: item.h,
        }
        setActiveKey(key)
        attachListeners()
    }

    const narrow = width > 0 && width < NARROW
    const cw = colWidth(width)
    const gridHeight = hToPx(Math.max(1, bottom(items)))

    // Stacked, non-editable fallback for small screens.
    if (narrow) {
        const ordered = items.slice().sort((a, b) => a.y - b.y || a.x - b.x)
        return (
            <div ref={containerRef} className="space-y-4">
                {ordered.map((it) => (
                    <WidgetFrame key={it.key} title={titleOf(it.key)} plain={plainOf?.(it.key)} editing={false} style={{ height: hToPx(it.h) }}>
                        {renderContent(it.key)}
                    </WidgetFrame>
                ))}
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className={`relative ${editing ? 'select-none' : ''}`}
            style={{ height: width ? gridHeight : undefined, minHeight: 200 }}
        >
            {/* Drop placeholder showing where the lifted widget will land */}
            {drag && width > 0 && (() => {
                const slot = items.find((i) => i.key === drag.key)
                if (!slot) return null
                return (
                    <div
                        className="pointer-events-none absolute left-0 top-0 rounded-2xl border-2 border-dashed border-teal-400/70 bg-teal-50/50 transition-all duration-150 dark:border-teal-400/40 dark:bg-teal-500/10"
                        style={{ transform: `translate(${xToPx(slot.x, cw)}px, ${yToPx(slot.y)}px)`, width: wToPx(slot.w, cw), height: hToPx(slot.h) }}
                    />
                )
            })()}

            {width > 0 &&
                items.map((it) => {
                    const lifted = drag && drag.key === it.key
                    const isActive = activeKey === it.key
                    const x = lifted ? drag.px : xToPx(it.x, cw)
                    const y = lifted ? drag.py : yToPx(it.y)
                    return (
                        <div
                            key={it.key}
                            className="absolute left-0 top-0"
                            style={{
                                transform: `translate(${x}px, ${y}px)`,
                                width: wToPx(it.w, cw),
                                height: hToPx(it.h),
                                transition: isActive ? 'none' : 'transform 180ms ease, width 180ms ease, height 180ms ease',
                                zIndex: lifted ? 30 : 1,
                            }}
                        >
                            <WidgetFrame
                                title={titleOf(it.key)}
                                action={actionOf?.(it.key)}
                                plain={plainOf?.(it.key)}
                                editing={editing}
                                lifted={lifted}
                                onRemove={() => onRemove(it.key)}
                                onDragStart={(e) => startDrag(e, it.key)}
                                onResizeStart={(e) => startResize(e, it.key)}
                            >
                                {renderContent(it.key)}
                            </WidgetFrame>
                        </div>
                    )
                })}
        </div>
    )
}

/**
 * The card around a widget: a title bar (which doubles as the drag handle while editing) over the
 * widget's own content. `plain` widgets — the headline figures — carry their own label and link, so
 * outside edit mode they get the bare card and skip the title bar entirely.
 */
function WidgetFrame({ title, action, plain, editing, lifted, onRemove, onDragStart, onResizeStart, children, style }) {
    const { t } = useTranslation()
    const bare = plain && !editing
    return (
        <div
            style={style}
            className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-shadow dark:bg-slate-900 ${
                lifted ? 'border-teal-400 shadow-2xl ring-2 ring-teal-400/40 dark:border-teal-400' : 'border-slate-200 shadow-sm dark:border-slate-800'
            }`}
        >
            {!bare && <div
                onPointerDown={editing ? onDragStart : undefined}
                style={editing ? { touchAction: 'none' } : undefined}
                className={`flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800 ${
                    editing ? 'cursor-grab bg-slate-50 active:cursor-grabbing dark:bg-slate-800/40' : ''
                }`}
            >
                <div className="flex min-w-0 items-center gap-2">
                    {editing && <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />}
                    <h3 className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
                </div>
                {/* While editing the header is the drag handle, so the link is hidden to keep it grabbable. */}
                {!editing && action}
                {editing && (
                    <button
                        type="button"
                        onClick={onRemove}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={t('dashboard.removeWidget')}
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>}

            <div className={`min-h-0 flex-1 overflow-auto ${bare ? '' : 'p-4'} ${editing ? 'pointer-events-none select-none' : ''}`}>{children}</div>

            {editing && (
                <div
                    onPointerDown={onResizeStart}
                    style={{ touchAction: 'none' }}
                    role="separator"
                    aria-label={t('dashboard.resizeWidget')}
                    className="absolute bottom-0 right-0 flex h-6 w-6 cursor-se-resize items-end justify-end p-1 text-slate-400 hover:text-teal-500"
                >
                    <svg viewBox="0 0 10 10" className="h-3.5 w-3.5 fill-current">
                        <circle cx="9" cy="9" r="1" />
                        <circle cx="9" cy="5.5" r="1" />
                        <circle cx="5.5" cy="9" r="1" />
                        <circle cx="9" cy="2" r="1" />
                        <circle cx="5.5" cy="5.5" r="1" />
                        <circle cx="2" cy="9" r="1" />
                    </svg>
                </div>
            )}
        </div>
    )
}
