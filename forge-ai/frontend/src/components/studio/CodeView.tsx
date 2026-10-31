// The site's files, read-only: a file tree and the selected file. Editing lives in the Workspace.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileText, Folder, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { FileNode } from '@/types'

// Pictures and fonts are not text: reading them as code only shows garbage
const isBinary = (p: string) => /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|eot|mp4|mp3|pdf|zip)$/i.test(p)

function Node({ node, depth, selected, onPick }: { node: FileNode; depth: number; selected: string; onPick: (p: string) => void }) {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: 10 + depth * 14 }
  if (node.type === 'directory') {
    return (
      <>
        <button onClick={() => setOpen(!open)} style={{ ...pad, color: 'var(--text-2)' }} className="w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left hover:bg-black/5 dark:hover:bg-white/5">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={12} /><span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} selected={selected} onPick={onPick} />)}
      </>
    )
  }
  return (
    <button
      onClick={() => onPick(node.path)}
      style={{ ...pad, color: selected === node.path ? 'var(--text)' : 'var(--text-2)', background: selected === node.path ? 'var(--bg-raised)' : undefined }}
      className="w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left hover:bg-black/5 dark:hover:bg-white/5"
    >
      <FileText size={12} className="ml-[18px] shrink-0" /><span className="truncate">{node.name}</span>
    </button>
  )
}

export default function CodeView({ repositoryId, version }: { repositoryId?: string; version: string }) {
  const [path, setPath] = useState('')
  const { data: tree, isLoading, isError } = useQuery({
    queryKey: ['studio-tree', repositoryId, version],
    queryFn: () => api.get(`/repositories/${repositoryId}/tree`).then((r) => r.data.tree as FileNode[]),
    enabled: !!repositoryId,
    retry: false,
  })
  const { data: content, isFetching } = useQuery({
    queryKey: ['studio-file', repositoryId, path, version],
    queryFn: () => api.get(`/repositories/${repositoryId}/file`, { params: { path } }).then((r) => r.data.content as string),
    enabled: !!repositoryId && !!path && !isBinary(path),
    retry: false,
  })

  // Open the home page first
  useEffect(() => {
    if (path || !tree) return
    const home = tree.find((n) => n.name === 'index.html') ?? tree.find((n) => n.type === 'file')
    if (home) setPath(home.path)
  }, [tree, path])

  if (!repositoryId || isError) {
    return <div className="h-full grid place-items-center text-sm px-6 text-center" style={{ color: 'var(--text-3)' }}>The code appears here once your site is built.</div>
  }
  return (
    <div className="h-full flex min-h-0">
      <div className="w-56 shrink-0 overflow-y-auto py-2 border-r" style={{ borderColor: 'var(--border)' }}>
        {isLoading ? <Loader2 size={14} className="animate-spin m-3" /> : tree?.map((n) => <Node key={n.path} node={n} depth={0} selected={path} onPick={setPath} />)}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 py-2 text-xs font-mono border-b truncate" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>{path}</div>
        <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed font-mono" style={{ color: 'var(--text)' }}>
          {isBinary(path) ? 'This file is not text, so it cannot be shown here.' : isFetching && content === undefined ? 'Loading…' : content}
        </pre>
      </div>
    </div>
  )
}
