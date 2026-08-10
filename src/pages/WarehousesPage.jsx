import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, Pencil, Trash2, Warehouse } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { usePermissions } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray } from '../utils/format'
import { FormField } from '../components/FormField.jsx'
import AddressAutocompleteField from '../components/AddressAutocompleteField.jsx'

const emptyForm = { name: '', address: '', active: true }

/**
 * The company's warehouses. Every one of them is ours: a warehouse always belongs to the company whose
 * stock is in it, and a warehouse partner is only ever given access to one — never ownership of it. So
 * whether an outside company works here is not a property of the warehouse, and it is decided on the
 * Connections page instead.
 */
export default function WarehousesPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('WAREHOUSES')
    const toast = useToast()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const formModal = useModal()
    const deleteModal = useModal()

    const [rows, setRows] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState([])
    const [loading, setLoading] = useState(false)
    const [listLoading, setListLoading] = useState(true)

    const filtersActive = !!search || statusFilter.length > 0

    useEffect(() => { loadData() }, [])

    const editId = searchParams.get('edit')
    useEffect(() => {
        if (!editId || rows.length === 0) return
        const item = rows.find((r) => String(r.id) === String(editId))
        if (item) {
            openEdit(item)
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                next.delete('edit')
                return next
            }, { replace: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId, rows])

    const loadData = async () => {
        setListLoading(true)
        try {
            setRows(safeArray(await apiGet('/warehouses')))
        } finally {
            setListLoading(false)
        }
    }

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            const q = search.toLowerCase()
            const matchesSearch =
                !search ||
                row.name?.toLowerCase().includes(q) ||
                row.address?.toLowerCase().includes(q)
            const matchesStatus =
                statusFilter.length === 0 || statusFilter.includes(row.active ? 'active' : 'inactive')
            return matchesSearch && matchesStatus
        })
    }, [rows, search, statusFilter])

    const openCreate = () => {
        setEditingId(null)
        setForm(emptyForm)
        formModal.open()
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setForm({ name: item.name || '', address: item.address || '', active: !!item.active })
        formModal.open()
    }

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (editingId) {
                await apiPut(`/warehouses/${editingId}`, form)
            } else {
                await apiPost('/warehouses', form)
            }
            toast.success(editingId ? t('warehouses.updated') : t('warehouses.created'))
            formModal.close()
            setForm(emptyForm)
            setEditingId(null)
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/warehouses/${deletingItem.id}`)
            toast.success(t('warehouses.deleted'))
            deleteModal.close()
            setDeletingItem(null)
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        { key: 'name', label: t('warehouses.cols.name') },
        { key: 'address', label: t('warehouses.cols.address'), render: (row) => row.address || '—' },
        {
            key: 'active',
            label: t('warehouses.cols.active'),
            render: (row) => <StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} />,
        },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        actions={[
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/warehouses/${row.id}`) },
                            ...(canEdit ? [{ key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEdit(row) }] : []),
                            ...(canDelete ? [{ key: 'delete', label: t('common.delete'), icon: Trash2, danger: true, onClick: () => openDelete(row) }] : []),
                        ]}
                    />
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('warehouses.title')}
                description={t('warehouses.description')}
                action={canCreate && (
                    <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                        {t('warehouses.add')}
                    </button>
                )}
            />

            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        placeholder: t('common.allStatuses'),
                        options: [
                            { value: 'active', label: t('common.active') },
                            { value: 'inactive', label: t('common.inactive') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="warehouses"
                columns={columns}
                rows={filteredRows}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Warehouse}
                        title={t('warehouses.emptyTitle')}
                        description={t('warehouses.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('warehouses.add')}
                            </button>
                        ) : null}
                    />
                }
                onRowClick={(row) => navigate(`/warehouses/${row.id}`)}
            />

            <Modal isOpen={formModal.isOpen} title={editingId ? t('warehouses.editTitle') : t('warehouses.addTitle')} onClose={formModal.close}>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                    <FormField
                        id="warehouse-name"
                        label={t('warehouses.form.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('warehouses.form.name')}
                        className="md:col-span-2"
                    />

                    <AddressAutocompleteField
                        id="warehouse-address"
                        label={t('warehouses.form.address')}
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        placeholder={t('warehouses.form.address')}
                        className="md:col-span-2"
                    />

                    {/* Active is a lifecycle toggle, only meaningful once a record exists — new records are active. */}
                    {editingId && (
                        <label className="md:col-span-2 inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <input
                                type="checkbox"
                                name="active"
                                checked={form.active}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700"
                            />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('warehouses.form.active')}</span>
                        </label>
                    )}

                    <div className="md:col-span-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={formModal.close}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('warehouses.add')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('warehouses.deleteTitle')}
                message={t('warehouses.deleteConfirm', { name: deletingItem?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />
        </div>
    )
}
