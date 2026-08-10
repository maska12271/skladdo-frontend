import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Check, Copy, Handshake, Plus, RefreshCw, Unlink } from 'lucide-react'
import { apiGet, apiPost, apiPut } from '../api/client'
import EmptyState from './EmptyState'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { FormField } from './FormField.jsx'
import { useModal } from '../hooks/useModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray } from '../utils/format'

/**
 * Who works inside this company, or which companies we work inside — the two readings of the same list.
 *
 * Connections run one way: a business company issues a code and a warehouse account redeems it, which
 * connects them on the spot. So each account type sees exactly one half of this tab — a business gets a
 * code to hand out and the partners that used it, a warehouse account gets a box to paste a code into and
 * the companies it can then switch between.
 *
 * For a warehouse account this is the main screen of the app: it has no company of its own to work in, so
 * this is where it picks up new clients and lets go of old ones.
 *
 * Everything a partner may reach is chosen here too: a connection on its own grants entry to the company
 * but no stock, until the client picks which of *their own* warehouses it covers.
 */
export default function ConnectionsTab() {
    const { t } = useTranslation()
    const { isWarehouseAccount, refreshCompanies } = useAuth()
    const toast = useToast()
    const redeemModal = useModal()
    const disconnectModal = useModal()

    const [connections, setConnections] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [code, setCode] = useState(null)
    const [redeemCode, setRedeemCode] = useState('')
    const [disconnecting, setDisconnecting] = useState(null)
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(false)
    const [listLoading, setListLoading] = useState(true)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setListLoading(true)
        try {
            // A warehouse account has no warehouses of its own and issues no code; a business account
            // never redeems one. Each side only asks for what it can actually use.
            const [links, ownWarehouses, ownCode] = await Promise.all([
                apiGet('/warehouse-partners'),
                isWarehouseAccount ? Promise.resolve([]) : apiGet('/warehouses'),
                isWarehouseAccount ? Promise.resolve(null) : apiGet('/warehouse-partners/code'),
            ])
            setConnections(safeArray(links))
            setWarehouses(safeArray(ownWarehouses))
            setCode(ownCode)
        } finally {
            setListLoading(false)
        }
    }

    const active = useMemo(() => connections.filter((c) => c.status === 'ACTIVE'), [connections])

    const handleCopy = async () => {
        if (!code?.code) return
        await navigator.clipboard.writeText(code.code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleRegenerate = async () => {
        setLoading(true)
        try {
            setCode(await apiPost('/warehouse-partners/code/regenerate', {}))
            toast.success(t('connections.codeRegenerated'))
        } finally {
            setLoading(false)
        }
    }

    const handleRedeem = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            await apiPost('/warehouse-partners/redeem', { code: redeemCode.trim() })
            toast.success(t('connections.connected'))
            redeemModal.close()
            setRedeemCode('')
            // The new company has to appear in the header picker without a re-login.
            await Promise.all([loadData(), refreshCompanies()])
        } finally {
            setLoading(false)
        }
    }

    const handleDisconnect = async () => {
        if (!disconnecting) return
        setLoading(true)
        try {
            await apiPost(`/warehouse-partners/${disconnecting.id}/disconnect`, {})
            toast.success(t('connections.disconnected'))
            disconnectModal.close()
            setDisconnecting(null)
            await Promise.all([loadData(), refreshCompanies()])
        } finally {
            setLoading(false)
        }
    }

    const toggleWarehouse = async (connection, warehouseId) => {
        const current = connection.warehouses.map((w) => w.id)
        const next = current.includes(warehouseId)
            ? current.filter((id) => id !== warehouseId)
            : [...current, warehouseId]
        setLoading(true)
        try {
            await apiPut(`/warehouse-partners/${connection.id}/warehouses`, { warehouseIds: next })
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const togglePrices = async (connection) => {
        setLoading(true)
        try {
            await apiPut(`/warehouse-partners/${connection.id}`, { canSeePrices: !connection.canSeePrices })
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">
                        {isWarehouseAccount ? t('connections.warehouseTitle') : t('connections.businessTitle')}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {isWarehouseAccount ? t('connections.warehouseDescription') : t('connections.businessDescription')}
                    </p>
                </div>
                {isWarehouseAccount && (
                    <button
                        onClick={() => { setRedeemCode(''); redeemModal.open() }}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                        <Plus className="h-4 w-4" />
                        {t('connections.addCompany')}
                    </button>
                )}
            </div>

            {/* The code is the consent, so it is stated as such rather than presented as a harmless id. */}
            {!isWarehouseAccount && code && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-sm font-semibold">{t('connections.codeHeading')}</h3>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('connections.codeHint')}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <code className="rounded-xl bg-slate-100 px-4 py-2.5 font-mono text-lg font-semibold tracking-wider dark:bg-slate-800">
                            {code.code}
                        </code>
                        <button
                            onClick={handleCopy}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            {copied ? <Check className="h-4 w-4 text-teal-600" /> : <Copy className="h-4 w-4" />}
                            {copied ? t('common.copied') : t('common.copy')}
                        </button>
                        <button
                            onClick={handleRegenerate}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t('connections.regenerate')}
                        </button>
                    </div>
                    {code.expiresAt && (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            {t('connections.codeExpires', { date: new Date(code.expiresAt).toLocaleString() })}
                        </p>
                    )}
                </div>
            )}

            {listLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
            ) : active.length === 0 ? (
                <EmptyState
                    icon={Handshake}
                    title={isWarehouseAccount ? t('connections.emptyWarehouseTitle') : t('connections.emptyBusinessTitle')}
                    description={isWarehouseAccount ? t('connections.emptyWarehouseDesc') : t('connections.emptyBusinessDesc')}
                />
            ) : (
                <div className="space-y-4">
                    {active.map((connection) => (
                        <div key={connection.id} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                                            {connection.viewedAsPartner ? connection.clientCompanyName : connection.warehouseCompanyName}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {connection.viewedAsPartner ? t('connections.weWorkFor') : t('connections.worksForUs')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setDisconnecting(connection); disconnectModal.open() }}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                >
                                    <Unlink className="h-4 w-4" />
                                    {t('connections.disconnect')}
                                </button>
                            </div>

                            {connection.viewedAsPartner ? (
                                // The partner's own view: what they were given, read-only. It is the client's
                                // call, so there is nothing to change from this side.
                                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {t('connections.warehousesWeWork')}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                        {connection.warehouses.length > 0
                                            ? connection.warehouses.map((w) => w.name).join(', ')
                                            : t('connections.noWarehousesYet')}
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    {/* Access is opt-in per warehouse: an empty list is a valid, fully closed state. */}
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            {t('connections.assignWarehouses')}
                                        </p>
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('connections.assignHint')}</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {warehouses.length === 0 && (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('connections.noWarehouses')}</p>
                                            )}
                                            {warehouses.map((warehouse) => {
                                                const checked = connection.warehouses.some((w) => w.id === warehouse.id)
                                                return (
                                                    <label
                                                        key={warehouse.id}
                                                        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                                            checked
                                                                ? 'border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-200'
                                                                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={loading}
                                                            onChange={() => toggleWarehouse(connection, warehouse.id)}
                                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700"
                                                        />
                                                        {warehouse.name}
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            checked={connection.canSeePrices}
                                            disabled={loading}
                                            onChange={() => togglePrices(connection)}
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                                                {t('connections.canSeePrices')}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                                                {t('connections.canSeePricesHint')}
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={redeemModal.isOpen} title={t('connections.addCompany')} onClose={redeemModal.close}>
                <form onSubmit={handleRedeem} className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('connections.redeemHint')}</p>
                    <FormField
                        id="connection-code"
                        label={t('connections.codeLabel')}
                        name="code"
                        value={redeemCode}
                        onChange={(e) => setRedeemCode(e.target.value)}
                        required
                        placeholder="CO-XXXX-XXXX"
                    />
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={redeemModal.close} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={loading} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {loading ? t('common.saving') : t('connections.connect')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={disconnectModal.isOpen}
                title={t('connections.disconnectTitle')}
                message={t('connections.disconnectConfirm', {
                    company: disconnecting?.viewedAsPartner
                        ? disconnecting?.clientCompanyName || ''
                        : disconnecting?.warehouseCompanyName || '',
                })}
                onClose={() => { disconnectModal.close(); setDisconnecting(null) }}
                onConfirm={handleDisconnect}
                loading={loading}
            />
        </div>
    )
}
