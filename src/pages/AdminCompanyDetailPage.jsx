import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CircleCheck } from 'lucide-react'
import { apiDelete, apiGet, apiPost } from '../api/client'
import { formatDate, formatDateTime, formatBytes, safeArray } from '../utils/format'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'
import LoadingBlock from '../components/LoadingBlock'
import Modal from '../components/Modal'
import { FormField } from '../components/FormField'
import { FREE_PERIOD_PRESETS, Pill, StatusBadge, daysUntil, relativeDays } from '../components/AdminBits'
import Checkbox from '../components/Checkbox'

function Card({ title, children }) {
    return (
        <div className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-semibold">{title}</h2>
            {children}
        </div>
    )
}

function Field({ label, children }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
            <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{label}</span>
            <span className="min-w-0 truncate text-right text-sm font-medium">{children ?? <span className="text-slate-400">—</span>}</span>
        </div>
    )
}

/**
 * Confirming a suspension. Its own modal rather than the shared {@code ConfirmModal} because that one is
 * hard-wired to a red "Delete" button and this action is reversible in one click — overstating it would
 * train the operator to click through warnings.
 */
function SuspendModal({ isOpen, company, onClose, onConfirm, busy }) {
    return (
        <Modal isOpen={isOpen} title="Suspend company" onClose={onClose} width="max-w-lg">
            <div className="space-y-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    Every account in <span className="font-medium">{company?.name}</span> stops being able to
                    sign in, and anyone currently signed in is locked out on their next request. Their data is
                    untouched and you can lift this at any time.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={busy}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                        {busy ? 'Suspending…' : 'Suspend'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}

/**
 * Granting or extending a free period.
 *
 * Extending is the default and it runs from the current end date, not today — "another 30 days" should
 * add to what they have rather than silently shorten it. Restarting from today is available but has to be
 * asked for. A lapsed period always restarts, since there is nothing left to extend.
 */
function SponsorshipModal({ isOpen, company, onClose, onSaved }) {
    const active = company?.freeUntil && new Date(company.freeUntil) > new Date()
    const [days, setDays] = useState('30')
    const [note, setNote] = useState('')
    const [fromToday, setFromToday] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const close = () => {
        setDays('30')
        setNote('')
        setFromToday(false)
        setError('')
        onClose()
    }

    const submit = async (e) => {
        e.preventDefault()
        const parsed = Number(days)
        if (!Number.isFinite(parsed) || parsed < 1) {
            setError('Enter a number of days.')
            return
        }
        setSaving(true)
        setError('')
        try {
            await apiPost(`/admin/companies/${company.id}/sponsorship`,
                { days: parsed, note: note || null, fromToday }, { suppressErrorToast: true })
            onSaved()
            close()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal isOpen={isOpen} title={active ? 'Extend free period' : 'Grant free period'} onClose={close} width="max-w-lg">
            <form onSubmit={submit} className="space-y-4">
                {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                        {error}
                    </div>
                ) : null}

                {active ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Currently free until <span className="font-medium">{formatDate(company.freeUntil)}</span>.
                    </p>
                ) : null}

                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">How long?</label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {FREE_PERIOD_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setDays(String(preset))}
                                className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                                    days === String(preset)
                                        ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                                        : 'border-slate-300 dark:border-slate-700'
                                }`}
                            >
                                {preset} days
                            </button>
                        ))}
                        <input
                            type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)}
                            className="w-24 rounded-xl border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                    </div>
                </div>

                {active ? (
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Checkbox checked={fromToday} onChange={(e) => setFromToday(e.target.checked)} />
                        Restart from today instead of extending the current period
                    </label>
                ) : null}

                <FormField
                    id="note" name="note" label="Why (your note)"
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Pilot agreed on the call, 12 Aug"
                />
                <p className="-mt-2 text-xs text-slate-500">Never shown to the company.</p>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={close}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving}
                        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                        {saving ? 'Saving…' : active ? 'Extend' : 'Grant'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

/** One company as the operator sees it: identity, billing, and its user accounts. */
export default function AdminCompanyDetailPage() {
    const { id } = useParams()
    const toast = useToast()
    const [detail, setDetail] = useState(null)
    const [loading, setLoading] = useState(true)
    const [confirming, setConfirming] = useState(false)
    const [sponsoring, setSponsoring] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        apiGet(`/admin/companies/${id}`)
            .then(setDetail)
            .catch(() => { /* the api client already surfaced the error */ })
            .finally(() => setLoading(false))
    }, [id])

    useEffect(() => {
        load()
    }, [load])

    const setSuspended = async (suspended) => {
        setBusy(true)
        try {
            await apiPost(`/admin/companies/${id}/${suspended ? 'suspend' : 'activate'}`, {})
            toast.success(suspended ? 'Company suspended.' : 'Company restored.')
            setConfirming(false)
            load()
        } catch {
            // The api client surfaced the error; the refusal to suspend an operator's own company
            // (error.admin.cannotSuspendOperator) arrives as a translated 403 message.
        } finally {
            setBusy(false)
        }
    }

    const endSponsorship = async () => {
        setBusy(true)
        try {
            await apiDelete(`/admin/companies/${id}/sponsorship`)
            toast.success('Free period ended.')
            load()
        } catch {
            // The api client surfaced it.
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <LoadingBlock />
    if (!detail) return null

    const company = detail.company
    const suspended = company.status === 'SUSPENDED'
    const users = safeArray(detail.users)
    const freeActive = company.freeUntil && new Date(company.freeUntil) > new Date()

    return (
        <div>
            <Link
                to="/admin/companies"
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
                <ArrowLeft className="h-4 w-4" />
                All companies
            </Link>

            <PageHeader
                title={company.name}
                description={company.ownerEmail ? `Owner: ${company.ownerEmail}` : 'No owner account on record'}
                action={
                    suspended ? (
                        <button
                            onClick={() => setSuspended(false)}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                            <CircleCheck className="h-4 w-4" />
                            Restore access
                        </button>
                    ) : (
                        <button
                            onClick={() => setConfirming(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                        >
                            <Ban className="h-4 w-4" />
                            Suspend
                        </button>
                    )
                }
            />

            {suspended ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
                    This company is suspended. Nobody in it can sign in.
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Company">
                    <Field label="Status"><StatusBadge status={company.status} /></Field>
                    <Field label="Account type"><Pill>{company.type === 'WAREHOUSE' ? 'Warehouse' : 'Business'}</Pill></Field>
                    <Field label="Registration code">{company.registrationCode}</Field>
                    <Field label="Signed up">
                        {company.createdAt
                            ? `${formatDate(company.createdAt)} (${relativeDays(company.createdAt)})`
                            : <span className="text-slate-400">Unknown</span>}
                    </Field>
                    <Field label="Last active">
                        {company.lastActiveAt
                            ? `${formatDate(company.lastActiveAt)} (${relativeDays(company.lastActiveAt)})`
                            : <span className="text-slate-400">Never signed in</span>}
                    </Field>
                    <Field label="Users">{company.userCount}</Field>
                    {/* What this customer costs to host, split by where it actually sits. */}
                    <Field label="File storage">
                        {formatBytes(detail.storageBytes)}
                        <span className="ml-1.5 text-slate-400">
                            ({detail.storageFiles} file{detail.storageFiles === 1 ? '' : 's'})
                        </span>
                    </Field>
                    <Field label="Database">
                        {formatBytes(detail.databaseBytes)}
                        <span className="ml-1.5 text-slate-400">row data</span>
                    </Field>
                </Card>

                <Card title="Billing">
                    <Field label="Plan"><Pill>{company.plan}</Pill></Field>
                    <Field label="Subscription">{company.subscriptionStatus}</Field>
                    <Field label="Period start">{detail.currentPeriodStart ? formatDate(detail.currentPeriodStart) : null}</Field>
                    <Field label="Period end">{company.currentPeriodEnd ? formatDate(company.currentPeriodEnd) : null}</Field>
                    <Field label="Cancelling at period end">{detail.cancelAtPeriodEnd ? 'Yes' : 'No'}</Field>
                    <p className="pt-3 text-xs text-slate-400">
                        Billing is not connected to a payment provider yet — these dates track periods, not
                        payments, and “overdue” is a signal to follow up rather than a restriction.
                    </p>
                </Card>
            </div>

            <div className="mt-4">
                <Card title="Free access">
                    {freeActive ? (
                        <>
                            <Field label="Free until">
                                {formatDate(company.freeUntil)} ({daysUntil(company.freeUntil)})
                            </Field>
                            <Field label="Reason">{company.freeNote}</Field>
                            <p className="pt-3 text-xs text-slate-500">
                                While this runs the company is never counted as overdue, and its billing tab
                                tells them the account is free rather than naming a payment date.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSponsoring(true)}
                                    className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                                >
                                    Extend
                                </button>
                                <button
                                    onClick={endSponsorship}
                                    disabled={busy}
                                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"
                                >
                                    End now
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {company.freeUntil
                                    ? `A free period ended on ${formatDate(company.freeUntil)}. This company pays normally now.`
                                    : 'This company pays normally.'}
                            </p>
                            {company.freeNote ? (
                                <p className="mt-1 text-xs text-slate-500">Last note: {company.freeNote}</p>
                            ) : null}
                            <button
                                onClick={() => setSponsoring(true)}
                                className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                            >
                                Grant free period
                            </button>
                        </>
                    )}
                </Card>
            </div>

            <div className="mt-4">
                <Card title={`Users (${users.length})`}>
                    {users.length === 0 ? (
                        <p className="py-4 text-sm text-slate-500">No accounts in this company.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800">
                                        <th className="py-2 pr-4 font-medium">Name</th>
                                        <th className="py-2 pr-4 font-medium">Email</th>
                                        <th className="py-2 pr-4 font-medium">Role</th>
                                        <th className="py-2 pr-4 font-medium">State</th>
                                        <th className="py-2 font-medium">Last sign-in</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {users.map((u) => (
                                        <tr key={u.id}>
                                            <td className="py-2.5 pr-4">{u.fullName || '—'}</td>
                                            <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                                            <td className="py-2.5 pr-4"><Pill>{u.role}</Pill></td>
                                            <td className="py-2.5 pr-4">
                                                {u.archived ? <span className="text-slate-400">Archived</span>
                                                    : u.passwordSetupPending ? <span className="text-amber-600 dark:text-amber-400">Awaiting setup</span>
                                                    : <span className="text-emerald-600 dark:text-emerald-400">Active</span>}
                                            </td>
                                            <td className="py-2.5 text-slate-500">
                                                {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <SuspendModal
                isOpen={confirming}
                company={company}
                onClose={() => setConfirming(false)}
                onConfirm={() => setSuspended(true)}
                busy={busy}
            />

            <SponsorshipModal
                isOpen={sponsoring}
                company={company}
                onClose={() => setSponsoring(false)}
                onSaved={() => {
                    toast.success('Free period updated.')
                    load()
                }}
            />
        </div>
    )
}
