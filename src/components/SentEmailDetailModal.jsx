import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiGet } from '../api/client'
import Modal from './Modal'
import StatusBadge from './StatusBadge'
import LoadingBlock from './LoadingBlock'
import { formatDateTime } from '../utils/format'

/**
 * Read-only detail of a single sent email: metadata, open/reply status, the rendered HTML body and the
 * inbound reply thread. The body is tenant-authored HTML, so it is rendered inside a sandboxed iframe
 * (no scripts, no same-origin access) rather than injected into the page.
 */
export default function SentEmailDetailModal({ emailId, isOpen, onClose }) {
    const { t } = useTranslation()
    const [email, setEmail] = useState(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!isOpen || emailId == null) return
        let cancelled = false
        setLoading(true)
        setEmail(null)
        apiGet(`/sent-emails/${emailId}`)
            .then((res) => !cancelled && setEmail(res))
            .catch(() => {})
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
    }, [isOpen, emailId])

    return (
        <Modal isOpen={isOpen} title={t('emails.detail.title')} onClose={onClose}>
            {loading || !email ? (
                <LoadingBlock />
            ) : (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                        <Fact label={t('emails.cols.manufacturer')} value={email.manufacturerName || '—'} />
                        <Fact label={t('emails.detail.recipient')} value={email.recipientEmail || '—'} />
                        <Fact label={t('common.status')} value={<StatusBadge status={email.status} />} />
                        <Fact label={t('emails.cols.sentAt')} value={formatDateTime(email.sentAt)} />
                        <Fact
                            label={t('emails.cols.viewed')}
                            value={email.viewed ? formatDateTime(email.viewedAt) : t('common.no')}
                        />
                        <Fact
                            label={t('emails.cols.replied')}
                            value={email.replied ? formatDateTime(email.repliedAt) : t('common.no')}
                        />
                    </div>

                    {email.status === 'FAILED' && email.failureReason && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            <span className="font-medium">{t('emails.detail.failureReason')}: </span>{email.failureReason}
                        </div>
                    )}

                    <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t('emails.cols.subject')}</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{email.subject}</p>
                    </div>

                    {email.attachmentNames && (
                        <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t('emails.detail.attachments')}</p>
                            <p className="text-sm text-slate-700 dark:text-slate-200">{email.attachmentNames}</p>
                        </div>
                    )}

                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('emails.detail.body')}</p>
                        <iframe
                            title={t('emails.detail.body')}
                            sandbox=""
                            srcDoc={email.body}
                            className="h-80 w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
                        />
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                            {t('emails.detail.replies', { count: email.replies?.length || 0 })}
                        </p>
                        {(!email.replies || email.replies.length === 0) ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('emails.detail.noReplies')}</p>
                        ) : (
                            <ul className="space-y-3">
                                {email.replies.map((reply) => (
                                    <li key={reply.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                        <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                            <span className="font-medium text-slate-700 dark:text-slate-200">{reply.fromAddress || '—'}</span>
                                            <span>{formatDateTime(reply.receivedAt)}</span>
                                        </div>
                                        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{reply.snippet || '—'}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    )
}

function Fact({ label, value }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
        </div>
    )
}
