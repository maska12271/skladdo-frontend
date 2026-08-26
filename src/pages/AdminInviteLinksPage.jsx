import { useCallback, useEffect, useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { formatDate, safeArray } from '../utils/format'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import LoadingBlock from '../components/LoadingBlock'
import Modal from '../components/Modal'
import CopyButton from '../components/CopyButton'
import { FormField, FormSelect } from '../components/FormField'
import { COMPANY_TYPES, FREE_PERIOD_PRESETS, PLANS, Pill, StatusBadge, daysUntil } from '../components/AdminBits'
import ModalActions from '../components/ModalActions'

const EMPTY_FORM = {
    label: '',
    accountType: '',
    plan: '',
    freeDays: '30',
    expiresInDays: '',
    maxUses: '',
}

const ANY = '' // "let the visitor choose" — an absent term rather than a value

/**
 * Creating a link. Every term is optional: a link with none at all is just a signup URL whose arrivals
 * are attributed to it, which is a perfectly reasonable thing to want for a campaign.
 */
function CreateLinkModal({ isOpen, onClose, onCreated }) {
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const isWarehouse = form.accountType === 'WAREHOUSE'
    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

    const close = () => {
        setForm(EMPTY_FORM)
        setError('')
        onClose()
    }

    const toNumber = (value) => {
        const n = Number(value)
        return value !== '' && Number.isFinite(n) && n > 0 ? n : null
    }

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            const created = await apiPost('/admin/invite-links', {
                label: form.label,
                accountType: form.accountType || null,
                // A warehouse account is free and its plan follows from the type, so never send one.
                plan: isWarehouse ? null : (form.plan || null),
                freeDays: toNumber(form.freeDays),
                expiresInDays: toNumber(form.expiresInDays),
                maxUses: toNumber(form.maxUses),
            }, { suppressErrorToast: true })
            onCreated(created)
            close()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} title="New invite link" onClose={close} width="max-w-xl">
            <form onSubmit={submit} className="space-y-4">
                {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                        {error}
                    </div>
                ) : null}

                <FormField
                    id="label" name="label" label="What is this link for?" required
                    value={form.label} onChange={change}
                    placeholder="Acme pilot, autumn outreach…"
                />
                <p className="-mt-2 text-xs text-slate-500">
                    Your own note. It never appears to whoever opens the link.
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormSelect
                        id="accountType" name="accountType" label="Account type"
                        value={form.accountType} onChange={change}
                        placeholder="Let them choose"
                        options={[{ value: ANY, label: 'Let them choose' },
                            ...COMPANY_TYPES.map((v) => ({ value: v, label: v === 'BUSINESS' ? 'Business' : 'Warehouse' }))]}
                    />
                    {isWarehouse ? (
                        <div className="flex items-end pb-2.5 text-xs text-slate-500">
                            Warehouse accounts are free, so there is no plan to pin.
                        </div>
                    ) : (
                        <FormSelect
                            id="plan" name="plan" label="Plan"
                            value={form.plan} onChange={change}
                            placeholder="Let them choose"
                            options={[{ value: ANY, label: 'Let them choose' },
                                ...PLANS.filter((p) => p !== 'WAREHOUSE').map((p) => ({ value: p, label: p }))]}
                        />
                    )}
                </div>

                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Free period</label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {FREE_PERIOD_PRESETS.map((days) => (
                            <button
                                key={days}
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, freeDays: String(days) }))}
                                className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                                    form.freeDays === String(days)
                                        ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                                        : 'border-slate-300 dark:border-slate-700'
                                }`}
                            >
                                {days} days
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, freeDays: '' }))}
                            className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                                form.freeDays === ''
                                    ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                                    : 'border-slate-300 dark:border-slate-700'
                            }`}
                        >
                            None
                        </button>
                        <input
                            type="number" min="1" name="freeDays" value={form.freeDays} onChange={change}
                            placeholder="Custom"
                            className="w-24 rounded-xl border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                        id="expiresInDays" name="expiresInDays" label="Link expires after (days)"
                        type="number" min="1" value={form.expiresInDays} onChange={change}
                        placeholder="Never"
                    />
                    <FormField
                        id="maxUses" name="maxUses" label="Maximum signups"
                        type="number" min="1" value={form.maxUses} onChange={change}
                        placeholder="Unlimited"
                    />
                </div>

                <ModalActions className="pt-2">
                    <button type="button" onClick={close}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving}
                        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? 'Creating…' : 'Create link'}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}

