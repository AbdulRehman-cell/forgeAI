import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Zap, FileCode2, Calendar, Cpu, Globe, Loader2, AlertCircle, ExternalLink } from 'lucide-react'

interface ReportData {
  repository: {
    name: string
    fullName: string
    description?: string
    language?: string
    fileCount?: number
    status: string
    createdAt: string
  }
  analysis: {
    type: string
    summary: string
    createdAt: string
  } | null
  deploy: {
    url: string
    platform: string
  } | null
}

function MarkdownBlock({ content }: { content: string }) {
  // Minimal markdown renderer (headings, bold, bullets, code)
  const html = content
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-zinc-100 mt-8 mb-3">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-zinc-200 mt-6 mb-2 border-b border-surface-700 pb-1">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-zinc-300 mt-4 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-100">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="font-mono text-xs bg-surface-700 px-1.5 py-0.5 rounded text-brand-300">$1</code>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="flex gap-2 items-start py-0.5"><span class="text-zinc-600 mt-0.5 shrink-0">☐</span><span>$1</span></div>')
    .replace(/^- \[x\] (.+)$/gm, '<div class="flex gap-2 items-start py-0.5"><span class="text-green-400 mt-0.5 shrink-0">☑</span><span>$1</span></div>')
    .replace(/^- (.+)$/gm, '<div class="flex gap-2 items-start py-0.5"><span class="text-brand-400 shrink-0">·</span><span>$1</span></div>')
    .replace(/^\| (.+) \|$/gm, (_match, row) => {
      if (row.replace(/[-| ]/g, '').trim() === '') return ''
      const cells = row.split('|').map((c: string) => c.trim())
      return '<tr>' + cells.map((c: string) => `<td class="px-3 py-1.5 text-sm border-b border-surface-700">${c}</td>`).join('') + '</tr>'
    })
    .replace(/(<tr>[\s\S]+?<\/tr>)/g, '<table class="w-full border-collapse bg-surface-800 rounded-lg overflow-hidden mb-4">$1</table>')
    .replace(/```[\w]*\n([\s\S]+?)```/g, '<pre class="bg-[#0d0d14] rounded-xl p-4 overflow-x-auto my-3 text-xs font-mono text-zinc-300"><code>$1</code></pre>')
    .replace(/\n\n/g, '</p><p class="mb-2 text-zinc-400 text-sm">')

  return (
    <div
      className="text-zinc-400 text-sm leading-relaxed space-y-1"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${html}</p>` }}
    />
  )
}

export default function ShareReport() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    api.get(`/share/${token}`)
      .then((r) => setData(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle size={32} className="text-zinc-600" />
        <h1 className="text-xl font-bold text-zinc-300">Report not found</h1>
        <p className="text-zinc-500 text-sm">This link may have expired or been revoked.</p>
      </div>
    )
  }

  const { repository: repo, analysis, deploy } = data
  const typeLabel: Record<string, string> = {
    review: 'Code Review',
    rebuild_proposal: 'Rebuild Proposal',
    security_scan: 'Security Scan',
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-300">
      {/* Header */}
      <header className="border-b border-surface-800 sticky top-0 z-10 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm">
            <Zap size={15} className="text-white" />
          </div>
          <span className="font-bold text-zinc-100 tracking-tight">ForgeAI</span>
          <span className="text-zinc-700 mx-2">·</span>
          <span className="text-sm text-zinc-400">Repository Report</span>
          {deploy && (
            <a
              href={deploy.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400 hover:bg-green-500/20 transition-colors"
            >
              <Globe size={11} /> Live Site <ExternalLink size={10} />
            </a>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Repo info */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">{repo.fullName}</h1>
          {repo.description && (
            <p className="text-zinc-400 text-base mb-4">{repo.description}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {repo.language && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs">
                <Cpu size={11} className="text-brand-400" />
                <span className="text-zinc-300">{repo.language}</span>
              </div>
            )}
            {repo.fileCount && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs">
                <FileCode2 size={11} className="text-zinc-500" />
                <span className="text-zinc-300">{repo.fileCount.toLocaleString()} files</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs">
              <Calendar size={11} className="text-zinc-500" />
              <span className="text-zinc-300">Analysed {new Date(repo.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Analysis */}
        {analysis ? (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-brand-500 to-violet-500" />
              <h2 className="text-base font-semibold text-zinc-100">
                {typeLabel[analysis.type] ?? 'Analysis'}
              </h2>
              <span className="text-xs text-zinc-600 ml-2">
                {new Date(analysis.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="bg-surface-900 border border-surface-700 rounded-2xl p-6">
              <MarkdownBlock content={analysis.summary} />
            </div>
          </div>
        ) : (
          <div className="mb-8 px-6 py-8 rounded-2xl bg-surface-900 border border-surface-700 border-dashed text-center">
            <p className="text-zinc-500 text-sm">No analysis available yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Run a Code Review or Rebuild Proposal from the workspace first.</p>
          </div>
        )}

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-r from-brand-600/20 to-violet-600/15 border border-brand-500/30 p-6 text-center">
          <p className="text-zinc-200 font-semibold text-base mb-1">Want your own site rebuilt by ForgeAI?</p>
          <p className="text-zinc-400 text-sm mb-4">Professional AI-powered rebuild — delivered faster and better.</p>
          <a
            href="https://forgeai.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-violet-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Zap size={14} /> Get Started with ForgeAI
          </a>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-6">
          Generated by ForgeAI · This report is read-only and public
        </p>
      </main>
    </div>
  )
}
