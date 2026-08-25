import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import Modal from './Modal'

/** Side of the square the crop is written out at. Comfortably above the largest place it is drawn (80px). */
const OUTPUT_SIZE = 512

/** Editor size in CSS pixels. Fixed, so the maths below never has to read layout. */
const VIEW = 288

/**
 * Frames a picked photo inside the circle it will actually be shown in.
 *
 * A face is rarely in the middle of the frame, and `object-fit: cover` on a wide photo crops to the
 * centre regardless — so uploading a perfectly good picture often produced an avatar of someone's
 * shoulder. Here the crop is chosen rather than assumed: drag to move, slider or buttons to zoom, and
 * what the preview shows is what gets stored.
 *
 * The result is written to a canvas and handed back as a square JPEG blob, so the file that reaches
 * storage is the crop — not the original with crop coordinates that every reader would have to honour.
 */
export default function AvatarCropModal({ file, isOpen, onCancel, onConfirm, busy = false }) {
    const { t } = useTranslation()
    const [image, setImage] = useState(null)
    const [zoom, setZoom] = useState(1)
    // Offset of the image centre from the frame centre, in CSS pixels.
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const drag = useRef(null)
    const canvasRef = useRef(null)

    // Decode the picked file. The object URL is revoked on cleanup so editing several photos in a row
    // does not leak one blob per attempt. Nothing is reset here - the parent keys this component by file,
    // so a new pick is a new component with zoom and offset already at their defaults.
    useEffect(() => {
        if (!file) return undefined
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => setImage(img)
        img.src = url
        return () => URL.revokeObjectURL(url)
    }, [file])

    // The scale at which the photo exactly fills the frame — zoom 1 means "no gaps", and every zoom
    // above it is the user choosing to crop in further.
    const baseScale = image ? Math.max(VIEW / image.width, VIEW / image.height) : 1
    const scale = baseScale * zoom

    /** Keeps the frame covered: the picture can never be dragged far enough to show a corner of nothing. */
    const clamp = (next) => {
        if (!image) return next
        const maxX = Math.max(0, (image.width * scale - VIEW) / 2)
        const maxY = Math.max(0, (image.height * scale - VIEW) / 2)
        return {
            x: Math.min(maxX, Math.max(-maxX, next.x)),
            y: Math.min(maxY, Math.max(-maxY, next.y)),
        }
    }

    const view = clamp(offset)

    const onPointerDown = (event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, y: event.clientY, from: view }
    }

    const onPointerMove = (event) => {
        if (!drag.current) return
        setOffset(clamp({
            x: drag.current.from.x + (event.clientX - drag.current.x),
            y: drag.current.from.y + (event.clientY - drag.current.y),
        }))
    }

    const onPointerUp = () => {
        drag.current = null
    }

    /**
     * Renders the visible crop at {@link OUTPUT_SIZE} and hands back a JPEG blob.
     *
     * The canvas is the same square as the frame, scaled up: every measurement below is the on-screen one
     * multiplied by the same ratio, so what was framed is what is written.
     */
    const confirm = () => {
        if (!image) return
        const canvas = canvasRef.current
        canvas.width = OUTPUT_SIZE
        canvas.height = OUTPUT_SIZE
        const ctx = canvas.getContext('2d')
        // JPEG has no alpha, so an un-painted canvas would come out black rather than transparent.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

        const ratio = OUTPUT_SIZE / VIEW
        const drawWidth = image.width * scale * ratio
        const drawHeight = image.height * scale * ratio
        ctx.drawImage(
            image,
            OUTPUT_SIZE / 2 - drawWidth / 2 + view.x * ratio,
            OUTPUT_SIZE / 2 - drawHeight / 2 + view.y * ratio,
            drawWidth,
            drawHeight,
        )
        canvas.toBlob((blob) => blob && onConfirm(blob), 'image/jpeg', 0.9)
    }

    return (
        <Modal isOpen={isOpen} onClose={onCancel} title={t('avatar.cropTitle')} width="max-w-lg">
            <div className="space-y-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">{t('avatar.cropHint')}</p>

                <div className="flex justify-center">
                    <div
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        style={{ width: VIEW, height: VIEW }}
                        className="relative cursor-grab touch-none overflow-hidden rounded-full bg-slate-100 active:cursor-grabbing dark:bg-slate-800"
                    >
                        {image ? (
                            <img
                                src={image.src}
                                alt=""
                                draggable={false}
                                style={{
                                    width: image.width * scale,
                                    height: image.height * scale,
                                    transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
                                }}
                                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        )}
                        {/* The ring is the only thing telling you the crop is round, since the frame it
                            sits on is already clipped to a circle. */}
                        <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/70 dark:ring-slate-900/70" />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(2))))}
                        aria-label={t('avatar.zoomOut')}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.01"
                        value={zoom}
                        onChange={(event) => setZoom(Number(event.target.value))}
                        aria-label={t('avatar.zoom')}
                        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-600 dark:bg-slate-700"
                    />
                    <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(3, Number((z + 0.2).toFixed(2))))}
                        aria-label={t('avatar.zoomIn')}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!image || busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('avatar.usePicture')}
                    </button>
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
        </Modal>
    )
}