/** One link as a card — the URL is the point, so it gets the most room and a copy button. */
function LinkCard({ link, onRevoke, busy }) {
    const terms = []
    if (link.accountType) terms.push(link.accountType === 'WAREHOUSE' ? 'Warehouse account' : 'Business account')
    if (link.plan) terms.push(`${link.plan} plan`)
    if (link.freeDays) terms.push(`${link.freeDays} days free`)
    if (link.maxUses) terms.push(`max ${link.maxUses} signups`)
    if (link.expiresAt) terms.push(`link expires ${formatDate(link.expiresAt)}`)

    return (
        <div className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{link.label}</h3>
                        <StatusBadge status={link.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        Created {formatDate(link.createdAt)} · {link.signups} signup{link.signups === 1 ? '' : 's'}
                        {link.maxUses ? ` of ${link.maxUses}` : ''}
                        {link.expiresAt && link.status === 'ACTIVE' ? ` · expires ${daysUntil(link.expiresAt)}` : ''}
                    </p>
                </div>
                {link.status === 'ACTIVE' ? (
                    <button
                        onClick={() => onRevoke(link)}
                        disabled={busy}
                        className="shrink-0 rounded-xl border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                    >
                        Revoke
                    </button>
                ) : null}
            </div>

            {terms.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {terms.map((term) => <Pill key={term}>{term}</Pill>)}
                </div>
            ) : (
                <p className="mt-3 text-xs text-slate-500">
                    No special terms — an ordinary signup, tracked back to this link.
                </p>
            )}

            <div className="mt-4 flex items-center gap-2">
                <input
                    readOnly
                    value={link.url}
                    className={`w-full rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 ${
                        link.status === 'ACTIVE' ? '' : 'text-slate-400 line-through'
                    }`}
                />
                {link.status === 'ACTIVE' ? <CopyButton value={link.url} /> : null}
            </div>
        </div>
    )
}

/** Signup links carrying their own terms — the operator's way to hand out trials and track campaigns. */
export default function AdminInviteLinksPage() {
    const toast = useToast()
    const [links, setLinks] = useState([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        apiGet('/admin/invite-links')
            .then((res) => setLinks(safeArray(res)))
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const revoke = async (link) => {
        setBusy(true)
        try {
            await apiPost(`/admin/invite-links/${link.id}/revoke`, {})
            toast.success('Link revoked.')
            load()
        } catch {
            // The api client surfaced it.
        } finally {
            setBusy(false)
        }
    }

    return (
        <div>
            <PageHeader
                title="Invite links"
                description="Signup links that carry their own terms — plan, free period, expiry."
                action={
                    <button
                        onClick={() => setCreating(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                        <Plus className="h-4 w-4" />
                        New link
                    </button>
                }
            />

            {loading ? (
                <LoadingBlock />
            ) : links.length === 0 ? (
                <EmptyState
                    icon={Link2}
                    title="No invite links yet"
                    description="Create one to give a company a free trial, or to see which outreach brought a customer in."
                    action={
                        <button
                            onClick={() => setCreating(true)}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            New link
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {links.map((link) => (
                        <LinkCard key={link.id} link={link} onRevoke={revoke} busy={busy} />
                    ))}
                </div>
            )}

            <CreateLinkModal
                isOpen={creating}
                onClose={() => setCreating(false)}
                onCreated={(created) => {
                    toast.success('Link created — copy it from the list.')
                    setLinks((prev) => [created, ...prev])
                }}
            />
        </div>
    )
}
