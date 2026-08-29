import { useEditorStore } from '@/store/editorStore'
import { X, Circle } from 'lucide-react'
import clsx from 'clsx'

function getFileIcon(language: string): string {
  const icons: Record<string, string> = {
    typescript: '🔷', javascript: '🟨', python: '🐍', json: '📋',
    markdown: '📝', css: '🎨', scss: '🎨', html: '🌐', go: '🐹',
    rust: '🦀', java: '☕', csharp: '💜', cpp: '⚙️', shell: '🖥️',
    yaml: '📄', sql: '🗃️', dockerfile: '🐳',
  }
  return icons[language] ?? '📄'
}

interface Props {
  onTabClick: (tabId: string) => void
  activeId: string | null
}

export default function TabBar({ onTabClick, activeId }: Props) {
  const { tabs, closeTab } = useEditorStore()

  if (!tabs.length) return (
    <div className="flex items-center px-4 h-9 border-b border-[#1c1c1f] bg-[#18181b]">
      <span className="text-[11px] text-zinc-700">No files open</span>
    </div>
  )

  return (
    <div className="flex items-center border-b border-[#1c1c1f] bg-[#18181b] overflow-x-auto shrink-0 tab-scroll">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={clsx(
            'group flex items-center gap-1.5 px-3 h-9 border-r border-[#1c1c1f] cursor-pointer transition-colors shrink-0 max-w-[180px]',
            activeId === tab.id
              ? 'bg-[#0f0f11] border-t-2 border-t-brand-500 text-zinc-200'
              : 'bg-[#18181b] text-zinc-500 hover:text-zinc-300 hover:bg-[#1c1c1f] border-t-2 border-t-transparent',
          )}
          title={tab.path}
        >
          <span className="text-[11px]">{getFileIcon(tab.language)}</span>
          <span className="text-[11px] font-mono truncate flex-1">{tab.label}</span>
          {tab.isDirty && (
            <Circle size={6} className="text-yellow-400 fill-yellow-400 shrink-0" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all p-0.5 rounded shrink-0"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <style>{`.tab-scroll::-webkit-scrollbar{height:3px}.tab-scroll::-webkit-scrollbar-thumb{background:#27272a}`}</style>
    </div>
  )
}