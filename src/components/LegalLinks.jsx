import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * The three legal documents as a compact row, for the foot of a signed-out page.
 *
 * The signed-out pages are where somebody decides whether to trust the service with a company's data, and
 * until now only the landing page offered these — reaching them from the sign-in form meant going back to
 * the marketing page first. The signup forms make a stronger statement instead (see LegalConsentNotice);
 * this is for the pages that are not creating an account.
 */
export default function LegalLinks({ className = '' }) {
    const { t } = useTranslation()

    const documents = [
        { to: '/terms', label: t('terms.title') },
        { to: '/privacy', label: t('privacy.title') },
        { to: '/cookies', label: t('cookies.title') },
    ]

    return (
        <p className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500 ${className}`}>
            {documents.map((doc, index) => (
                <span key={doc.to} className="flex items-center gap-3">
                    {index > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />}
                    <Link to={doc.to} className="transition-colors hover:text-teal-700 dark:hover:text-teal-400">
                        {doc.label}
                    </Link>
                </span>
            ))}
        </p>
    )
}
