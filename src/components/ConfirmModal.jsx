import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import ModalActions from './ModalActions'

export default function ConfirmModal({ isOpen, title, message, onClose, onConfirm, loading }) {
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
                        {loading ? t('confirm.deleting') : t('confirm.delete')}
                    </button>
                </ModalActions>
            </div>
        </Modal>
    )
}