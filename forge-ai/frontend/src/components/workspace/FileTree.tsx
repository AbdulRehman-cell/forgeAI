import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspaceStore'
import {
  ChevronRight, ChevronDown, Loader2,
  FileText, Folder, FolderOpen, FileCode2, FileJson, FileType2, Braces
} from 'lucide-react'
import clsx from 'clsx'
import type { FileNode } from '@/types'

interface Props { repositoryId: string }

export default function FileTree({ repositoryId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['filetree', repositoryId],
    queryFn: () => api.get(`/repositories/${repositoryId}/tree`).then((r) => r.data.tree),
  })

  if (isLoading) return (
    <div className="p-4 flex justify-center">
      <Loader2 size={14} className="animate-spin text-zinc-600" />
    </div>
  )

  if (!data?.length) return (
    <div className="p-4 text-xs text-zinc-600 text-center leading-relaxed">
      No files found.<br />Repository may still be cloning.
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