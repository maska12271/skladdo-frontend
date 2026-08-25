import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    ArrowRight,
    Check,
    Plus,
    SlidersHorizontal,
    X,
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    Truck,
    FileText,
    AlertTriangle,
    Wallet,
} from 'lucide-react'
import { apiGet } from '../api/client'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingBlock from '../components/LoadingBlock'
import RevenueSpendChart from '../components/RevenueSpendChart'
import { ActivityFeed, RankList, ExpiringLots, Receivables, StockHealth, ShowingCount, WIDGET_ROWS, MOBILE_WIDGET_ROWS, MOBILE_CARD_ROWS } from '../components/DashboardWidgets'
import { Sparkline } from '../components/MicroCharts'
import DashboardGrid from '../components/DashboardGrid'
import { useBreakpoint } from '../hooks/useBreakpoint'
import WarehouseDashboard from '../components/WarehouseDashboard'
import { useDashboardLayout, resolveLayout, widgetMeta } from '../hooks/useDashboardLayout'
import { compact, bottom } from '../utils/gridLayout'
import { formatMoney } from '../utils/format'

// Month-over-month percentage change; treats "from nothing to something" as +100% and "all gone" as
// -100% so the trend pill stays meaningful at the edges.
function pctChange(now, prev) {
    const a = Number(now) || 0
    const b = Number(prev) || 0
    if (b === 0) return a > 0 ? 100 : 0
    return ((a - b) / b) * 100
}

