import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { safeArray } from '../utils/format'
import { formatDateTime } from '../utils/format'
import { NOTIFICATION_TYPE_BY_VALUE } from '../constants/notifications'

// How often the unread badge refreshes. Deliberately a poll rather than a socket: the payload is a single
// integer, and a persistent connection is not worth the infrastructure until this needs to be live.
const POLL_INTERVAL_MS = 60000

/** Bell with an unread badge and a dropdown of recent notifications. */
export default function NotificationBell() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const [unread, setUnread] = useState(0)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const ref = useRef(null)

    const refreshCount = useCallback(() => {
        apiGet('/notifications/unread-count')
            .then((res) => setUnread(res?.count ?? 0))
            .catch(() => { /* transient; the badge just keeps its previous value */ })
    }, [])

    // Poll the count, and stop while the tab is hidden so a backgrounded tab isn't chatting all day.
    useEffect(() => {
        refreshCount()
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') refreshCount()
        }, POLL_INTERVAL_MS)
        return () => clearInterval(id)
    }, [refreshCount])

    // Close on an outside click, matching LanguageSwitcher.
    useEffect(() => {
        if (!open) return
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    const openPanel = () => {
        const next = !open
        setOpen(next)
        if (!next) return
        setLoading(true)
        apiGet('/notifications?limit=15')
            .then((res) => setItems(safeArray(res)))
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => setLoading(false))
    }

    const openItem = async (item) => {
        setOpen(false)
        if (!item.readAt) {
            try {
                await apiPost(`/notifications/${item.id}/read`, {})
                setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)))
                setUnread((n) => Math.max(0, n - 1))
            } catch { /* navigating anyway is more useful than blocking on the mark-read */ }
        }
        if (item.linkPath) navigate(item.linkPath)
    }

    const markAllRead = async () => {
        try {
            await apiPost('/notifications/read-all', {})
            const now = new Date().toISOString()
            setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
            setUnread(0)
        } catch { /* the api client already surfaced the error */ }
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={openPanel}
                aria-label={t('notifications.title')}
                aria-haspopup="menu"
                aria-expanded={open}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-100 lg:h-auto lg:w-auto lg:p-2.5 dark:border-slate-700 dark:hover:bg-slate-800"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
                >
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
                        <span className="text-sm font-semibold">{t('notifications.title')}</span>
                        {unread > 0 && (
                            <button
                                onClick={markAllRead}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                            >
                                <CheckCheck className="h-4 w-4" />
                                {t('notifications.markAllRead')}
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading && (
                            <p className="px-4 py-6 text-center text-sm text-slate-500">{t('common.loading')}</p>
                        )}
                        {!loading && items.length === 0 && (
                            <p className="px-4 py-6 text-center text-sm text-slate-500">{t('notifications.empty')}</p>
                        )}
                        {!loading && items.map((item) => {
                            const meta = NOTIFICATION_TYPE_BY_VALUE[item.type]
                            const Icon = meta?.icon || Bell
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => openItem(item)}
                                    className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/50 ${
                                        item.readAt ? 'opacity-60' : ''
                                    }`}
                                >
                                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta?.accent || ''}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                                            {t(`notifications.type.${item.type}`, item.type)}
                                        </span>
                                        {item.details && (
                                            <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                                                {item.details}
                                            </span>
                                        )}
                                        <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                                            {formatDateTime(item.createdAt)}
                                        </span>
                                    </span>
                                    {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
