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
import { formatDateTime, safeArray } from '../utils/format'
import { FormField, FormSelect } from '../components/FormField.jsx'
import { PERMISSION_MODULES } from '../constants/modules'
import { Pencil, Trash2, Archive, ArchiveRestore, ShieldCheck, User, KeyRound, Crown, Warehouse, CheckCircle2, Loader2, Link2, Send, Ban, UserPlus } from 'lucide-react'
import Checkbox from '../components/Checkbox'
import UserAvatar from '../components/UserAvatar'
import AvatarPicker from '../components/AvatarPicker'
import ModalActions from '../components/ModalActions'

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

// A fresh invitation: the access, and nothing about the person - they supply that themselves.
const emptyInvite = {
    role: 'USER',
    canSeePrices: true,
}

// Restricted (permission-governed) roles that also carry the price-visibility toggle.
const RESTRICTED_ROLES = ['USER', 'WAREHOUSE']

// Invitations worth keeping in front of an administrator. A spent or lapsed one is history, and the
// list would fill up with it - the account it produced is in the table above, where it belongs.
const OPEN_INVITE_STATUSES = ['PENDING']

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

/**
 * The per-module access grid, driven entirely by the rows handed to it.
 *
 * Shared by the two places access is decided - the permission editor for an existing account, and the
 * invitation that will create one - because they have to agree: a grant that reads one way when it is
 * issued and another when it is edited is a grant nobody can be sure of.
 */
