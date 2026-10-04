/**
 * ForgeAI React Component Pack
 * Injected into every MERN build as client/src/components/ui/
 * All components use the design-pack CSS variables — theme-aware out of the box.
 */

export interface ReactPackFile {
  path: string
  content: string
}

export function getReactPackFiles(): ReactPackFile[] {
  return [
    { path: 'client/src/components/ui/index.ts',        content: UI_INDEX },
    { path: 'client/src/components/ui/Button.tsx',      content: BUTTON },
    { path: 'client/src/components/ui/Card.tsx',        content: CARD },
    { path: 'client/src/components/ui/Input.tsx',       content: INPUT },
    { path: 'client/src/components/ui/Textarea.tsx',    content: TEXTAREA },
    { path: 'client/src/components/ui/Select.tsx',      content: SELECT },
    { path: 'client/src/components/ui/Badge.tsx',       content: BADGE },
    { path: 'client/src/components/ui/Avatar.tsx',      content: AVATAR },
    { path: 'client/src/components/ui/Modal.tsx',       content: MODAL },
    { path: 'client/src/components/ui/Spinner.tsx',     content: SPINNER },
    { path: 'client/src/components/ui/Alert.tsx',       content: ALERT },
    { path: 'client/src/components/ui/Stat.tsx',        content: STAT },
    { path: 'client/src/components/ui/EmptyState.tsx',  content: EMPTY_STATE },
    { path: 'client/src/components/ui/PageHeader.tsx',  content: PAGE_HEADER },
    { path: 'client/src/components/ui/Table.tsx',       content: TABLE },
    { path: 'client/src/components/ui/Navbar.tsx',      content: NAVBAR },
    { path: 'client/src/components/ui/Tabs.tsx',        content: TABS },
    { path: 'client/src/components/ui/Toast.tsx',       content: TOAST },
  ]
}

export function getReactPackCss(): string {
  return COMPONENT_CSS
}

