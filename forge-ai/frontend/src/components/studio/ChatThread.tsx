// A chat conversation on the home page: same page, same sidebar, no new window.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import Markdown from '@/components/Markdown'
import type { Conversation } from './studio'

// One reply per message, even when React runs an effect twice in development
const asked = new Set<string>()

export default function ChatThread({ conversation }: { conversation: Conversation }) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const messages = conversation.messages
  const last = messages[messages.length - 1]

  const store = (next: Conversation) => qc.setQueryData(['conversation', next._id], next)

  const reply = async () => {
    setWaiting(true)
    setFailed(false)
    try {
      const { data } = await api.post(`/studio/conversations/${conversation._id}/reply`, {}, { timeout: 150_000 })
      store(data.conversation)
    } catch {
      setFailed(true)
    } finally {
      setWaiting(false)
      qc.invalidateQueries({ queryKey: ['conversations'] })
    }
  }

  // The first message of a thread, or a thread reopened before its answer arrived
  useEffect(() => {
    if (last?.role !== 'user' || asked.has(last._id)) return
    asked.add(last._id)
    reply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?._id])

  // Straight to the newest message when a thread opens, smoothly after that
  const opened = useRef(false)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: opened.current ? 'smooth' : 'auto', block: 'end' })
    opened.current = true
  }, [messages.length, waiting])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || waiting) return
    setInput('')
    const { data } = await api.post(`/studio/conversations/${conversation._id}/messages`, { content })
    store(data.conversation)
  }

  const followups: string[] = !waiting && last?.role === 'assistant' ? last.data?.followups ?? [] : []

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {messages.map((m) => m.role === 'user' ? (
            <div key={m._id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text)' }}>{m.content}</div>
            </div>
          ) : (
            <div key={m._id} className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}><Markdown content={m.content} /></div>
          ))}
          {waiting && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}><Loader2 size={14} className="animate-spin" /> Thinking…</p>}
          {failed && (
            <button onClick={reply} className="flex items-center gap-2 text-sm text-red-500">
              <RotateCcw size={14} /> The assistant could not answer. Try again
            </button>
          )}
          {followups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {followups.map((f) => (
                <button key={f} onClick={() => send(f)} className="text-xs px-3 py-1.5 rounded-full transition-colors hover:border-brand-500/50" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{f}</button>
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="max-w-3xl mx-auto flex items-end gap-2 rounded-2xl p-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            rows={2}
            placeholder="Reply…"
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
            style={{ color: 'var(--text)' }}
          />
          <button onClick={() => send(input)} disabled={!input.trim() || waiting} aria-label="Send" className="p-2 rounded-xl text-white bg-brand-600 disabled:opacity-40"><ArrowUp size={16} /></button>
        </div>
      </div>
    </div>
  )
}
