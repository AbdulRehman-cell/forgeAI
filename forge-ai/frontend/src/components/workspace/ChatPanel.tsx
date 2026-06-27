import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Send, Zap, Copy, Check, RotateCcw, ChevronDown,
  Code2, FileText, GitBranch, Lightbulb
} from 'lucide-react'
import type { ChatMessage } from '@/types'
import clsx from 'clsx'

interface Props { repositoryId: string }

// ─── Markdown renderer (no extra deps) ────────────────────
function renderMarkdown(text: string): string {
  return text
    // code blocks
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block" data-lang="${lang || ''}">${escHtml(code.trim())}</pre>`
    )
    // inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // headings
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    // unordered lists
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>)/g, '<ul class="md-ul">$1</ul>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="md-hr" />')
    // line breaks (but not inside pre)
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br />')
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── Suggestion chips ─────────────────────────────────────
const SUGGESTIONS = [
  { icon: Code2,     label: 'Explain the codebase structure' },
  { icon: GitBranch, label: 'What dependencies does this project use?' },
  { icon: Lightbulb, label: 'What are the main entry points?' },
  { icon: FileText,  label: 'Find potential bugs or issues' },
]

// ─── Code block with copy button ─────────────────────────
function MessageContent({ content }: { content: string }) {
  const [copied, setCopied] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const html = renderMarkdown(content)

  const handleCopy = (idx: number, code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  // After render, enhance code blocks with copy buttons
  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll<HTMLPreElement>('pre.code-block').forEach((pre, idx) => {
      if (pre.querySelector('.copy-btn')) return
      const lang = pre.dataset.lang
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.innerHTML = lang ? `<span class="lang-label">${lang}</span>` : ''
      btn.innerHTML += '<span class="copy-icon">⎘</span>'
      btn.onclick = () => handleCopy(idx, pre.textContent ?? '')
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

// ─── Typing indicator ────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-start gap-4 px-4 py-5">
      <div className="forge-avatar shrink-0">
        <Zap size={14} />
      </div>
      <div className="typing-bubble">
        <span /><span /><span />
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────
export default function ChatPanel({ repositoryId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Show scroll-to-bottom button when user scrolls up
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distFromBottom > 200)
    }
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post('/ai/chat', { repositoryId, message: content }).then((r) => r.data),
    onMutate: (content) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content, timestamp: new Date().toISOString() },
      ])
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: new Date().toISOString() },
      ])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ])
    },
  })

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || sendMutation.isPending) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMutation.mutate(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <>
      <style>{CHAT_STYLES}</style>
      <div className="chat-root">
        {/* Messages */}
        <div className="chat-scroll" ref={scrollRef}>
          {isEmpty ? (
            <EmptyState onSuggest={(s) => { setInput(s); textareaRef.current?.focus() }} />
          ) : (
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <MessageRow key={i} msg={msg} />
              ))}
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
          <div className="chat-input-box">
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
              className={clsx('chat-send-btn', input.trim() && !sendMutation.isPending && 'active')}
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
            >
              <Send size={15} />
            </button>
          </div>
          <p className="chat-hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  )
}

