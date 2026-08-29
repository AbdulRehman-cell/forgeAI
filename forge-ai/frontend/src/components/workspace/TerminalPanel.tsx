import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { TerminalSquare, RotateCcw, Loader2 } from 'lucide-react'

// Strip ANSI escape sequences + carriage-return progress redraws
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
const clean = (s: string) => s.replace(ANSI_RE, '').replace(/\r(?!\n)/g, '\n')

interface Props { repositoryId: string }

/**
 * Interactive terminal — a real shell (PowerShell / bash) running in the
 * workspace folder on the backend, streamed over the existing socket.
 */
export default function TerminalPanel({ repositoryId }: Props) {
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'connecting' | 'ready' | 'exited'>('connecting')
  const [session, setSession] = useState(0) // bump to restart the shell
  const termId = useRef(`t_${Math.random().toString(36).slice(2)}`)
  const history = useRef<string[]>([])
  const histIdx = useRef(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const socket = getSocket()
    const id = termId.current
    setOutput('')
    setStatus('connecting')

    const onData = (p: { termId: string; data: string }) => {
      if (p.termId !== id) return
      setOutput((o) => (o + clean(p.data)).slice(-100_000))
    }
    const onReady = (p: { termId: string; cwd: string; shell: string }) => {
      if (p.termId !== id) return
      setStatus('ready')
      setOutput((o) => o + `— ${p.shell} session in ${p.cwd} —\n`)
    }
    const onExit = (p: { termId: string; code: number | null }) => {
      if (p.termId !== id) return
      setStatus('exited')
      setOutput((o) => o + `\n— shell exited (code ${p.code ?? '?'}) —\n`)
    }
    const onError = (p: { termId: string; message: string }) => {
      if (p.termId !== id) return
      setStatus('exited')
      setOutput((o) => o + `\nTerminal error: ${p.message}\n`)
    }

    socket.on('terminal:data', onData)
    socket.on('terminal:ready', onReady)
    socket.on('terminal:exit', onExit)
    socket.on('terminal:error', onError)
    socket.emit('terminal:create', { termId: id, repositoryId })

    return () => {
      socket.emit('terminal:kill', { termId: id })
      socket.off('terminal:data', onData)
      socket.off('terminal:ready', onReady)
      socket.off('terminal:exit', onExit)
      socket.off('terminal:error', onError)
    }
  }, [repositoryId, session])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [output])

  const send = () => {
    if (status !== 'ready') return
    const socket = getSocket()
    socket.emit('terminal:input', { termId: termId.current, data: input + '\n' })
    setOutput((o) => o + `❯ ${input}\n`)
    if (input.trim()) {
      history.current = [input, ...history.current.slice(0, 49)]
    }
    histIdx.current = -1
    setInput('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); send() }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (histIdx.current < history.current.length - 1) {
        histIdx.current++
        setInput(history.current[histIdx.current])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx.current > 0) {
        histIdx.current--
        setInput(history.current[histIdx.current])
      } else {
        histIdx.current = -1
        setInput('')
      }
    } else if (e.key === 'c' && e.ctrlKey && !input) {
      // Ctrl+C with empty input → interrupt signal (best effort without a pty)
      getSocket().emit('terminal:input', { termId: termId.current, data: '\u0003' })
    }
  }

  const restart = () => {
    termId.current = `t_${Math.random().toString(36).slice(2)}`
    setSession((s) => s + 1)
  }

  return (
    <div className="flex flex-col h-full bg-black/30" onClick={() => inputRef.current?.focus()}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surface-700 shrink-0">
        <TerminalSquare size={12} className="text-zinc-500" />
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex-1">Terminal</p>
        {status === 'connecting' && <Loader2 size={11} className="animate-spin text-zinc-500" />}
        {status === 'exited' && (
          <button
            onClick={(e) => { e.stopPropagation(); restart() }}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw size={10} /> Restart
          </button>
        )}
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">{output}</pre>
      </div>

      {/* Input line */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-surface-700/60 shrink-0">
        <span className="font-mono text-xs text-brand-400 shrink-0">❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={status !== 'ready'}
          placeholder={status === 'ready' ? 'Type a command…' : status === 'connecting' ? 'Starting shell…' : 'Shell exited'}
          className="flex-1 bg-transparent font-mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none disabled:opacity-50"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
