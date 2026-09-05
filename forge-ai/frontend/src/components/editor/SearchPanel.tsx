import { useState, useCallback, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { api } from '@/lib/api'
import { Search, X, Loader2, FileCode2, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import debounce from 'lodash/debounce'

interface Props {
  repositoryId: string
  onResultClick: (path: string, line: number) => void
}

export default function SearchPanel({ repositoryId, onResultClick }: Props) {
  const { searchQuery, searchResults, searchLoading, setSearchQuery, setSearchResults, setSearchLoading } = useEditorStore()
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) { setSearchResults([]); setSearchLoading(false); return }
      setSearchLoading(true)
      try {
        const { data } = await api.post(`/repositories/${repositoryId}/search`, {
          query, caseSensitive, wholeWord,
        })
        setSearchResults(data.results ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 400),
    [repositoryId, caseSensitive, wholeWord],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    doSearch(e.target.value)
  }

  const clear = () => { setSearchQuery(''); setSearchResults([]) }

  // Group results by file
  const grouped = searchResults.reduce((acc: Record<string, typeof searchResults>, r) => {
    if (!acc[r.path]) acc[r.path] = []
    acc[r.path].push(r)
    return acc
  }, {})

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-2 border-b border-[#27272a]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={handleChange}
            placeholder="Search in files…"
            className="w-full bg-[#0f0f11] border border-[#27272a] focus:border-brand-600 rounded-md pl-7 pr-7 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 outline-none transition-colors font-mono"
          />
          {searchQuery && (
            <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Options */}
        <div className="flex gap-1 mt-1.5">
          {[
            { label: 'Aa', title: 'Case sensitive', active: caseSensitive, toggle: () => setCaseSensitive(!caseSensitive) },
            { label: 'W', title: 'Whole word', active: wholeWord, toggle: () => setWholeWord(!wholeWord) },
          ].map(({ label, title, active, toggle }) => (
            <button
              key={label}
              onClick={toggle}
              title={title}
              className={clsx(
                'px-2 py-0.5 text-[10px] rounded border transition-colors font-mono',
                active
                  ? 'bg-brand-600/20 border-brand-600/50 text-brand-400'
                  : 'border-[#27272a] text-zinc-600 hover:text-zinc-400'
              )}
            >
              {label}
            </button>
          ))}
          {searchResults.length > 0 && (
            <span className="ml-auto text-[10px] text-zinc-600 py-0.5">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto text-[11px]">
        {searchLoading && (
          <div className="flex items-center gap-2 p-3 text-zinc-600">
            <Loader2 size={12} className="animate-spin" />
            Searching…
          </div>
        )}

        {!searchLoading && searchQuery && !searchResults.length && (
          <div className="p-3 text-zinc-600">No results for "{searchQuery}"</div>
        )}

        {Object.entries(grouped).map(([filePath, results]) => (
          <div key={filePath}>
            {/* File header */}
            <button
              onClick={() => toggleCollapse(filePath)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-[#1c1c1f] transition-colors"
            >
              <ChevronRight
                size={10}
                className={clsx('text-zinc-600 transition-transform shrink-0', !collapsed.has(filePath) && 'rotate-90')}
              />
              <FileCode2 size={11} className="text-brand-400 shrink-0" />
              <span className="text-zinc-300 truncate font-mono flex-1 text-left">{filePath.split('/').pop()}</span>
              <span className="text-zinc-600 shrink-0">{results.length}</span>
            </button>

            {/* File path */}
            {!collapsed.has(filePath) && (
              <div className="px-6 pb-0.5 text-[10px] text-zinc-600 font-mono truncate">{filePath}</div>
            )}

            {/* Matches */}
            {!collapsed.has(filePath) && results.map((r, i) => (
              <button
                key={i}
                onClick={() => onResultClick(r.path, r.line)}
                className="w-full flex items-start gap-2 px-6 py-1 hover:bg-[#1c1c1f] transition-colors text-left"
              >
                <span className="text-zinc-700 shrink-0 font-mono w-8 text-right">{r.line}</span>
                <span className="text-zinc-500 font-mono truncate flex-1">
                  {r.preview.slice(0, r.col - 1)}
                  <mark className="bg-yellow-500/30 text-yellow-300 rounded-sm px-0.5">{r.match}</mark>
                  {r.preview.slice(r.col - 1 + r.match.length)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}