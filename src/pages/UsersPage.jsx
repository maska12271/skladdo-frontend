import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import DataToolbar from '../components/DataToolbar'
import StatusBadge from '../components/StatusBadge'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import CopyButton from '../components/CopyButton'
import { useModal } from '../hooks/useModal'
import { safeArray } from '../utils/format'
import { FormField, FormSelect } from '../components/FormField.jsx'
import { PERMISSION_MODULES } from '../constants/modules'
import { Pencil, Trash2, Archive, ArchiveRestore, ShieldCheck, User, KeyRound, Crown, Warehouse, CheckCircle2, Loader2 } from 'lucide-react'
import Checkbox from '../components/Checkbox'
import UserAvatar from '../components/UserAvatar'
import AvatarPicker from '../components/AvatarPicker'

const PERMISSION_ACTIONS = [
    { key: 'canView', labelKey: 'users.perm.view' },
    { key: 'canCreate', labelKey: 'users.perm.create' },
    { key: 'canEdit', labelKey: 'users.perm.edit' },
    { key: 'canDelete', labelKey: 'users.perm.delete' },
]

const emptyForm = {
    email: '',
    fullName: '',
    role: 'USER',
    canSeePrices: true,
    // Optional: an administrator can give a new colleague a picture or an icon so they do not start as
    // another grey circle. The user can change it themselves afterwards under My Account.
    avatarKey: null,
    avatarIcon: null,
    avatarColor: null,
}

// Restricted (permission-governed) roles that also carry the price-visibility toggle.
const RESTRICTED_ROLES = ['USER', 'WAREHOUSE']

const ROLE_LABELS = {
    OWNER: 'Owner',
    ADMINISTRATOR: 'Administrator',
    USER: 'User',
    WAREHOUSE: 'Warehouse',
}

// One icon per role, so the badge reads at a glance rather than only by colour — which is the half of
// it that a colour-blind reader loses.
const ROLE_ICON = {
    OWNER: Crown,
    ADMINISTRATOR: ShieldCheck,
    USER: User,
    WAREHOUSE: Warehouse,
}

const ROLE_BADGE = {
    OWNER: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ADMINISTRATOR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    USER: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    WAREHOUSE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const exportColumns = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Name', value: (r) => r.fullName },
    { header: 'Email', value: (r) => r.email },
    { header: 'Role', value: (r) => ROLE_LABELS[r.role] || r.role },
    { header: 'Status', value: (r) => (r.archived ? 'Archived' : 'Active') },
]

