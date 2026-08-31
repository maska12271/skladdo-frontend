import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, HelpCircle } from 'lucide-react'

/**
 * The tokens the backend substitutes at send time, and what each is replaced with. Must match
 * EmailTemplateRenderer's whitelist.
 *
 * `recipient.*` works for a client and a manufacturer alike, which is the point of it. `manufacturer.*`
 * is kept alive only so templates written before clients were reachable keep rendering; it is listed
 * once, as legacy, rather than doubling the table.
 */
const TOKENS = [
    'recipient.name',
    'recipient.contactName',
    'recipient.email',
    'recipient.address',
    'recipient.phone',
    'recipient.country',
    'sender.fullName',
    'company.name',
    'today',
]

/**
 * Explains how templates work: one short worked example, then the token reference.
 *
 * <p>Shared by the template editor and the compose form, because the question ("what can I put in
 * here?") is the same in both and answering it in only one place is what left the other showing a bare
 * row of token names with no example of a finished email.</p>
 *
 * <p>Every token is written as hardcoded JSX, never through a translation string: i18next reads
 * <code>{'{{'}...{'}}'}</code> as an interpolation placeholder and would render these empty - see
 * config/emailExamples.js for the same trap.</p>
 */
export default function EmailTokensHelp({ defaultOpen = false }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <HelpCircle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    {t('emailHelp.heading')}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="space-y-4 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('emailHelp.intro')}</p>

                    {/* A whole template, small enough to read at a glance. Shows a token in the subject
                        line and two in the body, which is the pattern people copy.

                        Every line puts its token last, so a translator gets a whole clause to work with
                        rather than a sentence split in half around a placeholder. */}
                    <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('emailHelp.exampleHeading')}
                        </p>
                        <div className="space-y-2 overflow-x-auto rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                            <p>
                                <span className="text-slate-400">{t('emailHelp.exampleSubjectLabel')}: </span>
                                {t('emailHelp.exampleSubject')} <Token>company.name</Token>
                            </p>
                            <p className="border-t border-slate-100 pt-2 dark:border-slate-800">
                                {t('emailHelp.exampleGreeting')} <Token>recipient.contactName</Token>,
                            </p>
                            <p>{t('emailHelp.exampleLine')} <Token>recipient.name</Token>.</p>
                            <p>
                                {t('emailHelp.exampleSignoff')}<br />
                                <Token>sender.fullName</Token>
                            </p>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('emailHelp.exampleNote')}</p>
                    </div>

                    <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('emailHelp.tokensHeading')}
                        </p>
                        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                            {TOKENS.map((token) => (
                                <div key={token} className="flex flex-col gap-0.5">
                                    <dt><Token>{token}</Token></dt>
                                    <dd className="text-xs text-slate-500 dark:text-slate-400">
                                        {t(`emailHelp.tokens.${token}`)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('emailHelp.legacyNote')}</p>
                    </div>
                </div>
            )}
        </div>
    )
}

/** One token, braces and all. Written here rather than in a translation - see the component note. */
function Token({ children }) {
    return (
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-teal-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-700">
            {`{{${children}}}`}
        </code>
    )
}
