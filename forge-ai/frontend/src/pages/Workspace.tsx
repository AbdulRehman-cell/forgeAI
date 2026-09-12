import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useWorkspaceStore } from '@/store/workspaceStore'
import FileTree from '@/components/workspace/FileTree'
import TaskPanel from '@/components/workspace/TaskPanel'
import ChatPanel from '@/components/workspace/ChatPanel'
import DiffViewer from '@/components/workspace/DiffViewer'
import FileViewer from '@/components/workspace/FileViewer'
import AgentPanel from '@/components/workspace/AgentPanel'
import TerminalPanel from '@/components/workspace/TerminalPanel'
import { Zap, MessageSquare, GitCompare, Loader2, X, FileCode2, Bot, TerminalSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Task } from '@/types'
import AIActionsMenu from '@/components/workspace/AIActionsMenu'
import DependencyGraph from '@/components/workspace/DependencyGraph'
import { GitFork } from 'lucide-react'

type Tab = 'chat' | 'agent' | 'diff' | 'graph'

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Draggable vertical divider between workspace panels. Double-click resets. */
function ResizeHandle({ onDrag, onReset }: { onDrag: (dx: number) => void; onReset: () => void }) {
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    let last = e.clientX
    const move = (ev: PointerEvent) => { onDrag(ev.clientX - last); last = ev.clientX }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  return (
    <div
      onPointerDown={startDrag}
      onDoubleClick={onReset}
      title="Drag to resize · double-click to reset"
      className="group relative w-[5px] -mx-[2px] z-10 shrink-0 cursor-col-resize"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-surface-700 group-hover:w-[3px] group-hover:bg-brand-500 group-active:bg-brand-400 transition-all" />
    </div>
  )
}

function usePanelWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key))
    return saved ? clamp(saved, min, max) : initial
  })
  useEffect(() => { localStorage.setItem(key, String(width)) }, [key, width])
  const resize = (dx: number) => setWidth((w) => clamp(w + dx, min, max))
  const reset = () => setWidth(initial)
  return { width, resize, reset }
}

