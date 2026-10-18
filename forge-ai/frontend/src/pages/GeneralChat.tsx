import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { ArrowLeft, ArrowRight, Loader2, Sparkles, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED_STARTERS = [
  'Help me brainstorm startup ideas for a tech product',
  'Explain quantum computing in simple terms',
  'Write a persuasive pitch for my business idea',
  'What are the best practices for growing a SaaS?',
]

export default function GeneralChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [followups, setFollowups] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const pending = sessionStorage.getItem('forge_pending_chat')
    if (pending) {
      sessionStorage.removeItem('forge_pending_chat')
      doSend(pending, [])
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const doSend = async (text: string, currentMessages: Message[]) => {
    const msg = text.trim()
    if (!msg) return

    const nextMessages: Message[] = [...currentMessages, { role: 'user', content: msg }]
    setMessages(nextMessages)
    setInput('')
    setFollowups([])
    setLoading(true)

    try {
      const history = currentMessages.slice(-12).map((m) => ({ role: m.role, content: m.content }))
      const { data } = await api.post('/ai/general-chat', { message: msg, history })
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
      setFollowups(data.followups ?? [])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    doSend(msg, messages)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const clearChat = () => {
    setMessages([])
    setFollowups([])
    inputRef.current?.focus()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="p-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          style={{ color: 'var(--text-3)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>AI Chat</h1>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-3)' }}>
              Powered by a blend of AI models
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            <RotateCcw size={12} /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center min-h-full text-center px-4 py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/15 to-violet-600/15 dark:from-brand-500/25 dark:to-violet-600/25 flex items-center justify-center mb-4">
              <Sparkles size={28} className="text-brand-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-white">
              What can I help you with?
            </h2>
            <p className="text-sm mb-8 max-w-sm" style={{ color: 'var(--text-3)' }}>
              Brainstorm ideas, get answers, explore any topic — powered by a blend of AI models for accurate replies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="text-left text-sm px-4 py-3 rounded-xl transition-all duration-150 hover:scale-[1.01]"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl mx-auto">
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={12} className="text-white" />
                  </div>
                )}
                <div
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
                    m.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm',
                  )}
                  style={
                    m.role === 'user'
                      ? { background: '#4f46e5' }
                      : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shrink-0">
                  <Sparkles size={12} className="text-white" />
                </div>
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-3"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {followups.length > 0 && !loading && (
              <div className="flex flex-wrap gap-2 pl-10">
                {followups.map((f) => (
                  <button
                    key={f}
                    onClick={() => sendMessage(f)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 hover:scale-[1.01]"
                    style={{
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="hero-prompt max-w-3xl mx-auto">
          <div className="flex flex-col gap-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ask anything — ideas, answers, analysis..."
              className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-sm outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600"
            />
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                Enter to send · Shift+Enter for new line
              </span>
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: input.trim() && !loading ? '#4f46e5' : 'rgba(79, 70, 229, 0.4)' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                {loading ? 'Thinking…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
