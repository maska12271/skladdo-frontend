import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Pencil, Trash2, Plus, Trophy, Crown } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { usePermissions } from '../context/AuthContext'
import { useModal } from '../hooks/useModal'
import LoadingBlock from '../components/LoadingBlock'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import MoneyWithBase from '../components/MoneyWithBase'
import { FormField, FormSelect, TextareaField } from '../components/FormField.jsx'
import UnitSelect from '../components/UnitSelect.jsx'
import { formatDate, formatMoney, toCompanyAmount } from '../utils/format'
import Checkbox from '../components/Checkbox'
import ModalActions from '../components/ModalActions'

const emptyPart = { partNumber: '', title: '', description: '', estimatedValue: '', samplesRequired: false, requirements: [] }
const emptyRequirementRow = () => ({ description: '', serviceId: '', quantity: '', unit: '', sampleQuantity: '' })
const emptyParticipant = { manufacturerName: '', offeredPrice: '', notes: '', participating: true }

// Total pieces across a part's requirement items (used to derive per-piece figures). Rows without a
// quantity contribute nothing; a single common unit is surfaced so figures can be labelled per that unit.
function partMetrics(part) {
    const reqs = part.requirements || []
    const totalQty = reqs.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
    const units = [...new Set(reqs.map((r) => r.unit).filter(Boolean))]
    const unit = units.length === 1 ? units[0] : null
    return { totalQty, unit }
}

