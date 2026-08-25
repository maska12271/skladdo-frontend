import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, User as UserIcon, ShieldCheck, BarChart3, Archive, ArchiveRestore, Mail, KeyRound } from 'lucide-react'
import { apiGet, apiPost, apiPut } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import DataTable from '../components/DataTable'
import LoadingBlock from '../components/LoadingBlock'
import TrendChart from '../components/TrendChart'
import CopyButton from '../components/CopyButton'
import SentEmailDetailModal from '../components/SentEmailDetailModal'
import { formatMoney, formatDate, formatDateTime, safeArray } from '../utils/format'
import { PERIOD_KEYS, periodRange } from '../utils/period'
import { PERMISSION_MODULES } from '../constants/modules'
import Checkbox from '../components/Checkbox'
import UserAvatar from '../components/UserAvatar'

const ROLE_BADGE = {
    OWNER: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ADMINISTRATOR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    USER: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    WAREHOUSE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const PERMISSION_ACTIONS = [
    { key: 'canView', labelKey: 'users.perm.view' },
    { key: 'canCreate', labelKey: 'users.perm.create' },
    { key: 'canEdit', labelKey: 'users.perm.edit' },
    { key: 'canDelete', labelKey: 'users.perm.delete' },
]

const TABS = [
    { key: 'general', labelKey: 'userDetail.tabs.general', icon: UserIcon },
    { key: 'settings', labelKey: 'userDetail.tabs.settings', icon: ShieldCheck },
    { key: 'performance', labelKey: 'userDetail.tabs.performance', icon: BarChart3 },
    { key: 'emails', labelKey: 'userDetail.tabs.emails', icon: Mail },
]

// Cancelled orders stay in the tables for completeness, but never count toward totals or the chart.
const isCancelled = (o) => String(o.status || '').toUpperCase() === 'CANCELLED'

function summarize(salesLines, purchaseLines) {
    let salesRevenue = 0
    let salesCount = 0
    for (const o of salesLines) {
        if (isCancelled(o)) continue
        salesRevenue += Number(o.totalAmount) || 0
        salesCount += 1
    }
    let purchaseSpend = 0
    let purchaseCount = 0
    for (const o of purchaseLines) {
        if (isCancelled(o)) continue
        purchaseSpend += Number(o.totalAmount) || 0
        purchaseCount += 1
    }
    return {
        salesRevenue,
        salesCount,
        purchaseSpend,
        purchaseCount,
        avgSalesValue: salesCount ? salesRevenue / salesCount : 0,
    }
}

// Inventory-adjustment rollup for warehouse profiles: how many movements, and how many units were
// added vs removed across them.
function summarizeAdjustments(adjustments) {
    let count = 0
    let added = 0
    let removed = 0
    for (const a of adjustments) {
        count += 1
        const q = Number(a.quantityChange) || 0
        if (q >= 0) added += q
        else removed += -q
    }
    return { count, added, removed }
}

function buildMonthly(salesLines, purchaseLines) {
    const map = new Map()
    const add = (o, kind) => {
        if (isCancelled(o) || !o.orderDate) return
        const month = o.orderDate.slice(0, 7)
        let m = map.get(month)
        if (!m) {
            m = { month, salesAmount: 0, salesCount: 0, purchaseAmount: 0, purchaseCount: 0 }
            map.set(month, m)
        }
        m[`${kind}Amount`] += Number(o.totalAmount) || 0
        m[`${kind}Count`] += 1
    }
    salesLines.forEach((o) => add(o, 'sales'))
    purchaseLines.forEach((o) => add(o, 'purchase'))
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export default function UserDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const { user: currentUser, isAdmin } = useAuth()
    const toast = useToast()

    // Performance chart metrics. The user profile plots the activity the user is responsible for, so a
    // single TrendChart config can switch between value (money) and order counts for sales/purchases.
    const CHART_METRICS = {
        salesAmount: { label: t('userDetail.chart.salesValue'), bar: 'fill-teal-500', accent: 'text-teal-600 dark:text-teal-400', money: true },
        purchaseAmount: { label: t('userDetail.chart.purchaseValue'), bar: 'fill-amber-500', accent: 'text-amber-600 dark:text-amber-400', money: true },
        salesCount: { label: t('userDetail.chart.salesOrders'), bar: 'fill-indigo-500', accent: 'text-indigo-600 dark:text-indigo-400', money: false },
        purchaseCount: { label: t('userDetail.chart.purchaseOrders'), bar: 'fill-violet-500', accent: 'text-violet-600 dark:text-violet-400', money: false },
    }

    const [user, setUser] = useState(null)
    const [details, setDetails] = useState(null)
    const [tab, setTab] = useState('general')
    const [period, setPeriod] = useState('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    // Permissions (Settings & rights tab) are loaded lazily so the general tab renders immediately.
    const [permRows, setPermRows] = useState(null)
    const [permLoading, setPermLoading] = useState(false)
    const [permError, setPermError] = useState('')
    const [savingPerms, setSavingPerms] = useState(false)
    const [archiving, setArchiving] = useState(false)
    const [sendingReset, setSendingReset] = useState(false)
    // Copyable setup/reset link, shown when the email couldn't be delivered (company SMTP not set up).
    const [resetLink, setResetLink] = useState(null)
    const [allWarehouses, setAllWarehouses] = useState([])
    const [assignedWarehouseIds, setAssignedWarehouseIds] = useState([])
    const [savingWarehouses, setSavingWarehouses] = useState(false)

    // Emails tab (manager-facing; the whole page is admin-only). Lazily loaded when the tab is opened.
    const [emailData, setEmailData] = useState(null)
    const [emailDetailId, setEmailDetailId] = useState(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        // Drop any cached permissions / emails so a different user's data is re-fetched, not shown stale.
        setPermRows(null)
        setEmailData(null)
        Promise.all([apiGet(`/users/${id}`), apiGet(`/users/${id}/details`)])
            .then(([userRes, detailsRes]) => {
                if (cancelled) return
                setUser(userRes)
                setDetails(detailsRes)
                if (userRes.warehouseIds) setAssignedWarehouseIds(userRes.warehouseIds)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [id])

    // Load the permission matrix the first time the Settings tab is opened. `permLoading` is
    // intentionally NOT a dependency: it changes inside the effect, and including it would re-run
    // (and cancel) the in-flight request, leaving the tab stuck on "Loading…".
    useEffect(() => {
        if (tab !== 'settings' || permRows !== null) return
        let cancelled = false
        setPermLoading(true)
        setPermError('')
        apiGet(`/users/${id}/permissions`)
            .then((res) => !cancelled && setPermRows(safeArray(res)))
            .catch((err) => !cancelled && setPermError(err.message || t('errors.serverError')))
            .finally(() => !cancelled && setPermLoading(false))
        return () => {
            cancelled = true
        }
    }, [tab, id, permRows])

    useEffect(() => {
        if (tab !== 'settings' || allWarehouses.length > 0) return
        apiGet('/warehouses').then((res) => setAllWarehouses(safeArray(res))).catch(() => {})
    }, [tab, allWarehouses.length])

    // Load this user's sent emails the first time the Emails tab is opened.
    useEffect(() => {
        if (tab !== 'emails' || emailData !== null) return
        apiGet(`/sent-emails?senderId=${id}&size=100&sortBy=sentAt&sortDir=desc`)
            .then((res) => setEmailData(res || { content: [], totalElements: 0 }))
            .catch(() => setEmailData({ content: [], totalElements: 0 }))
    }, [tab, id, emailData])

    const handleSaveWarehouses = async () => {
        setSavingWarehouses(true)
        try {
            const ids = await apiPut(`/users/${id}/warehouses`, { warehouseIds: assignedWarehouseIds })
            setAssignedWarehouseIds(ids)
            toast.success(t('userDetail.settings.warehousesUpdated'))
        } catch (err) {
            toast.error?.(err.message || t('users.couldNotSavePermissions'))
        } finally {
            setSavingWarehouses(false)
        }
    }

    const range = periodRange(period)
    const rangeCaption = range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : 'All time'
    const inRange = (dateStr) => !range || (dateStr && dateStr >= range.start && dateStr <= range.end)

    const allSales = details?.salesOrders || []
    const allPurchases = details?.purchaseOrders || []
    const lifetime = useMemo(() => summarize(allSales, allPurchases), [details])

    const filteredSales = allSales.filter((o) => inRange(o.orderDate))
    const filteredPurchases = allPurchases.filter((o) => inRange(o.orderDate))
    const summary = summarize(filteredSales, filteredPurchases)

    // Warehouse staff don't author orders; their activity is stock adjustments instead.
    const allAdjustments = details?.inventoryAdjustments || []
    const adjDateOf = (a) => (a.createdAt || '').slice(0, 10)
    const lifetimeAdj = useMemo(() => summarizeAdjustments(allAdjustments), [details])
    const filteredAdjustments = allAdjustments.filter((a) => inRange(adjDateOf(a)))
    const adjSummary = summarizeAdjustments(filteredAdjustments)
    const monthly = useMemo(
        () => buildMonthly(filteredSales, filteredPurchases),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [details, period],
    )

    if (loading) return <LoadingBlock text={t('userDetail.loading')} />
    if (error || !user) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/users')} label={t('userDetail.back')} />
                <LoadingBlock text={t('userDetail.notFound')} />
            </div>
        )
    }

    const isOwner = user.role === 'OWNER'
    const isSelf = user.id === currentUser?.id
    const isRestrictable = user.role === 'USER' || user.role === 'WAREHOUSE'
    const isWarehouse = user.role === 'WAREHOUSE'
    const canEditRights = isAdmin && isRestrictable

    const salesRows = filteredSales.map((o, i) => ({ ...o, _rid: `s-${o.orderId}-${i}` }))
    const purchaseRows = filteredPurchases.map((o, i) => ({ ...o, _rid: `p-${o.orderId}-${i}` }))

    const togglePermission = (module, action, checked) => {
        setPermRows((prev) =>
            (prev || []).map((row) => {
                if (row.module !== module) return row
                const next = { ...row, [action]: checked }
                if (action === 'canView' && !checked) {
                    next.canCreate = false
                    next.canEdit = false
                    next.canDelete = false
                } else if (action !== 'canView' && checked) {
                    next.canView = true
                }
                return next
            }),
        )
    }

    // Emails is granted as a single capability ("can send emails") rather than the per-action CRUD
    // grid: ON enables viewing sent history and sending; OFF revokes everything. Template management
    // (canEdit/canDelete) is not separately grantable and stays off for regular users.
    const toggleEmailAccess = (module, checked) => {
        setPermRows((prev) =>
            (prev || []).map((row) =>
                row.module === module
                    ? { ...row, canView: checked, canCreate: checked, canEdit: false, canDelete: false }
                    : row,
            ),
        )
    }

    const handleSavePermissions = async () => {
        if (!canEditRights || !permRows) return
        setSavingPerms(true)
        setPermError('')
        try {
            const res = await apiPut(`/users/${id}/permissions`, { permissions: permRows })
            setPermRows(safeArray(res))
            toast.success(t('userDetail.settings.permissionsUpdated'))
        } catch (err) {
            setPermError(err.message || t('users.couldNotSavePermissions'))
        } finally {
            setSavingPerms(false)
        }
    }

    const handleArchiveToggle = async () => {
        setArchiving(true)
        try {
            const res = await apiPut(`/users/${id}/${user.archived ? 'unarchive' : 'archive'}`, {})
            setUser(res)
            toast.success(user.archived ? t('users.unarchived') : t('users.archived'))
        } catch (err) {
            toast.error?.(err.message || t('userDetail.settings.couldNotUpdate'))
        } finally {
            setArchiving(false)
        }
    }

    // (Re)sends the user their password setup/reset link. Never changes an existing password: an active
    // user keeps their current one until they actually reset. Falls back to a copyable link if email fails.
    const handleSendResetLink = async () => {
        setSendingReset(true)
        setResetLink(null)
        try {
            const res = await apiPost(`/users/${id}/setup-email`, {})
            if (res?.emailSent) {
                toast.success(t('userDetail.settings.resetEmailSent', { email: user.email }))
            } else if (res?.setupLink) {
                setResetLink(res.setupLink)
            }
        } catch (err) {
            toast.error?.(err.message || t('userDetail.settings.couldNotUpdate'))
        } finally {
            setSendingReset(false)
        }
    }

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate('/users')} label={t('userDetail.back')} />

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center">
                <div className="flex items-center gap-4">
                    <UserAvatar user={user} size="lg" />
                    <div className="space-y-1.5">
                        <h1 className="text-2xl font-bold tracking-tight">{user.fullName || user.email}</h1>
                        <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                            <span className="truncate">{user.email}</span>
                            <CopyButton value={user.email} />
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGE[user.role] || ROLE_BADGE.USER}`}>
                                {t(`roles.${user.role}`)}
                            </span>
                            <StatusBadge status={user.archived ? 'ARCHIVED' : 'ACTIVE'} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
                {TABS.map((tb) => {
                    const Icon = tb.icon
                    return (
                        <button
                            key={tb.key}
                            type="button"
                            onClick={() => setTab(tb.key)}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                                tab === tb.key
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon className="h-4 w-4" /> {t(tb.labelKey)}
                        </button>
                    )
                })}
            </div>

            {/* ---- General ---- */}
            {tab === 'general' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                            <Fact label={t('userDetail.general.fullName')} value={user.fullName || '—'} />
                            <Fact label={t('common.email')} value={user.email} copyValue={user.email} />
                            <Fact label={t('userDetail.general.role')} value={t(`roles.${user.role}`)} />
                            <Fact label={t('userDetail.general.accountStatus')} value={user.archived ? t('userDetail.general.archived') : t('userDetail.general.active')} />
                            <Fact label={t('userDetail.general.company')} value={user.companyName || '—'} />
                            {/* "Never" is the useful answer here, not a dash: an invited colleague who has
                                not signed in yet is exactly what an administrator is looking for. */}
                            <Fact
                                label={t('userDetail.general.lastLogin')}
                                value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('userDetail.general.neverSignedIn')}
                            />
                        </dl>
                    </div>

                    <div>
                        <h2 className="mb-3 text-lg font-semibold">{t('userDetail.general.lifetime')}</h2>
                        {isWarehouse ? (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <StatCard title={t('userDetail.inventory.adjustments')} value={lifetimeAdj.count} hint={t('userDetail.general.allTime')} color="blue" />
                                <StatCard title={t('userDetail.inventory.itemsAdded')} value={lifetimeAdj.added} hint={t('userDetail.inventory.unitsAddedHint')} color="teal" />
                                <StatCard title={t('userDetail.inventory.itemsRemoved')} value={lifetimeAdj.removed} hint={t('userDetail.inventory.unitsRemovedHint')} color="rose" />
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <StatCard title={t('userDetail.general.salesOrdersCreated')} value={lifetime.salesCount} hint={t('userDetail.general.allTime')} color="teal" />
                                <StatCard title={t('userDetail.general.salesValue')} value={formatMoney(lifetime.salesRevenue)} hint={t('userDetail.general.exclCancelled')} color="teal" />
                                <StatCard title={t('userDetail.general.purchaseOrdersCreated')} value={lifetime.purchaseCount} hint={t('userDetail.general.allTime')} color="amber" />
                                <StatCard title={t('userDetail.general.purchaseValue')} value={formatMoney(lifetime.purchaseSpend)} hint={t('userDetail.general.exclCancelled')} color="amber" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---- Settings & rights ---- */}
            {tab === 'settings' && (
                <div className="space-y-6">
                    {/* Account settings */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="text-lg font-semibold">{t('userDetail.settings.account')}</h2>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                            <Fact
                                label={t('userDetail.settings.role')}
                                value={
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGE[user.role] || ROLE_BADGE.USER}`}>
                                        {t(`roles.${user.role}`)}
                                    </span>
                                }
                            />
                            <Fact label={t('userDetail.settings.status')} value={<StatusBadge status={user.archived ? 'ARCHIVED' : 'ACTIVE'} />} />
                            {isRestrictable && (
                                <Fact
                                    label={t('userDetail.settings.canSeePrices')}
                                    value={user.canSeePrices !== false ? t('common.yes') : t('common.no')}
                                />
                            )}
                        </dl>
                        {isAdmin && !isOwner && !isSelf && (
                            <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleArchiveToggle}
                                        disabled={archiving}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                        {user.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                        {user.archived ? t('userDetail.settings.unarchiveAccount') : t('userDetail.settings.archiveAccount')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSendResetLink}
                                        disabled={sendingReset}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                        <KeyRound className="h-4 w-4" />
                                        {user.passwordSetupPending ? t('userDetail.settings.resendSetup') : t('userDetail.settings.sendResetLink')}
                                    </button>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {user.passwordSetupPending
                                            ? t('userDetail.settings.awaitingSetup')
                                            : t('userDetail.settings.resetHint')}
                                    </p>
                                </div>
                                {resetLink && (
                                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('userDetail.settings.setupLinkHint')}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-300">{resetLink}</span>
                                            <CopyButton value={resetLink} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {isSelf && (
                            <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                {t('userDetail.settings.ownAccount')}
                            </p>
                        )}
                    </div>

                    {/* Warehouse assignment (WAREHOUSE role only) */}
                    {isWarehouse && isAdmin && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="text-lg font-semibold">{t('userDetail.settings.warehouseAssignment')}</h2>
                                <button
                                    type="button"
                                    onClick={handleSaveWarehouses}
                                    disabled={savingWarehouses}
                                    className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                                >
                                    {savingWarehouses ? t('common.saving') : t('common.save')}
                                </button>
                            </div>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                {t('userDetail.settings.warehouseAssignmentHint')}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {allWarehouses.map((w) => {
                                    const checked = assignedWarehouseIds.includes(w.id)
                                    return (
                                        <label key={w.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${checked ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}`}>
                                            <Checkbox checked={checked} onChange={(e) => setAssignedWarehouseIds((prev) => e.target.checked ? [...prev, w.id] : prev.filter((x) => x !== w.id))} />
                                            {w.name}
                                        </label>
                                    )
                                })}
                                {allWarehouses.length === 0 && (
                                    <p className="text-sm text-slate-400">{t('common.loading')}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* User rights */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold">{t('userDetail.settings.userRights')}</h2>
                            {canEditRights && permRows && (
                                <button
                                    type="button"
                                    onClick={handleSavePermissions}
                                    disabled={savingPerms}
                                    className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                                >
                                    {savingPerms ? t('common.saving') : t('userDetail.settings.savePermissions')}
                                </button>
                            )}
                        </div>

                        {permError && (
                            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                                {permError}
                            </div>
                        )}

                        {!isRestrictable ? (
                            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                                {t('userDetail.settings.fullAccessNote', { role: t(`roles.${user.role}`) })}
                            </p>
                        ) : permLoading && !permRows ? (
                            <p className="mt-4 py-6 text-center text-sm text-slate-500">{t('userDetail.settings.loadingPermissions')}</p>
                        ) : (
                            <>
                                {isWarehouse && (
                                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                                        <p className="font-medium">{t('userDetail.settings.warehouseTitle')}</p>
                                        <p className="mt-1 text-emerald-700 dark:text-emerald-300/90">{t('userDetail.settings.warehouseNote')}</p>
                                    </div>
                                )}
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {t('userDetail.settings.rightsIntro')}
                                </p>
                                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                                                <th className="px-4 py-3 font-semibold">{t('users.perm.area')}</th>
                                                {PERMISSION_ACTIONS.map((action) => (
                                                    <th key={action.key} className="px-4 py-3 text-center font-semibold">{t(action.labelKey)}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(permRows || []).map((row) => {
                                                const meta = PERMISSION_MODULES.find((m) => m.module === row.module)
                                                const label = meta ? t(`nav.${meta.navKey}`) : row.module
                                                // Emails is a single on/off capability, not a CRUD row.
                                                if (row.module === 'MANUFACTURER_EMAILS') {
                                                    return (
                                                        <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                            <td className="px-4 py-3 font-medium">{label}</td>
                                                            <td colSpan={PERMISSION_ACTIONS.length} className="px-4 py-3 text-center">
                                                                <label className="inline-flex items-center gap-2">
                                                                    <Checkbox checked={!!row.canCreate} disabled={!canEditRights} onChange={(e) => toggleEmailAccess(row.module, e.target.checked)} />
                                                                    <span className="text-sm text-slate-600 dark:text-slate-300">{t('users.perm.emailAccess')}</span>
                                                                </label>
                                                            </td>
                                                        </tr>
                                                    )
                                                }
                                                return (
                                                    <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                        <td className="px-4 py-3 font-medium">{label}</td>
                                                        {PERMISSION_ACTIONS.map((action) => (
                                                            <td key={action.key} className="px-4 py-3 text-center">
                                                                <Checkbox checked={!!row[action.key]} disabled={!canEditRights} onChange={(e) => togglePermission(row.module, action.key, e.target.checked)} />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ---- Performance ---- */}
            {tab === 'performance' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">{t('userDetail.performance.title')}</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{rangeCaption}</p>
                        </div>
                        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                            {PERIOD_KEYS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setPeriod(key)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                        period === key
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {t(`period.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isWarehouse ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <StatCard title={t('userDetail.inventory.adjustments')} value={adjSummary.count} hint={t('common.inSelectedPeriod')} color="blue" />
                                <StatCard title={t('userDetail.inventory.itemsAdded')} value={adjSummary.added} hint={t('userDetail.inventory.unitsAddedHint')} color="teal" />
                                <StatCard title={t('userDetail.inventory.itemsRemoved')} value={adjSummary.removed} hint={t('userDetail.inventory.unitsRemovedHint')} color="rose" />
                            </div>

                            <section className="space-y-3">
                                <h2 className="text-lg font-semibold">{t('userDetail.inventory.tableTitle', { count: filteredAdjustments.length })}</h2>
                                <DataTable
                                    tableId="user-inventory-adjustments"
                                    columns={adjustmentColumns(t)}
                                    rows={filteredAdjustments.map((a, i) => ({ ...a, _rid: `a-${a.id}-${i}` }))}
                                    getRowId={(r) => r._rid}
                                    onRowClick={(r) => r.productId && navigate(`/products/${r.productId}`)}
                                    initialPageSize={10}
                                />
                            </section>
                        </>
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <StatCard title={t('userDetail.performance.salesValue')} value={formatMoney(summary.salesRevenue)} hint={t('userDetail.performance.salesOrdersHint', { count: summary.salesCount })} color="teal" />
                                <StatCard title={t('userDetail.performance.salesOrders')} value={summary.salesCount} hint={t('common.inSelectedPeriod')} color="teal" />
                                <StatCard title={t('userDetail.performance.avgSalesOrder')} value={formatMoney(summary.avgSalesValue)} hint={t('userDetail.performance.perSalesOrder')} color="blue" />
                                <StatCard title={t('userDetail.performance.purchaseValue')} value={formatMoney(summary.purchaseSpend)} hint={t('userDetail.performance.purchaseOrdersHint', { count: summary.purchaseCount })} color="amber" />
                                <StatCard title={t('userDetail.performance.purchaseOrders')} value={summary.purchaseCount} hint={t('common.inSelectedPeriod')} color="amber" />
                            </div>

                            <TrendChart data={monthly} metrics={CHART_METRICS} initialMetric="salesAmount" />

                            <section className="space-y-3">
                                <h2 className="text-lg font-semibold">{t('userDetail.performance.salesOrdersTable', { count: salesRows.length })}</h2>
                                <DataTable
                                    tableId="user-sales-orders"
                                    columns={orderColumns(t, t('userDetail.cols.client'))}
                                    rows={salesRows}
                                    getRowId={(r) => r._rid}
                                    onRowClick={(r) => navigate(`/sales-orders/${r.orderId}`)}
                                    initialPageSize={10}
                                />
                            </section>

                            <section className="space-y-3">
                                <h2 className="text-lg font-semibold">{t('userDetail.performance.purchaseOrdersTable', { count: purchaseRows.length })}</h2>
                                <DataTable
                                    tableId="user-purchase-orders"
                                    columns={orderColumns(t, t('userDetail.cols.manufacturer'))}
                                    rows={purchaseRows}
                                    getRowId={(r) => r._rid}
                                    onRowClick={(r) => navigate(`/purchase-orders/${r.orderId}`)}
                                    initialPageSize={10}
                                />
                            </section>
                        </>
                    )}
                </div>
            )}

            {/* ---- Emails ---- */}
            {tab === 'emails' && (
                <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <StatCard
                            title={t('userDetail.emails.sent')}
                            value={emailData?.totalElements ?? 0}
                            hint={t('userDetail.general.allTime')}
                            color="teal"
                        />
                    </div>

                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">{t('userDetail.emails.tableTitle', { count: emailData?.totalElements ?? 0 })}</h2>
                        <DataTable
                            tableId="user-sent-emails"
                            columns={emailColumns(t)}
                            rows={safeArray(emailData)}
                            getRowId={(r) => r.id}
                            onRowClick={(r) => setEmailDetailId(r.id)}
                            loading={emailData === null}
                            initialPageSize={10}
                        />
                    </section>
                </div>
            )}

            <SentEmailDetailModal
                emailId={emailDetailId}
                isOpen={emailDetailId != null}
                onClose={() => setEmailDetailId(null)}
            />
        </div>
    )
}

const emailColumns = (t) => [
    { key: 'manufacturerName', label: t('emails.cols.manufacturer'), render: (r) => r.manufacturerName || r.recipientEmail || '—' },
    { key: 'subject', label: t('emails.cols.subject'), render: (r) => <span className="line-clamp-1">{r.subject}</span> },
    { key: 'sentAt', label: t('emails.cols.sentAt'), render: (r) => formatDateTime(r.sentAt) },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'viewed', label: t('emails.cols.viewed'), render: (r) => (r.viewed ? t('common.yes') : t('common.no')) },
    { key: 'replied', label: t('emails.cols.replied'), render: (r) => (r.replied ? t('common.yes') : t('common.no')) },
]

const orderColumns = (t, counterpartyLabel) => [
    { key: 'orderNumber', label: t('userDetail.cols.orderNumber'), render: (r) => r.orderNumber || `#${r.orderId}` },
    { key: 'orderDate', label: t('common.date'), render: (r) => formatDate(r.orderDate) },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'counterpartyName', label: counterpartyLabel, render: (r) => r.counterpartyName || '—' },
    { key: 'itemCount', label: t('userDetail.cols.items') },
    { key: 'totalAmount', label: t('common.total'), render: (r) => formatMoney(r.totalAmount) },
]

const adjustmentColumns = (t) => [
    { key: 'createdAt', label: t('common.date'), render: (r) => formatDate(r.createdAt) },
    { key: 'productName', label: t('userDetail.inventory.product'), render: (r) => r.productName || '—' },
    {
        key: 'quantityChange',
        label: t('userDetail.inventory.change'),
        render: (r) => {
            const added = (r.quantityChange ?? 0) >= 0
            return (
                <span className={added ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-rose-600 dark:text-rose-400'}>
                    {added ? '+' : ''}{r.quantityChange}
                </span>
            )
        },
    },
    { key: 'newQuantity', label: t('userDetail.inventory.resulting') },
    { key: 'note', label: t('userDetail.inventory.reason'), render: (r) => r.note || '—' },
]

function BackButton({ onClick, label }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
            <ChevronLeft className="h-4 w-4" /> {label}
        </button>
    )
}

function Fact({ label, value, copyValue }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            {copyValue ? (
                <dd className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    <span className="min-w-0 truncate">{value}</span>
                    <CopyButton value={copyValue} />
                </dd>
            ) : (
                <dd className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
            )}
        </div>
    )
}