export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('chat')
  const [liveTask, setLiveTask] = useState<Task | null>(null)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalMounted, setTerminalMounted] = useState(false) // keep the shell alive when hidden
  const { setTaskRunning, activeFile, setActiveFile } = useWorkspaceStore()
  const qc = useQueryClient()

  // Resizable panel widths (persisted across sessions)
  const tree = usePanelWidth('ws-tree-width', 240, 160, 440)
  const panel = usePanelWidth('ws-panel-width', 320, 240, 560)

  const { data: repo } = useQuery({
    queryKey: ['repo', id],
    queryFn: () => api.get(`/repositories/${id}`).then((r) => r.data.repository),
  })

  // ── Load last task from DB on mount so changes survive page reload ──
  const { data: savedTask } = useQuery({
    queryKey: ['last-task', id],
    queryFn: () =>
      api.get(`/tasks?repositoryId=${id}&limit=1`).then((r) => r.data.tasks?.[0] ?? null),
    enabled: !!id,
    staleTime: 0,
  })

  // Live task wins; fall back to DB task on reload
  const task: Task | null = liveTask ?? savedTask ?? null

  // ── Fix Workspace ──────────────────────────────────────────────
  const fixMutation = useMutation({
    mutationFn: () => api.post('/tasks/fix-workspace', { repositoryId: id }),
    onSuccess: ({ data }) => {
      setLiveTask(data.task)
      setTaskRunning(true, data.task._id)
      setTab('diff')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to start task'),
  })

  // ── Socket live updates ────────────────────────────────────────
  useEffect(() => {
    const taskId = liveTask?._id ?? savedTask?._id
    if (!taskId) return
    const socket = getSocket()
    socket.emit('subscribe:task', taskId)
    socket.on('task:update', (updated: Task) => {
      setLiveTask(updated)
      if (updated.status === 'completed' || updated.status === 'failed') {
        setTaskRunning(false)
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['last-task', id] })
        // Refresh the file tree so new/modified files appear immediately
        qc.invalidateQueries({ queryKey: ['filetree', id] })
        if (updated.status === 'completed')
          toast.success(updated.type === 'agent'
            ? `🤖 Agent finished — ${updated.changes?.length ?? 0} file(s) changed`
            : `✅ Fixed ${updated.changes?.length ?? 0} file(s)!`)
        else toast.error('Task failed — check the logs')
      }
    })
    return () => {
      socket.off('task:update')
      socket.emit('unsubscribe:task', taskId)
    }
  }, [liveTask?._id, savedTask?._id])

  const isRunning = fixMutation.isPending || task?.status === 'running'

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── File Tree ── */}
      <div style={{ width: tree.width }} className="flex flex-col shrink-0 overflow-hidden">
        <div className="p-3 border-b border-surface-700 shrink-0">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Explorer</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {id && <FileTree repositoryId={id} />}
        </div>
      </div>

      <ResizeHandle onDrag={tree.resize} onReset={tree.reset} />

      {/* ── Center panel ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-700 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-300 truncate">{repo?.fullName}</p>
          </div>
          <button
            onClick={() => {
              setShowTerminal((v) => !v)
              setTerminalMounted(true)
            }}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0',
              showTerminal
                ? 'border-brand-500/50 text-brand-400 bg-brand-500/10'
                : 'border-surface-600 text-zinc-400 hover:text-zinc-200',
            )}
            title="Toggle terminal"
          >
            <TerminalSquare size={13} /> Terminal
          </button>
          <button
            onClick={() => fixMutation.mutate()}
            disabled={isRunning}
            className="btn-primary flex items-center gap-2 shrink-0 text-xs"
          >
            {isRunning
              ? <><Loader2 size={13} className="animate-spin" /> Fixing…</>
              : <><Zap size={13} /> Fix Workspace</>
              
            }
          </button>
        
<AIActionsMenu repositoryId={id!} onTaskStarted={(t) => { setLiveTask(t); setTab('diff') }} />

        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-surface-700 px-3 shrink-0">
          {([['chat', 'Chat', MessageSquare], ['agent', 'Agent', Bot], ['diff', 'Changes', GitCompare], ['graph', 'Graph', GitFork]] as const).map(
            ([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => { setTab(key); setActiveFile(null) }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                  tab === key && !activeFile
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Icon size={12} />
                {label}
                {key === 'diff' && (task?.changes?.length ?? 0) > 0 && (
                  <span className="ml-1 bg-brand-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                    {task!.changes.length}
                  </span>
                )}
              </button>
            ),
          )}

          {/* File viewer tab — appears when a file is open */}
          {activeFile && (
            <div className="flex items-center gap-1.5 px-3 py-2 ml-1 border-b-2 border-brand-500 text-brand-400 text-xs">
              <FileCode2 size={12} />
              <span className="font-mono max-w-[140px] truncate">{activeFile.split('/').pop()}</span>
              <button
                onClick={() => setActiveFile(null)}
                className="ml-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          )}
        </div>

        {/* Content — all panels always mounted to preserve state */}
        <div className="flex-1 overflow-hidden relative">
          {/* Chat panel */}
          <div className={clsx('absolute inset-0', tab === 'chat' && !activeFile ? 'block' : 'hidden')}>
            {id && <ChatPanel repositoryId={id} />}
          </div>

          {/* Agent panel — Claude Code-style autonomous sessions */}
          <div className={clsx('absolute inset-0', tab === 'agent' && !activeFile ? 'block' : 'hidden')}>
            {id && (
              <AgentPanel
                repositoryId={id}
                task={task}
                onTaskStarted={(t) => { setLiveTask(t); setTaskRunning(true, t._id) }}
              />
            )}
          </div>

          {/* Diff panel */}
          <div className={clsx('absolute inset-0', tab === 'diff' && !activeFile ? 'block' : 'hidden')}>
            {task
              ? <DiffViewer task={task} repositoryId={id!} />
              : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <GitCompare size={28} className="text-zinc-700" />
                  <p className="text-zinc-500 text-sm">No changes yet</p>
                  <p className="text-zinc-600 text-xs">Run Fix Workspace to see diffs here</p>
                  <button
                    onClick={() => fixMutation.mutate()}
                    disabled={isRunning}
                    className="btn-primary text-xs flex items-center gap-1.5 mt-1"
                  >
                    <Zap size={12} /> Fix Workspace
                  </button>
                </div>
              )
            }
          </div>

          {/* Dependency graph */}
          <div className={clsx('absolute inset-0', tab === 'graph' && !activeFile ? 'block' : 'hidden')}>
            {id && tab === 'graph' && (
              <DependencyGraph
                repositoryId={id}
                onFileOpen={(path) => { setActiveFile(path) }}
              />
            )}
          </div>

          {/* File viewer — shown when a file is clicked in the tree */}
          {activeFile && id && (
            <div className="absolute inset-0">
              <FileViewer repositoryId={id} filePath={activeFile} />
            </div>
          )}
        </div>

        {/* Terminal — real shell in the workspace folder; stays mounted so the session survives toggling */}
        {terminalMounted && id && (
          <div className={clsx('h-60 border-t border-surface-700 shrink-0', !showTerminal && 'hidden')}>
            <TerminalPanel repositoryId={id} />
          </div>
        )}
      </div>

      {/* ── Task log panel ── */}
      {task && (
        <>
          <ResizeHandle onDrag={(dx) => panel.resize(-dx)} onReset={panel.reset} />
          <div style={{ width: panel.width }} className="shrink-0 overflow-hidden">
            <TaskPanel task={task} />
          </div>
        </>
      )}
    </div>
  )
}