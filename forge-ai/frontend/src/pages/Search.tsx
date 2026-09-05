import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { CodeSearchResult } from '@/types'
import { Search as SearchIcon, FileCode2, Loader2, GitBranch, ChevronRight } from 'lucide-react'

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CodeSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const search = async (q: string) => {
    if (!q.trim() || q.trim().length < 2) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/repositories/search/code?q=${encodeURIComponent(q.trim())}`)
      setResults(data.results)
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Search failed')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search(query)
  }

  // Group results by repo
  const grouped = results?.reduce<Record<string, CodeSearchResult[]>>((acc, r) => {
    const key = r.repoFullName
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {}) ?? {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-surface-700 shrink-0">
        <h1 className="text-xl font-bold text-zinc-100 mb-1">Code Search</h1>
        <p className="text-sm text-zinc-500">Search across all your repositories simultaneously</p>

        {/* Search bar */}
        <div className="mt-4 relative">
          <SearchIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search function names, component names, patterns…"
            className="w-full pl-10 pr-28 py-2.5 rounded-xl bg-surface-800 border border-surface-600 text-sm text-zinc-100 placeholder-zinc-600 focus:border-brand-500 focus:outline-none"
            autoFocus
          />
          <button
            disabled={loading || query.trim().length < 2}
            onClick={() => search(query)}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {results === null && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center">
              <SearchIcon size={22} className="text-zinc-600" />
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">Search your entire codebase</p>
              <p className="text-zinc-600 text-xs mt-1">Find functions, components, patterns across all repositories</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {['useState', 'authenticate', 'fetchData', 'handleSubmit'].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); search(ex) }}
                  className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-brand-500 font-mono transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-12">
            No results found for <span className="font-mono text-zinc-300">"{query}"</span>
          </div>
        )}

        {Object.entries(grouped).map(([repoFullName, hits]) => (
          <div key={repoFullName} className="mb-6">
            {/* Repo header */}
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={13} className="text-brand-400" />
              <span className="text-sm font-semibold text-zinc-200">{repoFullName}</span>
              <span className="text-xs text-zinc-600 bg-surface-800 px-2 py-0.5 rounded-full">{hits.length} match{hits.length !== 1 ? 'es' : ''}</span>
            </div>

            {/* Hits */}
            <div className="space-y-1.5 pl-4 border-l border-surface-700">
              {hits.slice(0, 20).map((hit, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/repositories/${hit.repoId}/workspace`)}
                  className="w-full text-left group px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-700 hover:border-brand-500/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode2 size={11} className="text-zinc-600 shrink-0" />
                    <span className="text-[11px] font-mono text-zinc-400 truncate flex-1">{hit.file}</span>
                    <span className="text-[10px] text-zinc-600 shrink-0">line {hit.line}</span>
                    <ChevronRight size={10} className="text-zinc-700 group-hover:text-brand-400 transition-colors shrink-0" />
                  </div>
                  <p className="font-mono text-xs text-zinc-300 truncate pl-4 group-hover:text-zinc-100 transition-colors">
                    {hit.snippet}
                  </p>
                </button>
              ))}
              {hits.length > 20 && (
                <p className="text-xs text-zinc-600 pl-3">+{hits.length - 20} more matches in this repo</p>
              )}
            </div>
          </div>
        ))}

        {results !== null && results.length > 0 && (
          <p className="text-xs text-zinc-600 text-center mt-4">
            {results.length} result{results.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} repo{Object.keys(grouped).length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
