import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * The line under a signup form saying which documents creating an account agrees to.
 *
 * The terms state that creating an account accepts them, which is only true if the form that creates one
 * says so — so this is not decoration, it is the half of that sentence that lives in the interface. It
 * belongs on every page that can create an account: signup, and the invitation page.
 *
 * Assembled from a prefix, a separator and a suffix rather than one interpolated string because the two
 * document names are links, and because the word order around them differs across the three languages.
 */
export default function LegalConsentNotice({ className = '' }) {
    const { t } = useTranslation()

    const linkClass = 'font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-400'

    return (
        <p className={`text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400 ${className}`}>
            {t('legal.consent.prefix')}{' '}
            <Link to="/terms" className={linkClass}>{t('terms.title')}</Link>{' '}
            {t('legal.consent.separator')}{' '}
            <Link to="/privacy" className={linkClass}>{t('privacy.title')}</Link>
            {t('legal.consent.suffix')}
        </p>
    )
}
