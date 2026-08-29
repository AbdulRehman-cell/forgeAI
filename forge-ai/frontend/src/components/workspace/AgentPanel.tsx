import { useRef, useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Task } from '@/types'
import { Bot, Loader2, Square, Send, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import Markdown from '@/components/Markdown'
import ImageAttachButton, { ImageChips, UploadedImage } from '@/components/ImageAttach'

interface Props {
  repositoryId: string
  task: Task | null
  onTaskStarted: (task: Task) => void
}

/**
 * Forge Agent — Claude Code-style autonomous sessions.
 * Type an instruction; the agent reads code, edits files, and runs terminal
 * commands in the workspace until it's done. Steps stream in live below.
 */
export default function AgentPanel({ repositoryId, task, onTaskStarted }: Props) {
  const [instruction, setInstruction] = useState('')
  const [attachedImages, setAttachedImages] = useState<UploadedImage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Only show agent tasks in this panel — other task types have their own UI
  const agentTask = task?.type === 'agent' ? task : null
  const isRunning = agentTask?.status === 'running' || agentTask?.status === 'pending'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentTask?.logs?.length, agentTask?.summary])

  const startMutation = useMutation({
    mutationFn: ({ text, images }: { text: string; images: UploadedImage[] }) =>
      api.post('/tasks/agent', { repositoryId, instruction: text, images }),
    onSuccess: ({ data }) => {
      onTaskStarted(data.task)
      setInstruction('')
      setAttachedImages([])
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to start the agent'),
  })

  const stopMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${agentTask!._id}/stop`),
    onSuccess: () => toast('Stopping after the current step…', { icon: '⏹' }),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not stop'),
  })

  const submit = () => {
    const text = instruction.trim()
    if ((!text && !attachedImages.length) || isRunning || startMutation.isPending) return
    startMutation.mutate({ text, images: attachedImages })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Session timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!agentTask && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <Bot size={30} className="text-zinc-700" />
            <p className="text-zinc-400 text-sm font-medium">Forge Agent</p>
            <p className="text-zinc-600 text-xs max-w-sm">
              Give it a job — "fix the failing tests", "add dark mode", "find and fix the login bug" —
              and it will read your code, edit files, and run commands in the terminal until it's done.
            </p>
          </div>
        )}

        {agentTask && (
          <>
            {/* The instruction that started this session */}
            {agentTask.metadata?.instruction && (
              <div className="bg-brand-600/10 border border-brand-600/30 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider mb-1">Instruction</p>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">{agentTask.metadata.instruction}</p>
              </div>
            )}

            {/* Live step log */}
            <div className="space-y-1 font-mono text-xs">
              {agentTask.logs?.map((log, i) => (
                <div
                  key={i}
                  className={clsx(
                    'flex gap-2 items-start',
                    log.level === 'error' && 'text-red-400',
                    log.level === 'warn' && 'text-yellow-400',
                    log.level === 'info' && 'text-zinc-400',
                  )}
                >
                  <span className="text-zinc-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {isRunning && (
                <div className="flex gap-2 items-center text-brand-400">
                  <Loader2 size={11} className="animate-spin" />
                  <span>working…</span>
                </div>
              )}
            </div>

            {/* Final summary */}
            {agentTask.summary && agentTask.status === 'completed' && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-400">Session complete</p>
                  {(agentTask.changes?.length ?? 0) > 0 && (
                    <span className="text-[10px] text-zinc-500">· {agentTask.changes.length} file(s) changed — see the Changes tab</span>
                  )}
                </div>
                <Markdown content={agentTask.summary} />
              </div>
            )}

            {agentTask.status === 'failed' && (
              <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
                <XCircle size={13} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-300">{agentTask.error ?? 'The agent session failed — check the log above.'}</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-surface-700">
        <ImageChips images={attachedImages} onChange={setAttachedImages} />
        <div className="flex items-end gap-2">
          <ImageAttachButton images={attachedImages} onChange={setAttachedImages} disabled={isRunning} />
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            placeholder={isRunning ? 'Agent is working…' : 'Tell the agent what to do… (Enter to run, Shift+Enter for a new line)'}
            disabled={isRunning}
            rows={2}
            className="input flex-1 resize-none text-sm leading-relaxed disabled:opacity-50"
          />
          {isRunning ? (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors shrink-0"
            >
              <Square size={12} /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={(!instruction.trim() && !attachedImages.length) || startMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs shrink-0 disabled:opacity-50"
            >
              {startMutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <><Send size={12} /> Run</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
