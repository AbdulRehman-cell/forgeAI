import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { ArrowLeft, Send, Loader2, Sparkles, RotateCcw, Copy, Check } from 'lucide-react'
import clsx from 'clsx'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED_STARTERS = [
  { icon: '💡', text: 'Brainstorm startup ideas in the health tech space' },
  { icon: '📝', text: 'Write a compelling elevator pitch for my SaaS product' },
  { icon: '🧠', text: 'Explain machine learning in simple, everyday terms' },
  { icon: '🚀', text: 'What are the best growth strategies for a new app?' },
]

// ── Lightweight markdown renderer ────────────────────────────────────────────
interface CodeBlockProps { code: string; lang: string }

function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="my-3 rounded-xl overflow-hidden text-sm" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[11px] font-mono" style={{ color: '#a1a1aa' }}>{lang || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] transition-colors" style={{ color: copied ? '#4ade80' : '#71717a' }}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 leading-relaxed" style={{ color: '#e4e4e7', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function InlineCode({ children }: { children: string }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[13px] font-mono"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: '#e879f9' }}
    >
      {children}
    </code>
  )
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Match: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2] !== undefined) parts.push(<strong key={key++} className="font-semibold" style={{ color: 'var(--text)' }}>{m[2]}</strong>)
    else if (m[3] !== undefined) parts.push(<em key={key++}>{m[3]}</em>)
    else if (m[4] !== undefined) parts.push(<InlineCode key={key++}>{m[4]}</InlineCode>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const output: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      output.push(<CodeBlock key={key++} code={codeLines.join('\n')} lang={lang} />)
      i++
      continue
    }

    // Headings
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)
    if (h3) {
      output.push(<h3 key={key++} className="text-base font-semibold mt-5 mb-1.5" style={{ color: 'var(--text)' }}>{parseInline(h3[1])}</h3>)
      i++; continue
    }
    if (h2) {
      output.push(<h2 key={key++} className="text-lg font-semibold mt-6 mb-2" style={{ color: 'var(--text)' }}>{parseInline(h2[1])}</h2>)
      i++; continue
    }
    if (h1) {
      output.push(<h1 key={key++} className="text-xl font-bold mt-6 mb-2" style={{ color: 'var(--text)' }}>{parseInline(h1[1])}</h1>)
      i++; continue
    }

    // Unordered list: collect consecutive items
    if (/^[\s]*[-*•]\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^[\s]*[-*•]\s/.test(lines[i])) {
        const text = lines[i].replace(/^[\s]*[-*•]\s/, '')
        items.push(<li key={items.length} className="mb-0.5">{parseInline(text)}</li>)
        i++
      }
      output.push(<ul key={key++} className="list-disc pl-5 my-2 space-y-0.5 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{items}</ul>)
      continue
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^[\s]*\d+\.\s/, '')
        items.push(<li key={items.length} className="mb-0.5">{parseInline(text)}</li>)
        i++
      }
      output.push(<ol key={key++} className="list-decimal pl-5 my-2 space-y-0.5 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{items}</ol>)
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      output.push(<hr key={key++} className="my-4" style={{ borderColor: 'var(--border)' }} />)
      i++; continue
    }

    // Blank line → spacing
    if (line.trim() === '') {
      output.push(<div key={key++} className="h-2" />)
      i++; continue
    }

    // Paragraph
    output.push(
      <p key={key++} className="text-sm leading-[1.75] mb-0" style={{ color: 'var(--text)' }}>
        {parseInline(line)}
      </p>
    )
    i++
  }

  return <div className="space-y-0.5">{output}</div>
}
// ─────────────────────────────────────────────────────────────────────────────

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
    } else {
      inputRef.current?.focus()
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

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const clearChat = () => { setMessages([]); setFollowups([]); inputRef.current?.focus() }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Top bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="p-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          style={{ color: 'var(--text-3)' }}
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shrink-0">
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>ForgeAI Chat</span>
            <span className="hidden sm:inline text-xs ml-2" style={{ color: 'var(--text-3)' }}>
              Powered by a blend of AI models
            </span>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            <RotateCcw size={12} />
            <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !loading ? (
          /* ── Empty / welcome state ── */
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-12 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(124,58,237,0.15) 100%)' }}
            >
              <Sparkles size={26} className="text-indigo-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)', fontFamily: "'Inter', system-ui, sans-serif" }}>
              How can I help you today?
            </h2>
            <p className="text-sm mb-8 max-w-xs" style={{ color: 'var(--text-3)', lineHeight: '1.6' }}>
              Ask me anything — ideas, explanations, writing, strategy — powered by a blend of AI models.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
              {SUGGESTED_STARTERS.map(({ icon, text }) => (
                <button
                  key={text}
                  onClick={() => { setInput(text); inputRef.current?.focus() }}
                  className="text-left flex items-start gap-3 p-4 rounded-xl transition-all duration-150 hover:scale-[1.01] hover:shadow-sm group"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <span className="text-lg leading-none mt-0.5">{icon}</span>
                  <span className="text-sm leading-snug" style={{ color: 'var(--text-2)' }}>{text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Conversation ── */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>

                {/* AI avatar */}
                {m.role === 'assistant' && (
                  <div className="shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                      <Sparkles size={12} className="text-white" />
                    </div>
                  </div>
                )}

                {/* Message bubble */}
                {m.role === 'user' ? (
                  <div
                    className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 pt-0.5">
                    <MarkdownRenderer content={m.content} />
                  </div>
                )}
              </div>
            ))}

            {/* Loading dots */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                  <Sparkles size={12} className="text-white" />
                </div>
                <div
                  className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-tl-sm"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up chips */}
            {followups.length > 0 && !loading && (
              <div className="flex flex-wrap gap-2 pl-10">
                {followups.map((f) => (
                  <button
                    key={f}
                    onClick={() => sendMessage(f)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 hover:scale-[1.01]"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
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

      {/* Input bar — ChatGPT-style */}
      <div className="shrink-0 px-4 pb-4 pt-3" style={{ background: 'var(--bg)' }}>
        <div
          className="max-w-3xl mx-auto flex items-end gap-3 rounded-2xl px-4 py-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Message ForgeAI…"
            className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
            style={{ color: 'var(--text)', minHeight: '24px', maxHeight: '160px', overflowY: 'auto' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className={clsx(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200',
              input.trim() && !loading
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed',
            )}
          >
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />
            }
          </button>
        </div>
        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-3)' }}>
          ForgeAI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}