export default function DashboardPage() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const navigate = useNavigate()
    const { stored, save, reset } = useDashboardLayout(user?.id)

    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const isPhone = useBreakpoint() === 'mobile'
    // Low stock and expiring lots draw their rows as cards on a phone, so they show fewer there.
    const cardRows = isPhone ? MOBILE_CARD_ROWS : WIDGET_ROWS
    // Tenders draws cards at every width, so it counts in cards at every width — a tender card runs about
    // 109px, and four of them overflowed the widget on a desktop just as six did on a phone.
    const tenderRows = MOBILE_CARD_ROWS

    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState([]) // working copy of items while editing

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        apiGet('/dashboard/stats')
            .then((res) => !cancelled && setStats(res))
            .catch(() => !cancelled && setStats(null))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [])

    // Which widgets have data the user is allowed to see — drives rendering and the add menu.
    const availableKeys = useMemo(() => {
        const keys = new Set()
        if (!stats) return keys
        const hasSales = !!stats.sales
        const hasPurchases = !!stats.purchases
        // Each headline figure is its own widget, so each appears only when its data does.
        if (hasSales) keys.add('kpiRevenue')
        if (hasPurchases) keys.add('kpiSpend')
        if (stats.collected) keys.add('kpiCollected')
        if (stats.products) keys.add('kpiLowStock')
        if (hasSales) keys.add('kpiActiveSales')
        if (hasPurchases) keys.add('kpiActivePurchases')
        if (stats.tenders) keys.add('kpiActiveTenders')
        if (stats.products) keys.add('stockHealth')
        if (hasSales || hasPurchases) keys.add('revenueChart')
        if (hasSales || hasPurchases || stats.tenders) keys.add('activity')
        if (stats.products) keys.add('lowStock')
        if (stats.receivables) keys.add('receivables')
        if (stats.expiry) keys.add('expiringLots')
        if (stats.tenders) keys.add('tenders')
        if (hasSales) keys.add('topClients')
        if (hasSales) keys.add('topProducts')
        if (hasSales) keys.add('topServices')
        return keys
    }, [stats])

    const resolved = useMemo(() => resolveLayout(stored, availableKeys), [stored, availableKeys])

    const items = editing ? draft : resolved.items
    const hiddenKeys = editing
        ? [...availableKeys].filter((k) => !draft.some((i) => i.key === k))
        : []

    const enterEdit = () => {
        setDraft(resolved.items.map((i) => ({ ...i })))
        setEditing(true)
    }
    const cancelEdit = () => {
        setEditing(false)
        setDraft([])
    }
    const saveEdit = () => {
        const removed = [...availableKeys].filter((k) => !draft.some((i) => i.key === k))
        save({ items: draft, removed })
        setEditing(false)
        setDraft([])
    }
    const resetEdit = () => {
        reset()
        setEditing(false)
        setDraft([])
    }
    const addWidget = (key) => {
        const m = widgetMeta(key)
        setDraft((d) => compact([...d, { key, x: 0, y: bottom(d), w: m.w, h: m.h }]))
    }
    const removeWidget = (key) => setDraft((d) => compact(d.filter((i) => i.key !== key)))

    if (loading) return <LoadingBlock text={t('dashboard.loading')} />

    // Warehouse staff get a dedicated operational dashboard (no revenue/value figures).
    if (user?.role === 'WAREHOUSE') {
        return (
            <div className="space-y-6">
                <PageHeader title={t('dashboard.title')} description={t('warehouseDash.desc')} />
                {!stats ? <LoadingBlock text={t('dashboard.noData')} /> : <WarehouseDashboard stats={stats} />}
            </div>
        )
    }

    const titleOf = (key) => {
        // KPI widgets reuse the labels the summary cards already had, in every locale.
        if (KPI_TITLE_KEYS[key]) return t(KPI_TITLE_KEYS[key])
        switch (key) {
            case 'revenueChart':
                return t('dashboard.titles.revenueChart')
            case 'activity':
                return t('dashboard.titles.activity')
            case 'lowStock':
                return t('dashboard.titles.lowStock')
            case 'receivables':
                return t('dashboard.titles.receivables')
            case 'expiringLots':
                return t('dashboard.titles.expiringLots')
            case 'tenders':
                return t('dashboard.titles.tenders')
            case 'stockHealth':
                return t('dashboard.titles.stockHealth')
            case 'topClients':
                return t('dashboard.titles.topClients')
            case 'topProducts':
                return t('dashboard.titles.topProducts')
            case 'topServices':
                return t('dashboard.titles.topServices')
            default:
                // KPI widgets fall through to their catalogue label.
                return t(`dashboard.widgets.${key}`, { defaultValue: widgetMeta(key)?.label || key })
        }
    }

    /**
     * The "view all" link in a widget's header, for the widgets that show a cut-down list: it lands on
     * the matching list page with the filter that produced the widget already applied, so what the user
     * clicked is what they see — with every row and every column. Charts and top-N rankings show their
     * whole story in the widget, so they carry no link.
     */
    const actionOf = (key) => {
        const target = VIEW_ALL_KEYS.has(key) ? WIDGET_LINKS[key] : null
        if (!target) return null
        return (
            <Link
                to={target}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
            >
                {t('dashboard.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
        )
    }

    const renderContent = (key) => {
        // While editing the frame supplies the title and the card must not navigate, so the KPI drops
        // its own label and link and renders as a plain figure.
        const kpi = KPI_DEFS[key]
        if (kpi) return <KpiWidget {...kpi(stats, t)} title={titleOf(key)} to={WIDGET_LINKS[key]} linked={!editing} />

        switch (key) {
            case 'revenueChart':
                return <RevenueSpendChart bare data={stats.monthly || []} showRevenue={!!stats.sales} showSpend={!!stats.purchases} />
            case 'activity':
                return <ActivityFeed items={stats.activity || []} onNavigate={navigate} rowLimit={isPhone ? MOBILE_WIDGET_ROWS : undefined} />
            case 'lowStock': {
                const rows = (stats.products?.lowStock || []).slice(0, cardRows)
                return (
                    // No tableId: the column picker belongs on the full list pages, not on a dashboard card.
                    <div className="flex h-full flex-col">
                        {/* Scrolls rather than clips. The row count above is an estimate of what fits,
                            and an estimate is wrong at some zoom level, font size or card height - when
                            it is, the reader should be able to reach the rest instead of losing it. */}
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <DataTable
                                bare
                                columns={lowStockColumns(t)}
                                rows={rows}
                                getRowId={(r) => r.id}
                                onRowClick={editing ? undefined : (r) => navigate(`/products/${r.id}`)}
                                paginate={false}
                            />
                        </div>
                        <ShowingCount shown={rows.length} total={stats.products?.lowStockCount} />
                    </div>
                )
            }
            case 'receivables':
                return <Receivables data={stats.receivables} onNavigate={editing ? undefined : navigate} />
            case 'expiringLots':
                return <ExpiringLots rows={stats.expiry?.rows || []} onNavigate={editing ? undefined : navigate} rowLimit={cardRows} />
            case 'tenders': {
                const rows = (stats.tenders?.latest || []).slice(0, tenderRows)
                return (
                    <div className="flex h-full flex-col">
                        {/* Scrolls rather than clips. The row count above is an estimate of what fits,
                            and an estimate is wrong at some zoom level, font size or card height - when
                            it is, the reader should be able to reach the rest instead of losing it. */}
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <DataTable
                                bare
                                alwaysCards
                                columns={tenderColumns(t)}
                                rows={rows}
                                getRowId={(r) => r.id}
                                onRowClick={editing ? undefined : (r) => navigate(`/tenders/${r.id}`)}
                                paginate={false}
                            />
                        </div>
                        <ShowingCount shown={rows.length} total={stats.tenders?.totalCount} />
                    </div>
                )
            }
            case 'stockHealth':
                return <StockHealth products={stats.products} />
            case 'topClients':
                return <RankList rows={stats.topClients || []} emptyText={t('dashboard.rank.noSales')} />
            case 'topProducts':
                return <RankList rows={stats.topProducts || []} emptyText={t('dashboard.rank.noSales')} unit={t('dashboard.rank.units')} />
            case 'topServices':
                return <RankList rows={stats.topServices || []} emptyText={t('dashboard.rank.noSales')} unit={t('dashboard.rank.units')} />
            default:
                return null
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('dashboard.title')}
                description={editing ? t('dashboard.descEdit') : t('dashboard.descIdle')}
                action={
                    editing ? (
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {hiddenKeys.length > 0 && <AddWidgetMenu hiddenKeys={hiddenKeys} onAdd={addWidget} labelOf={titleOf} />}
                            <button
                                onClick={resetEdit}
                                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {t('dashboard.reset')}
                            </button>
                            <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <X className="h-4 w-4" /> {t('dashboard.cancel')}
                            </button>
                            <button
                                onClick={saveEdit}
                                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                            >
                                <Check className="h-4 w-4" /> {t('dashboard.save')}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={enterEdit}
                            disabled={availableKeys.size === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <SlidersHorizontal className="h-4 w-4" /> {t('dashboard.customize')}
                        </button>
                    )
                }
            />

            {!stats || availableKeys.size === 0 ? (
                <LoadingBlock text={t('dashboard.noData')} />
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t('dashboard.allHidden')}
                </div>
            ) : (
                <DashboardGrid
                    items={items}
                    editing={editing}
                    onChange={setDraft}
                    onRemove={removeWidget}
                    renderContent={renderContent}
                    titleOf={titleOf}
                    actionOf={actionOf}
                    plainOf={(key) => !!KPI_DEFS[key]}
                />
            )}
        </div>
    )
}

function AddWidgetMenu({ hiddenKeys, onAdd, labelOf }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDocClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [open])

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Plus className="h-4 w-4" /> {t('dashboard.addWidget')}
            </button>
            {open && (
                <div className="absolute right-0 z-20 mt-2 max-h-80 w-60 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {hiddenKeys.map((key) => (
                        <button
                            key={key}
                            onClick={() => {
                                onAdd(key)
                                setOpen(false)
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            {labelOf(key)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// The statuses each list page treats as "still active", mirroring DashboardService.ACTIVE_STATUSES so a
// KPI and the list it links to always agree on what they are counting.
const ACTIVE_ORDER_STATUSES = 'NEW,IN_PROGRESS,CONFIRMED'
const ACTIVE_TENDER_STATUSES = 'OPEN,PUBLISHED,IN_PROGRESS'

/**
 * Where each widget's "view all" goes, with the filter that produced it already applied — clicking
 * through from "7 low stock items" lands on the product list showing exactly those 7.
 *
 * The query keys are the ones each list page reads from the URL (see its `useServerTable` filterKeys);
 * the product page folds stock level into its `status` filter.
 */
// The widgets that show a trimmed list and so earn a "view all" in their header. Everything else —
// the KPI cards (whose whole card is already the link), the chart and the top-N rankings — shows all
// it has to show, so a link there would only add noise.
const VIEW_ALL_KEYS = new Set(['lowStock', 'receivables', 'expiringLots', 'tenders'])

const WIDGET_LINKS = {
    kpiRevenue: '/sales-orders',
    kpiSpend: '/purchase-orders',
    kpiCollected: '/sales-orders?paymentStatus=PAID',
    kpiLowStock: '/products?status=low',
    kpiActiveSales: `/sales-orders?status=${ACTIVE_ORDER_STATUSES}`,
    kpiActivePurchases: `/purchase-orders?status=${ACTIVE_ORDER_STATUSES}`,
    kpiActiveTenders: `/tenders?status=${ACTIVE_TENDER_STATUSES}`,
    revenueChart: '/sales-orders',
    stockHealth: '/products?status=low',
    lowStock: '/products?status=low',
    receivables: '/sales-orders?paymentStatus=OVERDUE',
    expiringLots: '/products',
    tenders: '/tenders',
    topClients: '/clients',
    topProducts: '/products',
    topServices: '/services',
}

/** Widget title per KPI, reusing the translations the old summary-card block already shipped. */
const KPI_TITLE_KEYS = {
    kpiRevenue: 'dashboard.kpi.revenueThisMonth',
    kpiSpend: 'dashboard.kpi.spendThisMonth',
    kpiCollected: 'dashboard.kpi.collectedThisMonth',
    kpiLowStock: 'dashboard.kpi.lowStockItems',
    kpiActiveSales: 'dashboard.kpi.activeSales',
    kpiActivePurchases: 'dashboard.kpi.activePurchases',
    kpiActiveTenders: 'dashboard.kpi.activeTenders',
}

/** Builds the props for each KPI widget. Only called for keys whose data is present. */
const KPI_DEFS = {
    // The two figures with a 12-month series behind them also get a sparkline of it.
    kpiRevenue: (s, t) => ({
        icon: TrendingUp, tone: 'teal',
        value: formatMoney(s.sales.thisMonth), hint: t('dashboard.kpi.vsLastMonth'),
        trend: { pct: pctChange(s.sales.thisMonth, s.sales.lastMonth), good: true },
        spark: (s.monthly || []).map((m) => m.revenue),
    }),
    kpiSpend: (s, t) => ({
        icon: TrendingDown, tone: 'amber',
        value: formatMoney(s.purchases.thisMonth), hint: t('dashboard.kpi.vsLastMonth'),
        trend: { pct: pctChange(s.purchases.thisMonth, s.purchases.lastMonth), good: false },
        spark: (s.monthly || []).map((m) => m.spend),
    }),
    kpiCollected: (s, t) => ({
        icon: Wallet, tone: 'emerald',
        value: formatMoney(s.collected.thisMonth), hint: t('dashboard.kpi.fromInvoicePayments'),
        trend: { pct: pctChange(s.collected.thisMonth, s.collected.lastMonth), good: true },
    }),
    // Plain counts: no series to chart and no month-on-month to compare, so they ride on the small card
    // and drop the hint — it only restated the label.
    kpiLowStock: (s) => ({ icon: AlertTriangle, tone: 'rose', value: s.products.lowStockCount, compact: true }),
    kpiActiveSales: (s) => ({ icon: ShoppingCart, tone: 'teal', value: s.sales.activeCount, compact: true }),
    kpiActivePurchases: (s) => ({ icon: Truck, tone: 'blue', value: s.purchases.activeCount, compact: true }),
    kpiActiveTenders: (s) => ({ icon: FileText, tone: 'blue', value: s.tenders.activeCount, compact: true }),
}

const KPI_TONES = {
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
}

/**
 * A single headline figure filling its whole card. Two sizes: the money figures get the large card —
 * label, big number, month-over-month trend and a sparkline of their 12-month series — while the plain
 * counts get a half-height card holding just an icon, a label and the number.
 *
 * When `linked`, the entire card is the link to the list page behind the figure. While the dashboard is
 * being edited it renders inert and unlabelled, because the widget frame supplies the title and needs to
 * stay draggable.
 */
function KpiWidget({ icon: Icon, tone, title, to, value, hint, trend, spark, compact, linked }) {
    const badge = KPI_TONES[tone] || KPI_TONES.teal
    // On a phone the card is sized by its content, so tightening the padding actually shortens it — and
    // the sparkline can take the room that frees up, where at 120x40 it was a thin strip on a 333px card.
    const isMobile = useBreakpoint() === 'mobile'
    const wrap = (className, children) =>
        !linked || !to ? (
            <div className={className}>{children}</div>
        ) : (
            <Link to={to} className={`${className} transition hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
                {children}
            </Link>
        )

    if (compact) {
        // Padding only when this card is the link: while editing, the widget frame supplies its own.
        return wrap(`flex h-full items-center gap-3 ${linked && to ? 'p-3' : ''}`, (
            <>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${badge}`}>
                    <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                    {linked && <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{title}</span>}
                    <span className="block truncate text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
                </span>
            </>
        ))
    }

    const up = trend ? trend.pct >= 0 : false
    // "Good" depends on the metric: rising revenue is good, rising spend is not.
    const positive = trend ? (trend.good ? up : !up) : false

    // A container query, not a media query: this widget is resizable, so its width is set by the
    // dashboard layout rather than the viewport — the same card is 19.5rem wide at 1280 and 32.8rem at
    // 1920. The figure is the reason the card exists, so the sparkline only appears once there is room
    // for both; below that the number takes the whole line rather than being clipped.
    return wrap(`@container flex h-full flex-col justify-center ${linked && to ? 'p-3 sm:p-4' : ''}`, (
        <>
            <div className="flex items-start justify-between gap-3">
                {linked ? <p className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p> : <span />}
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${badge}`}>
                    <Icon className="h-5 w-5" />
                </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3 sm:mt-3">
                <div className="min-w-0">
                    <div className="truncate text-xl font-bold tracking-tight tabular-nums text-slate-900 @[26rem]:text-3xl dark:text-slate-50">{value}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                        {trend && Number.isFinite(trend.pct) && (
                            <span className={`font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {up ? '+' : ''}{Math.round(trend.pct)}%
                            </span>
                        )}
                        <span className="truncate text-slate-400 dark:text-slate-500">{hint}</span>
                    </div>
                </div>
                {/* A quarter of the row, not a fixed strip: the graph stays beside the figure at every
                    size and simply gets narrower on a small card, rather than being dropped (which left
                    the card looking like it had lost something) or pushed underneath it. */}
                {spark && (
                    <div className={`shrink-0 ${isMobile ? 'h-12 w-1/2 max-w-[170px]' : 'h-10 w-1/3 min-w-[60px] max-w-[140px]'}`}>
                        <Sparkline responsive values={spark} color={tone === 'teal' ? 'teal' : 'amber'} width={96} height={40} />
                    </div>
                )}
            </div>
        </>
    ))
}

const lowStockColumns = (t) => [
    { key: 'name', label: t('dashboard.cols.product') },
    { key: 'manufacturerName', label: t('dashboard.cols.manufacturer'), render: (row) => row.manufacturerName || '-' },
    { key: 'stockQuantity', label: t('dashboard.cols.stock'), render: (row) => <span className="font-semibold text-rose-600 dark:text-rose-400">{row.stockQuantity}</span> },
    { key: 'minimumStock', label: t('dashboard.cols.minStock') },
]

// The customer column is left to the tenders list page: this widget sits in the narrow rail, where a
// fourth column would squeeze the title down to nothing.
const tenderColumns = (t) => [
    { key: 'title', label: t('dashboard.cols.title') },
    { key: 'status', label: t('dashboard.cols.status'), render: (row) => <StatusBadge status={row.status} /> },
    { key: 'estimatedValue', label: t('dashboard.cols.value'), render: (row) => formatMoney(row.estimatedValue) },
]
