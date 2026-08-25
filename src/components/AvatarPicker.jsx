import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloud, Loader2, X } from 'lucide-react'
import { useImageUpload, ACCEPTED_LABEL } from '../hooks/useImageUpload'
import UserAvatar from './UserAvatar'
import AvatarCropModal from './AvatarCropModal'
import {
    AVATAR_ICONS, AVATAR_COLORS, AVATAR_ICON_NAMES, AVATAR_COLOR_NAMES, DEFAULT_AVATAR_COLOR,
} from '../constants/avatars'

/**
 * Editor for one account's avatar, offering the two things it can be: an uploaded photo, or a preset
 * icon in a colour. Picking either clears the other, which is the same rule the server applies — the two
 * cannot both be set, so the control never lets them look as though they are.
 *
 * Uncontrolled of its own state: `value` is `{ avatarKey, avatarIcon, avatarColor }` and every change
 * goes out through `onChange`, so the owning form decides when it is saved. `preview` is the user being
 * edited, used only to draw the initials fallback with the right name.
 */
export default function AvatarPicker({ value, onChange, preview = {} }) {
    const { t } = useTranslation()
    const { uploadFiles, uploading, error } = useImageUpload()
    const fileRef = useRef(null)
    // The picked file waits here while it is being framed; nothing is uploaded until the crop is accepted,
    // so backing out of the editor leaves no orphan object in storage.
    const [pending, setPending] = useState(null)

    const { avatarKey = null, avatarIcon = null, avatarColor = null } = value || {}
    const current = { ...preview, avatarKey, avatarIcon, avatarColor }
    // A colour is only meaningful next to an icon, but it has to be pickable before one is chosen -
    // otherwise the swatches look inert. Default the icon so a colour click alone still produces an avatar.
    const activeColor = avatarColor || DEFAULT_AVATAR_COLOR

    // Picking a file opens the framing step rather than uploading straight away - a circle crops a photo
    // hard, and letting the app choose which part reliably picks the wrong one.
    const pickFile = (fileList) => {
        const [file] = Array.from(fileList || [])
        if (file) setPending(file)
    }

    const uploadCrop = async (blob) => {
        const named = new File([blob], (pending?.name || 'avatar').replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
        })
        const [key] = await uploadFiles([named])
        if (key) onChange({ avatarKey: key, avatarIcon: null, avatarColor: null })
        setPending(null)
    }

    const pickIcon = (icon) => onChange({ avatarKey: null, avatarIcon: icon, avatarColor: activeColor })
    const pickColor = (color) => onChange({ avatarKey: null, avatarIcon: avatarIcon || 'user', avatarColor: color })
    const clear = () => onChange({ avatarKey: null, avatarIcon: null, avatarColor: null })

    const hasAvatar = Boolean(avatarKey || avatarIcon)

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <UserAvatar user={current} size="xl" />
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                        {t('avatar.upload')}
                    </button>
                    {hasAvatar && (
                        <button
                            type="button"
                            onClick={clear}
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                        >
                            <X className="h-4 w-4" />
                            {t('avatar.remove')}
                        </button>
                    )}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            pickFile(e.target.files)
                            e.target.value = ''
                        }}
                    />
                </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">{ACCEPTED_LABEL}</p>
            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

            <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('avatar.orPickIcon')}</p>
                <div className="flex flex-wrap gap-2">
                    {AVATAR_ICON_NAMES.map((name) => {
                        const Icon = AVATAR_ICONS[name]
                        const on = !avatarKey && avatarIcon === name
                        return (
                            <button
                                type="button"
                                key={name}
                                aria-pressed={on}
                                aria-label={name}
                                onClick={() => pickIcon(name)}
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                                    on
                                        ? 'border-teal-500 bg-teal-50 text-teal-700 ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400'
                                        : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
                                }`}
                            >
                                <Icon className="h-5 w-5" />
                            </button>
                        )
                    })}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                    {AVATAR_COLOR_NAMES.map((name) => {
                        const on = !avatarKey && activeColor === name && Boolean(avatarIcon)
                        return (
                            <button
                                type="button"
                                key={name}
                                aria-pressed={on}
                                aria-label={name}
                                onClick={() => pickColor(name)}
                                className={`h-7 w-7 rounded-full ring-offset-2 transition dark:ring-offset-slate-900 ${AVATAR_COLORS[name]} ${
                                    on ? 'ring-2 ring-slate-900 dark:ring-slate-100' : ''
                                }`}
                            />
                        )
                    })}
                </div>
            </div>

            <AvatarCropModal
                // Keyed by the pick, so choosing a different photo starts a fresh editor rather than
                // reusing one still holding the last one's zoom and position.
                key={pending ? `${pending.name}-${pending.lastModified}` : 'none'}
                file={pending}
                isOpen={Boolean(pending)}
                busy={uploading}
                onCancel={() => setPending(null)}
                onConfirm={uploadCrop}
            />
        </div>
    )
}
