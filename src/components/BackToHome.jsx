import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

/**
 * The way out of the signed-out pages.
 *
 * These pages already linked home, but only from the logo with an `aria-label` — which reads fine to a
 * screen reader and is invisible to everyone else, so on a phone the sign-in page was a dead end unless
 * you knew the picture was a link. This says what it is.
 *
 * Placed inside the card rather than floating over the page: the auth pages paint decorative blurs
 * across the full viewport, and anything absolutely positioned on top of them collides with the card on a
 * short screen.
 */
export default function BackToHome({ className = '' }) {
    const { t } = useTranslation()

    return (
        <Link
            to="/"
            className={`inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-teal-700 lg:min-h-0 dark:text-slate-400 dark:hover:text-teal-400 ${className}`}
        >
            <ArrowLeft className="h-4 w-4" />
            {t('common.backToHome')}
        </Link>
    )
}
