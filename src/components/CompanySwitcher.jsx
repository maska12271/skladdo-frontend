import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, ChevronDown, Plus, Warehouse } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Header control for working across companies. A warehouse operator's staff serve several clients from
 * one login, so this is the thing that replaces signing out and back in: pick a company, and every page
 * is simply showing that company's data from the next request on.
 *
 * Renders nothing at all for an account with only its own company, which is everybody who isn't a
 * warehouse operator.
 */
export default function CompanySwitcher() {
    const { t } = useTranslation()
    const { companies, switchCompany, isHomeAdmin, isPartnerSession, isWarehouseAccount, lastClientId } = useAuth()
    const toast = useToast()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const [switching, setSwitching] = useState(null)
    const containerRef = useRef(null)

    // Close on an outside click, the same way the other header menus behave.
    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        return () => document.removeEventListener('mousedown', onPointerDown)
    }, [open])

    const home = companies.find((company) => company.home)
    // A warehouse operator's own company is not a place to do business — it holds their warehouses,
    // codes and settings, nothing else. So it is not offered as a company to work in; the clients are the
    // list, and getting back to their own account is a separate action at the bottom.
    const selectable = isWarehouseAccount ? companies.filter((company) => !company.home) : companies

    // Only worth a header control once there is something to switch between — an ordinary company with a
    // single tenant should not carry a dropdown it can never use. A warehouse account always gets one,
    // because "Add company" at the bottom is how it connects to its first client.
    if (!isWarehouseAccount && companies.length < 2) return null
    // Only a warehouse account joins companies, and only its owners/administrators — judged by their
    // standing at home, since inside a client every session is capped to warehouse staff.
    const canConnectCompanies = isHomeAdmin && isWarehouseAccount

    const current = companies.find((company) => company.current) || companies[0]
    const atHome = Boolean(current?.home)

    /**
     * What the control displays. For a warehouse account this is a *client* picker, and stepping into its
     * own settings does not change which client it works for — so it keeps naming that client rather than
     * blanking to an instruction every time the account looks at its own pages. The header still states
     * plainly which company's data is on screen; this says who the work is for.
     */
    const workingWith = (isWarehouseAccount && atHome
        ? companies.find((company) => !company.home && company.id === lastClientId)
        : null) || current

    /**
     * Opens the place where a new client is taken on. A partner session is capped at warehouse access and
     * cannot reach its own settings, so this switches back to the account's own company on the way.
     */
    const connectNewCompany = async () => {
        if (!atHome && home) {
            setSwitching(home.id)
            try {
                await switchCompany(home.id)
            } finally {
                setSwitching(null)
            }
        }
        setOpen(false)
        navigate('/settings?tab=connections')
    }

    const handleSelect = async (company) => {
        if (company.current) {
            setOpen(false)
            return
        }
        setSwitching(company.id)
        try {
            await switchCompany(company.id)
            setOpen(false)
            toast.success(t('companySwitcher.switched', { company: company.name }))
            // Land somewhere that exists in every company rather than on a page the new company's
            // permissions may not allow (an order id from the previous company certainly won't resolve).
            navigate('/dashboard')
        } finally {
            setSwitching(null)
        }
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
                title={isPartnerSession ? t('companySwitcher.workingInClient', { company: current?.name || '' }) : undefined}
                // Working inside someone else's data is worth seeing at a glance, not just on the label.
                className={`flex max-w-[13rem] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    isPartnerSession
                        ? 'border-teal-500 bg-teal-50/60 dark:border-teal-500 dark:bg-teal-950/30'
                        : 'border-slate-300 dark:border-slate-700'
                }`}
            >
                {workingWith?.home
                    ? <Building2 className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    : <Warehouse className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />}
                <span className="truncate">
                    {/* Only a warehouse account with no client yet has nothing to name here. */}
                    {workingWith?.name || (isWarehouseAccount ? t('companySwitcher.pickClient') : t('companySwitcher.label'))}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>

            {open && (
                <div
                    role="listbox"
                    className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                    <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {t('companySwitcher.label')}
                    </p>
                    <ul className="max-h-80 overflow-y-auto py-1">
                        {/* A warehouse account that hasn't redeemed a code yet — say so, rather than
                            showing an empty box above the action that fixes it. */}
                        {selectable.length === 0 && (
                            <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                                {t('companySwitcher.noClients')}
                            </li>
                        )}
                        {selectable.map((company) => (
                            <li key={company.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={company.current}
                                    disabled={switching !== null}
                                    onClick={() => handleSelect(company)}
                                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800 ${
                                        company.current ? 'bg-slate-50 dark:bg-slate-800/60' : ''
                                    }`}
                                >
                                    <span className="mt-0.5 w-4 shrink-0">
                                        {company.current && <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium text-slate-700 dark:text-slate-200">
                                            {company.name}
                                        </span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                                            {company.home ? t('companySwitcher.ownCompany') : t('companySwitcher.clientCompany')}
                                        </span>
                                    </span>
                                    {switching === company.id && (
                                        <span className="mt-0.5 text-xs text-slate-500">{t('common.loading')}</span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {/* The list is the client companies and nothing else — a warehouse account's own
                        company is not a place to work, only the settings behind this action. Taking on a
                        new client is the one thing it does from here, so it is the only action, and it
                        goes home first because managing your own account cannot happen inside a client. */}
                    {canConnectCompanies && (
                        <button
                            type="button"
                            disabled={switching !== null}
                            onClick={connectNewCompany}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-teal-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:text-teal-400 dark:hover:bg-slate-800"
                        >
                            <Plus className="h-4 w-4" />
                            {t('companySwitcher.connectCompany')}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
