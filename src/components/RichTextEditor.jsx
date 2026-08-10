import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react'

/**
 * Lightweight WYSIWYG editor built on contentEditable + document.execCommand — no external dependency,
 * in keeping with the app's hand-rolled components. Emits HTML via onChange. Produces simple, email-safe
 * markup (<b>, <i>, <u>, <ul>/<ol>, <a>).
 *
 * Semi-controlled: the DOM is only rewritten from `value` when the editor is NOT focused (e.g. when a
 * template is selected), so typing never resets the caret.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = '10rem', id }) {
    const { t } = useTranslation()
    const ref = useRef(null)

    // Push external value changes into the DOM only while the user isn't typing in it.
    useEffect(() => {
        const el = ref.current
        if (!el) return
        if (document.activeElement !== el && el.innerHTML !== (value || '')) {
            el.innerHTML = value || ''
        }
    }, [value])

    const emit = () => onChange?.(ref.current?.innerHTML || '')

    const exec = (command, arg) => {
        ref.current?.focus()
        document.execCommand(command, false, arg)
        emit()
    }

    const addLink = () => {
        const url = window.prompt(t('richText.linkPrompt'), 'https://')
        if (url) exec('createLink', url)
    }

    const buttons = [
        { icon: Bold, label: t('richText.bold'), onClick: () => exec('bold') },
        { icon: Italic, label: t('richText.italic'), onClick: () => exec('italic') },
        { icon: Underline, label: t('richText.underline'), onClick: () => exec('underline') },
        { icon: List, label: t('richText.bulletList'), onClick: () => exec('insertUnorderedList') },
        { icon: ListOrdered, label: t('richText.numberedList'), onClick: () => exec('insertOrderedList') },
        { icon: Link2, label: t('richText.link'), onClick: addLink },
        { icon: RemoveFormatting, label: t('richText.clearFormatting'), onClick: () => exec('removeFormat') },
    ]

    return (
        <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
            <div className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                {buttons.map(({ icon: Icon, label, onClick }) => (
                    <button
                        key={label}
                        type="button"
                        title={label}
                        aria-label={label}
                        // preventDefault keeps focus (and the text selection) in the editor so the command applies.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onClick}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Icon className="h-4 w-4" />
                    </button>
                ))}
            </div>
            <div
                id={id}
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                onInput={emit}
                data-placeholder={placeholder}
                style={{ minHeight }}
                className="w-full overflow-y-auto px-4 py-2.5 text-sm outline-none dark:bg-slate-950
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                    [&_a]:text-teal-600 [&_a]:underline dark:[&_a]:text-teal-400
                    empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
            />
        </div>
    )
}
