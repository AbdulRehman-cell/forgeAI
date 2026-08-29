// frontend/src/components/Markdown.tsx
// Reusable markdown renderer for AI-generated summaries, reviews, scans.
// No dependencies — same approach as ChatPanel's renderer.
import { useEffect, useRef } from 'react'

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(text: string): string {
  // Pull code blocks out first (content escaped), then escape EVERYTHING
  // else before formatting — otherwise literal HTML in the AI's reply is
  // injected into the page instead of displayed as text.
  const blocks: string[] = []
  const extracted = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre class="mdx-code" data-lang="${lang || ''}">${escHtml(code.trim())}</pre>`)
    return `\u0000B${blocks.length - 1}\u0000`
  })

  return escHtml(extracted)
    // tables: | a | b |
    .replace(/((?:^\|.+\|\s*$\n?)+)/gm, (block) => {
      const rows = block.trim().split('\n').filter((r) => r.trim().startsWith('|'))
      if (rows.length < 2) return block
      const cells = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim())
      const isDivider = (row: string) => /^\|[\s:-]+\|/.test(row.replace(/\|/g, '|'))
      let html = '<table class="mdx-table">'
      rows.forEach((row, i) => {
        if (/^[\s|:-]+$/.test(row)) return // divider row
        const tag = i === 0 ? 'th' : 'td'
        html += '<tr>' + cells(row).map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>'
      })
      return html + '</table>'
    })
    // inline code
    .replace(/`([^`]+)`/g, '<code class="mdx-inline">$1</code>')
    // headings
    .replace(/^#### (.+)$/gm, '<h4 class="mdx-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="mdx-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="mdx-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="mdx-h1">$1</h1>')
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // severity badges — colorize common review/scan keywords
    .replace(/\b(CRITICAL|Critical)\b/g, '<span class="mdx-sev mdx-critical">CRITICAL</span>')
    .replace(/\b(HIGH|High severity|MAJOR|Major)\b/g, '<span class="mdx-sev mdx-high">$1</span>')
    .replace(/\b(MEDIUM|Medium)\b(?=[\s:)\],.])/g, '<span class="mdx-sev mdx-medium">$1</span>')
    .replace(/\b(LOW|Minor)\b(?=[\s:)\],.])/g, '<span class="mdx-sev mdx-low">$1</span>')
    // numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="mdx-oli">$1</li>')
    // bullets
    .replace(/^[-*]\s+(.+)$/gm, '<li class="mdx-li">$1</li>')
    .replace(/((?:<li class="mdx-li">[\s\S]*?<\/li>\n?)+)/g, '<ul class="mdx-ul">$1</ul>')
    .replace(/((?:<li class="mdx-oli">[\s\S]*?<\/li>\n?)+)/g, '<ol class="mdx-ol">$1</ol>')
    // horizontal rules
    .replace(/^---+$/gm, '<hr class="mdx-hr" />')
    // paragraphs
    .replace(/\n\n+/g, '</p><p class="mdx-p">')
    .replace(/\n/g, '<br />')
    // restore extracted code blocks
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => blocks[Number(i)])
}

interface Props {
  content: string
  className?: string
}

export default function Markdown({ content, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Add copy buttons to code blocks
  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll<HTMLPreElement>('pre.mdx-code').forEach((pre) => {
      if (pre.querySelector('.mdx-copy')) return
      const btn = document.createElement('button')
      btn.className = 'mdx-copy'
      btn.textContent = '⎘ Copy'
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.innerText.replace(/^⎘ Copy\n?/, ''))
        btn.textContent = '✓ Copied'
        setTimeout(() => { btn.textContent = '⎘ Copy' }, 2000)
      }
      pre.prepend(btn)
    })
  }, [content])

  return (
    <>
      <style>{MDX_STYLES}</style>
      <div
        ref={ref}
        className={`mdx-root ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: `<p class="mdx-p">${renderMarkdown(content)}</p>` }}
      />
    </>
  )
}

const MDX_STYLES = `
.mdx-root { color:#d4d4d8; font-size:13px; line-height:1.7; }
.mdx-p { margin:0 0 10px; }
.mdx-p:last-child { margin-bottom:0; }
.mdx-h1 { font-size:18px; font-weight:700; color:#f4f4f5; margin:18px 0 8px; }
.mdx-h2 { font-size:15px; font-weight:600; color:#f4f4f5; margin:16px 0 6px; padding-bottom:4px; border-bottom:1px solid #27272a; }
.mdx-h3 { font-size:13.5px; font-weight:600; color:#e4e4e7; margin:12px 0 5px; }
.mdx-h4 { font-size:12.5px; font-weight:600; color:#d4d4d8; margin:10px 0 4px; }
.mdx-ul, .mdx-ol { padding-left:18px; margin:6px 0; }
.mdx-ul { list-style:disc; }
.mdx-ol { list-style:decimal; }
.mdx-li, .mdx-oli { margin:3px 0; color:#c4c4cc; }
.mdx-hr { border:none; border-top:1px solid #27272a; margin:14px 0; }
.mdx-root strong { color:#f4f4f5; font-weight:600; }
.mdx-root em { color:#a1a1aa; }
.mdx-inline { background:#27272a; border:1px solid #3a3a42; color:#a78bfa; padding:1px 5px; border-radius:4px; font-family:'JetBrains Mono',monospace; font-size:11.5px; }
.mdx-code { background:#111114; border:1px solid #26262c; border-radius:8px; padding:30px 12px 12px; margin:10px 0; overflow-x:auto; font-family:'JetBrains Mono',monospace; font-size:11.5px; line-height:1.6; color:#c9c9d1; position:relative; white-space:pre; }
.mdx-copy { position:absolute; top:6px; right:8px; background:#1e1e24; border:1px solid #2e2e36; color:#71717a; font-size:10px; padding:2px 8px; border-radius:5px; cursor:pointer; transition:color .15s; }
.mdx-copy:hover { color:#d4d4d8; }
.mdx-table { border-collapse:collapse; margin:10px 0; width:100%; font-size:12px; }
.mdx-table th { background:#1c1c22; color:#e4e4e7; text-align:left; padding:6px 10px; border:1px solid #2a2a32; font-weight:600; }
.mdx-table td { padding:5px 10px; border:1px solid #26262c; color:#b9b9c2; }
.mdx-sev { display:inline-block; font-size:10px; font-weight:700; padding:1px 7px; border-radius:99px; letter-spacing:.03em; }
.mdx-critical { background:rgba(239,68,68,.15); color:#f87171; border:1px solid rgba(239,68,68,.3); }
.mdx-high { background:rgba(249,115,22,.15); color:#fb923c; border:1px solid rgba(249,115,22,.3); }
.mdx-medium { background:rgba(234,179,8,.12); color:#facc15; border:1px solid rgba(234,179,8,.25); }
.mdx-low { background:rgba(113,113,122,.15); color:#a1a1aa; border:1px solid rgba(113,113,122,.3); }
`
