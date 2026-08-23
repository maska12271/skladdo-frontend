import { useCallback, useEffect, useState } from 'react'
import { COLS, clamp, compact } from '../utils/gridLayout'

export { COLS }

// Catalogue of dashboard widgets: label, default position (x,y) and size (w,h) in grid units, and
// minimum size. Order here is only a fallback; the real arrangement comes from the x/y of each item.
// Grid is COLS (24) wide and rows are 40px, so widths snap to 1/24 and heights to ~half a card row
// — fine enough to size widgets precisely without leaving gaps.
// Each headline figure is its own widget, so a user can drop the ones they don't care about and put the
// rest wherever they like - the same add / move / resize / remove treatment as every other widget.
export const KPI_KEYS = [
    'kpiRevenue', 'kpiSpend', 'kpiCollected', 'kpiLowStock',
    'kpiActiveSales', 'kpiActivePurchases', 'kpiActiveTenders',
]

/**
 * The default arrangement is two full-width KPI bands over a two-column body: a wide left column for
 * the chart and the tables that need room for their columns, and a narrow right rail of at-a-glance
 * widgets. Every widget in a band shares its neighbours' height so no row is left ragged, and the two
 * columns are sized to finish within a row of each other rather than leaving one hanging.
 *
 * List widgets are deliberately short — they show the first few rows and link out for the rest — so
 * the whole dashboard stays scannable instead of turning into stacked full-height tables.
 */
export const DASHBOARD_WIDGETS = [
    // Band 1: the three money figures, given room for a big number and their 12-month sparkline.
    { key: 'kpiRevenue', label: 'Revenue this month', x: 0, y: 0, w: 8, h: 3, minW: 5, minH: 3 },
    { key: 'kpiSpend', label: 'Spend this month', x: 8, y: 0, w: 8, h: 3, minW: 5, minH: 3 },
    { key: 'kpiCollected', label: 'Collected this month', x: 16, y: 0, w: 8, h: 3, minW: 5, minH: 3 },
    // Band 2: the four plain counts, on half-height cards — a number and a label need no more.
    { key: 'kpiLowStock', label: 'Low stock items', x: 0, y: 4, w: 6, h: 2, minW: 4, minH: 2 },
    { key: 'kpiActiveSales', label: 'Active sales orders', x: 6, y: 4, w: 6, h: 2, minW: 4, minH: 2 },
    { key: 'kpiActivePurchases', label: 'Active purchase orders', x: 12, y: 4, w: 6, h: 2, minW: 4, minH: 2 },
    { key: 'kpiActiveTenders', label: 'Active tenders', x: 18, y: 4, w: 6, h: 2, minW: 4, minH: 2 },

    // Left column: chart first, then the wide tables.
    { key: 'revenueChart', label: 'Revenue vs spend', x: 0, y: 6, w: 16, h: 6, minW: 8, minH: 5, chart: true },
    { key: 'lowStock', label: 'Low stock products', x: 0, y: 14, w: 16, h: 8, minW: 8, minH: 8 },
    // Taller than the other tables: the totals and the aging donut sit above its list.
    { key: 'receivables', label: 'Outstanding invoices', x: 0, y: 21, w: 16, h: 9, minW: 8, minH: 7 },
    { key: 'expiringLots', label: 'Expiring lots', x: 0, y: 30, w: 16, h: 8, minW: 8, minH: 6 },

    // Right rail: glanceable widgets, none of them wide enough to need many columns. Sized so the rail
    // meets the left column at y=14 and y=21 and finishes level with it, instead of trailing off.
    { key: 'activity', label: 'Recent activity', x: 16, y: 6, w: 8, h: 8, minW: 6, minH: 8 },
    { key: 'tenders', label: 'Latest tenders', x: 16, y: 14, w: 8, h: 8, minW: 6, minH: 8 },
    { key: 'stockHealth', label: 'Stock health', x: 16, y: 21, w: 8, h: 4, minW: 5, minH: 4 },
    { key: 'topClients', label: 'Top clients', x: 16, y: 26, w: 8, h: 6, minW: 6, minH: 4 },
    { key: 'topProducts', label: 'Top products', x: 16, y: 32, w: 8, h: 6, minW: 6, minH: 4 },
]

// v8: widgets were resized and rearranged into columns, and the KPI bands re-split into three large
// cards over four small ones. An older layout would reproduce the previous, ragged arrangement, so the
// key is bumped to hand everyone the new default; their own edits start again from it.
const STORAGE_PREFIX = 'dashboard-grid-v8'

export const widgetMeta = (key) => DASHBOARD_WIDGETS.find((w) => w.key === key)

const defaultItem = (key) => {
    const m = widgetMeta(key)
    return { key, x: m.x, y: m.y, w: m.w, h: m.h }
}

/**
 * Reconcile a persisted layout with what the user may actually see: keep saved position/size for
 * known+available widgets, drop unknown/forbidden ones, append newly-available widgets that were
 * never placed (and not explicitly removed), then compact so there are no overlaps or gaps. Also
 * reports which available widgets are currently hidden so they can be re-added.
 */
export function resolveLayout(stored, availableKeys) {
    const items = []
    const seen = new Set()
    const removed = new Set(Array.isArray(stored?.removed) ? stored.removed : [])

    for (const it of Array.isArray(stored?.items) ? stored.items : []) {
        const meta = it && widgetMeta(it.key)
        if (!meta || seen.has(it.key) || !availableKeys.has(it.key) || removed.has(it.key)) continue
        const w = clamp(Math.round(it.w) || meta.w, meta.minW, COLS)
        items.push({
            key: it.key,
            x: clamp(Math.round(it.x) || 0, 0, COLS - w),
            y: Math.max(0, Math.round(it.y) || 0),
            w,
            h: Math.max(meta.minH, Math.round(it.h) || meta.h),
        })
        seen.add(it.key)
    }

    for (const meta of DASHBOARD_WIDGETS) {
        if (availableKeys.has(meta.key) && !seen.has(meta.key) && !removed.has(meta.key)) {
            items.push(defaultItem(meta.key))
            seen.add(meta.key)
        }
    }

    const hidden = DASHBOARD_WIDGETS
        .filter((meta) => availableKeys.has(meta.key) && !seen.has(meta.key))
        .map((meta) => meta.key)

    return { items: compact(items), hidden }
}

function readStored(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

/**
 * Per-user dashboard grid layout (widget positions, sizes and which are removed), persisted to
 * localStorage and keyed by user id so each account keeps its own arrangement on a shared machine.
 */
export function useDashboardLayout(userId) {
    const storageKey = `${STORAGE_PREFIX}:${userId ?? 'anon'}`
    const [stored, setStored] = useState(() => readStored(storageKey))

    useEffect(() => {
        setStored(readStored(storageKey))
    }, [storageKey])

    const save = useCallback((next) => {
        setStored(next)
        try {
            localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
            /* storage unavailable — layout simply won't persist */
        }
    }, [storageKey])

    const reset = useCallback(() => {
        try {
            localStorage.removeItem(storageKey)
        } catch {
            /* ignore */
        }
        setStored(null)
    }, [storageKey])

    return { stored, save, reset }
}
