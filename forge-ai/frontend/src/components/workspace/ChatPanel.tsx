import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Send, Zap, Copy, Check, ChevronDown,
  Code2, FileText, GitBranch, Lightbulb, Trash2, Loader2
} from 'lucide-react'
import clsx from 'clsx'
import ImageAttachButton, { ImageChips, UploadedImage } from '@/components/ImageAttach'

interface Props { repositoryId: string }

interface ChatMessage {
 role: 'user' | 'assistant'
  content: string
  timestamp: string
  citations?: string[]   // add
  followups?: string[]   // add
}

// ─── Markdown renderer ────────────────────────────────────
function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function renderMarkdown(text: string): string {
  // 1. Pull fenced code blocks out (content escaped) so nothing inside them
  //    is re-processed, then 2. escape EVERYTHING else — otherwise literal
  //    HTML in the reply (e.g. `<meta charset="UTF-8">`) is injected into the
  //    page and renders as invisible elements instead of visible code.
  const blocks: string[] = []
  const out = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre class="code-block" data-lang="${lang || ''}">${escHtml(code.trim())}</pre>`)
    return `\u0000B${blocks.length - 1}\u0000`
  })

  return escHtml(out)
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)/g, '<ul class="md-ul">$1</ul>')
    .replace(/^---$/gm, '<hr class="md-hr" />')
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br />')
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => blocks[Number(i)])
}

// ─── Suggestion chips ─────────────────────────────────────
const SUGGESTIONS = [
  { icon: Code2,     label: 'Explain the codebase structure' },
  { icon: GitBranch, label: 'What dependencies does this project use?' },
  { icon: Lightbulb, label: 'What are the main entry points?' },
  { icon: FileText,  label: 'Find potential bugs or issues' },
]

// ─── Message content with code copy buttons ───────────────
function MessageContent({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = renderMarkdown(content)

  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll<HTMLPreElement>('pre.code-block').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return
      const lang = pre.dataset.lang
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.innerHTML = `<span class="lang-label">${lang || 'code'}</span><span class="copy-icon">⎘ Copy</span>`
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.innerText.replace(/^.+\n/, ''))
        btn.querySelector('.copy-icon')!.textContent = '✓ Copied'
        setTimeout(() => { btn.querySelector('.copy-icon')!.textContent = '⎘ Copy' }, 2000)
      }
      pre.prepend(btn)
    })
  }, [content])

  return (
    <div
      ref={ref}
      className="message-content"
      dangerouslySetInnerHTML={{ __html: `<p class="md-p">${html}</p>` }}
    />
  )
}

// ─── Typing indicator ─────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="assistant-row">
      <div className="forge-avatar"><Zap size={14} /></div>
      <div className="typing-bubble"><span /><span /><span /></div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────
function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="empty-state">
      <div className="empty-logo"><Zap size={28} /></div>
      <h2 className="empty-title">How can I help with your code?</h2>
      <p className="empty-sub">I have full context of your repository. Ask me anything.</p>
      <div className="suggestions">
        {SUGGESTIONS.map(({ icon: Icon, label }) => (
          <button key={label} className="suggestion-chip" onClick={() => onSuggest(label)}>
            <Icon size={14} className="suggestion-icon" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Single message row ───────────────────────────────────
function MessageRow({ msg, onFollowup }: { msg: ChatMessage; onFollowup?: (q: string) => void }) {
  const [copied, setCopied] = useState(false)

  if (msg.role === 'user') {
    return (
      <div className="user-row">
        <div className="user-bubble">{msg.content}</div>
      </div>
    )
  }

  return (
    <div className="assistant-row">
      <div className="forge-avatar shrink-0"><Zap size={14} /></div>
      <div className="assistant-content">

        {/* ── Citations bar (Perplexity style) ── */}
        {msg.citations && msg.citations.length > 0 && (
          <div className="citations-bar">
            <span className="citations-label">Sources</span>
            {msg.citations.map((file, i) => (
              <span key={i} className="citation-chip" title={file}>
                <span className="citation-num">{i + 1}</span>
                {file.split('/').pop()}
              </span>
            ))}
          </div>
        )}

        <MessageContent content={msg.content} />

        {/* ── Follow-up suggestion chips ── */}
        {msg.followups && msg.followups.length > 0 && (
          <div className="followups">
            {msg.followups.map((q) => (
              <button key={q} className="followup-chip" onClick={() => onFollowup?.(q)}>
                {q} →
              </button>
            ))}
          </div>
        )}

        <div className="msg-actions">
          <button className="msg-action-btn" onClick={() => {
            navigator.clipboard.writeText(msg.content)
            setCopied(true); setTimeout(() => setCopied(false), 2000)
          }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
// ─── Main component ───────────────────────────────────────
export default function ChatPanel({ repositoryId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachedImages, setAttachedImages] = useState<UploadedImage[]>([])
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const qc = useQueryClient()

  // ── Load history on mount ──────────────────────────────
  const { isLoading: historyLoading } = useQuery({
    queryKey: ['chat-history', repositoryId],
    queryFn: async () => {
      const r = await api.get(`/ai/chat/${repositoryId}`)
      const msgs: ChatMessage[] = r.data.messages ?? []
      setMessages(msgs)
      return msgs
    },
    refetchOnWindowFocus: false,
    retry: false,
  })

  // ── Clear history ──────────────────────────────────────
  const clearMutation = useMutation({
    mutationFn: () => api.delete(`/ai/chat/${repositoryId}`),
    onSuccess: () => {
      setMessages([])
      qc.invalidateQueries({ queryKey: ['chat-history', repositoryId] })
    },
  })

  // ── Send message ───────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: ({ content, images }: { content: string; images: UploadedImage[] }) =>
      api.post('/ai/chat', { repositoryId, message: content, images }).then((r) => r.data),
    onMutate: ({ content, images }) => {
      const label = images.length
        ? `${content}${content ? '\n\n' : ''}📎 ${images.map((i) => i.originalName).join(', ')}`
        : content
      setMessages((prev) => [...prev, { role: 'user', content: label, timestamp: new Date().toISOString() }])
    },
   onSuccess: (data) => {
  setMessages((prev) => [...prev, {
    role: 'assistant',
    content: data.response,
    timestamp: new Date().toISOString(),
    citations: data.citations ?? [],
    followups: data.followups ?? [],
  }])
},
    
onError: (e: any) => {
  const data = e.response?.data
  if (data?.code === 'QUOTA_EXCEEDED') {
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `**Monthly limit reached** — you've used ${data.used}/${data.limit} ${data.kind} on the ${data.plan} plan.\n\n[Upgrade to Pro](/pricing) for higher limits.`,
      timestamp: new Date().toISOString(),
    }])
  } else {
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: 'Something went wrong. Please try again.',
      timestamp: new Date().toISOString(),
    }])
  }
},
  })

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200)
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const handleSend = () => {
    const msg = input.trim()
    if ((!msg && !attachedImages.length) || sendMutation.isPending) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMutation.mutate({ content: msg, images: attachedImages })
    setAttachedImages([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <>
      <style>{STYLES}</style>
      <div className="chat-root">
        <div className="chat-scroll" ref={scrollRef}>

          {historyLoading ? (
            <div className="empty-state">
              <Loader2 size={22} style={{ color: '#4f46e5', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#71717a', fontSize: '13px', marginTop: '12px' }}>Loading chat history…</p>
            </div>
          ) : isEmpty ? (
            <EmptyState onSuggest={(s) => { setInput(s); textareaRef.current?.focus() }} />
          ) : (
            <div className="chat-messages">
              {/* Header bar with clear button */}
              <div className="chat-header-bar">
                <span style={{ fontSize: '12px', color: '#52525b' }}>
                  {Math.floor(messages.length / 2)} conversation{messages.length !== 2 ? 's' : ''}
                </span>
                <button
                  className="clear-btn"
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                >
                  <Trash2 size={12} />
                  {clearMutation.isPending ? 'Clearing…' : 'Clear history'}
                </button>
              </div>

              {messages.map((msg, i) => <MessageRow key={i} msg={msg} />)}
              {sendMutation.isPending && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}

          {showScrollBtn && (
            <button className="scroll-btn" onClick={scrollToBottom}>
              <ChevronDown size={16} />
            </button>
          )}
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <ImageChips images={attachedImages} onChange={setAttachedImages} />
          </div>
          <div className="chat-input-box">
            <ImageAttachButton images={attachedImages} onChange={setAttachedImages} disabled={sendMutation.isPending} />
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Ask anything about your codebase…"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className={clsx('chat-send-btn', (input.trim() || attachedImages.length > 0) && !sendMutation.isPending && 'active')}
              onClick={handleSend}
              disabled={(!input.trim() && !attachedImages.length) || sendMutation.isPending}
            >
              <Send size={15} />
            </button>
          </div>
          <p className="chat-hint">Enter to send · Shift+Enter for new line · attach images with the 🖼 button (text in them is auto-extracted)</p>
        </div>
      </div>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────
const STYLES = `
@keyframes spin { to { transform: rotate(360deg); } }

.chat-root { display:flex; flex-direction:column; height:100%; min-height:0; position:absolute; inset:0; background:#0f0f11; }
.chat-scroll { flex:1; overflow-y:auto; scroll-behavior:smooth; position:relative; }
.chat-scroll::-webkit-scrollbar { width:5px; }
.chat-scroll::-webkit-scrollbar-track { background:transparent; }
.chat-scroll::-webkit-scrollbar-thumb { background:#3f3f46; border-radius:99px; }

.chat-messages { max-width:760px; margin:0 auto; padding:24px 24px 16px; display:flex; flex-direction:column; gap:0; }

.chat-header-bar { display:flex; align-items:center; justify-content:space-between; padding:0 0 16px; border-bottom:1px solid #1c1c1f; margin-bottom:8px; }
.clear-btn { display:flex; align-items:center; gap:5px; font-size:11px; color:#52525b; background:none; border:1px solid #27272a; border-radius:6px; padding:4px 10px; cursor:pointer; transition:all .15s; }
.clear-btn:hover { color:#ef4444; border-color:#ef4444; background:rgba(239,68,68,.05); }
.clear-btn:disabled { opacity:.5; cursor:not-allowed; }

.user-row { display:flex; justify-content:flex-end; padding:10px 0; }
.user-bubble { background:#2a2a35; border:1px solid #3a3a4a; color:#f4f4f5; border-radius:18px 18px 4px 18px; padding:12px 18px; font-size:14px; line-height:1.6; max-width:72%; white-space:pre-wrap; word-break:break-word; }

.assistant-row { display:flex; gap:14px; padding:14px 0; align-items:flex-start; }
.forge-avatar { width:30px; height:30px; border-radius:8px; background:linear-gradient(135deg,#4f46e5,#7c3aed); display:flex; align-items:center; justify-content:center; color:white; flex-shrink:0; margin-top:2px; box-shadow:0 0 16px rgba(99,102,241,.3); }
.assistant-content { flex:1; min-width:0; }

.message-content { color:#e4e4e7; font-size:14px; line-height:1.75; }
.message-content .md-p { margin:0 0 12px; }
.message-content .md-p:last-child { margin-bottom:0; }
.message-content .md-h1 { font-size:20px; font-weight:700; color:#f4f4f5; margin:20px 0 10px; }
.message-content .md-h2 { font-size:17px; font-weight:600; color:#f4f4f5; margin:16px 0 8px; }
.message-content .md-h3 { font-size:15px; font-weight:600; color:#d4d4d8; margin:12px 0 6px; }
.message-content .md-ul { padding-left:20px; margin:8px 0; list-style:disc; }
.message-content .md-li { margin:4px 0; color:#d4d4d8; }
.message-content .md-hr { border:none; border-top:1px solid #3f3f46; margin:16px 0; }
.message-content strong { color:#f4f4f5; font-weight:600; }
.message-content em { color:#a1a1aa; font-style:italic; }
.message-content .inline-code { background:#27272a; border:1px solid #3f3f46; color:#a78bfa; padding:1px 6px; border-radius:5px; font-family:'JetBrains Mono',monospace; font-size:12.5px; }

.message-content pre.code-block { background:#18181b; border:1px solid #27272a; border-radius:10px; padding:40px 16px 16px; margin:12px 0; overflow-x:auto; font-family:'JetBrains Mono','Fira Code',monospace; font-size:12.5px; line-height:1.7; color:#d4d4d8; position:relative; white-space:pre; }
.copy-btn { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:#1e1e24; border-bottom:1px solid #2a2a35; border-radius:10px 10px 0 0; cursor:pointer; border:none; width:100%; }
.lang-label { font-size:11px; color:#71717a; font-family:'JetBrains Mono',monospace; }
.copy-icon { font-size:11px; color:#52525b; transition:color .15s; }
.copy-btn:hover .copy-icon { color:#a1a1aa; }

.msg-actions { display:flex; gap:4px; margin-top:6px; opacity:0; transition:opacity .15s; }
.assistant-row:hover .msg-actions { opacity:1; }
.msg-action-btn { display:flex; align-items:center; gap:4px; font-size:11px; color:#52525b; background:none; border:1px solid transparent; border-radius:6px; padding:3px 8px; cursor:pointer; transition:all .15s; }
.msg-action-btn:hover { color:#a1a1aa; background:#27272a; border-color:#3f3f46; }

.typing-bubble { display:flex; gap:5px; align-items:center; padding:14px 0 4px; }
.typing-bubble span { width:7px; height:7px; background:#4f46e5; border-radius:50%; animation:typing-bounce 1.2s infinite ease-in-out; }
.typing-bubble span:nth-child(2) { animation-delay:.2s; }
.typing-bubble span:nth-child(3) { animation-delay:.4s; }
@keyframes typing-bounce { 0%,60%,100% { transform:translateY(0); opacity:.4; } 30% { transform:translateY(-6px); opacity:1; } }

.scroll-btn { position:sticky; bottom:16px; left:50%; transform:translateX(-50%); display:flex; background:#27272a; border:1px solid #3f3f46; color:#a1a1aa; border-radius:50%; width:32px; height:32px; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; box-shadow:0 2px 8px rgba(0,0,0,.4); margin:0 auto; }
.scroll-btn:hover { background:#3f3f46; color:#f4f4f5; }

.chat-input-area { padding:12px 24px 16px; background:#0f0f11; border-top:1px solid #1c1c1f; }
.chat-input-box { max-width:760px; margin:0 auto; display:flex; align-items:flex-end; gap:10px; background:#18181b; border:1px solid #27272a; border-radius:14px; padding:10px 10px 10px 16px; transition:border-color .15s,box-shadow .15s; }
.chat-input-box:focus-within { border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.12); }
.chat-textarea { flex:1; background:none; border:none; outline:none; color:#f4f4f5; font-size:14px; line-height:1.6; resize:none; max-height:200px; font-family:inherit; padding:2px 0; }
.chat-textarea::placeholder { color:#52525b; }
.chat-send-btn { width:34px; height:34px; border-radius:9px; background:#27272a; border:none; color:#52525b; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:all .15s; }
.chat-send-btn.active { background:#4f46e5; color:white; box-shadow:0 0 12px rgba(79,70,229,.4); }
.chat-send-btn.active:hover { background:#4338ca; }
.chat-hint { max-width:760px; margin:6px auto 0; font-size:11px; color:#3f3f46; text-align:center; }

.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:400px; padding:32px 24px; text-align:center; }
.empty-logo { width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg,#4f46e5,#7c3aed); display:flex; align-items:center; justify-content:center; color:white; margin-bottom:20px; box-shadow:0 0 32px rgba(99,102,241,.35); }
.empty-title { font-size:22px; font-weight:600; color:#f4f4f5; margin-bottom:8px; }
.empty-sub { font-size:14px; color:#71717a; margin-bottom:32px; }
.suggestions { display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%; max-width:520px; }
.suggestion-chip { display:flex; align-items:center; gap:8px; background:#18181b; border:1px solid #27272a; border-radius:10px; padding:12px 14px; font-size:13px; color:#a1a1aa; cursor:pointer; text-align:left; transition:all .15s; }
.suggestion-chip:hover { background:#1e1e28; border-color:#4f46e5; color:#e4e4e7; }
.suggestion-icon { color:#4f46e5; flex-shrink:0; }

.citations-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
.citations-label { font-size:10px; color:#52525b; text-transform:uppercase; letter-spacing:.05em; margin-right:2px; }
.citation-chip { display:inline-flex; align-items:center; gap:5px; background:#1c1c22; border:1px solid #2a2a35; color:#a1a1aa; font-size:11px; font-family:'JetBrains Mono',monospace; padding:3px 8px 3px 4px; border-radius:6px; cursor:default; transition:border-color .15s; }
.citation-chip:hover { border-color:#4f46e5; }
.citation-num { display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; background:#4f46e5; color:white; font-size:9px; border-radius:4px; font-weight:600; }

/* Follow-ups */
.followups { display:flex; flex-direction:column; gap:6px; margin-top:14px; }
.followup-chip { text-align:left; background:#16161c; border:1px solid #26262e; color:#8b8b96; font-size:12px; padding:8px 12px; border-radius:10px; cursor:pointer; transition:all .15s; }
.followup-chip:hover { border-color:#4f46e5; color:#c7c7d1; background:#1a1a24; }
`