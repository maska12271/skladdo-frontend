import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import StatCard from './StatCard'
import DataTable from './DataTable'
import StatusBadge from './StatusBadge'
import { formatDate } from '../utils/format'

// The statuses the backend counts as "still open for fulfilment" (DashboardService.OPEN_FOR_FULFILMENT),
// so a card and the list it links to always show the same orders.
const OPEN_STATUSES = 'NEW,IN_PROGRESS,CONFIRMED'

// Section heading with a "view all" link to the matching list page, already filtered to what the
// section shows.
function SectionHeader({ title, to }) {
    const { t } = useTranslation()
    return (
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Link
                to={to}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
            >
                {t('dashboard.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
        </div>
    )
}

/** How many rows each dashboard card previews before deferring to its "view all" link. */
const PREVIEW_ROWS = 5

/**
 * Operational dashboard for warehouse staff: no revenue or money figures, just what needs working —
 * sales orders waiting to be shipped, purchase orders expected in, and low-stock products. Driven by
 * the {@code fulfilment} and {@code products} blocks of the dashboard stats.
 */
export default function WarehouseDashboard({ stats }) {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const fulfilment = stats?.fulfilment || {}
    // A dashboard card is a "what needs attention now" preview, not a list page: show the first few and
    // let the section's "view all" link handle the rest. The KPI above each still counts everything, so
    // trimming the table never hides how much work there actually is.
    const salesToShip = (fulfilment.salesToShip || []).slice(0, PREVIEW_ROWS)
    const purchasesIncoming = (fulfilment.purchasesIncoming || []).slice(0, PREVIEW_ROWS)
    const allLowStock = stats?.products?.lowStock || []
    const lowStock = allLowStock.slice(0, PREVIEW_ROWS)
    const lowStockCount = stats?.products?.lowStockCount ?? allLowStock.length

    const today = new Date().toISOString().slice(0, 10)

    const salesColumns = [
        { key: 'orderNumber', label: t('warehouseDash.cols.order'), render: (r) => r.orderNumber || `#${r.id}` },
        { key: 'counterpartyName', label: t('warehouseDash.cols.client'), render: (r) => r.counterpartyName || '—' },
        { key: 'orderDate', label: t('warehouseDash.cols.ordered'), render: (r) => formatDate(r.orderDate) },
        { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    ]

    const purchaseColumns = [
        { key: 'orderNumber', label: t('warehouseDash.cols.order'), render: (r) => r.orderNumber || `#${r.id}` },
        { key: 'counterpartyName', label: t('warehouseDash.cols.supplier'), render: (r) => r.counterpartyName || '—' },
        {
            key: 'dueDate',
            label: t('warehouseDash.cols.expected'),
            render: (r) =>
                r.dueDate ? (
                    <span className={r.dueDate < today ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
                        {formatDate(r.dueDate)}
                    </span>
                ) : (
                    '—'
                ),
        },
        { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    ]

    const lowStockColumns = [
        { key: 'name', label: t('dashboard.cols.product') },
        { key: 'stockQuantity', label: t('dashboard.cols.stock'), render: (r) => <span className="font-semibold text-rose-600 dark:text-rose-400">{r.stockQuantity}</span> },
        { key: 'minimumStock', label: t('dashboard.cols.minStock') },
    ]

    return (
        <div className="space-y-6">
            {/* Each figure links to the list page filtered to exactly the orders/products it counts. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <Link to={`/sales-orders?status=${OPEN_STATUSES}`} className="block">
                    <StatCard compact title={t('warehouseDash.kpi.toShip')} value={fulfilment.salesToShipCount ?? salesToShip.length} hint={t('warehouseDash.kpi.toShipHint')} color="teal" />
                </Link>
                <Link to={`/purchase-orders?status=${OPEN_STATUSES}`} className="block">
                    <StatCard compact title={t('warehouseDash.kpi.incoming')} value={fulfilment.purchasesIncomingCount ?? purchasesIncoming.length} hint={t('warehouseDash.kpi.incomingHint')} color="blue" />
                </Link>
                <Link to="/products?status=low" className="block">
                    <StatCard compact title={t('warehouseDash.kpi.lowStock')} value={lowStockCount} hint={t('warehouseDash.kpi.lowStockHint')} color="rose" />
                </Link>
            </div>

            <section className="space-y-3">
                <SectionHeader title={t('warehouseDash.salesToShip')} to={`/sales-orders?status=${OPEN_STATUSES}`} />
                {/* No tableId: the column picker belongs on the full list pages, not on a dashboard card. */}
                <DataTable
                    columns={salesColumns}
                    rows={salesToShip}
                    getRowId={(r) => r.id}
                    onRowClick={(r) => navigate(`/sales-orders/${r.id}`)}
                    paginate={false}
                />
            </section>

            <section className="space-y-3">
                <SectionHeader title={t('warehouseDash.incoming')} to={`/purchase-orders?status=${OPEN_STATUSES}`} />
                <DataTable
                    columns={purchaseColumns}
                    rows={purchasesIncoming}
                    getRowId={(r) => r.id}
                    onRowClick={(r) => navigate(`/purchase-orders/${r.id}`)}
                    paginate={false}
                />
            </section>

            {lowStock.length > 0 && (
                <section className="space-y-3">
                    <SectionHeader title={t('dashboard.titles.lowStock', { count: lowStockCount })} to="/products?status=below,out" />
                    <DataTable
                        columns={lowStockColumns}
                        rows={lowStock}
                        getRowId={(r) => r.id}
                        onRowClick={(r) => navigate(`/products/${r.id}`)}
                        paginate={false}
                    />
                </section>
            )}
        </div>
    )
}
