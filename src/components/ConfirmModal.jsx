import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import ModalActions from './ModalActions'

/**
 * A destructive-action confirmation.
 *
 * `confirmLabel`/`busyLabel` default to "Delete"/"Deleting" because that is what nearly every caller is
 * confirming; pass them when the action is destructive but is not a deletion (withdrawing an invitation,
 * say), so the button says what the button does.
 */
export default function ConfirmModal({ isOpen, title, message, onClose, onConfirm, loading, confirmLabel, busyLabel }) {
    const { t } = useTranslation()
    return (
        <Modal isOpen={isOpen} title={title} onClose={onClose} width="max-w-lg">
            <div className="space-y-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
                <ModalActions>
                    <button
                        onClick={onClose}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700"
                    >
                        {t('confirm.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                        {loading ? (busyLabel ?? t('confirm.deleting')) : (confirmLabel ?? t('confirm.delete'))}
                    </button>
                </ModalActions>
            </div>
        </Modal>
    )
}