export default function UsersPage() {
    const { t } = useTranslation()
    const { user: currentUser } = useAuth()
    const toast = useToast()
    const navigate = useNavigate()

    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()
    const permModal = useModal()
    const setupLinkModal = useModal()

    // Holds the copyable one-time setup/reset link shown when an email couldn't be sent (no SMTP yet).
    const [setupLinkInfo, setSetupLinkInfo] = useState(null)

    const [rows, setRows] = useState([])
    const [permUser, setPermUser] = useState(null)
    const [permRows, setPermRows] = useState([])
    const [permLoading, setPermLoading] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [sendingInvite, setSendingInvite] = useState(false)
    const [selectedIds, setSelectedIds] = useState([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState([])
    const [roleFilter, setRoleFilter] = useState([])
    const [loading, setLoading] = useState(false)
    const [listLoading, setListLoading] = useState(true)
    const [error, setError] = useState('')

    const filtersActive = !!search || statusFilter.length > 0 || roleFilter.length > 0

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setListLoading(true)
        try {
            const response = await apiGet('/users')
            setRows(safeArray(response))
        } finally {
            setListLoading(false)
        }
    }

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            const q = search.toLowerCase()
            const matchesSearch =
                !search ||
                row.fullName?.toLowerCase().includes(q) ||
                row.email?.toLowerCase().includes(q)

            const matchesStatus =
                statusFilter.length === 0 || statusFilter.includes(row.archived ? 'archived' : 'active')

            const matchesRole = roleFilter.length === 0 || roleFilter.includes(row.role)

            return matchesSearch && matchesStatus && matchesRole
        })
    }, [rows, search, statusFilter, roleFilter])

    const openCreate = () => {
        setError('')
        setEditingId(null)
        setForm(emptyForm)
        formModal.open()
    }

    const openEdit = (item) => {
        setError('')
        setEditingId(item.id)
        setForm({
            email: item.email || '',
            fullName: item.fullName || '',
            role: item.role === 'OWNER' ? 'ADMINISTRATOR' : item.role || 'USER',
            canSeePrices: item.canSeePrices !== false,
            avatarKey: item.avatarKey || null,
            avatarIcon: item.avatarIcon || null,
            avatarColor: item.avatarColor || null,
        })
        formModal.open()
    }

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            // The price-visibility flag only applies to restricted roles; managers always see prices.
            const canSeePrices = RESTRICTED_ROLES.includes(form.role) ? form.canSeePrices : true
            if (editingId) {
                await apiPut(`/users/${editingId}`, {
                    fullName: form.fullName,
                    role: form.role,
                    canSeePrices,
                    avatarKey: form.avatarKey,
                    avatarIcon: form.avatarIcon,
                    avatarColor: form.avatarColor,
                })
                toast.success(t('users.updated'))
                formModal.close()
                setEditingId(null)
                setForm(emptyForm)
                await loadData()
            } else {
                // Create returns the invite outcome: the account is created "awaiting password setup"
                // and a setup link is emailed automatically. If email isn't configured we surface the
                // copyable link so the admin can share it manually.
                const created = await apiPost('/users', {
                    email: form.email,
                    fullName: form.fullName,
                    role: form.role,
                    canSeePrices,
                    avatarKey: form.avatarKey,
                    avatarIcon: form.avatarIcon,
                    avatarColor: form.avatarColor,
                })
                formModal.close()
                setEditingId(null)
                setForm(emptyForm)
                await loadData()
                handleInviteOutcome(created, form.email, created?.user?.id)
            }
        } catch (err) {
            setError(err.message || t('users.couldNotSave'))
        } finally {
            setLoading(false)
        }
    }

    /**
     * Shared handling for a setup/reset-link outcome ({ emailSent, setupLink }).
     *
     * A freshly created account always opens the dialog: the account exists either way, and the only
     * question left is how the person hears about it - which is the administrator's to answer rather than
     * ours to assume. Re-sending an existing user's link is already a deliberate "send it again", so that
     * path just confirms.
     */
    const handleInviteOutcome = (outcome, email, userId) => {
        if (userId) {
            setSetupLinkInfo({ email, link: outcome?.setupLink, userId, sent: Boolean(outcome?.emailSent) })
            setupLinkModal.open()
        } else if (outcome?.emailSent) {
            toast.success(t('users.inviteSent', { email }))
        } else if (outcome?.setupLink) {
            setSetupLinkInfo({ email, link: outcome.setupLink })
            setupLinkModal.open()
        }
    }

    /** Sends the invitation from the dialog. The server mints a fresh link, so the shown one is replaced. */
    const sendInviteFromDialog = async () => {
        if (!setupLinkInfo?.userId) return
        setSendingInvite(true)
        try {
            const res = await apiPost(`/users/${setupLinkInfo.userId}/setup-email`, {})
            setSetupLinkInfo((prev) => ({ ...prev, link: res.setupLink || prev.link, sent: Boolean(res.emailSent) }))
            if (res.emailSent) toast.success(t('users.inviteSent', { email: setupLinkInfo.email }))
            else toast.error?.(t('users.inviteNotConfigured'))
        } catch (err) {
            toast.error?.(err.message || t('users.couldNotSave'))
        } finally {
            setSendingInvite(false)
        }
    }

    // Row action: (re)send a user their setup/reset link. Never changes an existing password.
    const handleSendSetupEmail = async (row) => {
        try {
            const res = await apiPost(`/users/${row.id}/setup-email`, {})
            handleInviteOutcome(res, row.email)
        } catch (err) {
            toast.error?.(err.message || t('users.couldNotSave'))
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/users/${deletingItem.id}`)
            toast.success(t('users.deleted'))
            deleteModal.close()
            setDeletingItem(null)
            setSelectedIds((prev) => prev.filter((id) => id !== deletingItem.id))
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const handleArchiveToggle = async (item) => {
        await apiPut(`/users/${item.id}/${item.archived ? 'unarchive' : 'archive'}`, {})
        toast.success(item.archived ? t('users.unarchived') : t('users.archived'))
        await loadData()
    }

    const openPermissions = async (item) => {
        setError('')
        setPermUser(item)
        setPermRows([])
        permModal.open()
        setPermLoading(true)
        try {
            const response = await apiGet(`/users/${item.id}/permissions`)
            setPermRows(safeArray(response))
        } catch (err) {
            setError(err.message || t('users.couldNotLoadPermissions'))
        } finally {
            setPermLoading(false)
        }
    }

    // Toggle one flag, keeping the row coherent: any write permission implies view, and removing
    // view removes the writes that depend on it.
    const togglePermission = (module, action, checked) => {
        setPermRows((prev) =>
            prev.map((row) => {
                if (row.module !== module) return row
                const next = { ...row, [action]: checked }
                if (action === 'canView' && !checked) {
                    next.canCreate = false
                    next.canEdit = false
                    next.canDelete = false
                } else if (action !== 'canView' && checked) {
                    next.canView = true
                }
                return next
            })
        )
    }

    // Emails is granted as a single capability ("can send emails"): ON enables viewing sent history
    // and sending; OFF revokes everything. Template management is not separately grantable here.
    const toggleEmailAccess = (module, checked) => {
        setPermRows((prev) =>
            prev.map((row) =>
                row.module === module
                    ? { ...row, canView: checked, canCreate: checked, canEdit: false, canDelete: false }
                    : row,
            )
        )
    }

    const handleSavePermissions = async () => {
        if (!permUser) return
        setPermLoading(true)
        try {
            await apiPut(`/users/${permUser.id}/permissions`, { permissions: permRows })
            toast.success(t('users.permissionsUpdated'))
            permModal.close()
            setPermUser(null)
        } catch (err) {
            setError(err.message || t('users.couldNotSavePermissions'))
        } finally {
            setPermLoading(false)
        }
    }

    const isOwnerRow = (row) => row.role === 'OWNER'
    const isSelfRow = (row) => row.id === currentUser?.id
    const isSelectableRow = (row) => !isOwnerRow(row) && !isSelfRow(row)

    const selectedRows = rows.filter((row) => selectedIds.includes(row.id))

    const handleBulkArchive = async (archived) => {
        const targets = selectedRows.filter((row) => !!row.archived !== archived)
        if (targets.length === 0) return
        setLoading(true)
        try {
            await Promise.all(
                targets.map((row) => apiPut(`/users/${row.id}/${archived ? 'archive' : 'unarchive'}`, {}))
            )
            toast.success(archived ? t('users.bulkArchived', { count: targets.length }) : t('users.bulkUnarchived', { count: targets.length }))
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return
        setLoading(true)
        try {
            await Promise.all(selectedIds.map((id) => apiDelete(`/users/${id}`)))
            toast.success(t('users.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await loadData()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        {
            // Unlabelled and first, which is what makes it the leading adornment on a card — the same
            // slot the product thumbnail occupies.
            key: 'avatar',
            label: '',
            name: t('users.cols.name'),
            hideable: false,
            render: (row) => <UserAvatar user={row} size="sm" />,
        },
        { key: 'fullName', label: t('users.cols.name'), render: (row) => row.fullName || '-' },
        { key: 'email', label: t('common.email') },
        {
            key: 'role',
            label: t('users.cols.role'),
            render: (row) => {
                const Icon = ROLE_ICON[row.role] || User
                return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGE[row.role] || ROLE_BADGE.USER}`}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {t(`roles.${row.role}`)}
                    </span>
                )
            },
        },
        {
            key: 'archived',
            label: t('common.status'),
            render: (row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={row.archived ? 'ARCHIVED' : 'ACTIVE'} />
                    {row.passwordSetupPending && !row.archived && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {t('users.pendingBadge')}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end">
                    <ActionMenu
                        actions={[
                            { key: 'profile', label: t('users.viewProfile'), icon: User, onClick: () => navigate(`/users/${row.id}`) },
                            ...(isOwnerRow(row) || isSelfRow(row)
                                ? []
                                : [
                                    { key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEdit(row) },
                                    {
                                        key: 'resetLink',
                                        label: row.passwordSetupPending ? t('users.resendSetup') : t('users.sendResetLink'),
                                        icon: KeyRound,
                                        onClick: () => handleSendSetupEmail(row),
                                    },
                                    ...(RESTRICTED_ROLES.includes(row.role)
                                        ? [{ key: 'permissions', label: t('users.permissions'), icon: ShieldCheck, onClick: () => openPermissions(row) }]
                                        : []),
                                    {
                                        key: 'archive',
                                        label: row.archived ? t('users.unarchive') : t('users.archive'),
                                        icon: row.archived ? ArchiveRestore : Archive,
                                        onClick: () => handleArchiveToggle(row),
                                    },
                                    { key: 'delete', label: t('common.delete'), icon: Trash2, danger: true, onClick: () => openDelete(row) },
                                ]),
                        ]}
                    />
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('users.title')}
                description={t('users.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <DataToolbar
                            entityLabel="users"
                            exportColumns={exportColumns}
                            rows={filteredRows}
                        />
                    </div>
                }
                primaryAction={
                        <button onClick={openCreate} className="min-h-11 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 lg:min-h-0">
                            {t('users.add')}
                        </button>
                    }
            />

            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'role',
                        value: roleFilter,
                        onChange: setRoleFilter,
                        placeholder: t('users.filters.allRoles'),
                        options: [
                            { value: 'OWNER', label: t('roles.OWNER') },
                            { value: 'ADMINISTRATOR', label: t('roles.ADMINISTRATOR') },
                            { value: 'USER', label: t('roles.USER') },
                            { value: 'WAREHOUSE', label: t('roles.WAREHOUSE') },
                        ],
                    },
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        placeholder: t('common.allStatuses'),
                        options: [
                            { value: 'active', label: t('users.filters.active') },
                            { value: 'archived', label: t('users.filters.archived') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="users"
                columns={columns}
                rows={filteredRows}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={User}
                        title={t('users.emptyTitle')}
                        description={t('users.emptyDesc')}
                        action={
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('users.add')}
                            </button>
                        }
                    />
                }
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                isRowSelectable={isSelectableRow}
                onRowClick={(row) => navigate(`/users/${row.id}`)}
                bulkActions={
                    <>
                        <button
                            onClick={() => handleBulkArchive(true)}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
                        >
                            <Archive className="h-4 w-4" /> {t('users.archive')}
                        </button>
                        <button
                            onClick={() => handleBulkArchive(false)}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                        >
                            <ArchiveRestore className="h-4 w-4" /> {t('users.unarchive')}
                        </button>
                        <button
                            onClick={bulkDeleteModal.open}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                            <Trash2 className="h-4 w-4" /> {t('common.delete')}
                        </button>
                    </>
                }
            />

            <Modal isOpen={formModal.isOpen} title={editingId ? t('users.editTitle') : t('users.addTitle')} onClose={formModal.close} width="max-w-xl">
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    <FormField
                        id="user-email"
                        label={t('common.email')}
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        required={!editingId}
                        placeholder={t('users.form.emailPlaceholder')}
                        disabled={!!editingId}
                    />

                    <FormField
                        id="user-full-name"
                        label={t('users.form.fullName')}
                        name="fullName"
                        value={form.fullName}
                        onChange={handleChange}
                        placeholder={t('users.form.fullNamePlaceholder')}
                    />

                    <FormSelect
                        id="user-role"
                        label={t('users.form.role')}
                        name="role"
                        value={form.role}
                        onChange={handleChange}
                        required
                        placeholder={t('users.form.selectRole')}
                        options={[
                            { value: 'USER', label: t('roles.USER') },
                            { value: 'WAREHOUSE', label: t('roles.WAREHOUSE') },
                            { value: 'ADMINISTRATOR', label: t('roles.ADMINISTRATOR') },
                        ]}
                    />

                    {!editingId && RESTRICTED_ROLES.includes(form.role) && (
                        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {form.role === 'WAREHOUSE' ? t('users.form.newWarehouseHint') : t('users.form.newUserHint')}
                        </p>
                    )}

                    {RESTRICTED_ROLES.includes(form.role) && (
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <span>
                                <span className="block font-medium text-slate-700 dark:text-slate-200">{t('users.form.canSeePrices')}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t('users.form.canSeePricesHint')}</span>
                            </span>
                            <Checkbox name="canSeePrices" checked={!!form.canSeePrices} onChange={(e) => setForm((prev) => ({ ...prev, canSeePrices: e.target.checked }))} />
                        </label>
                    )}

                    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                        <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.form.avatar')}</p>
                        <AvatarPicker
                            value={form}
                            onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                            preview={{ fullName: form.fullName, email: form.email }}
                        />
                    </div>

                    {!editingId && (
                        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200">
                            <p className="font-medium">{t('users.form.inviteTitle')}</p>
                            <p className="mt-1 text-teal-700 dark:text-teal-300/90">{t('users.form.inviteExplanation')}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('users.createBtn')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('users.deleteTitle')}
                message={t('users.deleteConfirm', { email: deletingItem?.email || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('users.bulkDeleteTitle')}
                message={t('users.bulkDeleteConfirm', { count: selectedIds.length })}
                onClose={bulkDeleteModal.close}
                onConfirm={handleBulkDelete}
                loading={loading}
            />

            <Modal
                isOpen={permModal.isOpen}
                title={permUser ? t('users.perm.title', { name: permUser.fullName || permUser.email }) : t('users.permissions')}
                onClose={permModal.close}
                width="max-w-3xl"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t('users.perm.intro')}
                    </p>

                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    {permLoading && permRows.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-500">{t('users.perm.loading')}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900">
                                        <th className="px-4 py-3 font-semibold">{t('users.perm.area')}</th>
                                        {PERMISSION_ACTIONS.map((action) => (
                                            <th key={action.key} className="px-4 py-3 text-center font-semibold">{t(action.labelKey)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {permRows.map((row) => {
                                        const meta = PERMISSION_MODULES.find((m) => m.module === row.module)
                                        const label = meta ? t(`nav.${meta.navKey}`) : row.module
                                        // Emails is a single on/off capability, not a CRUD row.
                                        if (row.module === 'MANUFACTURER_EMAILS') {
                                            return (
                                                <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                    <td className="px-4 py-3 font-medium">{label}</td>
                                                    <td colSpan={PERMISSION_ACTIONS.length} className="px-4 py-3 text-center">
                                                        <label className="inline-flex items-center gap-2">
                                                            <Checkbox checked={!!row.canCreate} onChange={(e) => toggleEmailAccess(row.module, e.target.checked)} />
                                                            <span className="text-sm text-slate-600 dark:text-slate-300">{t('users.perm.emailAccess')}</span>
                                                        </label>
                                                    </td>
                                                </tr>
                                            )
                                        }
                                        return (
                                            <tr key={row.module} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                                                <td className="px-4 py-3 font-medium">{label}</td>
                                                {PERMISSION_ACTIONS.map((action) => (
                                                    <td key={action.key} className="px-4 py-3 text-center">
                                                        <Checkbox checked={!!row[action.key]} onChange={(e) => togglePermission(row.module, action.key, e.target.checked)} />
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={permModal.close}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSavePermissions}
                            disabled={permLoading}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                            {permLoading ? t('common.saving') : t('users.perm.save')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={setupLinkModal.isOpen}
                title={t('users.setupLinkTitle')}
                onClose={setupLinkModal.close}
                width="max-w-lg"
            >
                <div className="space-y-5">
                    {/* The account already exists - said first, so the two options below read as a choice
                        about delivery rather than as steps still standing between here and a working user. */}
                    <div className="flex gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                        <p className="text-sm text-teal-900 dark:text-teal-100">
                            {setupLinkInfo?.userId
                                ? t('users.setupLinkCreated', { email: setupLinkInfo?.email || '' })
                                : t('users.setupLinkEmailFailed', { email: setupLinkInfo?.email || '' })}
                        </p>
                    </div>

                    {setupLinkInfo?.userId && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.setupLinkSendTitle')}</p>
                            <button
                                type="button"
                                onClick={sendInviteFromDialog}
                                disabled={sendingInvite || setupLinkInfo?.sent}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {sendingInvite && <Loader2 className="h-4 w-4 animate-spin" />}
                                {setupLinkInfo?.sent
                                    ? t('users.setupLinkSent', { email: setupLinkInfo?.email || '' })
                                    : t('users.setupLinkSendCta', { email: setupLinkInfo?.email || '' })}
                            </button>
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {setupLinkInfo?.userId ? t('users.setupLinkOrCopy') : t('users.setupLinkTitle')}
                        </p>
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                                {setupLinkInfo?.link}
                            </span>
                            <CopyButton value={setupLinkInfo?.link || ''} />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('users.setupLinkHint')}</p>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={setupLinkModal.close}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
