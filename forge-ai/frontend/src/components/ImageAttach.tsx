// Image attachment controls shared by Chat and Agent inputs.
// Uploads immediately (backend runs OCR) and shows a chip per image with a
// badge for how the model will see it: extracted text vs. the image itself.

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { ImagePlus, X, FileText, Eye, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export interface UploadedImage {
  url: string
  originalName: string
  hasText: boolean
  text: string
}

// uploads live on the backend origin (strip the /api suffix)
export const backendOrigin = (api.defaults.baseURL ?? '').replace(/\/api\/?$/, '')

interface SharedProps {
  images: UploadedImage[]
  onChange: (images: UploadedImage[]) => void
  disabled?: boolean
}

/** Chips row — render above the text input when images are attached. */
export function ImageChips({ images, onChange }: SharedProps) {
  if (!images.length) return null
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {images.map((img, i) => (
        <div
          key={img.url}
          className="flex items-center gap-2 bg-surface-800 border border-surface-600 rounded-lg pl-1 pr-2 py-1"
          title={img.hasText ? `Text extracted — the AI reads this as text:\n${img.text.slice(0, 300)}` : 'No text detected — sent to the AI as an image'}
        >
          <img
            src={`${backendOrigin}${img.url}`}
            alt={img.originalName}
            className="w-8 h-8 rounded object-cover"
          />
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-300 max-w-[110px] truncate">{img.originalName}</span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500">
              {img.hasText ? <><FileText size={8} /> text extracted</> : <><Eye size={8} /> vision</>}
            </span>
          </div>
          <button
            onClick={() => onChange(images.filter((_, idx) => idx !== i))}
            className="text-zinc-600 hover:text-red-400 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Downscale large images client-side: models cap request size, and a 4MB
 *  screenshot as base64 blows the limit. GIFs pass through (animation). */
async function downscale(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.type === 'image/gif' || file.size < 250_000) return { blob: file, name: file.name }
  try {
    const img = await createImageBitmap(file)
    const MAX_DIM = 1280
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
    if (scale === 1 && file.size < 800_000) return { blob: file, name: file.name }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob) return { blob: file, name: file.name }
    return { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg' }
  } catch {
    return { blob: file, name: file.name }
  }
}

/** Attach button — render inside the input row next to the send button. */
export default function ImageAttachButton({ images, onChange, disabled }: SharedProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const added: UploadedImage[] = []
      for (const file of Array.from(files).slice(0, 4)) {
        const { blob, name } = await downscale(file)
        const form = new FormData()
        form.append('image', blob, name)
        const { data } = await api.post('/uploads/image', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        added.push({ url: data.url, originalName: data.originalName, hasText: data.hasText, text: data.text })
      }
      onChange([...images, ...added])
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Image upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        title="Attach images — text in them is extracted automatically"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors shrink-0 disabled:opacity-50"
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
      </button>
    </>
  )
}
