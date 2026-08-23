import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff, Loader2, Plus, UploadCloud, X } from 'lucide-react'
import { usePresignedUrl } from '../hooks/usePresignedUrl'
import { useImageUpload, ACCEPTED_LABEL } from '../hooks/useImageUpload'

// One gallery thumbnail — its own component so usePresignedUrl (a hook) can resolve each key
// independently while mapping over the image list.
function GalleryThumbnail({ imageKey, active, alt, onClick, onRemove, removeLabel }) {
    const url = usePresignedUrl(imageKey)
    return (
        <div className="group relative">
            <button
                type="button"
                onClick={onClick}
                className={`block h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                    active ? 'border-teal-500' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                }`}
            >
                <img src={url} alt={alt} className="h-full w-full object-cover" />
            </button>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900/70 p-1 text-white opacity-0 transition hover:bg-rose-600 focus:opacity-100 group-hover:opacity-100"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    )
}

/**
 * The product detail page's image panel. With `editable` it doubles as the image editor: pictures can be
 * added and removed right here instead of opening the whole product form, which was the only way in.
 * Every change is handed to `onChange` as the complete new key list, and is persisted by the caller.
 */
export default function ProductGalleryCard({ images, alt, editable = false, onChange }) {
    const { t } = useTranslation()
    const { uploadFiles, uploading, error } = useImageUpload()
    const [activeImage, setActiveImage] = useState(0)
    const [dragOver, setDragOver] = useState(false)
    const fileRef = useRef(null)

    // Clamped rather than reset on change: removing an image must not leave the index past the end.
    const active = Math.min(activeImage, Math.max(images.length - 1, 0))
    const mainImageUrl = usePresignedUrl(images[active])

    const addFiles = async (fileList) => {
        const keys = await uploadFiles(fileList)
        if (keys.length > 0) onChange([...images, ...keys])
    }

    const removeAt = (index) => {
        // Keep the same picture selected when an earlier one goes; the clamp above covers the rest.
        if (index < active) setActiveImage(active - 1)
        onChange(images.filter((_, i) => i !== index))
    }

    const handleInputChange = (e) => {
        addFiles(e.target.files)
        e.target.value = ''
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        addFiles(e.dataTransfer.files)
    }

    const dropProps = editable
        ? {
            onDragOver: (e) => {
                e.preventDefault()
                setDragOver(true)
            },
            onDragLeave: () => setDragOver(false),
            onDrop: handleDrop,
        }
        : {}

    return (
        <div
            {...dropProps}
            className={`relative rounded-2xl border bg-white p-5 transition dark:bg-slate-900 ${
                dragOver ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-slate-200 dark:border-slate-800'
            }`}
        >
            {images.length > 0 ? (
                <div className="space-y-3">
                    <div className="group relative aspect-video overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        <img src={mainImageUrl} alt={alt} className="h-full w-full object-contain" />
                        {editable && (
                            <button
                                type="button"
                                onClick={() => removeAt(active)}
                                aria-label={t('imageUpload.removeImage')}
                                className="absolute right-2 top-2 rounded-full bg-slate-900/60 p-1.5 text-white opacity-0 transition hover:bg-rose-600 focus:opacity-100 group-hover:opacity-100"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {(images.length > 1 || editable) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {images.map((key, i) => (
                                <GalleryThumbnail
                                    key={`${key}-${i}`}
                                    imageKey={key}
                                    active={i === active}
                                    alt={`${alt} ${i + 1}`}
                                    onClick={() => setActiveImage(i)}
                                    onRemove={editable ? () => removeAt(i) : null}
                                    removeLabel={t('imageUpload.removeImage')}
                                />
                            ))}
                            {editable && (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    title={t('imageUpload.addImages')}
                                    aria-label={t('imageUpload.addImages')}
                                    className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-700 dark:hover:border-teal-500"
                                >
                                    <Plus className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : editable ? (
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                    className="flex h-full min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center transition hover:border-teal-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-teal-600 dark:text-teal-400">{t('imageUpload.clickToUpload')}</span>{' '}
                        {t('imageUpload.orDragDrop')}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('imageUpload.hint', { types: ACCEPTED_LABEL })}</p>
                </div>
            ) : (
                <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                    <ImageOff className="h-8 w-8" />
                    <span className="text-sm">{t('productDetail.noImages')}</span>
                </div>
            )}

            {editable && (
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleInputChange} />
            )}

            {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

            {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-slate-900/70">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                </div>
            )}
        </div>
    )
}
