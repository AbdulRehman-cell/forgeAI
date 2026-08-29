import { useRef, useEffect } from 'react'
import type { Task } from '@/types'
import { CheckCircle2, XCircle, Loader2, Globe, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import Markdown from '@/components/Markdown'

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

      {task.metadata?.deploymentUrl && (
        <a
          href={task.metadata.deploymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 mx-3 mb-3 p-3 rounded-xl bg-gradient-to-r from-emerald-600/20 to-brand-600/15 border border-emerald-500/40 hover:border-emerald-400/70 transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Globe size={14} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-300">Your site is live</p>
            <p className="text-[11px] text-zinc-400 truncate">{task.metadata.deploymentUrl}</p>
          </div>
          <ExternalLink size={13} className="text-zinc-500 group-hover:text-emerald-400 shrink-0" />
        </a>
      )}

      {task.summary && (
  <div className="p-4 border-t border-surface-700 bg-emerald-500/5 max-h-80 overflow-y-auto">
    <p className="text-xs font-semibold text-emerald-400 mb-2">Summary</p>
    <Markdown content={task.summary} />
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