// ─── Message row ─────────────────────────────────────────
function MessageRow({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false)

  const copyMessage = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (msg.role === 'user') {
    return (
      <div className="user-row">
        <div className="user-bubble">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="assistant-row">
      <div className="forge-avatar shrink-0">
        <Zap size={14} />
      </div>
      <div className="assistant-content">
        <MessageContent content={msg.content} />
        <div className="msg-actions">
          <button className="msg-action-btn" onClick={copyMessage}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────
function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="empty-state">
      <div className="empty-logo">
        <Zap size={28} />
      </div>
      <h2 className="empty-title">How can I help with your code?</h2>
      <p className="empty-sub">
        I have full context of your repository. Ask me anything.
      </p>
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

// ─── Styles ──────────────────────────────────────────────
const CHAT_STYLES = `
.chat-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f11;
  position: relative;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  position: relative;
}

.chat-scroll::-webkit-scrollbar { width: 5px; }
.chat-scroll::-webkit-scrollbar-track { background: transparent; }
.chat-scroll::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 99px; }

.chat-messages {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* User message */
.user-row {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0;
}
.user-bubble {
  background: #2a2a35;
  border: 1px solid #3a3a4a;
  color: #f4f4f5;
  border-radius: 18px 18px 4px 18px;
  padding: 12px 18px;
  font-size: 14px;
  line-height: 1.6;
  max-width: 72%;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Assistant message */
.assistant-row {
  display: flex;
  gap: 14px;
  padding: 16px 0;
  align-items: flex-start;
}

.forge-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  margin-top: 2px;
  box-shadow: 0 0 16px rgba(99,102,241,0.3);
}

.assistant-content {
  flex: 1;
  min-width: 0;
}

/* Markdown content */
.message-content {
  color: #e4e4e7;
  font-size: 14px;
  line-height: 1.75;
}
.message-content .md-p {
  margin: 0 0 12px;
}
.message-content .md-p:last-child { margin-bottom: 0; }
.message-content .md-h1 { font-size: 20px; font-weight: 700; color: #f4f4f5; margin: 20px 0 10px; }
.message-content .md-h2 { font-size: 17px; font-weight: 600; color: #f4f4f5; margin: 16px 0 8px; }
.message-content .md-h3 { font-size: 15px; font-weight: 600; color: #d4d4d8; margin: 12px 0 6px; }
.message-content .md-ul { padding-left: 20px; margin: 8px 0; list-style: disc; }
.message-content .md-li { margin: 4px 0; color: #d4d4d8; }
.message-content .md-hr { border: none; border-top: 1px solid #3f3f46; margin: 16px 0; }
.message-content strong { color: #f4f4f5; font-weight: 600; }
.message-content em { color: #a1a1aa; font-style: italic; }
.message-content .inline-code {
  background: #27272a;
  border: 1px solid #3f3f46;
  color: #a78bfa;
  padding: 1px 6px;
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12.5px;
}

/* Code blocks */
.message-content pre.code-block {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 10px;
  padding: 38px 16px 16px;
  margin: 12px 0;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12.5px;
  line-height: 1.7;
  color: #d4d4d8;
  position: relative;
  white-space: pre;
}
.copy-btn {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #1e1e24;
  border-bottom: 1px solid #2a2a35;
  border-radius: 10px 10px 0 0;
  cursor: pointer;
  border: none;
  width: 100%;
}
.lang-label {
  font-size: 11px;
  color: #71717a;
  font-family: 'JetBrains Mono', monospace;
  text-transform: lowercase;
}
.copy-icon {
  font-size: 14px;
  color: #52525b;
  transition: color 0.15s;
}
.copy-btn:hover .copy-icon { color: #a1a1aa; }

/* Message actions */
.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.assistant-row:hover .msg-actions { opacity: 1; }
.msg-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #52525b;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.msg-action-btn:hover {
  color: #a1a1aa;
  background: #27272a;
  border-color: #3f3f46;
}

/* Typing indicator */
.typing-bubble {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 14px 0 4px;
}
.typing-bubble span {
  width: 7px;
  height: 7px;
  background: #4f46e5;
  border-radius: 50%;
  animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
.typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* Scroll to bottom button */
.scroll-btn {
  position: sticky;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  background: #27272a;
  border: 1px solid #3f3f46;
  color: #a1a1aa;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  margin: 0 auto;
}
.scroll-btn:hover { background: #3f3f46; color: #f4f4f5; }

/* Input area */
.chat-input-area {
  padding: 12px 24px 16px;
  background: #0f0f11;
  border-top: 1px solid #1c1c1f;
}
.chat-input-box {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 14px;
  padding: 10px 10px 10px 16px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.chat-input-box:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
}
.chat-textarea {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #f4f4f5;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  max-height: 200px;
  font-family: inherit;
  padding: 2px 0;
}
.chat-textarea::placeholder { color: #52525b; }
.chat-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #27272a;
  border: none;
  color: #52525b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.chat-send-btn.active {
  background: #4f46e5;
  color: white;
  box-shadow: 0 0 12px rgba(79,70,229,0.4);
}
.chat-send-btn.active:hover { background: #4338ca; }
.chat-hint {
  max-width: 760px;
  margin: 6px auto 0;
  font-size: 11px;
  color: #3f3f46;
  text-align: center;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
  padding: 32px 24px;
  text-align: center;
}
.empty-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 20px;
  box-shadow: 0 0 32px rgba(99,102,241,0.35);
}
.empty-title {
  font-size: 22px;
  font-weight: 600;
  color: #f4f4f5;
  margin-bottom: 8px;
}
.empty-sub {
  font-size: 14px;
  color: #71717a;
  margin-bottom: 32px;
}
.suggestions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  max-width: 520px;
}
.suggestion-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px;
  color: #a1a1aa;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.suggestion-chip:hover {
  background: #1e1e28;
  border-color: #4f46e5;
  color: #e4e4e7;
}
.suggestion-icon { color: #4f46e5; flex-shrink: 0; }
`