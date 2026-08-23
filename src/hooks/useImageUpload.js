import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiUpload } from '../api/client'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB — keep in sync with backend multipart limit
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ACCEPTED_LABEL = 'JPG, PNG, GIF or WebP'

/**
 * Validates and uploads picked or dropped image files. Shared by the product form field and the
 * product detail gallery, which differ only in what they do with the resulting keys.
 *
 * `uploadFiles` never rejects: a rejected type/size lands in `error`, a failed request has already
 * raised the global error toast. It resolves to the stored keys, empty when nothing was uploaded.
 */
export function useImageUpload() {
    const { t } = useTranslation()
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')

    const uploadFiles = async (fileList) => {
        const files = Array.from(fileList || [])
        if (files.length === 0) return []
        setError('')

        const valid = []
        for (const file of files) {
            if (!ACCEPTED_TYPES.includes(file.type)) {
                setError(t('imageUpload.notSupported', { name: file.name, types: ACCEPTED_LABEL }))
                continue
            }
            if (file.size > MAX_SIZE) {
                setError(t('imageUpload.tooLarge', { name: file.name }))
                continue
            }
            valid.push(file)
        }
        if (valid.length === 0) return []

        setUploading(true)
        try {
            const results = await Promise.all(
                valid.map((file) => {
                    const formData = new FormData()
                    formData.append('file', file)
                    return apiUpload('/upload/image', formData)
                }),
            )
            return results.map((r) => r.key)
        } catch {
            return []
        } finally {
            setUploading(false)
        }
    }

    return { uploadFiles, uploading, error }
}
