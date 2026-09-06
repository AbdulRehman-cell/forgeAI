import { useRef, useState } from 'react'
import Editor, { OnMount, OnChange } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editorStore'
import { api } from '@/lib/api'
import { Save, RotateCcw, SplitSquareHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import type { editor } from 'monaco-editor'

interface Props {
  tabId: string
  repositoryId: string
  isSplit?: boolean
}

const MONACO_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
    { token: 'keyword', foreground: '79B8FF' },
    { token: 'string', foreground: '9ECBFF' },
    { token: 'number', foreground: 'F8C555' },
    { token: 'type', foreground: 'B392F0' },
    { token: 'function', foreground: 'B392F0' },
    { token: 'variable', foreground: 'E1E4E8' },
  ],
  colors: {
    'editor.background': '#0f0f11',
    'editor.foreground': '#E1E4E8',
    'editor.lineHighlightBackground': '#18181b',
    'editor.selectionBackground': '#3a3a5c',
    'editor.selectionHighlightBackground': '#2a2a4c',
    'editorLineNumber.foreground': '#444450',
    'editorLineNumber.activeForeground': '#888894',
    'editorCursor.foreground': '#6366f1',
    'editorBracketMatch.background': '#3a3a5c',
    'editorBracketMatch.border': '#6366f1',
    'scrollbarSlider.background': '#27272a80',
    'scrollbarSlider.hoverBackground': '#3f3f46',
    'editorGutter.background': '#0f0f11',
    'editorIndentGuide.background': '#1c1c1f',
    'editorIndentGuide.activeBackground': '#27272a',
    'editor.findMatchBackground': '#4f46e540',
    'editor.findMatchHighlightBackground': '#4f46e520',
  },
}

export default function EditorPane({ tabId, repositoryId, isSplit }: Props) {
  const { tabs, updateContent, markSaved, openSplit, closeSplit, splitEnabled } = useEditorStore()
  const tab = tabs.find((t) => t.id === tabId)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const [saving, setSaving] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed

    // Register custom theme
    monaco.editor.defineTheme('forge-dark', MONACO_THEME)
    monaco.editor.setTheme('forge-dark')

    // Cursor position tracking
    ed.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, col: e.position.column })
    })

    // Ctrl+S to save
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave()
    })

    // Focus
    ed.focus()
  }

  const handleChange: OnChange = (value) => {
    if (value !== undefined) updateContent(tabId, value)
  }

  const handleSave = async () => {
    if (!tab || saving) return
    setSaving(true)
    try {
      await api.put(`/repositories/${repositoryId}/file`, {
        path: tab.path,
        content: tab.content,
      })
      markSaved(tabId)
      toast.success('Saved', { duration: 1500 })
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!tab) return
    updateContent(tabId, tab.originalContent)
    editorRef.current?.setValue(tab.originalContent)
  }

  if (!tab) return (
    <div className="flex items-center justify-center h-full bg-[#0f0f11] text-zinc-600 text-sm">
      No file open
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-[#0f0f11]">
      {/* Editor toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#1c1c1f] bg-[#18181b] shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {tab.path.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-700 text-[10px]">/</span>}
              <span className={`text-[11px] font-mono truncate ${
                i === arr.length - 1
                  ? 'text-zinc-300'
                  : 'text-zinc-600 hover:text-zinc-400 cursor-pointer'
              }`}>
                {segment}
              </span>
            </span>
          ))}
          {tab.isDirty && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" title="Unsaved changes" />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {tab.isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-[#27272a] transition-colors"
              title="Reset to original"
            >
              <RotateCcw size={11} /> Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!tab.isDirty || saving}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-zinc-500 hover:text-zinc-300 hover:bg-[#27272a]"
            title="Save (Ctrl+S)"
          >
            <Save size={11} /> {saving ? 'Saving…' : 'Save'}
          </button>
          {!isSplit && (
            <button
              onClick={() => splitEnabled ? closeSplit() : openSplit(tabId)}
              className={`p-1.5 rounded transition-colors ${
                splitEnabled
                  ? 'text-brand-400 bg-brand-600/10'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-[#27272a]'
              }`}
              title={splitEnabled ? 'Close split' : 'Split editor'}
            >
              <SplitSquareHorizontal size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={tab.language}
          value={tab.content}
          onChange={handleChange}
          onMount={handleMount}
          theme="forge-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            minimap: { enabled: true, scale: 0.8 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'off',
            tabSize: 2,
            insertSpaces: true,
            folding: true,
            foldingHighlight: true,
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            mouseWheelZoom: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            renderWhitespace: 'selection',
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: true,
            parameterHints: { enabled: true },
            formatOnPaste: true,
            formatOnType: false,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 bg-[#18181b] border-t border-[#1c1c1f] shrink-0">
        <span className="text-[10px] text-zinc-600 font-mono">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono capitalize">{tab.language}</span>
        <span className="text-[10px] text-zinc-600">UTF-8</span>
        {tab.isDirty && (
          <span className="text-[10px] text-yellow-500 ml-auto">● Unsaved</span>
        )}
      </div>
    </div>
  )
}