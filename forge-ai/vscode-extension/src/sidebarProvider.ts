// vscode-extension/src/sidebarProvider.ts
import * as vscode from 'vscode'

export class BuddySidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'forgeai.home'
  private view?: vscode.WebviewView

  constructor(private onMessage: (msg: any, view: vscode.WebviewView) => void) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    view.webview.options = { enableScripts: true }
    view.webview.html = this.html()
    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg, view))
  }

  post(msg: any) { this.view?.webview.postMessage(msg) }

  private html(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui; background: transparent; color: #d4d4d8; padding: 12px 10px; font-size: 12px; }

  .hero { text-align:center; margin-bottom:14px; }
  .hero h1 { font-size:15px; font-weight:700;
    background: linear-gradient(135deg,#fff,#a5b4fc,#c4b5fd);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  .hero p { color:#71717a; font-size:10.5px; margin-top:3px; }

  .btn { position:relative; display:flex; align-items:center; gap:10px; width:100%;
    padding:11px 12px; margin-bottom:8px; border:none; border-radius:12px;
    cursor:pointer; text-align:left; color:#fff; font-size:12px; font-weight:600;
    transition: transform .18s, box-shadow .18s; overflow:hidden; }
  .btn:hover { transform: translateY(-2px); }
  .btn:active { transform: translateY(0); }
  .btn .sub { display:block; font-weight:400; font-size:10px; opacity:.75; margin-top:1px; }
  .btn .ic { font-size:16px; filter: drop-shadow(0 0 6px rgba(255,255,255,.4)); }

  .btn-scan { background: linear-gradient(135deg,#4f46e5,#7c3aed); box-shadow:0 4px 20px -6px rgba(99,102,241,.6); }
  .btn-scan:hover { box-shadow:0 6px 28px -6px rgba(124,58,237,.8); }
  .btn-fix  { background: linear-gradient(135deg,#7c3aed,#db2777); box-shadow:0 4px 20px -6px rgba(219,39,119,.5); }
  .btn-fix:hover { box-shadow:0 6px 28px -6px rgba(219,39,119,.7); }
  .btn-import { background: linear-gradient(135deg,#0ea5e9,#4f46e5); box-shadow:0 4px 20px -6px rgba(14,165,233,.5); }
  .btn-import:hover { box-shadow:0 6px 28px -6px rgba(14,165,233,.7); }
  .btn-ghosty { background: rgba(63,63,70,.35); border:1px solid rgba(99,102,241,.25); color:#c7c7d1; box-shadow:none; }
  .btn-ghosty:hover { border-color:rgba(99,102,241,.6); }

  .status { display:none; align-items:center; gap:8px; padding:10px; margin:10px 0;
    border-radius:10px; background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.3); font-size:11px; }
  .spinner { width:12px; height:12px; border:2px solid rgba(165,180,252,.3); border-top-color:#a5b4fc;
    border-radius:50%; animation:spin .8s linear infinite; flex-shrink:0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .summary { display:none; padding:10px; border-radius:10px; margin:10px 0; font-size:11px; line-height:1.55;
    background: linear-gradient(160deg, rgba(99,102,241,.12), rgba(24,24,27,.6));
    border:1px solid rgba(99,102,241,.3); color:#c7c7d1; }

  .issue { border:1px solid #2a2a34; border-radius:12px; padding:10px; margin-bottom:8px;
    background: linear-gradient(160deg, rgba(24,24,27,.9), rgba(15,15,17,.9)); animation: fadeUp .35s both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:none; } }
  .issue h3 { font-size:11.5px; color:#f4f4f5; margin-bottom:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .sev { font-size:8.5px; font-weight:700; padding:1px 7px; border-radius:99px; letter-spacing:.04em; text-transform:uppercase; }
  .sev-critical { background:rgba(239,68,68,.15); color:#f87171; border:1px solid rgba(239,68,68,.35); }
  .sev-high { background:rgba(249,115,22,.15); color:#fb923c; border:1px solid rgba(249,115,22,.35); }
  .sev-medium { background:rgba(234,179,8,.12); color:#facc15; border:1px solid rgba(234,179,8,.3); }
  .sev-low { background:rgba(113,113,122,.15); color:#a1a1aa; border:1px solid rgba(113,113,122,.3); }
  .issue p { font-size:10.5px; color:#9d9da8; line-height:1.5; margin:4px 0; }
  .hint { color:#a5b4fc !important; }
  .fchip { display:inline-block; font-family:monospace; font-size:9.5px; background:#1c1c24;
    border:1px solid #34343e; color:#a5b4fc; padding:1px 6px; border-radius:6px; margin:2px 3px 0 0; cursor:pointer; }
  .fchip:hover { border-color:#6366f1; }

  #applyAll { display:none; }
</style></head>
<body>
  <div class="hero">
    <h1>⚡ ForgeAI Buddy</h1>
    <p>Your whole-folder AI engineer</p>
  </div>

  <button class="btn btn-scan" onclick="send('scanFolder')">
    <span class="ic">🔍</span>
    <span>Scan Folder<span class="sub">Find cross-file bugs: imports, exports, wrong params</span></span>
  </button>

  <button class="btn btn-fix" onclick="send('fixFolder')">
    <span class="ic">🤖</span>
    <span>Auto-Fix Folder<span class="sub">AI fixes issues across ALL linked files autonomously</span></span>
  </button>

  <button class="btn btn-import" onclick="send('importRepo')">
    <span class="ic">📥</span>
    <span>Import Repo<span class="sub">Clone one of your ForgeAI repos into VS Code</span></span>
  </button>

  <button class="btn btn-ghosty" onclick="send('fixCurrent')">
    <span class="ic">📄</span>
    <span>Fix Current File<span class="sub">Quick single-file repair</span></span>
  </button>

  <button class="btn btn-ghosty" onclick="send('explainCurrent')">
    <span class="ic">💬</span>
    <span>Explain Current File<span class="sub">Understand any code instantly</span></span>
  </button>

  <div class="status" id="status"><div class="spinner"></div><span id="statusText">Working…</span></div>
  <div class="summary" id="summary"></div>
  <button class="btn btn-fix" id="applyAll" onclick="send('applyAll')">
    <span class="ic">✨</span><span>Apply All Fixes<span class="sub" id="applySub"></span></span>
  </button>
  <div id="issues"></div>

<script>
  const vscode = acquireVsCodeApi()
  function send(command, data) { vscode.postMessage({ command, ...data }) }

  window.addEventListener('message', (e) => {
    const m = e.data
    const status = document.getElementById('status')
    if (m.command === 'busy') {
      status.style.display = 'flex'
      document.getElementById('statusText').textContent = m.text
      document.getElementById('issues').innerHTML = ''
      document.getElementById('summary').style.display = 'none'
      document.getElementById('applyAll').style.display = 'none'
    }
    if (m.command === 'idle') status.style.display = 'none'
    if (m.command === 'results') {
      status.style.display = 'none'
      const s = document.getElementById('summary')
      if (m.summary) { s.textContent = m.summary; s.style.display = 'block' }
      if (m.fixCount > 0) {
        const b = document.getElementById('applyAll')
        b.style.display = 'flex'
        document.getElementById('applySub').textContent = m.fixCount + ' file(s) will be rewritten'
      }
      const wrap = document.getElementById('issues')
      wrap.innerHTML = ''
      for (const i of (m.issues ?? [])) {
        const div = document.createElement('div')
        div.className = 'issue'
        const chips = (i.files ?? []).map(f =>
          '<span class="fchip" data-f="' + f + '">' + f + '</span>').join('')
        div.innerHTML =
          '<h3><span class="sev sev-' + (i.severity ?? 'low') + '">' + (i.severity ?? 'low') + '</span>' +
          escapeHtml(i.title ?? 'Issue') + '</h3>' +
          '<div>' + chips + '</div>' +
          '<p>' + escapeHtml(i.description ?? '') + '</p>' +
          (i.fix_hint ? '<p class="hint">💡 ' + escapeHtml(i.fix_hint) + '</p>' : '')
        wrap.appendChild(div)
      }
      wrap.querySelectorAll('.fchip').forEach(c =>
        c.addEventListener('click', () => send('openFile', { file: c.dataset.f })))
      if (!(m.issues ?? []).length) {
        wrap.innerHTML = '<div class="issue"><h3>✅ No cross-file issues found</h3><p>Your folder links look clean.</p></div>'
      }
    }
  })
  function escapeHtml(s){return (s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script>
</body></html>`
  }
}
