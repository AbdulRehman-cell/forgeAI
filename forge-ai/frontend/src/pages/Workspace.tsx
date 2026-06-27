import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useWorkspaceStore } from '@/store/workspaceStore'
import FileTree from '@/components/workspace/FileTree'
import TaskPanel from '@/components/workspace/TaskPanel'
import ChatPanel from '@/components/workspace/ChatPanel'
import DiffViewer from '@/components/workspace/DiffViewer'
import { Zap, MessageSquare, GitCompare, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Task, FileChange } from '@/types'

type Tab = 'chat' | 'diff'

export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('chat')
  const [task, setTask] = useState<Task | null>(null)
  const { setTaskRunning } = useWorkspaceStore()
  const qc = useQueryClient()

  const { data: repo } = useQuery({
    queryKey: ['repo', id],
    queryFn: () => api.get(`/repositories/${id}`).then((r) => r.data.repository),
  })

  const fixMutation = useMutation({
    mutationFn: () => api.post(`/tasks/fix-workspace`, { repositoryId: id }),
    onSuccess: ({ data }) => {
      setTask(data.task)
      setTaskRunning(true, data.task._id)
      setTab('diff')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to start task'),
  })

  // Live task updates via socket
  useEffect(() => {
    if (!task?._id) return
    const socket = getSocket()
    socket.emit('subscribe:task', task._id)

    socket.on('task:update', (updated: Task) => {
      setTask(updated)
      if (updated.status === 'completed' || updated.status === 'failed') {
        setTaskRunning(false)
        qc.invalidateQueries({ queryKey: ['tasks'] })
        if (updated.status === 'completed') toast.success('Fix complete!')
        else toast.error('Task failed')
      }
    })

    return () => {
      socket.off('task:update')
      socket.emit('unsubscribe:task', task._id)
    }
  }, [task?._id])

  return (
    <div className="flex h-full">
      {/* File Tree */}
      <div className="w-60 border-r border-surface-700 overflow-auto shrink-0">
        <div className="p-3 border-b border-surface-700">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Explorer</p>
        </div>
        {id && <FileTree repositoryId={id} />}
      </div>

      {/* Center panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-300">{repo?.fullName}</p>
          </div>
          <button
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending || task?.status === 'running'}
            className="btn-primary flex items-center gap-2"
          >
            {fixMutation.isPending || task?.status === 'running' ? (
              <><Loader2 size={14} className="animate-spin" /> Fixing…</>
            ) : (
              <><Zap size={14} /> Fix Workspace</>
            )}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-700 px-4">
          {([['chat', 'Chat', MessageSquare], ['diff', 'Changes', GitCompare]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon size={13} /> {label}
              {key === 'diff' && task?.changes?.length ? (
                <span className="ml-1 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {task.changes.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {tab === 'chat' && id && <ChatPanel repositoryId={id} />}
          {tab === 'diff' && task && <DiffViewer task={task} repositoryId={id!} />}
        </div>
      </div>

      {/* Task log panel */}
      {task && (
        <div className="w-80 border-l border-surface-700 shrink-0">
          <TaskPanel task={task} />
        </div>
      )}
    </div>
  )
}