function PermissionMatrix({ rows, onChange }) {
    const { t } = useTranslation()

    // Toggle one flag, keeping the row coherent: any write permission implies view, and removing
    // view removes the writes that depend on it.
    const togglePermission = (module, action, checked) => {
        onChange(rows.map((row) => {
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
        }))
    }

    // Emails is granted as a single capability ("can send emails"): ON enables viewing sent history
    // and sending; OFF revokes everything. Template management is not separately grantable here.
    const toggleEmailAccess = (module, checked) => {
        onChange(rows.map((row) =>
            row.module === module
                ? { ...row, canView: checked, canCreate: checked, canEdit: false, canDelete: false }
                : row,
        ))
    }

    return (
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
                    {rows.map((row) => {
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
    )
}

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
    const inviteModal = useModal()
    const revokeModal = useModal()

    // Holds the copyable one-time setup/reset link shown when an email couldn't be sent (no SMTP yet).
    const [setupLinkInfo, setSetupLinkInfo] = useState(null)

    // Invitations: the outstanding links, the one being composed, and the one just minted.
    const [invites, setInvites] = useState([])
    const [inviteForm, setInviteForm] = useState(emptyInvite)
    const [invitePermRows, setInvitePermRows] = useState(null) // null = "use the company default template"
    const [createdInvite, setCreatedInvite] = useState(null)
    const [inviteEmail, setInviteEmail] = useState('')
    const [sendingInvite, setSendingInvite] = useState(false)
    const [revokingInvite, setRevokingInvite] = useState(null)

    const [rows, setRows] = useState([])
    const [permUser, setPermUser] = useState(null)
    const [permRows, setPermRows] = useState([])
    const [permLoading, setPermLoading] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
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
            const [users, inviteList] = await Promise.all([apiGet('/users'), apiGet('/user-invites')])
            setRows(safeArray(users))
            setInvites(safeArray(inviteList))
        } finally {
            setListLoading(false)
        }
    }

    // Only the ones still waiting for someone. See OPEN_INVITE_STATUSES.
    const openInvites = useMemo(
        () => invites.filter((invite) => OPEN_INVITE_STATUSES.includes(invite.status)),
        [invites],
    )

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

    /**
     * Starts a new invitation. Opens on the access alone: everything about the person is theirs to enter,
     * so there is nothing else here for an administrator to get wrong.
     */
    const openInvite = () => {
        setError('')
        setInviteForm(emptyInvite)
        setInvitePermRows(null)
        setCreatedInvite(null)
        setInviteEmail('')
        inviteModal.open()
    }

    /**
     * Opens the permission editor inside the invitation, seeded from the company's own default template -
     * which is what the new account would have got anyway, so the editor starts from the answer rather
     * than from nothing and only records a deliberate departure from it.
     */
    const customizeInvitePermissions = async () => {
        try {
            const template = await apiGet('/settings/default-permissions')
            setInvitePermRows(safeArray(template))
        } catch (err) {
            setError(err.message || t('users.couldNotLoadPermissions'))
        }
    }

    const handleCreateInvite = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const canSeePrices = RESTRICTED_ROLES.includes(inviteForm.role) ? inviteForm.canSeePrices : true
            const created = await apiPost('/user-invites', {
                role: inviteForm.role,
                canSeePrices,
                permissions: RESTRICTED_ROLES.includes(inviteForm.role) ? invitePermRows : null,
            })
            setCreatedInvite(created)
            await loadData()
        } catch (err) {
            setError(err.message || t('users.couldNotSave'))
        } finally {
            setLoading(false)
        }
    }

    /**
     * Emails an existing invitation. Delivery only - whoever opens it still enters their own address.
     *
     * The server reports whether a platform sender is even configured; when it is not, nothing left and
     * saying "sent" would be a lie that leaves the admin waiting for an email nobody posted. The copyable
     * link above is then the way through, so that is what the message points at.
     */
    const handleSendInvite = async (invite, email) => {
        if (!email?.trim()) return
        setSendingInvite(true)
        try {
            const res = await apiPost(`/user-invites/${invite.id}/send`, { email: email.trim() })
            const updated = res?.invite
            if (updated) setCreatedInvite((prev) => (prev && prev.id === updated.id ? updated : prev))
            if (res?.emailSent) {
                toast.success(t('users.invites.sent', { email: email.trim() }))
            } else {
                toast.error?.(t('users.invites.mailerOff'))
            }
            await loadData()
        } catch (err) {
            toast.error?.(err.message || t('users.couldNotSave'))
        } finally {
            setSendingInvite(false)
        }
    }

    const handleRevokeInvite = async () => {
        if (!revokingInvite) return
        setLoading(true)
        try {
            await apiPut(`/user-invites/${revokingInvite.id}/revoke`, {})
            toast.success(t('users.invites.revoked'))
            revokeModal.close()
            setRevokingInvite(null)
            await loadData()
        } catch (err) {
            toast.error?.(err.message || t('users.couldNotSave'))
        } finally {
            setLoading(false)
        }
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

    /**
     * Edits an existing account. New ones no longer come through here at all - they arrive through an
     * invitation, where the person enters their own details (see {@code openInvite}).
     */
    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            // The price-visibility flag only applies to restricted roles; managers always see prices.
            const canSeePrices = RESTRICTED_ROLES.includes(form.role) ? form.canSeePrices : true
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
        } catch (err) {
            setError(err.message || t('users.couldNotSave'))
        } finally {
            setLoading(false)
        }
    }

    /**
     * Row action: send an existing user a password reset link. Never changes their current password, and
     * the copyable link is the fallback for a company whose platform email is not configured.
     */
    const handleSendSetupEmail = async (row) => {
        try {
            const res = await apiPost(`/users/${row.id}/setup-email`, {})
            if (res?.emailSent) {
                toast.success(t('users.inviteSent', { email: row.email }))
            } else if (res?.setupLink) {
                setSetupLinkInfo({ email: row.email, link: res.setupLink })
                setupLinkModal.open()
            }
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
                        <button onClick={openInvite} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 lg:min-h-0">
                            <UserPlus className="h-4 w-4" /> {t('users.add')}
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
                            <button onClick={openInvite} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
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

            {/* Outstanding invitations. They sit below the accounts rather than among them because
                nobody is behind one yet - there is no name, no address and nothing to click through to,
                only a link waiting for someone. Hidden entirely when there are none. */}
            {openInvites.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-4">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {t('users.invites.title', { count: openInvites.length })}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('users.invites.description')}</p>
                    </div>
                    <ul className="space-y-3">
                        {openInvites.map((invite) => (
                            <li
                                key={invite.id}
                                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
                                    <Link2 className="h-[18px] w-[18px]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                        {t(`roles.${invite.role}`)}
                                        {invite.sentToEmail && (
                                            <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                                                {t('users.invites.sentTo', { email: invite.sentToEmail })}
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {t('users.invites.expires', { when: formatDateTime(invite.expiresAt) })}
                                    </p>
                                </div>
                                <CopyButton value={invite.url || ''} />
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Opens the dialog straight in its "here is the link" state - the
                                        // invitation already exists, so there is nothing left to compose.
                                        setCreatedInvite(invite)
                                        setInviteEmail(invite.sentToEmail || '')
                                        setError('')
                                        inviteModal.open()
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <Send className="h-4 w-4" /> {t('users.invites.send')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRevokingInvite(invite)
                                        revokeModal.open()
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                    <Ban className="h-4 w-4" /> {t('users.invites.revoke')}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <Modal isOpen={formModal.isOpen} title={t('users.editTitle')} onClose={formModal.close} width="max-w-xl">
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
                        placeholder={t('users.form.emailPlaceholder')}
                        disabled
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

                    <ModalActions>
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
                            {loading ? t('common.saving') : t('common.saveChanges')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            {/* Two states in one dialog: composing the invitation, then the link it produced. Deliberately
                not two modals - the link only makes sense as the outcome of the choices above it, and
                closing one to open another loses that thread. */}
            <Modal
                isOpen={inviteModal.isOpen}
                title={createdInvite ? t('users.invites.readyTitle') : t('users.invites.newTitle')}
                onClose={inviteModal.close}
                width="max-w-2xl"
            >
                {error && (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {!createdInvite ? (
                    <form onSubmit={handleCreateInvite} className="grid gap-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('users.invites.newIntro')}</p>

                        <FormSelect
                            id="invite-role"
                            label={t('users.form.role')}
                            name="role"
                            value={inviteForm.role}
                            onChange={(e) => {
                                setInviteForm((prev) => ({ ...prev, role: e.target.value }))
                                // A grant is written against a role; carrying one across to another role
                                // would quietly hand out access nobody chose for it.
                                setInvitePermRows(null)
                            }}
                            required
                            placeholder={t('users.form.selectRole')}
                            options={[
                                { value: 'USER', label: t('roles.USER') },
                                { value: 'WAREHOUSE', label: t('roles.WAREHOUSE') },
                                { value: 'ADMINISTRATOR', label: t('roles.ADMINISTRATOR') },
                            ]}
                        />

                        {RESTRICTED_ROLES.includes(inviteForm.role) && (
                            <>
                                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                                    <span>
                                        <span className="block font-medium text-slate-700 dark:text-slate-200">{t('users.form.canSeePrices')}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{t('users.form.canSeePricesHint')}</span>
                                    </span>
                                    <Checkbox
                                        name="canSeePrices"
                                        checked={!!inviteForm.canSeePrices}
                                        onChange={(e) => setInviteForm((prev) => ({ ...prev, canSeePrices: e.target.checked }))}
                                    />
                                </label>

                                {invitePermRows === null ? (
                                    <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                                        <p className="font-medium text-slate-700 dark:text-slate-200">{t('users.invites.defaultAccess')}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('users.invites.defaultAccessHint')}</p>
                                        <button
                                            type="button"
                                            onClick={customizeInvitePermissions}
                                            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <ShieldCheck className="h-4 w-4" /> {t('users.invites.customize')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.permissions')}</p>
                                            <button
                                                type="button"
                                                onClick={() => setInvitePermRows(null)}
                                                className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400"
                                            >
                                                {t('users.invites.useDefaults')}
                                            </button>
                                        </div>
                                        <PermissionMatrix rows={invitePermRows} onChange={setInvitePermRows} />
                                    </div>
                                )}
                            </>
                        )}

                        <ModalActions>
                            <button
                                type="button"
                                onClick={inviteModal.close}
                                className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                            >
                                {loading ? t('common.saving') : t('users.invites.createBtn')}
                            </button>
                        </ModalActions>
                    </form>
                ) : (
                    <div className="space-y-5">
                        <div className="flex gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                            <p className="text-sm text-teal-900 dark:text-teal-100">{t('users.invites.readyBody')}</p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.invites.copyTitle')}</p>
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                                    {createdInvite.url}
                                </span>
                                <CopyButton value={createdInvite.url || ''} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('users.invites.copyHint', { when: formatDateTime(createdInvite.expiresAt) })}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.invites.emailTitle')}</p>
                            <div className="flex flex-wrap items-end gap-2">
                                <FormField
                                    id="invite-email"
                                    label={t('common.email')}
                                    name="inviteEmail"
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder={t('users.form.emailPlaceholder')}
                                    className="min-w-[16rem] flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleSendInvite(createdInvite, inviteEmail)}
                                    disabled={sendingInvite || !inviteEmail.trim()}
                                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {sendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {t('users.invites.send')}
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('users.invites.emailHint')}</p>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={inviteModal.close}
                                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {t('common.close')}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={revokeModal.isOpen}
                title={t('users.invites.revokeTitle')}
                message={t('users.invites.revokeConfirm')}
                confirmLabel={t('users.invites.revoke')}
                busyLabel={t('common.saving')}
                onClose={revokeModal.close}
                onConfirm={handleRevokeInvite}
                loading={loading}
            />

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
                        <PermissionMatrix rows={permRows} onChange={setPermRows} />
                    )}

                    <ModalActions>
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
                    </ModalActions>
                </div>
            </Modal>

            <Modal
                isOpen={setupLinkModal.isOpen}
                title={t('users.setupLinkTitle')}
                onClose={setupLinkModal.close}
                width="max-w-lg"
            >
                <div className="space-y-5">
                    {/* Only ever reached when the email could not go out, so it opens by saying so - the
                        copyable link below is then the way round it rather than a second option. */}
                    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-sm text-amber-900 dark:text-amber-100">
                            {t('users.setupLinkEmailFailed', { email: setupLinkInfo?.email || '' })}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('users.setupLinkTitle')}</p>
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
