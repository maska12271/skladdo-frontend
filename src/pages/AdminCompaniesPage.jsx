import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { apiGet, apiPost } from '../api/client'
import { formatDate, formatBytes } from '../utils/format'
import { useServerTable } from '../hooks/useServerTable'
import { sortOptionsFromColumns } from '../utils/sortOptions'
import PageHeader from '../components/PageHeader'
import DataTable from '../components/DataTable'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import CopyButton from '../components/CopyButton'
import { FormField, FormSelect } from '../components/FormField'
import { COMPANY_STATUSES, COMPANY_TYPES, PLANS, Pill, StatusBadge, relativeDays } from '../components/AdminBits'
import ModalActions from '../components/ModalActions'

const EMPTY_FORM = {
    companyName: '',
    registrationCode: '',
    ownerName: '',
    ownerEmail: '',
    accountType: 'BUSINESS',
    plan: 'STARTER',
}

/**
 * Provisioning a company by hand, for a customer signed up over a call.
 *
 * A warehouse account is free and its plan follows from the account type, so the plan picker disappears
 * for one — the same shape the public signup wizard takes, and the server derives the plan either way
 * rather than trusting what is sent.
 */
function CreateCompanyModal({ isOpen, onClose, onCreated }) {
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)

    const isWarehouse = form.accountType === 'WAREHOUSE'
    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

    const close = () => {
        setForm(EMPTY_FORM)
        setError('')
        setResult(null)
        onClose()
    }

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            const created = await apiPost('/admin/companies', {
                ...form,
                registrationCode: form.registrationCode || null,
                plan: isWarehouse ? null : form.plan,
            }, { suppressErrorToast: true })
            setResult(created)
            onCreated()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    // After creation the modal switches to showing the owner's setup link. A brand-new company has no
    // SMTP configured, so the invitation email almost never sends — the copyable link is the real
    // delivery mechanism here, not a fallback.
    if (result) {
        return (
            <Modal isOpen={isOpen} title="Company created" onClose={close} width="max-w-xl">
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium">{result.company?.name}</span> is set up. The owner has to
                        set their own password before they can sign in.
                    </p>
                    <div className={`rounded-xl border p-4 text-sm ${result.emailSent
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
                        {result.emailSent
                            ? 'The invitation email was sent.'
                            : 'No email could be sent (the new company has no SMTP configured yet) — send this link yourself.'}
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Password setup link</p>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={result.setupLink || ''}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                            />
                            <CopyButton value={result.setupLink || ''} />
                        </div>
                        <p className="text-xs text-slate-500">
                            Expires {formatDate(result.expiresAt)}. Issuing a new link replaces this one.
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={close} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                            Done
                        </button>
                    </div>
                </div>
            </Modal>
        )
    }

    return (
        <Modal isOpen={isOpen} title="New company" onClose={close} width="max-w-xl">
            <form onSubmit={submit} className="space-y-4">
                {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                        {error}
                    </div>
                ) : null}

                <FormField id="companyName" name="companyName" label="Company name" required
                    value={form.companyName} onChange={change} />
                <FormField id="registrationCode" name="registrationCode" label="Registration code"
                    value={form.registrationCode} onChange={change} placeholder="Optional" />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormSelect
                        id="accountType" name="accountType" label="Account type" required
                        value={form.accountType} onChange={change}
                        options={COMPANY_TYPES.map((v) => ({ value: v, label: v === 'BUSINESS' ? 'Business' : 'Warehouse (free)' }))}
                    />
                    {isWarehouse ? (
                        <div className="flex items-end pb-2.5 text-xs text-slate-500">
                            Warehouse accounts are free and have no plan to choose.
                        </div>
                    ) : (
                        <FormSelect
                            id="plan" name="plan" label="Plan" required
                            value={form.plan} onChange={change}
                            options={PLANS.filter((p) => p !== 'WAREHOUSE').map((p) => ({ value: p, label: p }))}
                        />
                    )}
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                    <p className="mb-3 text-sm font-medium">Owner account</p>
                    <div className="space-y-4">
                        <FormField id="ownerName" name="ownerName" label="Full name" required
                            value={form.ownerName} onChange={change} />
                        <FormField id="ownerEmail" name="ownerEmail" label="Email" type="email" required
                            value={form.ownerEmail} onChange={change} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                        They receive a link to set their own password — you never see or choose it.
                    </p>
                </div>

                <ModalActions>
                    <button type="button" onClick={close}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving}
                        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? 'Creating…' : 'Create company'}
                    </button>
                </ModalActions>
            </form>
        </Modal>
    )
}

/** Every company on the platform, searchable and filterable. Server-paginated like the tenant lists. */
export default function AdminCompaniesPage() {
    const navigate = useNavigate()
    const [creating, setCreating] = useState(false)

    const fetcher = useCallback(({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams({
            // The table is 1-based, the backend 0-based.
            page: String(page - 1),
            size: String(size),
            sortBy,
            sortDir,
        })
        if (q) params.set('search', q)
        if (filters.type?.length) params.set('type', filters.type.join(','))
        if (filters.status?.length) params.set('status', filters.status.join(','))
        if (filters.plan?.length) params.set('plan', filters.plan.join(','))
        return apiGet(`/admin/companies?${params.toString()}`)
    }, [])

    const {
        rows, total, loading, page, pageSize, sortBy, sortDir, q, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['type', 'status', 'plan'],
        fetcher,
        defaultSortBy: 'createdAt',
        defaultSortDir: 'desc',
    })

    const filtersActive = Boolean(q) || Object.values(filters).some((v) => v.length > 0)

    // Storage is summed from a separate table (object keys carry no tenant, so the bucket cannot be
    // attributed), and it is one small figure per company — a single call indexed by id beats widening
    // the paged companies query for it.
    const [storageByCompany, setStorageByCompany] = useState({})
    useEffect(() => {
        apiGet('/admin/storage-usage')
            .then((rows) => setStorageByCompany(Object.fromEntries(
                (Array.isArray(rows) ? rows : []).map((r) => [r.companyId, r]),
            )))
            .catch(() => { /* the api client already surfaced it; the column just shows a dash */ })
    }, [])

    const columns = [
        {
            key: 'name',
            label: 'Company',
            sortKey: 'name',
            render: (r) => (
                <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-slate-500">{r.ownerEmail || '—'}</p>
                </div>
            ),
        },
        { key: 'type', label: 'Type', render: (r) => <Pill>{r.type === 'WAREHOUSE' ? 'Warehouse' : 'Business'}</Pill> },
        { key: 'plan', label: 'Plan', sortKey: 'plan', render: (r) => <Pill>{r.plan}</Pill> },
        { key: 'status', label: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'userCount', label: 'Users', sortKey: 'userCount', render: (r) => <span className="tabular-nums">{r.userCount}</span> },
        {
            key: 'storage',
            label: 'Storage',
            // Not sortable: the figures come from a second query, so the server cannot order the page by
            // them without joining the two.
            render: (r) => {
                const usage = storageByCompany[r.id]
                if (!usage) return <span className="text-slate-400">—</span>
                return (
                    <span className="tabular-nums" title={`${usage.files} file${usage.files === 1 ? '' : 's'}`}>
                        {formatBytes(usage.bytes)}
                    </span>
                )
            },
        },
        {
            key: 'createdAt',
            label: 'Signed up',
            sortKey: 'createdAt',
            render: (r) => (r.createdAt
                ? <span title={formatDate(r.createdAt)}>{relativeDays(r.createdAt)}</span>
                : <span className="text-slate-400">Unknown</span>),
        },
        {
            key: 'lastActiveAt',
            label: 'Last active',
            sortKey: 'lastActiveAt',
            render: (r) => (r.lastActiveAt
                ? <span title={formatDate(r.lastActiveAt)}>{relativeDays(r.lastActiveAt)}</span>
                : <span className="text-slate-400">Never</span>),
        },
    ]

    return (
        <div>
            <PageHeader
                title="Companies"
                description="Every tenant on the platform."
                action={
                    <button
                        onClick={() => setCreating(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                        <Plus className="h-4 w-4" />
                        New company
                    </button>
                }
            />

            <SearchFilters
                search={q}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'type',
                        value: filters.type,
                        onChange: (v) => setFilter('type', v),
                        placeholder: 'All types',
                        options: COMPANY_TYPES.map((v) => ({ value: v, label: v === 'BUSINESS' ? 'Business' : 'Warehouse' })),
                    },
                    {
                        key: 'status',
                        value: filters.status,
                        onChange: (v) => setFilter('status', v),
                        placeholder: 'All statuses',
                        options: COMPANY_STATUSES.map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() })),
                    },
                    {
                        key: 'plan',
                        value: filters.plan,
                        onChange: (v) => setFilter('plan', v),
                        placeholder: 'All plans',
                        options: PLANS.map((v) => ({ value: v, label: v })),
                    },
                ]}
                sort={{ sortBy, sortDir, onSortChange: setSort, options: sortOptionsFromColumns(columns) }}
            />

            <DataTable
                tableId="adminCompanies"
                columns={columns}
                rows={rows}
                total={total}
                loading={loading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Building2}
                        title="No companies yet"
                        description="Companies appear here as they sign up, or when you create one."
                    />
                }
                onRowClick={(row) => navigate(`/admin/companies/${row.id}`)}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                sortBy={sortBy}
                sortDir={sortDir}
                onSortChange={setSort}
                hideCardSort
            />

            <CreateCompanyModal
                isOpen={creating}
                onClose={() => setCreating(false)}
                onCreated={reload}
            />
        </div>
    )
}