export function getReactPackPromptNote(): string {
  return `
FORGEAI REACT COMPONENT PACK — INJECTED INTO client/src/components/ui/

These production-quality components are already written. USE THEM. Never hand-write a button, card, input, modal, table, badge, or alert from scratch.

IMPORT PATTERN (relative path from file location):
  From src/pages/*.tsx     → import { Button, Card } from '../components/ui'
  From src/components/*.tsx → import { Button, Card } from './ui'

AVAILABLE COMPONENTS:

Button
  import { Button } from '../components/ui'
  <Button variant="primary|secondary|ghost|danger" size="sm|md|lg" loading fullWidth iconLeft={<svg/>} iconRight={<svg/>}>
    Label
  </Button>

Card
  <Card variant="default|bordered|flat" padding="none|sm|md|lg" interactive onClick={fn}>
    content
  </Card>

Input
  <Input label="Email" placeholder="you@example.com" error="Required" iconLeft={<svg/>} type="email" />

Textarea
  <Textarea label="Bio" placeholder="Tell us about yourself" rows={4} error={errors.bio} />

Select
  <Select label="Role" options={[{ value:'admin', label:'Admin' }, { value:'user', label:'User' }]} error={errors.role} />

Badge
  <Badge variant="primary|success|warning|danger|neutral" size="sm|md|lg" dot>Active</Badge>

Avatar
  <Avatar src={user.avatar} name={user.name} size="sm|md|lg|xl" />

Modal
  <Modal open={isOpen} onClose={() => setOpen(false)} title="Confirm" size="sm|md|lg">
    <p>Modal body content</p>
    <Modal.Footer>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </Modal.Footer>
  </Modal>

Spinner
  <Spinner size="sm|md|lg" color="primary|white" />

Alert
  <Alert variant="info|success|warning|error" title="Heads up!" dismissible>
    Something happened you should know about.
  </Alert>

Stat
  <Stat value="1,284" label="Total Users" delta="+12%" deltaType="up|down|neutral" />

EmptyState
  <EmptyState icon="📭" title="No results" description="Try a different search." action={<Button>Add item</Button>} />

PageHeader
  <PageHeader title="Dashboard" subtitle="Welcome back" badge={<Badge variant="success">Live</Badge>}>
    <Button>New item</Button>
  </PageHeader>

Table
  <Table>
    <Table.Head>
      <Table.Row><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th></Table.Row>
    </Table.Head>
    <Table.Body>
      {rows.map(r => (
        <Table.Row key={r.id} clickable onClick={() => navigate(r.id)}>
          <Table.Td>{r.name}</Table.Td>
          <Table.Td><Badge variant="success">{r.status}</Badge></Table.Td>
        </Table.Row>
      ))}
    </Table.Body>
  </Table>

Navbar
  <Navbar logo={<span>MyApp</span>} actions={<Button size="sm">Sign in</Button>}>
    <Navbar.Link href="/" active>Home</Navbar.Link>
    <Navbar.Link href="/about">About</Navbar.Link>
  </Navbar>

Tabs
  const [tab, setTab] = useState('overview')
  <Tabs value={tab} onChange={setTab}>
    <Tabs.Tab value="overview">Overview</Tabs.Tab>
    <Tabs.Tab value="settings">Settings</Tabs.Tab>
  </Tabs>
  {tab === 'overview' && <div>...</div>}

Toast  (call imperatively — no Provider needed)
  import { toast } from '../components/ui'
  toast.success('Saved!') | toast.error('Failed') | toast.info('Note') | toast.warning('Watch out')

GOLDEN RULE: Every interactive element (button, link, form) uses a component from this library. The only CSS you write is for layout, positioning, and brand-specific hero/landing sections. Component appearance is handled by the pack.
`
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT CSS  (appended to client/src/index.css after pack + BASE_CSS)
// ─────────────────────────────────────────────────────────────────────────────
const COMPONENT_CSS = `
/* ═══ ForgeAI React Component Pack — Styles ══════════════════════════════════ */

/* ── Button ─────────────────────────────────────────────────────────────── */
.ui-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 7px; font-family: var(--font-body); font-weight: 600;
  border: 1.5px solid transparent; border-radius: var(--radius);
  cursor: pointer; user-select: none; position: relative; outline: none;
  transition: background .14s, color .14s, border-color .14s, transform .12s, box-shadow .14s, opacity .14s;
  text-decoration: none; white-space: nowrap; line-height: 1;
}
.ui-btn:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb,var(--primary) 30%,transparent); }
.ui-btn:active:not(:disabled) { transform: scale(.98); }
.ui-btn:disabled { opacity: .5; cursor: not-allowed; transform: none !important; pointer-events: none; }
.ui-btn-sm { padding: 7px 13px; font-size: .8125rem; border-radius: calc(var(--radius) - 2px); }
.ui-btn-md { padding: 10px 20px; font-size: .875rem; }
.ui-btn-lg { padding: 13px 28px; font-size: .9375rem; }
.ui-btn-icon { aspect-ratio: 1; padding: 9px; }
.ui-btn-icon.ui-btn-sm { padding: 7px; }
.ui-btn-icon.ui-btn-lg { padding: 13px; }
.ui-btn-full { width: 100%; }
.ui-btn-primary {
  background: var(--primary); color: #fff !important; border-color: var(--primary);
  box-shadow: 0 2px 10px -3px color-mix(in srgb,var(--primary) 45%,transparent);
}
.ui-btn-primary:hover:not(:disabled) {
  background: var(--primary-hover); border-color: var(--primary-hover);
  box-shadow: 0 6px 20px -4px color-mix(in srgb,var(--primary) 50%,transparent);
  transform: translateY(-1px);
}
.ui-btn-secondary { background: transparent; color: var(--text) !important; border-color: var(--border); }
.ui-btn-secondary:hover:not(:disabled) { background: var(--surface-2); border-color: color-mix(in srgb,var(--text) 22%,transparent); }
.ui-btn-ghost { background: transparent; color: var(--text-muted) !important; border-color: transparent; }
.ui-btn-ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text) !important; }
.ui-btn-danger { background: #dc2626; color: #fff !important; border-color: #dc2626; box-shadow: 0 2px 10px -3px rgba(220,38,38,.4); }
.ui-btn-danger:hover:not(:disabled) { background: #b91c1c; border-color: #b91c1c; transform: translateY(-1px); }
.ui-btn__spinner {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid color-mix(in srgb,currentColor 25%,transparent);
  border-top-color: currentColor; border-radius: 50%;
  animation: ui-spin .55s linear infinite;
}
@keyframes ui-spin { to { transform: rotate(360deg); } }

/* ── Card ────────────────────────────────────────────────────────────────── */
.ui-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 24px;
  transition: box-shadow .2s, transform .2s, border-color .2s;
}
.ui-card-bordered { border-width: 1.5px; }
.ui-card-flat { background: var(--surface-2); border-color: transparent; box-shadow: none; }
.ui-card-interactive { cursor: pointer; }
.ui-card-interactive:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: color-mix(in srgb,var(--primary) 28%,transparent); }
.ui-card-p-none { padding: 0; }
.ui-card-p-sm  { padding: 14px; }
.ui-card-p-md  { padding: 24px; }
.ui-card-p-lg  { padding: 36px; }

/* ── Form ────────────────────────────────────────────────────────────────── */
.ui-field { display: flex; flex-direction: column; gap: 6px; }
.ui-label { font-size: .84rem; font-weight: 600; color: var(--text); }
.ui-label-req::after { content: ' *'; color: #dc2626; }
.ui-input-wrap { position: relative; display: flex; align-items: center; }
.ui-icon-l,.ui-icon-r { position: absolute; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; display: flex; font-size: .95rem; }
.ui-icon-l { left: 11px; } .ui-icon-r { right: 11px; }
.ui-input,.ui-textarea,.ui-select {
  font-family: var(--font-body); font-size: .9rem; width: 100%;
  padding: 10px 13px; background: var(--surface-2);
  border: 1.5px solid var(--border); border-radius: var(--radius);
  color: var(--text); outline: none;
  transition: border-color .14s, box-shadow .14s, background .14s;
}
.ui-input::placeholder,.ui-textarea::placeholder { color: var(--text-muted); opacity: .65; }
.ui-input:hover,.ui-textarea:hover,.ui-select:hover { border-color: color-mix(in srgb,var(--text) 22%,transparent); }
.ui-input:focus,.ui-textarea:focus,.ui-select:focus {
  border-color: var(--primary); background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb,var(--primary) 14%,transparent);
}
.ui-input-pl { padding-left: 36px; } .ui-input-pr { padding-right: 36px; }
.ui-has-err .ui-input,.ui-has-err .ui-textarea,.ui-has-err .ui-select { border-color: #dc2626 !important; }
.ui-has-err .ui-input:focus,.ui-has-err .ui-textarea:focus,.ui-has-err .ui-select:focus { box-shadow: 0 0 0 3px rgba(220,38,38,.13) !important; }
.ui-textarea { resize: vertical; min-height: 90px; }
.ui-select {
  appearance: none; cursor: pointer; padding-right: 34px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
}
.ui-hint { font-size: .77rem; color: var(--text-muted); line-height: 1.4; }
.ui-err-msg { font-size: .77rem; color: #dc2626; display: flex; align-items: center; gap: 4px; }

/* ── Badge ───────────────────────────────────────────────────────────────── */
.ui-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 999px;
  font-size: .72rem; font-weight: 700; letter-spacing: .02em; white-space: nowrap;
}
.ui-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.ui-badge-sm { padding: 2px 8px; font-size: .68rem; }
.ui-badge-lg { padding: 5px 14px; font-size: .8rem; }
.ui-badge-primary { background: color-mix(in srgb,var(--primary) 12%,transparent); color: var(--primary); }
.ui-badge-success { background: rgba(22,163,74,.1);  color: #16a34a; }
.ui-badge-warning { background: rgba(234,88,12,.1);  color: #ea580c; }
.ui-badge-danger  { background: rgba(220,38,38,.1);  color: #dc2626; }
.ui-badge-neutral { background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--border); }
@media (prefers-color-scheme: dark) {
  .ui-badge-success { background: rgba(74,222,128,.12); color: #4ade80; }
  .ui-badge-warning { background: rgba(251,146,60,.12); color: #fb923c; }
  .ui-badge-danger  { background: rgba(248,113,113,.12); color: #f87171; }
}
[data-theme="dark"] .ui-badge-success { background: rgba(74,222,128,.12); color: #4ade80; }
[data-theme="dark"] .ui-badge-warning { background: rgba(251,146,60,.12); color: #fb923c; }
[data-theme="dark"] .ui-badge-danger  { background: rgba(248,113,113,.12); color: #f87171; }

/* ── Avatar ──────────────────────────────────────────────────────────────── */
.ui-avatar {
  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; overflow: hidden; flex-shrink: 0; color: #fff;
  background: var(--primary); font-size: .85rem; letter-spacing: -.01em;
}
.ui-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ui-avatar-sm { width: 28px; height: 28px; font-size: .68rem; }
.ui-avatar-md { width: 38px; height: 38px; font-size: .85rem; }
.ui-avatar-lg { width: 52px; height: 52px; font-size: 1.05rem; }
.ui-avatar-xl { width: 72px; height: 72px; font-size: 1.5rem; }
.ui-avatar-ring { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--primary); }
.ui-avatar-group { display: flex; }
.ui-avatar-group .ui-avatar { margin-left: -8px; border: 2px solid var(--surface); }
.ui-avatar-group .ui-avatar:first-child { margin-left: 0; }

/* ── Modal ───────────────────────────────────────────────────────────────── */
.ui-modal-overlay {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(0,0,0,.48); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: ui-fade-in .15s ease;
}
.ui-modal {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 28px; width: 100%;
  max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-lg);
  animation: ui-modal-in .2s cubic-bezier(.22,1,.36,1);
}
.ui-modal-sm { max-width: 380px; }
.ui-modal-md { max-width: 520px; }
.ui-modal-lg { max-width: 720px; }
.ui-modal-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; gap: 12px; }
.ui-modal-title { font-weight: 800; font-size: 1.05rem; letter-spacing: -.03em; color: var(--text); }
.ui-modal-close {
  background: transparent; border: none; cursor: pointer; color: var(--text-muted);
  width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s; font-size: 1.2rem; flex-shrink: 0; line-height: 1;
}
.ui-modal-close:hover { background: var(--surface-2); color: var(--text); }
.ui-modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
@keyframes ui-fade-in  { from { opacity: 0; }                              to { opacity: 1; } }
@keyframes ui-modal-in { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }

/* ── Spinner ─────────────────────────────────────────────────────────────── */
.ui-spinner {
  border-radius: 50%; display: inline-block; flex-shrink: 0;
  border-style: solid; border-color: color-mix(in srgb,var(--primary) 22%,transparent);
  border-top-color: var(--primary); animation: ui-spin .6s linear infinite;
}
.ui-spinner-sm  { width: 16px; height: 16px; border-width: 2px; }
.ui-spinner-md  { width: 24px; height: 24px; border-width: 2.5px; }
.ui-spinner-lg  { width: 36px; height: 36px; border-width: 3px; }
.ui-spinner-white { border-color: rgba(255,255,255,.25); border-top-color: #fff; }

/* ── Alert ───────────────────────────────────────────────────────────────── */
.ui-alert {
  display: flex; gap: 12px; padding: 14px 16px;
  border-radius: var(--radius); border: 1px solid transparent;
  animation: ui-alert-in .18s ease;
}
.ui-alert-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; line-height: 1.4; }
.ui-alert-body { min-width: 0; flex: 1; }
.ui-alert-title { font-weight: 700; font-size: .875rem; margin-bottom: 2px; }
.ui-alert-desc  { font-size: .8125rem; line-height: 1.5; opacity: .9; }
.ui-alert-dismiss { background: transparent; border: none; cursor: pointer; color: currentColor; opacity: .6; font-size: 1rem; padding: 2px; margin-left: auto; flex-shrink: 0; line-height: 1; transition: opacity .12s; }
.ui-alert-dismiss:hover { opacity: 1; }
.ui-alert-info    { background: color-mix(in srgb,var(--secondary,#219ebc) 10%,transparent); border-color: color-mix(in srgb,var(--secondary,#219ebc) 28%,transparent); color: color-mix(in srgb,var(--secondary,#219ebc) 90%,var(--text)); }
.ui-alert-success { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.28); color: #16a34a; }
.ui-alert-warning { background: rgba(234,88,12,.1); border-color: rgba(234,88,12,.28); color: #ea580c; }
.ui-alert-error   { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.28); color: #dc2626; }
@media (prefers-color-scheme: dark) {
  .ui-alert-success { background: rgba(74,222,128,.1); border-color: rgba(74,222,128,.25); color: #4ade80; }
  .ui-alert-warning { background: rgba(251,146,60,.1); border-color: rgba(251,146,60,.25); color: #fb923c; }
  .ui-alert-error   { background: rgba(248,113,113,.1); border-color: rgba(248,113,113,.25); color: #f87171; }
}
[data-theme="dark"] .ui-alert-success { background: rgba(74,222,128,.1); border-color: rgba(74,222,128,.25); color: #4ade80; }
[data-theme="dark"] .ui-alert-warning { background: rgba(251,146,60,.1); border-color: rgba(251,146,60,.25); color: #fb923c; }
[data-theme="dark"] .ui-alert-error   { background: rgba(248,113,113,.1); border-color: rgba(248,113,113,.25); color: #f87171; }
@keyframes ui-alert-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }

/* ── Stat ────────────────────────────────────────────────────────────────── */
.ui-stat { display: flex; flex-direction: column; gap: 4px; }
.ui-stat-value { font-size: clamp(1.6rem,3vw,2.2rem); font-weight: 800; letter-spacing: -.05em; line-height: 1; color: var(--text); font-variant-numeric: tabular-nums; }
.ui-stat-label { font-size: .76rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .07em; }
.ui-stat-delta { display: inline-flex; align-items: center; gap: 3px; font-size: .78rem; font-weight: 700; margin-top: 5px; }
.ui-stat-up   { color: #16a34a; } .ui-stat-down { color: #dc2626; } .ui-stat-neutral { color: var(--text-muted); }
@media (prefers-color-scheme: dark) { .ui-stat-up { color: #4ade80; } .ui-stat-down { color: #f87171; } }
[data-theme="dark"] .ui-stat-up { color: #4ade80; } [data-theme="dark"] .ui-stat-down { color: #f87171; }

/* ── Empty State ─────────────────────────────────────────────────────────── */
.ui-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: clamp(36px,8vw,72px) 24px; gap: 12px; }
.ui-empty-icon  { font-size: 2.8rem; opacity: .35; line-height: 1; }
.ui-empty-title { font-weight: 700; font-size: 1.05rem; color: var(--text); }
.ui-empty-desc  { font-size: .875rem; color: var(--text-muted); max-width: 320px; line-height: 1.6; }

/* ── PageHeader ──────────────────────────────────────────────────────────── */
.ui-page-hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: clamp(20px,4vw,36px); flex-wrap: wrap; }
.ui-page-hd-left { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ui-page-hd-title { font-size: clamp(1.4rem,3vw,2rem); font-weight: 800; letter-spacing: -.04em; line-height: 1.15; color: var(--text); }
.ui-page-hd-sub   { font-size: .9rem; color: var(--text-muted); line-height: 1.5; }
.ui-page-hd-right { display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.ui-table-wrap { width: 100%; overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--surface); }
.ui-table { width: 100%; border-collapse: collapse; min-width: 380px; }
.ui-table-th {
  text-align: left; padding: 11px 16px; font-size: .72rem; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted);
  background: var(--surface-2); border-bottom: 1px solid var(--border); white-space: nowrap; user-select: none;
}
.ui-table-th-sort { cursor: pointer; }
.ui-table-th-sort:hover { color: var(--text); }
.ui-table-td { padding: 13px 16px; border-bottom: 1px solid var(--border); font-size: .875rem; color: var(--text); vertical-align: middle; }
.ui-table-tr:last-child .ui-table-td { border-bottom: none; }
.ui-table-tr-clickable { cursor: pointer; transition: background .1s; }
.ui-table-tr-clickable:hover .ui-table-td { background: var(--surface-2); }

/* ── Navbar ──────────────────────────────────────────────────────────────── */
.ui-navbar {
  position: sticky; top: env(safe-area-inset-top,0px); z-index: 100;
  background: color-mix(in srgb,var(--surface) 88%,transparent);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--border);
  padding: 0 clamp(16px,4vw,40px); height: 64px;
  display: flex; align-items: center; gap: 20px;
}
.ui-navbar-logo { font-weight: 800; font-size: 1.15rem; letter-spacing: -.04em; color: var(--text); text-decoration: none; white-space: nowrap; flex-shrink: 0; }
.ui-navbar-nav  { display: flex; align-items: center; gap: 2px; flex: 1; }
.ui-navbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: auto; }
.ui-nav-link {
  color: var(--text-muted) !important; font-size: .875rem; font-weight: 500;
  padding: 6px 11px; border-radius: calc(var(--radius) - 2px); text-decoration: none !important;
  transition: color .14s, background .14s;
}
.ui-nav-link:hover,.ui-nav-link-active { color: var(--text) !important; background: var(--surface-2); }

/* ── Tabs ────────────────────────────────────────────────────────────────── */
.ui-tabs { display: flex; border-bottom: 1.5px solid var(--border); gap: 0; overflow-x: auto; }
.ui-tab {
  padding: 9px 16px; font-size: .875rem; font-weight: 600; color: var(--text-muted);
  border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -1.5px; white-space: nowrap; transition: color .14s, border-color .14s;
}
.ui-tab:hover { color: var(--text); }
.ui-tab-active { color: var(--primary) !important; border-bottom-color: var(--primary); }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.ui-toast-container {
  position: fixed; bottom: 20px; right: 20px; z-index: 500;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.ui-toast {
  display: flex; align-items: flex-start; gap: 10px; padding: 13px 16px;
  background: var(--text); color: var(--bg); border-radius: var(--radius);
  box-shadow: var(--shadow-lg); font-size: .875rem; font-weight: 500;
  max-width: 340px; pointer-events: all;
  animation: ui-toast-in .22s cubic-bezier(.22,1,.36,1);
}
.ui-toast-success .ui-toast-icon { color: #4ade80; }
.ui-toast-error   .ui-toast-icon { color: #f87171; }
.ui-toast-warning .ui-toast-icon { color: #fbbf24; }
.ui-toast-info    .ui-toast-icon { color: #60a5fa; }
.ui-toast-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
.ui-toast-out { animation: ui-toast-out .18s ease forwards; }
@keyframes ui-toast-in  { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes ui-toast-out { from { opacity: 1; transform: none; }            to { opacity: 0; transform: translateX(16px); } }

/* ── Divider / utility ───────────────────────────────────────────────────── */
.ui-divider { height: 1px; background: var(--border); }
.ui-divider-v { width: 1px; background: var(--border); align-self: stretch; }
.ui-muted { color: var(--text-muted); }
.ui-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

/* ── Scrollbar polish ────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: color-mix(in srgb,var(--text) 18%,transparent); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb,var(--text) 32%,transparent); }
`

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT SOURCES
// ─────────────────────────────────────────────────────────────────────────────

const UI_INDEX = `export { Button } from './Button'
export type { ButtonProps } from './Button'
export { Card } from './Card'
export type { CardProps } from './Card'
export { Input } from './Input'
export type { InputProps } from './Input'
export { Textarea } from './Textarea'
export type { TextareaProps } from './Textarea'
export { Select } from './Select'
export type { SelectProps } from './Select'
export { Badge } from './Badge'
export type { BadgeProps } from './Badge'
export { Avatar } from './Avatar'
export type { AvatarProps } from './Avatar'
export { Modal } from './Modal'
export type { ModalProps } from './Modal'
export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'
export { Alert } from './Alert'
export type { AlertProps } from './Alert'
export { Stat } from './Stat'
export type { StatProps } from './Stat'
export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'
export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'
export { Table } from './Table'
export { Navbar } from './Navbar'
export { Tabs } from './Tabs'
export { toast } from './Toast'
`

const BUTTON = `import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  iconOnly?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, iconLeft, iconRight, iconOnly, children, className, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        'ui-btn',
        \`ui-btn-\${variant}\`,
        \`ui-btn-\${size}\`,
        iconOnly && 'ui-btn-icon',
        fullWidth && 'ui-btn-full',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading
        ? <span className="ui-btn__spinner" aria-hidden="true" />
        : iconLeft && <span aria-hidden="true">{iconLeft}</span>}
      {!iconOnly && children && <span>{children}</span>}
      {!loading && iconRight && <span aria-hidden="true">{iconRight}</span>}
    </button>
  )
)
Button.displayName = 'Button'
`

const CARD = `import React from 'react'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardVariant = 'default' | 'bordered' | 'flat'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: CardPadding
  interactive?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', interactive, className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'ui-card',
        variant === 'bordered' && 'ui-card-bordered',
        variant === 'flat' && 'ui-card-flat',
        padding !== 'md' && \`ui-card-p-\${padding}\`,
        interactive && 'ui-card-interactive',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'
`

const INPUT = `import React from 'react'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  required?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, iconLeft, iconRight, required, className, id, ...rest }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\\s+/g, '-') : undefined)
    return (
      <div className={cn('ui-field', error && 'ui-has-err', className)}>
        {label && (
          <label className={cn('ui-label', required && 'ui-label-req')} htmlFor={inputId}>
            {label}
          </label>
        )}
        <div className="ui-input-wrap">
          {iconLeft && <span className="ui-icon-l">{iconLeft}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn('ui-input', iconLeft && 'ui-input-pl', iconRight && 'ui-input-pr')}
            aria-invalid={!!error}
            aria-describedby={error ? \`\${inputId}-err\` : hint ? \`\${inputId}-hint\` : undefined}
            {...rest}
          />
          {iconRight && <span className="ui-icon-r">{iconRight}</span>}
        </div>
        {error && <span id={\`\${inputId}-err\`} className="ui-err-msg" role="alert">⚠ {error}</span>}
        {!error && hint && <span id={\`\${inputId}-hint\`} className="ui-hint">{hint}</span>}
      </div>
    )
  }
)
Input.displayName = 'Input'
`

const TEXTAREA = `import React from 'react'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, className, id, rows = 4, ...rest }, ref) => {
    const tid = id || (label ? label.toLowerCase().replace(/\\s+/g, '-') : undefined)
    return (
      <div className={cn('ui-field', error && 'ui-has-err', className)}>
        {label && <label className={cn('ui-label', required && 'ui-label-req')} htmlFor={tid}>{label}</label>}
        <textarea ref={ref} id={tid} rows={rows} className="ui-textarea" aria-invalid={!!error} {...rest} />
        {error && <span className="ui-err-msg" role="alert">⚠ {error}</span>}
        {!error && hint && <span className="ui-hint">{hint}</span>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
`

const SELECT = `import React from 'react'

export interface SelectOption { value: string; label: string; disabled?: boolean }

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  options: SelectOption[]
  placeholder?: string
  error?: string
  hint?: string
  required?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, error, hint, required, className, id, ...rest }, ref) => {
    const sid = id || (label ? label.toLowerCase().replace(/\\s+/g, '-') : undefined)
    return (
      <div className={cn('ui-field', error && 'ui-has-err', className)}>
        {label && <label className={cn('ui-label', required && 'ui-label-req')} htmlFor={sid}>{label}</label>}
        <select ref={ref} id={sid} className="ui-select" aria-invalid={!!error} {...rest}>
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map(o => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        {error && <span className="ui-err-msg" role="alert">⚠ {error}</span>}
        {!error && hint && <span className="ui-hint">{hint}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
`

const BADGE = `import React from 'react'

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Badge: React.FC<BadgeProps> = ({ variant = 'primary', size = 'md', dot, className, children, ...rest }) => (
  <span className={cn('ui-badge', \`ui-badge-\${variant}\`, size !== 'md' && \`ui-badge-\${size}\`, className)} {...rest}>
    {dot && <span className="ui-badge-dot" aria-hidden="true" />}
    {children}
  </span>
)
Badge.displayName = 'Badge'
`

const AVATAR = `import React, { useState } from 'react'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  src?: string
  name?: string
  size?: AvatarSize
  ring?: boolean
  className?: string
  style?: React.CSSProperties
}

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#e85d04','#84cc16']
function nameColor(name: string) {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
function initials(name: string) {
  return name.trim().split(/\\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase()
}
function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Avatar: React.FC<AvatarProps> = ({ src, name = '', size = 'md', ring, className, style }) => {
  const [failed, setFailed] = useState(false)
  const showImg = src && !failed
  return (
    <span
      className={cn('ui-avatar', \`ui-avatar-\${size}\`, ring && 'ui-avatar-ring', className)}
      style={!showImg ? { background: nameColor(name), ...style } : style}
      aria-label={name || undefined}
    >
      {showImg
        ? <img src={src} alt={name} onError={() => setFailed(true)} />
        : <span aria-hidden="true">{name ? initials(name) : '?'}</span>}
    </span>
  )
}
Avatar.displayName = 'Avatar'
`

const MODAL = `import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: ModalSize
  children?: React.ReactNode
  closeOnOverlay?: boolean
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="ui-modal-footer">{children}</div>
}

const ModalInner: React.FC<ModalProps> = ({ open, onClose, title, size = 'md', children, closeOnOverlay = true }) => {
  const handleKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = '' }
  }, [open, handleKey])
  if (!open) return null
  return (
    <div className="ui-modal-overlay" onClick={closeOnOverlay ? onClose : undefined} aria-modal role="dialog">
      <div className={\`ui-modal ui-modal-\${size}\`} onClick={e => e.stopPropagation()}>
        {(title != null) && (
          <div className="ui-modal-hd">
            <div className="ui-modal-title">{title}</div>
            <button className="ui-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export const Modal = Object.assign(
  (props: ModalProps) => createPortal(<ModalInner {...props} />, document.body),
  { Footer }
)
Modal.displayName = 'Modal'
`

const SPINNER = `import React from 'react'

export type SpinnerSize = 'sm' | 'md' | 'lg'
export type SpinnerColor = 'primary' | 'white'

export interface SpinnerProps {
  size?: SpinnerSize
  color?: SpinnerColor
  className?: string
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = 'primary', className }) => (
  <span
    className={cn('ui-spinner', \`ui-spinner-\${size}\`, color === 'white' && 'ui-spinner-white', className)}
    role="status"
    aria-label="Loading"
  />
)
Spinner.displayName = 'Spinner'
`

const ALERT = `import React, { useState } from 'react'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  children?: React.ReactNode
  dismissible?: boolean
  className?: string
}

const ICONS: Record<AlertVariant, string> = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' }

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Alert: React.FC<AlertProps> = ({ variant = 'info', title, children, dismissible, className }) => {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <div className={cn('ui-alert', \`ui-alert-\${variant}\`, className)} role="alert">
      <span className="ui-alert-icon" aria-hidden="true">{ICONS[variant]}</span>
      <div className="ui-alert-body">
        {title && <div className="ui-alert-title">{title}</div>}
        {children && <div className="ui-alert-desc">{children}</div>}
      </div>
      {dismissible && (
        <button className="ui-alert-dismiss" onClick={() => setGone(true)} aria-label="Dismiss">×</button>
      )}
    </div>
  )
}
Alert.displayName = 'Alert'
`

const STAT = `import React from 'react'

export type DeltaType = 'up' | 'down' | 'neutral'

export interface StatProps {
  value: string | number
  label: string
  delta?: string
  deltaType?: DeltaType
  className?: string
}

const ARROW = { up: '↑', down: '↓', neutral: '→' } as const
function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const Stat: React.FC<StatProps> = ({ value, label, delta, deltaType = 'neutral', className }) => (
  <div className={cn('ui-stat', className)}>
    <div className="ui-stat-label">{label}</div>
    <div className="ui-stat-value">{value}</div>
    {delta && (
      <div className={cn('ui-stat-delta', \`ui-stat-\${deltaType}\`)} aria-label={\`\${deltaType}: \${delta}\`}>
        <span aria-hidden="true">{ARROW[deltaType]}</span> {delta}
      </div>
    )}
  </div>
)
Stat.displayName = 'Stat'
`

const EMPTY_STATE = `import React from 'react'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div className={cn('ui-empty', className)}>
    {icon && <div className="ui-empty-icon" aria-hidden="true">{icon}</div>}
    <div className="ui-empty-title">{title}</div>
    {description && <div className="ui-empty-desc">{description}</div>}
    {action}
  </div>
)
EmptyState.displayName = 'EmptyState'
`

const PAGE_HEADER = `import React from 'react'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, badge, children, className }) => (
  <div className={cn('ui-page-hd', className)}>
    <div className="ui-page-hd-left">
      {badge && <div>{badge}</div>}
      <h1 className="ui-page-hd-title">{title}</h1>
      {subtitle && <p className="ui-page-hd-sub">{subtitle}</p>}
    </div>
    {children && <div className="ui-page-hd-right">{children}</div>}
  </div>
)
PageHeader.displayName = 'PageHeader'
`

const TABLE = `import React from 'react'

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

function Th({ children, sortable, className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & { sortable?: boolean }) {
  return (
    <th className={cn('ui-table-th', sortable && 'ui-table-th-sort', className)} {...rest}>
      {children}
      {sortable && <span className="ui-table-th-sort-icon" aria-hidden>↕</span>}
    </th>
  )
}

function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('ui-table-td', className)} {...rest}>{children}</td>
}

function Head({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>
}

function Body({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

function Row({ children, clickable, className, onClick, ...rest }: React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={cn('ui-table-tr', clickable && 'ui-table-tr-clickable', className)}
      onClick={onClick}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') onClick?.(e as unknown as React.MouseEvent<HTMLTableRowElement>) } : undefined}
      {...rest}
    >
      {children}
    </tr>
  )
}

function TableRoot({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('ui-table-wrap', className)}>
      <table className="ui-table">{children}</table>
    </div>
  )
}

export const Table = Object.assign(TableRoot, { Head, Body, Row, Th, Td })
Table.displayName = 'Table'
`

const NAVBAR = `import React from 'react'

export interface NavbarProps {
  logo?: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

function NavLink({ href, active, children, className, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { active?: boolean }) {
  return (
    <a
      href={href}
      className={['ui-nav-link', active && 'ui-nav-link-active', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </a>
  )
}

function NavbarRoot({ logo, children, actions, className }: NavbarProps) {
  return (
    <header className={['ui-navbar', className].filter(Boolean).join(' ')}>
      {logo && <div className="ui-navbar-logo">{logo}</div>}
      {children && <nav className="ui-navbar-nav" aria-label="Main navigation">{children}</nav>}
      {actions && <div className="ui-navbar-actions">{actions}</div>}
    </header>
  )
}

export const Navbar = Object.assign(NavbarRoot, { Link: NavLink })
Navbar.displayName = 'Navbar'
`

const TABS = `import React from 'react'

export interface TabsProps {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export interface TabProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

function Tab({ value: tabValue, children, disabled, className }: TabProps & { _active?: boolean; _onChange?: (v: string) => void }) {
  return null
}

function TabsRoot({ value, onChange, children, className }: TabsProps) {
  return (
    <div className={['ui-tabs', className].filter(Boolean).join(' ')} role="tablist">
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return null
        const { value: tv, children: label, disabled } = child.props as TabProps
        const active = tv === value
        return (
          <button
            role="tab"
            aria-selected={active}
            className={['ui-tab', active && 'ui-tab-active'].filter(Boolean).join(' ')}
            onClick={() => !disabled && onChange(tv)}
            disabled={disabled}
            tabIndex={active ? 0 : -1}
            key={tv}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export const Tabs = Object.assign(TabsRoot, { Tab })
Tabs.displayName = 'Tabs'
`

const TOAST = `let container: HTMLDivElement | null = null

function getContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div')
    container.className = 'ui-toast-container'
    document.body.appendChild(container)
  }
  return container
}

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' } as const
type ToastType = keyof typeof ICONS

function show(message: string, type: ToastType, duration = 3500) {
  const c = getContainer()
  const el = document.createElement('div')
  el.className = \`ui-toast ui-toast-\${type}\`
  el.innerHTML = \`<span class="ui-toast-icon" aria-hidden="true">\${ICONS[type]}</span><span>\${message}</span>\`
  el.setAttribute('role', 'alert')
  c.appendChild(el)
  const remove = () => {
    el.classList.add('ui-toast-out')
    el.addEventListener('animationend', () => el.remove(), { once: true })
  }
  const t = setTimeout(remove, duration)
  el.addEventListener('click', () => { clearTimeout(t); remove() })
}

export const toast = {
  success: (msg: string, ms?: number) => show(msg, 'success', ms),
  error:   (msg: string, ms?: number) => show(msg, 'error',   ms),
  warning: (msg: string, ms?: number) => show(msg, 'warning', ms),
  info:    (msg: string, ms?: number) => show(msg, 'info',    ms),
}
`
