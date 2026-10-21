import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { api } from '@/lib/api'
import { FolderOpen, X, Loader2, Upload } from 'lucide-react'

interface Props {
  onClose: () => void
  onSelect: (repositoryId: string, repositoryData: any) => void
  busy?: boolean
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache'])

/** Browser-native folder picker — works from any device against a remote backend. */
export default function LocalFolderPicker({ onClose, onSelect }: Props) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'zipping' | 'uploading'>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = status !== 'idle'

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    setError('')
    setStatus('reading')

    try {
      const zip = new JSZip()
      let count = 0
      let skipped = 0

      setStatus('zipping')

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        // webkitRelativePath is like "project-name/src/index.ts"
        const rel = file.webkitRelativePath || file.name

        // Skip unwanted directories
        const parts = rel.split('/')
        if (parts.some(p => SKIP.has(p))) { skipped++; continue }

        // Skip large files (>10 MB)
        if (file.size > 10 * 1024 * 1024) { skipped++; continue }

        zip.file(rel, file)
        count++

        if (count % 50 === 0) setProgress(`Packing ${count} files…`)
      }

      setProgress(`Uploading ${count} files…`)
      setStatus('uploading')

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      const form = new FormData()
      form.append('project', blob, 'project.zip')

      const { data } = await api.post('/local/upload-zip', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      onSelect(data.repository._id, data.repository)
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Upload failed')
      setStatus('idle')
    }

    if (inputRef.current) inputRef.current.value = ''
  }

  const statusLabel = {
    idle: '',
    reading: 'Reading folder…',
    zipping: progress || 'Compressing…',
    uploading: progress || 'Uploading…',
  }[status]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card p-0 w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <h2 className="font-semibold text-zinc-100">Open Local Folder</h2>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <FolderOpen size={32} className="text-brand-400" />
          </div>

          <div className="text-center">
            <p className="text-zinc-200 font-medium mb-1">Select your project folder</p>
            <p className="text-zinc-500 text-sm">
              Forge AI will read the folder contents, compress them, and upload to the server.
              Works from any device.
            </p>
          </div>

          {/* Hidden input */}
          <input
            ref={inputRef}
            type="file"
            // @ts-ignore — webkitdirectory is non-standard but universally supported
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleFiles}
          />

          {busy ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 size={24} className="animate-spin text-brand-400" />
              <p className="text-sm text-zinc-400">{statusLabel}</p>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="btn-primary flex items-center gap-2 px-6 py-2.5"
            >
              <Upload size={15} /> Choose Folder
            </button>
          )}

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <p className="text-[11px] text-zinc-600 text-center">
            node_modules, .git, dist, and build folders are skipped automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
