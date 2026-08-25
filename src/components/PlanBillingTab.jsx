import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiGet, apiPut, apiPost, apiDelete } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import LoadingBlock from './LoadingBlock'
import { Check, Info, Zap } from 'lucide-react'

const UNLIMITED = -1

/**
 * The "Plan & Billing" settings tab: shows the company's current subscription, its usage against the
 * plan caps, the plans it can switch to, and the add-on store. Every action hits /api/subscription,
 * which returns the full, updated view, so this component always renders from a single payload.
 *
 * <p>Billing is stubbed on the backend (no payment provider): switching plans and toggling add-ons
 * takes effect immediately and is not charged - see the note banner.</p>
 */
export default function PlanBillingTab() {
    const { t, i18n } = useTranslation()
    const { refreshUser } = useAuth()
    const toast = useToast()

    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        load()
    }, [])

    const load = async () => {
        setLoading(true)
        try {
            setData(await apiGet('/subscription'))
        } finally {
            setLoading(false)
        }
    }

    // Every mutation returns the refreshed view, so we just swap it in.
    const act = async (fn, successKey) => {
        setBusy(true)
        try {
            setData(await fn())
            if (successKey) toast.success(t(successKey))
        } finally {
            setBusy(false)
        }
    }

    const changePlan = (plan) => act(() => apiPut('/subscription/plan', { plan }), 'settings.plan.changed')
    const cancel = () => act(() => apiPost('/subscription/cancel'), 'settings.plan.canceled')
    const resume = () => act(() => apiPost('/subscription/resume'), 'settings.plan.resumed')
    /**
     * Toggling an add-on changes what the whole app offers - the tender and email pages exist only while
     * one is active - so the session profile is re-read afterwards. Without it the sidebar goes on showing
     * the old entitlements until the next full page load, offering pages the server now refuses.
     */
    const enableAddon = (addon) =>
        act(() => apiPost(`/subscription/addons/${addon}`), 'settings.plan.enabled').then(refreshUser)
    const disableAddon = (addon) =>
        act(() => apiDelete(`/subscription/addons/${addon}`), 'settings.plan.disabled').then(refreshUser)

    const fmtDate = (iso) =>
        iso ? new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }) : ''

    const fmtPrice = (price, currency) => {
        const n = Number(price)
        if (!n) return t('settings.plan.free')
        let amount
        try {
            amount = new Intl.NumberFormat(i18n.language, {
                style: 'currency',
                currency,
                maximumFractionDigits: 0,
            }).format(n)
        } catch {
            amount = `${n} ${currency}`
        }
        return amount + t('settings.plan.perMonth')
    }

    const planName = (plan) => t(`settings.plan.names.${plan}`, { defaultValue: plan })

    if (loading || !data) return <LoadingBlock />

    const { plan, status, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, monthlyPrice, currency, usage, plans, addons, freeUntil } = data
    const isExpired = status === 'EXPIRED'
    // A free plan (a warehouse account) is never billed and cannot be switched or cancelled, so the
    // renewal date and the cancel control would both be describing something that does not happen. The
    // backend already sends it nothing to switch to; this drops the rest of the billing furniture.
    const isFreePlan = !Number(monthlyPrice)

    // A free period granted by Skladdo. The company cannot change it, but it must not be told it is about
    // to be charged on a date when it was promised the opposite — so this outranks the renewal line.
    const sponsored = Boolean(freeUntil) && new Date(freeUntil) > new Date()

    // The single dated line under the plan name: a free period wins, then cancellation, then trial, then
    // next payment.
    let periodLine = null
    if (isFreePlan) periodLine = null
    else if (sponsored) periodLine = t('settings.plan.freeUntil', { date: fmtDate(freeUntil) })
    else if (cancelAtPeriodEnd && currentPeriodEnd) periodLine = t('settings.plan.cancelsOn', { date: fmtDate(currentPeriodEnd) })
    else if (status === 'TRIALING' && trialEndsAt) periodLine = t('settings.plan.trialEnds', { date: fmtDate(trialEndsAt) })
    else if (currentPeriodEnd) periodLine = t('settings.plan.nextPayment', { date: fmtDate(currentPeriodEnd) })

    const statusBadge =
        status === 'TRIALING'
            ? { label: t('settings.plan.status.TRIALING'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
            : status === 'EXPIRED'
            ? { label: t('settings.plan.status.EXPIRED'), cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }
            : { label: t('settings.plan.status.ACTIVE'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }

    return (
        <div className="space-y-6">
            {/* Billing-not-live note — or, for a free plan, why there is no billing here at all. */}
            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900/60 dark:bg-sky-950/30">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <p className="text-sky-800 dark:text-sky-300/90">
                    {sponsored
                        ? t('settings.plan.sponsoredNote', { date: fmtDate(freeUntil) })
                        : t(isFreePlan ? 'settings.plan.warehouseFree' : 'settings.plan.billingNote')}
                </p>
            </div>

            {/* Current plan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('settings.plan.currentPlan')}
                        </p>
                        <div className="mt-1 flex items-center gap-3">
                            <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{planName(plan)}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}>{statusBadge.label}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {fmtPrice(monthlyPrice, currency)}
                            {periodLine && <span> · {periodLine}</span>}
                        </p>
                    </div>
                    <div>
                        {isFreePlan ? null : cancelAtPeriodEnd ? (
                            <button
                                onClick={resume}
                                disabled={busy}
                                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                            >
                                {t('settings.plan.resume')}
                            </button>
                        ) : (
                            !isExpired && (
                                <button
                                    onClick={cancel}
                                    disabled={busy}
                                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-rose-950/40"
                                >
                                    {t('settings.plan.cancel')}
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Usage bars */}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    {usage.map((u) => (
                        <UsageBar key={u.resource} item={u} t={t} />
                    ))}
                </div>
            </div>

            {/* Plans. Absent for a company with nothing to switch to (a warehouse account is on the free
                plan, which follows from its account type rather than being bought). */}
            {plans.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('settings.plan.plansHeading')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.plan.plansIntro')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {plans.map((p) => {
                        const current = p.plan === plan
                        const caps = [
                            { label: t('settings.plan.usage.USERS'), value: p.maxUsers },
                        ]
                        return (
                            <div
                                key={p.plan}
                                className={`flex flex-col rounded-xl border p-4 ${
                                    current
                                        ? 'border-teal-600 ring-1 ring-teal-600 dark:border-teal-400 dark:ring-teal-400'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{planName(p.plan)}</p>
                                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{fmtPrice(p.monthlyPrice, currency)}</p>
                                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                                    {caps.map((c) => (
                                        <li key={c.label} className="flex items-center gap-2">
                                            <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span>
                                                {c.value === UNLIMITED ? t('settings.plan.unlimited') : c.value} {c.label}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => changePlan(p.plan)}
                                    disabled={busy || current}
                                    className={`mt-4 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60 ${
                                        current
                                            ? 'cursor-default bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            : 'bg-teal-600 text-white hover:bg-teal-700'
                                    }`}
                                >
                                    {current ? t('settings.plan.current') : t('settings.plan.choosePlan')}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
            )}

            {/* Add-on store. Also absent for a warehouse account: tenders and manufacturer emails both
                belong to selling goods, which is exactly what such an account never does. */}
            {addons.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('settings.plan.addonsHeading')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.plan.addonsIntro')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    {addons.map((a) => (
                        <div key={a.addon} className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{t(`settings.plan.addon.${a.addon}`)}</p>
                                </div>
                                {a.active && (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                        {t('settings.plan.addonActive')}
                                    </span>
                                )}
                            </div>
                            <p className="mt-2 flex-1 text-sm text-slate-500 dark:text-slate-400">{t(`settings.plan.addon.${a.addon}_desc`)}</p>
                            <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{fmtPrice(a.monthlyPrice, currency)}</span>
                                {a.active ? (
                                    a.cancelAtPeriodEnd ? (
                                        <span className="text-xs text-amber-600 dark:text-amber-400">
                                            {t('settings.plan.addonCancels', { date: fmtDate(a.currentPeriodEnd) })}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => disableAddon(a.addon)}
                                            disabled={busy}
                                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-rose-950/40"
                                        >
                                            {t('settings.plan.disable')}
                                        </button>
                                    )
                                ) : (
                                    <button
                                        onClick={() => enableAddon(a.addon)}
                                        disabled={busy}
                                        className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                                    >
                                        {t('settings.plan.enable')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}
        </div>
    )
}

/** One usage meter: used vs. cap, with an over-limit state when an existing count exceeds a lowered cap. */
function UsageBar({ item, t }) {
    const unlimited = item.limit === UNLIMITED
    const over = !unlimited && item.used > item.limit
    const pct = unlimited ? 0 : Math.min(100, item.limit === 0 ? 100 : (item.used / item.limit) * 100)
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{t(`settings.plan.usage.${item.resource}`)}</span>
                <span className={over ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}>
                    {item.used} / {unlimited ? t('settings.plan.unlimited') : item.limit}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                {!unlimited && (
                    <div className={`h-full rounded-full ${over ? 'bg-rose-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                )}
            </div>
        </div>
    )
}
