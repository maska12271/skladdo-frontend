import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users, UserPlus, AlertTriangle, Activity, Warehouse, Ban, Gift } from 'lucide-react'
import { apiGet } from '../api/client'
import { formatDate, safeArray } from '../utils/format'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import LoadingBlock from '../components/LoadingBlock'
import { StatusBadge, Pill, daysUntil, relativeDays } from '../components/AdminBits'

/** Pulls a trailing-window count out of the backend's `[{ days, count }]` list. */
function windowCount(list, days) {
    return safeArray(list).find((w) => w.days === days)?.count ?? 0
}

/** A labelled row in one of the breakdown panels. */
function Row({ label, value, hint }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
            <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
            <span className="flex items-baseline gap-2">
                {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
                <span className="font-semibold tabular-nums">{value}</span>
            </span>
        </div>
    )
}

function Panel({ title, children, action }) {
    return (
        <div className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-semibold">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    )
}

/**
 * The platform operator's overview: how big the customer base is, who joined recently, who has gone
 * quiet, and who needs chasing. Read-only — every action lives on the companies pages.
 */
export default function AdminDashboardPage() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        apiGet('/admin/stats')
            .then((res) => {
                if (!cancelled) setStats(res)
            })
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (loading) return <LoadingBlock />
    if (!stats) return null

    const recent = safeArray(stats.recentSignups)
    const endingSoon = safeArray(stats.sponsorshipsEndingSoon)

    return (
        <div>
            <PageHeader
                title="Platform overview"
                description="Every company on Skladdo, across all tenants."
                action={
                    <Link
                        to="/admin/companies"
                        className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                        All companies
                    </Link>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total companies"
                    value={stats.totalCompanies}
                    hint={`${stats.businessCompanies} business · ${stats.warehouseCompanies} warehouse`}
                    icon={Building2}
                />
                <StatCard
                    title="Business accounts"
                    value={stats.businessCompanies}
                    hint="Paying customers"
                    color="blue"
                    icon={Building2}
                />
                <StatCard
                    title="Warehouse partners"
                    value={stats.warehouseCompanies}
                    hint="Free 3PL logins"
                    color="blue"
                    icon={Warehouse}
                />
                <StatCard
                    title="Total users"
                    value={stats.totalUsers}
                    hint="Active accounts, all companies"
                    icon={Users}
                />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="New this month"
                    value={windowCount(stats.newCompanies, 30)}
                    hint={`${windowCount(stats.newCompanies, 7)} in the last 7 days`}
                    icon={UserPlus}
                />
                <StatCard
                    title="Active last 30 days"
                    value={windowCount(stats.activeCompanies, 30)}
                    hint={`${windowCount(stats.activeCompanies, 90)} in the last 90 days`}
                    icon={Activity}
                />
                <StatCard
                    title="Overdue"
                    value={stats.overdueCompanies}
                    hint="Lapsed billing period — follow up"
                    color={stats.overdueCompanies > 0 ? 'amber' : 'teal'}
                    icon={AlertTriangle}
                />
                <StatCard
                    title="On a free period"
                    value={stats.sponsoredCompanies}
                    hint={endingSoon.length > 0 ? `${endingSoon.length} ending within 7 days` : 'Never counted as overdue'}
                    color="blue"
                    icon={Gift}
                />
            </div>

            {endingSoon.length > 0 ? (
                <div className="mt-4">
                    <Panel title="Free periods ending soon">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {endingSoon.map((company) => (
                                <Link
                                    key={company.id}
                                    to={`/admin/companies/${company.id}`}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{company.name}</p>
                                        <p className="truncate text-xs text-slate-500">
                                            {company.freeNote || company.ownerEmail}
                                        </p>
                                    </div>
                                    <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                                        {daysUntil(company.freeUntil)}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </Panel>
                </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Suspended"
                    value={stats.suspendedCompanies}
                    hint="Cannot sign in"
                    color={stats.suspendedCompanies > 0 ? 'rose' : 'teal'}
                    icon={Ban}
                />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Signups">
                    <Row label="Last 7 days" value={windowCount(stats.newCompanies, 7)} />
                    <Row label="Last 30 days" value={windowCount(stats.newCompanies, 30)} />
                    <Row label="Last 90 days" value={windowCount(stats.newCompanies, 90)} />
                    <p className="pt-3 text-xs text-slate-400">
                        Companies created before signup dates were recorded are excluded rather than counted
                        as new.
                    </p>
                </Panel>

                <Panel title="Plan mix">
                    {safeArray(stats.planMix).length === 0 ? (
                        <p className="py-4 text-sm text-slate-500">No subscriptions yet.</p>
                    ) : (
                        safeArray(stats.planMix).map((p) => (
                            <Row key={p.plan} label={p.plan} value={p.count} />
                        ))
                    )}
                </Panel>
            </div>

            <div className="mt-4">
                <Panel
                    title="Recent signups"
                    action={
                        <Link to="/admin/companies" className="text-sm font-medium text-teal-700 dark:text-teal-400">
                            View all
                        </Link>
                    }
                >
                    {recent.length === 0 ? (
                        <p className="py-4 text-sm text-slate-500">Nothing yet.</p>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recent.map((company) => (
                                <Link
                                    key={company.id}
                                    to={`/admin/companies/${company.id}`}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{company.name}</p>
                                        <p className="truncate text-xs text-slate-500">
                                            {company.ownerEmail || 'No owner on record'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Pill>{company.plan}</Pill>
                                        <StatusBadge status={company.status} />
                                        <span className="w-28 text-right text-xs text-slate-500">
                                            {relativeDays(company.createdAt) || formatDate(company.createdAt)}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    )
}
