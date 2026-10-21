import { useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspaceStore'
import {
  ChevronRight, ChevronDown, Loader2, RefreshCw,
  FileText, Folder, FolderOpen, FileCode2, FileJson, FileType2, Braces, Upload
} from 'lucide-react'
import clsx from 'clsx'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import type { FileNode } from '@/types'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache'])

interface Props { repositoryId: string }

export default function FileTree({ repositoryId }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['filetree', repositoryId],
    queryFn: () => api.get(`/repositories/${repositoryId}/tree`).then((r) => r.data.tree),
    refetchInterval: (q) => (!q.state.data?.length && !q.state.error) ? 4000 : false,
    retry: 2,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['filetree', repositoryId] })

  const isWorkspaceLost = (error as any)?.response?.data?.code === 'WORKSPACE_LOST'

  const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const toastId = toast.loading('Re-uploading workspace…')
    try {
      const zip = new JSZip()
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]
        const rel = f.webkitRelativePath || f.name
        if (rel.split('/').some((p: string) => SKIP.has(p))) continue
        if (f.size > 10 * 1024 * 1024) continue
        zip.file(rel, f)
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      const form = new FormData()
      form.append('project', blob, 'project.zip')
      await api.post(`/local/reupload-zip/${repositoryId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Workspace restored', { id: toastId })
      refresh()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Re-upload failed', { id: toastId })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (isLoading) return (
    <div className="p-4 flex justify-center">
      <Loader2 size={14} className="animate-spin text-zinc-600" />
    </div>
  )

  if (isError) return (
    <div className="p-4 text-xs text-center leading-relaxed space-y-3">
      <p className="text-red-400/80">
        {(error as any)?.response?.data?.message ?? 'Could not load files.'}
      </p>
      {isWorkspaceLost ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleReupload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-medium transition-colors"
          >
            <Upload size={11} /> Re-upload Folder
          </button>
        </>
      ) : (
        <button onClick={refresh} className="flex items-center gap-1 mx-auto text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw size={11} /> Retry
        </button>
      )}
    </div>
  )

  if (!data?.length) return (
    <div className="p-4 text-xs text-zinc-600 text-center leading-relaxed space-y-2">
      <Loader2 size={12} className="animate-spin mx-auto text-zinc-700" />
      <p>Loading files…</p>
      <button onClick={refresh} className="flex items-center gap-1 mx-auto text-zinc-500 hover:text-zinc-300 transition-colors">
        <RefreshCw size={11} /> Refresh
      </button>
    </div>
  )

  return (
    <div className="py-1 select-none">
      {data.map((node: FileNode) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx'].includes(ext)) return <FileCode2 size={12} className="text-blue-400 shrink-0" />
  if (['js', 'jsx'].includes(ext)) return <FileCode2 size={12} className="text-yellow-400 shrink-0" />
  if (ext === 'json') return <FileJson size={12} className="text-yellow-300 shrink-0" />
  if (['css', 'scss'].includes(ext)) return <FileType2 size={12} className="text-pink-400 shrink-0" />
  if (ext === 'py') return <FileCode2 size={12} className="text-green-400 shrink-0" />
  if (['html', 'ejs', 'jsx'].includes(ext)) return <Braces size={12} className="text-orange-300 shrink-0" />
  if (ext === 'md') return <FileText size={12} className="text-zinc-400 shrink-0" />
  return <FileText size={12} className="text-zinc-500 shrink-0" />
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const { expandedDirs, toggleDir, activeFile, setActiveFile } = useWorkspaceStore()
  const isExpanded = expandedDirs.has(node.path)
  const isActive = activeFile === node.path

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => toggleDir(node.path)}
          style={{ paddingLeft: `${depth * 10 + 6}px` }}
          className="w-full flex items-center gap-1.5 py-[3px] pr-2 text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-surface-700 transition-colors group"
        >
          <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors">
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          {isExpanded
            ? <FolderOpen size={12} className="text-brand-400/80 shrink-0" />
            : <Folder size={12} className="text-zinc-600 shrink-0" />
          }
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isExpanded && node.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => setActiveFile(isActive ? null : node.path)}
      style={{ paddingLeft: `${depth * 10 + 18}px` }}
      className={clsx(
        'w-full flex items-center gap-1.5 py-[3px] pr-2 text-[11px] transition-colors',
        isActive
          ? 'bg-brand-600/15 text-brand-300 border-l-2 border-brand-500'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-700',
      )}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  )
}