export default function TenderDetailPage() {
    const { t } = useTranslation()
    const { id } = useParams()
    const navigate = useNavigate()
    const toast = useToast()
    const { canEdit } = usePermissions('TENDERS')
    const { currency: baseCurrency, currencySymbol } = useSettings()

    const [tender, setTender] = useState(null)
    const [parts, setParts] = useState([])
    const [orderData, setOrderData] = useState(null)
    const [services, setServices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [saving, setSaving] = useState(false)

    const partModal = useModal()
    const participantModal = useModal()
    const confirmModal = useModal()

    const [partForm, setPartForm] = useState(emptyPart)
    const [editingPartId, setEditingPartId] = useState(null)
    const [activePartId, setActivePartId] = useState(null)
    const [participantForm, setParticipantForm] = useState(emptyParticipant)
    const [editingParticipant, setEditingParticipant] = useState(null)
    // A pending delete: { kind: 'part'|'participant', partId, itemId, name }
    const [pendingDelete, setPendingDelete] = useState(null)

    const currency = tender?.currency
    const exchangeRate = tender?.exchangeRate

    const loadAll = async () => {
        const [tenderRes, partsRes, ordersRes] = await Promise.all([
            apiGet(`/tenders/${id}`),
            apiGet(`/tenders/${id}/parts`),
            apiGet(`/tenders/${id}/orders`),
        ])
        setTender(tenderRes)
        setParts(Array.isArray(partsRes) ? partsRes : [])
        setOrderData(ordersRes || null)
    }

    // Only needed to populate the optional service picker on the part form, so a failure here must not
    // take the page down with it — the requirement's free-text description works without it.
    useEffect(() => {
        apiGet('/services?page=0&size=500&sortBy=name&sortDir=asc')
            .then((res) => setServices(Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : []))
            .catch(() => setServices([]))
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        loadAll()
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const reload = async () => {
        try {
            await loadAll()
        } catch { /* toast already surfaced the error */ }
    }

    // --- Part + requirements (one modal) ----------------------------------------------------------

    const openAddPart = () => {
        setEditingPartId(null)
        setPartForm({ ...emptyPart, requirements: [emptyRequirementRow()] })
        partModal.open()
    }

    const openEditPart = (part) => {
        setEditingPartId(part.id)
        setPartForm({
            partNumber: part.partNumber || '',
            title: part.title || '',
            description: part.description || '',
            estimatedValue: part.estimatedValue ?? '',
            samplesRequired: !!part.samplesRequired,
            requirements: (part.requirements || []).map((r) => ({
                description: r.description || '',
                serviceId: r.serviceId ?? '',
                quantity: r.quantity ?? '',
                unit: r.unit || '',
                sampleQuantity: r.sampleQuantity ?? '',
            })),
        })
        partModal.open()
    }

    const setReqRow = (index, field, value) => {
        setPartForm((prev) => {
            const requirements = prev.requirements.map((r, i) => (i === index ? { ...r, [field]: value } : r))
            return { ...prev, requirements }
        })
    }
    const addReqRow = () => setPartForm((prev) => ({ ...prev, requirements: [...prev.requirements, emptyRequirementRow()] }))
    const removeReqRow = (index) => setPartForm((prev) => ({ ...prev, requirements: prev.requirements.filter((_, i) => i !== index) }))

    const savePart = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = {
                partNumber: partForm.partNumber || null,
                title: partForm.title || null,
                description: partForm.description || null,
                estimatedValue: partForm.estimatedValue === '' ? null : Number(partForm.estimatedValue),
                samplesRequired: !!partForm.samplesRequired,
                requirements: (partForm.requirements || [])
                    .filter((r) => r.description && r.description.trim())
                    .map((r) => ({
                        description: r.description.trim(),
                        serviceId: r.serviceId ? Number(r.serviceId) : null,
                        quantity: r.quantity === '' || r.quantity == null ? null : Number(r.quantity),
                        unit: r.unit || null,
                        sampleQuantity: partForm.samplesRequired && r.sampleQuantity !== '' && r.sampleQuantity != null
                            ? Number(r.sampleQuantity)
                            : null,
                    })),
            }
            if (editingPartId) await apiPut(`/tenders/${id}/parts/${editingPartId}`, payload)
            else await apiPost(`/tenders/${id}/parts`, payload)
            toast.success(editingPartId ? t('tenderDetail.part.updated') : t('tenderDetail.part.created'))
            partModal.close()
            await reload()
        } finally {
            setSaving(false)
        }
    }

    // --- Participant CRUD + inline toggles --------------------------------------------------------

    const openAddParticipant = (partId) => {
        setActivePartId(partId)
        setEditingParticipant(null)
        setParticipantForm(emptyParticipant)
        participantModal.open()
    }

    const openEditParticipant = (partId, p) => {
        setActivePartId(partId)
        setEditingParticipant(p)
        setParticipantForm({
            manufacturerName: p.manufacturerName || '',
            offeredPrice: p.offeredPrice ?? '',
            notes: p.notes || '',
            participating: !!p.participating,
        })
        participantModal.open()
    }

    const participantPayload = (base, overrides = {}) => ({
        manufacturerName: base.manufacturerName,
        offeredPrice: base.offeredPrice === '' || base.offeredPrice == null ? null : Number(base.offeredPrice),
        notes: base.notes || null,
        winner: !!base.winner,
        participating: !!base.participating,
        ...overrides,
    })

    const saveParticipant = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const base = `/tenders/${id}/parts/${activePartId}/participants`
            const payload = participantPayload(participantForm, { winner: editingParticipant?.winner })
            if (editingParticipant) await apiPut(`${base}/${editingParticipant.id}`, payload)
            else await apiPost(base, payload)
            toast.success(editingParticipant ? t('tenders.participants.updated') : t('tenders.participants.added'))
            participantModal.close()
            await reload()
        } finally {
            setSaving(false)
        }
    }

    // Immediate save of a single toggled field on a participant row.
    const patchParticipant = async (partId, p, overrides) => {
        try {
            await apiPut(`/tenders/${id}/parts/${partId}/participants/${p.id}`, participantPayload(p, overrides))
            await reload()
        } catch { /* toast already surfaced the error */ }
    }

    const toggleParticipating = (partId, p) => patchParticipant(partId, p, { participating: !p.participating })
    const markWinner = (partId, p) => patchParticipant(partId, p, { winner: true })
    const clearWinner = (partId, p) => patchParticipant(partId, p, { winner: false })

    // --- Deletes (shared confirm modal) -----------------------------------------------------------

    const askDelete = (kind, partId, itemId, name) => {
        setPendingDelete({ kind, partId, itemId, name })
        confirmModal.open()
    }

    const doDelete = async () => {
        if (!pendingDelete) return
        setSaving(true)
        try {
            const { kind, partId, itemId } = pendingDelete
            if (kind === 'part') await apiDelete(`/tenders/${id}/parts/${itemId}`)
            else if (kind === 'participant') await apiDelete(`/tenders/${id}/parts/${partId}/participants/${itemId}`)
            toast.success(t('common.deleted'))
            confirmModal.close()
            setPendingDelete(null)
            await reload()
        } finally {
            setSaving(false)
        }
    }

    // ---------------------------------------------------------------------------------------------

    if (loading) return <LoadingBlock text={t('tenderDetail.loading')} />
    if (error || !tender) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/tenders')} label={t('tenderDetail.back')} />
                <LoadingBlock text={t('tenderDetail.notFound')} />
            </div>
        )
    }

    const money = (value) => <MoneyWithBase amount={value} currency={currency} exchangeRate={exchangeRate} base={baseCurrency} />
    const participatingValueBase = toCompanyAmount(tender.participatingValue, exchangeRate)

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate('/tenders')} label={t('tenderDetail.back')} />

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{tender.title}</h1>
                        {tender.status && <StatusBadge status={tender.status} />}
                    </div>
                    {tender.tenderNumber && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('tenders.cols.tenderNo')}: {tender.tenderNumber}</p>
                    )}
                </div>
                {canEdit && (
                    <button
                        onClick={() => navigate(`/tenders?edit=${tender.id}`)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                        <Pencil className="h-4 w-4" /> {t('tenderDetail.editTender')}
                    </button>
                )}
            </div>

            {/* Rollup summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title={t('tenderDetail.rollup.parts')} value={tender.partCount ?? parts.length} color="slate" />
                <StatCard title={t('tenderDetail.rollup.participating')} value={`${tender.participatingCount ?? 0} / ${tender.partCount ?? parts.length}`} color="blue" />
                <StatCard
                    title={t('tenderDetail.rollup.wonLostPending')}
                    value={(
                        <span>
                            <span className="text-teal-600 dark:text-teal-400">{tender.wonCount ?? 0}</span>
                            <span className="text-slate-300 dark:text-slate-600"> · </span>
                            <span className="text-rose-600 dark:text-rose-400">{tender.lostCount ?? 0}</span>
                            <span className="text-slate-300 dark:text-slate-600"> · </span>
                            <span className="text-amber-600 dark:text-amber-400">{tender.pendingCount ?? 0}</span>
                        </span>
                    )}
                    hint={t('tenderDetail.rollup.wonLostPendingHint')}
                    color="teal"
                />
                <StatCard title={t('tenderDetail.rollup.valueIn')} value={formatMoney(participatingValueBase ?? tender.participatingValue, participatingValueBase != null ? baseCurrency : currency)} color="amber" />
            </div>

            {/* Overview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tenderDetail.overview')}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Fact label={t('tenders.cols.requester')} value={tender.clientName || '—'} />
                    <Fact label={t('common.currency')} value={currency || baseCurrency} />
                    <Fact label={t('tenders.form.publishedAt')} value={tender.publishedAt ? formatDate(tender.publishedAt) : '—'} />
                    <Fact label={t('tenders.form.deadline')} value={tender.deadline ? formatDate(tender.deadline) : '—'} />
                    <Fact label={t('tenders.form.estimatedValue')} value={money(tender.estimatedValue)} />
                </div>
                {tender.description && (
                    <p className="mt-4 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{tender.description}</p>
                )}
            </div>

            {/* Orders & finance */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tenderDetail.finance.title')}</h2>
                <div className="mb-4 grid gap-4 sm:grid-cols-3">
                    <StatCard title={t('tenderDetail.finance.revenue')} value={formatMoney(orderData?.revenue ?? 0, orderData?.baseCurrency || baseCurrency)} hint={t('tenderDetail.finance.fromSales')} color="teal" />
                    <StatCard title={t('tenderDetail.finance.spending')} value={formatMoney(orderData?.spending ?? 0, orderData?.baseCurrency || baseCurrency)} hint={t('tenderDetail.finance.fromPurchases')} color="amber" />
                    <StatCard title={t('tenderDetail.finance.profit')} value={formatMoney(orderData?.profit ?? 0, orderData?.baseCurrency || baseCurrency)} color="blue" />
                </div>
                {orderData?.orders?.length ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                    <th className="px-3 py-2 font-semibold">{t('tenderDetail.finance.type')}</th>
                                    <th className="px-3 py-2 font-semibold">{t('tenderDetail.finance.orderNumber')}</th>
                                    <th className="px-3 py-2 font-semibold">{t('tenderDetail.finance.party')}</th>
                                    <th className="px-3 py-2 font-semibold">{t('common.status')}</th>
                                    <th className="px-3 py-2 font-semibold">{t('common.date')}</th>
                                    <th className="px-3 py-2 font-semibold">{t('common.total')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderData.orders.map((o) => (
                                    <tr
                                        key={`${o.type}-${o.id}`}
                                        onClick={() => navigate(`/${o.type === 'SALES' ? 'sales-orders' : 'purchase-orders'}/${o.id}`)}
                                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50"
                                    >
                                        <td className="px-3 py-2">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.type === 'SALES' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                                {o.type === 'SALES' ? t('tenderDetail.finance.sale') : t('tenderDetail.finance.purchase')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 font-medium">{o.orderNumber || `#${o.id}`}</td>
                                        <td className="px-3 py-2">{o.counterpartyName || '—'}</td>
                                        <td className="px-3 py-2">{o.status ? <StatusBadge status={o.status} /> : '—'}</td>
                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{o.orderDate ? formatDate(o.orderDate) : '—'}</td>
                                        <td className="px-3 py-2">
                                            {formatMoney(o.total, o.currency)}
                                            {o.currency && o.currency !== (orderData.baseCurrency || baseCurrency) && (
                                                <span className="block text-xs text-slate-400">{formatMoney(o.baseTotal, orderData.baseCurrency || baseCurrency)}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-slate-400">{t('tenderDetail.finance.empty')}</p>
                )}
            </div>

            {/* Parts */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('tenderDetail.parts.title')}</h2>
                {canEdit && (
                    <button onClick={openAddPart} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                        <Plus className="h-4 w-4" /> {t('tenderDetail.parts.add')}
                    </button>
                )}
            </div>

            <div className="space-y-5">
                {parts.map((part) => (
                    <PartCard
                        key={part.id}
                        part={part}
                        canEdit={canEdit}
                        currency={currency}
                        money={money}
                        t={t}
                        onEditPart={() => openEditPart(part)}
                        onDeletePart={() => askDelete('part', null, part.id, part.partNumber || part.title)}
                        onAddParticipant={() => openAddParticipant(part.id)}
                        onEditParticipant={(p) => openEditParticipant(part.id, p)}
                        onDeleteParticipant={(p) => askDelete('participant', part.id, p.id, p.manufacturerName)}
                        onToggleParticipating={(p) => toggleParticipating(part.id, p)}
                        onMarkWinner={(p) => markWinner(part.id, p)}
                        onClearWinner={(p) => clearWinner(part.id, p)}
                    />
                ))}
            </div>

            {/* Part + requirements modal */}
            <Modal isOpen={partModal.isOpen} title={editingPartId ? t('tenderDetail.part.editTitle') : t('tenderDetail.part.addTitle')} onClose={partModal.close} width="max-w-2xl">
                <form onSubmit={savePart} className="grid gap-4 md:grid-cols-2">
                    <FormField id="part-number" label={t('tenderDetail.part.numberLabel')} name="partNumber" value={partForm.partNumber} onChange={(e) => setPartForm((p) => ({ ...p, partNumber: e.target.value }))} placeholder="1" />
                    <FormField id="part-value" label={`${t('tenderDetail.part.estimatedValue')} (${currencySymbol(currency || baseCurrency)})`} type="number" step="0.01" min="0" name="estimatedValue" value={partForm.estimatedValue} onChange={(e) => setPartForm((p) => ({ ...p, estimatedValue: e.target.value }))} />
                    <FormField id="part-title" label={t('tenderDetail.part.titleLabel')} name="title" value={partForm.title} onChange={(e) => setPartForm((p) => ({ ...p, title: e.target.value }))} className="md:col-span-2" />
                    <TextareaField id="part-description" label={t('common.description')} name="description" value={partForm.description} onChange={(e) => setPartForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="md:col-span-2" />

                    {/* Requirement items — one card per item, mirroring the sales-order item rows. */}
                    <div className="md:col-span-2 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('tenderDetail.requirements.title')}</h3>
                            <button type="button" onClick={addReqRow} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white dark:bg-slate-700">
                                {t('tenderDetail.requirements.add')}
                            </button>
                        </div>
                        <label className="inline-flex w-fit items-center gap-2 text-sm">
                            <Checkbox checked={partForm.samplesRequired} onChange={(e) => setPartForm((p) => ({ ...p, samplesRequired: e.target.checked }))} />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('tenderDetail.part.samplesRequired')}</span>
                        </label>
                        {partForm.requirements.map((r, i) => (
                            <div key={i} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                <div className="flex items-end gap-3">
                                    {/* `flex-1` on the field itself, not a wrapper: a wrapper runs taller
                                        than the input inside it, which left the delete button sitting
                                        below the field rather than level with it. */}
                                    <FormField
                                        className="flex-1"
                                        id={`req-desc-${i}`}
                                        label={t('tenderDetail.requirements.description')}
                                        value={r.description}
                                        onChange={(e) => setReqRow(i, 'description', e.target.value)}
                                        placeholder={t('tenderDetail.requirements.descriptionPlaceholder')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeReqRow(i)}
                                        aria-label={t('common.remove')}
                                        title={t('common.remove')}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className={`grid gap-3 ${partForm.samplesRequired ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                                    <FormField
                                        id={`req-qty-${i}`}
                                        label={t('tenderDetail.requirements.quantity')}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={r.quantity}
                                        onChange={(e) => setReqRow(i, 'quantity', e.target.value)}
                                        placeholder={t('common.qty')}
                                    />
                                    <UnitSelect
                                        id={`req-unit-${i}`}
                                        label={t('tenderDetail.requirements.unit')}
                                        value={r.unit}
                                        onChange={(e) => setReqRow(i, 'unit', e.target.value)}
                                        allowEmpty
                                    />
                                    {partForm.samplesRequired && (
                                        <FormField
                                            id={`req-samples-${i}`}
                                            label={t('tenderDetail.requirements.samplesNeeded')}
                                            type="number"
                                            step="1"
                                            min="0"
                                            value={r.sampleQuantity}
                                            onChange={(e) => setReqRow(i, 'sampleQuantity', e.target.value)}
                                            placeholder="0"
                                        />
                                    )}
                                </div>
                                {/* Optional: ties the requirement to a catalogue service. The description
                                    above stays the authoritative wording — this is a cross-reference, not
                                    a replacement for it. */}
                                <FormSelect
                                    id={`req-service-${i}`}
                                    label={t('tenderDetail.requirements.service')}
                                    value={r.serviceId}
                                    onChange={(e) => setReqRow(i, 'serviceId', e.target.value)}
                                    searchable
                                    placeholder={t('tenderDetail.requirements.selectService')}
                                    options={services.map((s) => ({ value: String(s.id), label: s.name, search: s.code }))}
                                />
                            </div>
                        ))}
                        {partForm.requirements.length === 0 && <p className="text-sm text-slate-400">{t('tenderDetail.requirements.empty')}</p>}
                        <p className="text-xs text-slate-400">{t('tenderDetail.requirements.hint')}</p>
                    </div>

                    <ModalButtons onCancel={partModal.close} saving={saving} t={t} />
                </form>
            </Modal>

            {/* Participant modal */}
            <Modal isOpen={participantModal.isOpen} title={editingParticipant ? t('tenders.participants.editTitle') : t('tenders.participants.addTitle')} onClose={participantModal.close}>
                <form onSubmit={saveParticipant} className="grid gap-4">
                    <FormField
                        id="participant-name"
                        label={t('tenders.participants.name')}
                        name="manufacturerName"
                        value={participantForm.manufacturerName}
                        onChange={(e) => setParticipantForm((p) => ({ ...p, manufacturerName: e.target.value }))}
                        required
                        disabled={!!editingParticipant?.ownCompany}
                    />
                    <FormField id="participant-price" label={`${t('tenders.participants.offeredPrice')} (${currencySymbol(currency || baseCurrency)})`} type="number" step="0.01" min="0" name="offeredPrice" value={participantForm.offeredPrice} onChange={(e) => setParticipantForm((p) => ({ ...p, offeredPrice: e.target.value }))} />
                    <TextareaField id="participant-notes" label={t('common.notes')} name="notes" value={participantForm.notes} onChange={(e) => setParticipantForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
                    <label className="inline-flex w-fit items-center gap-2 text-sm">
                        <Checkbox checked={participantForm.participating} onChange={(e) => setParticipantForm((p) => ({ ...p, participating: e.target.checked }))} />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{t('tenderDetail.participants.participating')}</span>
                    </label>
                    <ModalButtons onCancel={participantModal.close} saving={saving} t={t} />
                </form>
            </Modal>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={t('common.confirmDelete')}
                message={t('tenderDetail.deleteConfirm', { name: pendingDelete?.name || '' })}
                onClose={confirmModal.close}
                onConfirm={doDelete}
                loading={saving}
            />
        </div>
    )
}

/** One part: header (with per-piece estimate), requirements list and the participant matrix. */
function PartCard({ part, canEdit, currency, money, t, onEditPart, onDeletePart, onAddParticipant, onEditParticipant, onDeleteParticipant, onToggleParticipating, onMarkWinner, onClearWinner }) {
    const { totalQty, unit } = partMetrics(part)
    const perLabel = unit || t('tenderDetail.part.piece')
    const estPerPiece = totalQty > 0 && part.estimatedValue != null ? part.estimatedValue / totalQty : null

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {t('tenderDetail.part.label', { number: part.partNumber || part.sortOrder + 1 })}
                            {part.title ? ` — ${part.title}` : ''}
                        </h3>
                        {part.samplesRequired && (
                            <span className="inline-flex items-center rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-semibold text-secondary-700 dark:bg-secondary-500/15 dark:text-secondary-300">
                                {t('tenderDetail.part.samplesRequired')}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
                        <span>{t('tenderDetail.part.estimatedValue')}: {money(part.estimatedValue)}</span>
                        {estPerPiece != null && (
                            <span className="text-slate-400">· {t('tenderDetail.part.perPiece', { amount: formatMoney(estPerPiece, currency), unit: perLabel })}</span>
                        )}
                    </div>
                    {part.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{part.description}</p>}
                </div>
                {canEdit && (
                    <div className="flex gap-1">
                        <button onClick={onEditPart} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button>
                        <button onClick={onDeletePart} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></button>
                    </div>
                )}
            </div>

            {/* Requirements (read-only; edited via the part modal) */}
            <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tenderDetail.requirements.title')}</h4>
                {part.requirements?.length ? (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {part.requirements.map((req) => (
                            <li key={req.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                                <span className="text-slate-700 dark:text-slate-200">
                                    {req.description}
                                    {req.serviceName && (
                                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {req.serviceName}
                                        </span>
                                    )}
                                </span>
                                {(req.quantity != null || (part.samplesRequired && req.sampleQuantity != null)) && (
                                    <span className="shrink-0 text-right text-slate-400">
                                        {req.quantity != null ? `${req.quantity}${req.unit ? ` ${req.unit}` : ''}` : ''}
                                        {part.samplesRequired && req.sampleQuantity != null && (
                                            <span className="ml-1 text-secondary-600 dark:text-secondary-300">
                                                {req.quantity != null ? '· ' : ''}{t('tenderDetail.requirements.samplesShort', { count: req.sampleQuantity })}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-400">{t('tenderDetail.requirements.empty')}</p>
                )}
            </div>

            {/* Participants */}
            <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('tenderDetail.participants.title')}</h4>
                    {canEdit && <button onClick={onAddParticipant} className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"><Plus className="h-3.5 w-3.5" /> {t('tenderDetail.participants.add')}</button>}
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/60">
                                <th className="px-3 py-2 font-semibold">{t('tenders.participants.name')}</th>
                                <th className="px-3 py-2 text-center font-semibold">{t('tenderDetail.participants.participating')}</th>
                                <th className="px-3 py-2 font-semibold">{t('tenders.participants.offeredPrice')}</th>
                                <th className="px-3 py-2 font-semibold">{t('tenderDetail.participants.pricePer', { unit: perLabel })}</th>
                                <th className="px-3 py-2 font-semibold">{t('tenderDetail.participants.result')}</th>
                                {canEdit && <th className="px-3 py-2" />}
                            </tr>
                        </thead>
                        <tbody>
                            {part.participants?.map((p) => {
                                const perPiece = totalQty > 0 && p.offeredPrice != null ? p.offeredPrice / totalQty : null
                                return (
                                    <tr key={p.id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${p.winner ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                                        <td className="px-3 py-2 font-medium">
                                            <span className="inline-flex items-center gap-2">
                                                {p.manufacturerName}
                                                {p.ownCompany && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">{t('tenderDetail.participants.you')}</span>}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <Checkbox checked={!!p.participating} disabled={!canEdit} onChange={() => onToggleParticipating(p)} />
                                        </td>
                                        <td className="px-3 py-2">{p.offeredPrice != null ? money(p.offeredPrice) : <span className="text-slate-400">—</span>}</td>
                                        <td className="px-3 py-2">{perPiece != null ? formatMoney(perPiece, currency) : <span className="text-slate-400">—</span>}</td>
                                        <td className="px-3 py-2">
                                            {p.winner ? (
                                                <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"><Trophy className="h-4 w-4" /> {t('tenderDetail.participants.won')}</span>
                                            ) : canEdit ? (
                                                <button onClick={() => onMarkWinner(p)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-600 dark:text-slate-400"><Crown className="h-3.5 w-3.5" /> {t('tenderDetail.participants.markWinner')}</button>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>
                                        {canEdit && (
                                            <td className="px-3 py-2">
                                                <div className="flex justify-end gap-1">
                                                    {p.winner && <button onClick={() => onClearWinner(p)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('tenderDetail.participants.clearWinner')}><Trophy className="h-3.5 w-3.5" /></button>}
                                                    <button onClick={() => onEditParticipant(p)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('common.edit')}><Pencil className="h-3.5 w-3.5" /></button>
                                                    {!p.ownCompany && <button onClick={() => onDeleteParticipant(p)} className="rounded p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label={t('common.delete')}><Trash2 className="h-3.5 w-3.5" /></button>}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function Fact({ label, value }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
            <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</div>
        </div>
    )
}

function ModalButtons({ onCancel, saving, t }) {
    return (
        <ModalActions className="md:col-span-2">
            <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">{saving ? t('common.saving') : t('common.save')}</button>
        </ModalActions>
    )
}

function BackButton({ onClick, label }) {
    return (
        <button onClick={onClick} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            <ChevronLeft className="h-4 w-4" /> {label}
        </button>
    )
}
