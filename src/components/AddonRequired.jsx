import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, ArrowRight, Gavel, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PageHeader from './PageHeader'

/** What each add-on unlocks, so the page sells the feature rather than just refusing entry. */
const ADDON_ICON = { TENDERS: Gavel, MANUFACTURER_EMAILS: Mail }

/**
 * Shown in place of a page the company does not pay for.
 *
 * <p>The nav hides these pages, so arriving here means something got out of step — a bookmark, a link
 * from a colleague, an add-on that lapsed mid-session. A bare 403 is the wrong answer to that: nothing
 * is broken and nothing was forbidden to *them*, the company simply has not bought the feature. So this
 * says which feature, what it does, and where to turn it on.</p>
 *
 * <p>Only an owner or administrator can actually change the plan, so everyone else is told who to ask
 * rather than sent to a page that would refuse them too.</p>
 */
export default function AddonRequired({ addon }) {
    const { t } = useTranslation()
    const { isHomeAdmin } = useAuth()
    const Icon = ADDON_ICON[addon] || Lock

    return (
        <div className="space-y-4">
            <PageHeader title={t(`settings.plan.addon.${addon}`)} />

            <div className="shadow-card rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                    <Icon className="h-7 w-7" />
                </span>

                <h2 className="mt-5 text-xl font-semibold">{t('addonRequired.title')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
                    {t(`settings.plan.addon.${addon}_desc`)}
                </p>
                <p className="mx-auto mt-4 max-w-md text-sm text-slate-500 dark:text-slate-400">
                    {isHomeAdmin ? t('addonRequired.adminHint') : t('addonRequired.userHint')}
                </p>

                {isHomeAdmin && (
                    <Link
                        to="/settings?tab=plan"
                        className="shadow-card mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
                    >
                        {t('addonRequired.cta')} <ArrowRight className="h-4 w-4" />
                    </Link>
                )}
            </div>
        </div>
    )
}
