import { useRef, useEffect } from 'react'
import type { Task } from '@/types'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Props { task: Task }

export default function TaskPanel({ task }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [task.logs])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-surface-700">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Task Log</p>
          <StatusIcon status={task.status} />
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-1">{task.progress}% complete</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {task.logs.map((log, i) => (
          <div
            key={i}
            className={clsx(
              'flex gap-2',
              log.level === 'error' && 'text-red-400',
              log.level === 'warn' && 'text-yellow-400',
              log.level === 'info' && 'text-zinc-400',
            )}
          >
            <span className="text-zinc-600 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {task.summary && (
        <div className="p-4 border-t border-surface-700 bg-emerald-500/5">
          <p className="text-xs font-semibold text-emerald-400 mb-1">Summary</p>
          <p className="text-xs text-zinc-400">{task.summary}</p>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-emerald-400" />
  if (status === 'failed') return <XCircle size={14} className="text-red-400" />
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-brand-400" />
  return null
}
