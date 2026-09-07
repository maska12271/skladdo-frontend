import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackToHome from './BackToHome'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, isEntityPublished } from '../config/legal'

/**
 * The three public legal documents, in the order they are cross-linked at the foot of each one.
 * `key` is both the route segment and the i18n namespace, which is why neither is passed separately.
 */
const DOCUMENTS = [
    { key: 'privacy', path: '/privacy' },
    { key: 'cookies', path: '/cookies' },
    { key: 'terms', path: '/terms' },
]

/**
 * Who operates the service — the controller under the GDPR, and the party an account is contracted with.
 * Rendered on all three documents because all three depend on it being answered.
 *
 * While `config/legal.js` still holds placeholders this says so plainly instead of printing them. A
 * half-filled register entry read by a customer is worse than an honest gap, and it is the failure mode
 * a "fill this in later" constant invites.
 */
function EntityBlock({ t }) {
    if (!isEntityPublished()) {
        return (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                {t('legal.entity.pending')}
            </div>
        )
    }

    const rows = [
        ['name', LEGAL_ENTITY.name],
        ['registryCode', LEGAL_ENTITY.registryCode],
        ['vatNumber', LEGAL_ENTITY.vatNumber],
        ['address', LEGAL_ENTITY.address],
        ['country', LEGAL_ENTITY.country],
    ].filter(([, value]) => value)

    return (
        <dl className="mt-6 grid gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-[auto_1fr] dark:border-slate-800 dark:bg-slate-950/40">
            {rows.map(([key, value]) => (
                <div key={key} className="contents">
                    <dt className="font-medium text-slate-500 dark:text-slate-400">{t(`legal.entity.${key}`)}</dt>
                    <dd className="text-slate-700 dark:text-slate-200">{value}</dd>
                </div>
            ))}
            <dt className="font-medium text-slate-500 dark:text-slate-400">{t('legal.entity.email')}</dt>
            <dd>
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300">
                    {LEGAL_CONTACT_EMAIL}
                </a>
            </dd>
        </dl>
    )
}

/**
 * The shared layout of the public legal pages — privacy policy, cookie policy and terms.
 *
 * All three are the same document in different words: a title, the date it last changed, an opening
 * paragraph, the identity of the operator, then a run of sections. So the *content* lives entirely in the
 * locale files under `<namespace>.sections.*` — each entry may carry a heading (`h`), a paragraph (`p`), a
 * bulleted `items` array and a closing `note`, and renders whichever of those it defines. Editing a policy
 * is therefore editing translations, not JSX, and a section added to one language and forgotten in another
 * is caught by `i18n/locales.test.js` rather than by a customer.
 *
 * @param namespace the i18n namespace holding the text ('privacy' | 'cookies' | 'terms').
 * @param sections  the section keys, in the order they appear.
 * @param updated   ISO date the document last changed, from `config/legal.js`.
 */
export default function LegalDocument({ namespace, sections, updated }) {
    const { t, i18n } = useTranslation()

    const updatedLabel = new Date(updated).toLocaleDateString(i18n.resolvedLanguage, {
        year: 'numeric', month: 'long', day: 'numeric',
    })

    return (
        <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div className="mx-auto w-full max-w-3xl">
                <BackToHome className="mb-4" />

                <article className="shadow-pop rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
                    <header className="mb-8">
                        <Link to="/" aria-label={t('common.backToHome')}>
                            <img src="/skladdo-logo.svg" alt="" aria-hidden="true" className="mb-4 h-9 w-auto" />
                        </Link>
                        <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
                            {t(`${namespace}.title`)}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {t(`${namespace}.updated`, { date: updatedLabel })}
                        </p>
                        <p className="mt-4 leading-relaxed text-slate-600 dark:text-slate-300">
                            {t(`${namespace}.intro`)}
                        </p>
                        <EntityBlock t={t} />
                    </header>

                    <div className="space-y-8">
                        {sections.map((key) => {
                            const paragraph = t(`${namespace}.sections.${key}.p`, { defaultValue: '' })
                            const note = t(`${namespace}.sections.${key}.note`, { defaultValue: '' })
                            const items = t(`${namespace}.sections.${key}.items`, { returnObjects: true, defaultValue: [] })

                            return (
                                <section key={key}>
                                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                        {t(`${namespace}.sections.${key}.h`)}
                                    </h2>
                                    {paragraph && (
                                        <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">
                                            {paragraph}
                                        </p>
                                    )}
                                    {Array.isArray(items) && items.length > 0 && (
                                        <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
                                            {items.map((item) => (
                                                <li key={item} className="flex gap-2.5 leading-relaxed">
                                                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600 dark:bg-teal-400" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {note && (
                                        <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
                                            {note}
                                        </p>
                                    )}
                                </section>
                            )
                        })}
                    </div>

                    {/* Each document answers a question the other two raise, so every one of them offers
                        the other two rather than leaving the reader to go back to the footer. */}
                    <footer className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {DOCUMENTS.filter((doc) => doc.key !== namespace).map((doc) => (
                            <Link
                                key={doc.key}
                                to={doc.path}
                                className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                            >
                                {t(`${doc.key}.title`)}
                            </Link>
                        ))}
                        <a
                            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                            className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                            {LEGAL_CONTACT_EMAIL}
                        </a>
                    </footer>
                </article>
            </div>
        </div>
    )
}
