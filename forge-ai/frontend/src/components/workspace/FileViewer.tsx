import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Loader2, Copy, Check, AlertCircle, GitCompare } from 'lucide-react'
import { useState } from 'react'

interface Props {
  repositoryId: string
  filePath: string
}

function getLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', json: 'JSON', md: 'Markdown', css: 'CSS', scss: 'SCSS',
    html: 'HTML', yml: 'YAML', yaml: 'YAML', sh: 'Shell', go: 'Go',
    rs: 'Rust', java: 'Java', cs: 'C#', cpp: 'C++', c: 'C',
    rb: 'Ruby', php: 'PHP', toml: 'TOML', xml: 'XML', sql: 'SQL',
  }
  return map[ext] ?? 'Plain Text'
}

export default function FileViewer({ repositoryId, filePath }: Props) {
  const [copied, setCopied] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  const { data: content, isLoading, error } = useQuery({
    queryKey: ['file', repositoryId, filePath],
    queryFn: () =>
      api.get(`/repositories/${repositoryId}/file`, { params: { path: filePath } })
        .then((r) => r.data.content as string),
    staleTime: 30_000,
  })

  // Check if this file was changed by a fix task
  const { data: originalContent } = useQuery({
    queryKey: ['file-original', repositoryId, filePath],
    queryFn: async () => {
      const { data } = await api.get(`/tasks?repositoryId=${repositoryId}&limit=10`)
      for (const task of data.tasks ?? []) {
        if (task.status !== 'completed') continue
        const { data: full } = await api.get(`/tasks/${task._id}`)
        const change = full.task?.changes?.find((c: any) => c.path === filePath)
        if (change?.before !== undefined) return change.before as string
      }
      return null
    },
    enabled: !!content,
    staleTime: 60_000,
  })

  const copyFile = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = content?.split('\n') ?? []
  const lang = getLang(filePath)
  const wasChanged = originalContent !== null && originalContent !== undefined && originalContent !== content
  const beforeLines = originalContent?.split('\n') ?? []

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-surface-700 bg-surface-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] bg-surface-700 text-zinc-400 px-2 py-0.5 rounded font-mono">{lang}</span>
          <span className="text-xs text-zinc-400 font-mono truncate">{filePath}</span>
          {wasChanged && (
            <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded shrink-0">
              modified by ForgeAI
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {wasChanged && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={clsx(
                'flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors',
                showDiff
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-700',
              )}
            >
              <GitCompare size={11} />
              {showDiff ? 'Show file' : 'Show diff'}
            </button>
          )}
          <span className="text-[10px] text-zinc-600">{lines.length} lines</span>
          <button
            onClick={copyFile}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 gap-2 text-zinc-600">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-4 text-red-400 text-sm">
            <AlertCircle size={14} />
            Could not load file. Make sure the repository is cloned.
          </div>
        )}
        {content && !showDiff && (
          <table className="w-full border-collapse font-mono text-[12px]">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-surface-800 group">
                  <td className="select-none text-right text-zinc-700 px-3 py-0 w-10 leading-relaxed border-r border-surface-700 align-top shrink-0 text-[10px]">
                    {i + 1}
                  </td>
                  <td className="px-4 py-0 leading-relaxed text-zinc-300 whitespace-pre">
                    {line || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Inline diff view when "Show diff" is clicked */}
        {content && showDiff && wasChanged && (
          <div className="font-mono text-[11px]">
            <div className="grid grid-cols-2 divide-x divide-surface-700">
              <div>
                <div className="px-3 py-1.5 text-[10px] text-red-400 bg-red-500/5 border-b border-surface-700 font-sans sticky top-0">
                  Before (original)
                </div>
                {beforeLines.map((line, i) => {
                  const changed = line !== (lines[i] ?? '')
                  return (
                    <div key={i} className={clsx('flex leading-relaxed', changed && 'bg-red-500/10')}>
                      <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-surface-700 text-[10px]">{i + 1}</span>
                      <span className={clsx('px-3 whitespace-pre', changed ? 'text-red-300/80' : 'text-zinc-500')}>
                        {line || ' '}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div>
                <div className="px-3 py-1.5 text-[10px] text-emerald-400 bg-emerald-500/5 border-b border-surface-700 font-sans sticky top-0">
                  After (current)
                </div>
                {lines.map((line, i) => {
                  const changed = line !== (beforeLines[i] ?? '')
                  return (
                    <div key={i} className={clsx('flex leading-relaxed', changed && 'bg-emerald-500/10')}>
                      <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-surface-700 text-[10px]">{i + 1}</span>
                      <span className={clsx('px-3 whitespace-pre', changed ? 'text-emerald-300/80' : 'text-zinc-500')}>
                        {line || ' '}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function clsx(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}