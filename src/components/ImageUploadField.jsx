import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloud, X, Loader2 } from 'lucide-react'
import { usePresignedUrl } from '../hooks/usePresignedUrl'
import { useImageUpload, ACCEPTED_LABEL } from '../hooks/useImageUpload'

// One image's thumbnail — its own component so usePresignedUrl (a hook) can resolve each key
// independently while mapping over a dynamic list.
function Thumbnail({ imageKey, alt, onRemove, removeLabel }) {
    const url = usePresignedUrl(imageKey)
    return (
        <div className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <img src={url} alt={alt} className="h-full w-full object-cover" />
            <button
                type="button"
                onClick={onRemove}
                aria-label={removeLabel}
                className="absolute right-1 top-1 rounded-full bg-slate-900/60 p-1 text-white opacity-0 transition hover:bg-rose-600 group-hover:opacity-100"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

export default function ImageUploadField({ value = [], onChange, className = '' }) {
    const { t } = useTranslation()
    const { uploadFiles, uploading, error } = useImageUpload()
    const [dragOver, setDragOver] = useState(false)
    const fileRef = useRef(null)

    const addFiles = async (fileList) => {
        const keys = await uploadFiles(fileList)
        if (keys.length > 0) onChange([...value, ...keys])
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

    const removeAt = (index) => {
        onChange(value.filter((_, i) => i !== index))
    }

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t('imageUpload.label')}</label>

            <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                    dragOver
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                        : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                }`}
            >
                {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                ) : (
                    <UploadCloud className="h-6 w-6 text-slate-400" />
                )}
                <div className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-teal-600 dark:text-teal-400">{t('imageUpload.clickToUpload')}</span> {t('imageUpload.orDragDrop')}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    {t('imageUpload.hint', { types: ACCEPTED_LABEL })}
                </p>
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleInputChange}
            />

            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

            {value.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {value.map((key, index) => (
                        <Thumbnail
                            key={`${key}-${index}`}
                            imageKey={key}
                            alt={`${t('imageUpload.label')} ${index + 1}`}
                            onRemove={() => removeAt(index)}
                            removeLabel={t('imageUpload.removeImage')}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
