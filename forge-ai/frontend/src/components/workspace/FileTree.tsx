import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { FileNode } from '@/types'

interface Props { repositoryId: string }

export default function FileTree({ repositoryId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['filetree', repositoryId],
    queryFn: () => api.get(`/repositories/${repositoryId}/tree`).then((r) => r.data.tree),
  })

  if (isLoading) return <div className="p-4 flex justify-center"><Loader2 size={14} className="animate-spin text-zinc-500" /></div>

  return (
    <div className="py-1">
      {data?.map((node: FileNode) => <TreeNode key={node.path} node={node} depth={0} />)}
    </div>
  )
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
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="w-full flex items-center gap-1.5 py-0.5 pr-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 transition-colors"
        >
          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {isExpanded ? <FolderOpen size={12} className="text-brand-400 shrink-0" /> : <Folder size={12} className="text-zinc-500 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => setActiveFile(node.path)}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      className={clsx(
        'w-full flex items-center gap-1.5 py-0.5 pr-2 text-xs transition-colors',
        isActive
          ? 'bg-brand-600/20 text-brand-300'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-700',
      )}
    >
      <File size={11} className="shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}
