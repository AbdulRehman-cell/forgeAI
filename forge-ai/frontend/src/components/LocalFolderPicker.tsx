import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Folder, HardDrive, Home, ArrowUp, Loader2, FolderOpen, X, CornerDownLeft } from 'lucide-react'

interface BrowseResponse {
  current: string
  parent: string | null
  home: string
  dirs: { name: string; path: string }[]
}

interface Props {
  onClose: () => void
  onSelect: (path: string) => void
  busy?: boolean
}

/** Server-backed folder browser — picks a folder on the machine the backend runs on. */
export default function LocalFolderPicker({ onClose, onSelect, busy }: Props) {
  const [current, setCurrent] = useState('')
  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, error } = useQuery<BrowseResponse>({
    queryKey: ['local-browse', current],
    queryFn: () => api.get('/local/browse', { params: { path: current } }).then((r) => r.data),
  })

  useEffect(() => {
    if (data?.current) setInputVal(data.current)
  }, [data?.current])

  const atRoot = !current

  const goToPath = () => {
    const p = inputVal.trim()
    if (p) setCurrent(p)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card p-0 w-full max-w-lg max-h-[75vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <h2 className="font-semibold text-zinc-100">Open Local Folder</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        {/* Path input — paste any path directly */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-700">
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && goToPath()}
            placeholder="Paste a path, e.g. C:\Users\You\Desktop\my-app"
            className="flex-1 bg-surface-800 border border-surface-600 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={goToPath}
            title="Go to path"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors shrink-0"
          >
            <CornerDownLeft size={12} /> Go
          </button>
        </div>

        {/* Nav bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-surface-700">
          <button
            onClick={() => { setCurrent(data?.parent ?? ''); setInputVal(data?.parent ?? '') }}
            disabled={atRoot}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp size={12} /> Up
          </button>
          <button
            onClick={() => { if (data?.home) { setCurrent(data.home); setInputVal(data.home) } }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 transition-colors"
          >
            <Home size={12} /> Home
          </button>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[240px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-zinc-500" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-400 p-4">Could not read this folder.</p>
          ) : data?.dirs.length === 0 ? (
            <p className="text-xs text-zinc-500 p-4">No subfolders here.</p>
          ) : (
            data?.dirs.map((dir) => (
              <button
                key={dir.path}
                onClick={() => { setCurrent(dir.path); setInputVal(dir.path) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-zinc-300 hover:bg-surface-700 transition-colors"
              >
                {atRoot
                  ? <HardDrive size={14} className="text-zinc-500 shrink-0" />
                  : <Folder size={14} className="text-brand-400 shrink-0" />}
                <span className="truncate">{dir.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-surface-700">
          <p className="text-[11px] text-zinc-600">
            Forge AI gets full read/write + terminal access to this folder.
          </p>
          <button
            onClick={() => data?.current && onSelect(data.current)}
            disabled={atRoot || busy || !data?.current}
            className="btn-primary flex items-center gap-2 text-xs shrink-0"
          >
            {busy
              ? <><Loader2 size={13} className="animate-spin" /> Opening…</>
              : <><FolderOpen size={13} /> Open this folder</>}
          </button>
        </div>
      </div>
    </div>
  )
}
