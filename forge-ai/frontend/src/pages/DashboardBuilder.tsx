// New-dashboard wizard: pick a source (upload / google_sheet / stripe),
// name it, kick off the build. Everything else (progress, iframe embed)
// happens on the DashboardDetail page — this file's only job is submitting.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { FileSpreadsheet, Sheet, CreditCard, Loader2, ArrowRight, Link as LinkIcon, CheckCircle2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type SourceKind = 'upload' | 'google_sheet' | 'stripe'

const SOURCES: { kind: SourceKind; label: string; description: string; icon: any }[] = [
  { kind: 'upload', label: 'Upload a file', description: 'CSV or Excel — the fastest way to try it out.', icon: FileSpreadsheet },
  { kind: 'google_sheet', label: 'Google Sheet', description: 'Live connection to a sheet you own.', icon: Sheet },
  { kind: 'stripe', label: 'Stripe', description: 'Charges + subscriptions from your Stripe account.', icon: CreditCard },
]

export default function DashboardBuilder() {
  const nav = useNavigate()
  const [kind, setKind] = useState<SourceKind>('upload')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [vertical, setVertical] = useState<string>('general')

  const { data: verticals } = useQuery<Array<{ kind: string; name: string; description: string; icon: string }>>({
    queryKey: ['dashboard-verticals'],
    queryFn: () => api.get('/dashboard/verticals').then((r) => r.data),
  })

  // Upload state — array so the same UI handles single & multi
  const [files, setFiles] = useState<File[]>([])

  // Sheet state
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetTab, setSheetTab] = useState('')

  // Stripe state
  const [stripeInclude, setStripeInclude] = useState<'charges' | 'subscriptions' | 'both'>('both')
  const [stripeWindow, setStripeWindow] = useState(90)

  // OAuth connection state (google/stripe availability)
  const { data: connStatus, refetch: refetchConnStatus } = useQuery<{ google: boolean; stripe: boolean }>({
    queryKey: ['dashboard-oauth-status'],
    queryFn: () => api.get('/dashboard/oauth/status').then((r) => r.data),
  })

  const submit = useMutation({
    mutationFn: async () => {
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
      if (!clean) throw new Error('Give the dashboard a name (letters/numbers).')

      const promptClean = prompt.trim()
      if (kind === 'upload') {
        if (!files.length) throw new Error('Choose one or more CSV / Excel files to upload.')
        const fd = new FormData()
        if (files.length === 1) fd.append('file', files[0])
        else for (const f of files) fd.append('files', f)
        fd.append('name', clean)
        fd.append('vertical', vertical)
        if (promptClean) fd.append('prompt', promptClean)
        return api.post('/dashboard/build', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      if (kind === 'google_sheet') {
        if (!connStatus?.google) throw new Error('Connect Google first.')
        if (!sheetUrl.trim()) throw new Error('Paste a Google Sheets URL.')
        return api.post('/dashboard/build-from-sheet', { url: sheetUrl.trim(), sheetName: sheetTab.trim() || undefined, name: clean, vertical, prompt: promptClean || undefined })
      }
      if (kind === 'stripe') {
        if (!connStatus?.stripe) throw new Error('Connect Stripe first.')
        return api.post('/dashboard/build-from-stripe', { name: clean, vertical, include: stripeInclude, windowDays: stripeWindow, prompt: promptClean || undefined })
      }
      throw new Error('Unknown source')
    },
    onSuccess: ({ data }) => {
      toast.success('Build queued — jumping in')
      nav(`/dashboards/${data.repositoryId}`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? e.message ?? 'Failed'),
  })

  // OAuth popup — opens the provider consent screen and closes on postMessage.
  const connect = async (provider: 'google' | 'stripe') => {
    const { data } = await api.get(`/dashboard/oauth/${provider}/start`).catch((e) => {
      toast.error(e.response?.data?.message ?? 'OAuth start failed')
      return { data: null } as any
    })
    if (!data?.url) return
    const w = window.open(data.url, `oauth-${provider}`, 'width=560,height=720')
    if (!w) return toast.error('Popup blocked — allow popups for this site.')
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type !== 'dashboard-oauth') return
      window.removeEventListener('message', onMsg)
      if (ev.data.ok) { toast.success(ev.data.message); refetchConnStatus() }
      else toast.error(ev.data.message)
    }
    window.addEventListener('message', onMsg)
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New dashboard</h1>
        <p className="text-sm text-neutral-400 mt-1">Pick a data source. We'll profile it, clean it, and render a hosted dashboard.</p>
      </div>

      {/* Dashboard type — the biggest sellability lever. Client picks the
          business function; downstream AI planner is biased to that vertical's
          typical KPIs and layout. */}
      {verticals && verticals.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold">Dashboard type</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {verticals.map((v) => {
              const selected = vertical === v.kind
              return (
                <button
                  key={v.kind}
                  onClick={() => setVertical(v.kind)}
                  title={v.description}
                  className={clsx(
                    'text-left p-3 rounded-lg border transition-all',
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                      : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/60',
                  )}
                >
                  <div className={clsx('text-lg mb-1', selected ? '' : 'grayscale opacity-70')}>{v.icon}</div>
                  <div className="font-medium text-xs">{v.name}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold">Data source</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {SOURCES.map((s) => {
          const Icon = s.icon
          const selected = kind === s.kind
          return (
            <button
              key={s.kind}
              onClick={() => setKind(s.kind)}
              className={clsx(
                'text-left p-4 rounded-xl border transition-all',
                selected ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40' : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/60',
              )}
            >
              <Icon className={clsx('w-5 h-5 mb-2', selected ? 'text-emerald-400' : 'text-neutral-400')} />
              <div className="font-medium text-sm">{s.label}</div>
              <div className="text-xs text-neutral-500 mt-1">{s.description}</div>
            </button>
          )
        })}
      </div>

      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-neutral-300">Dashboard name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="acme-q1-sales"
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-neutral-500 mt-1 block">Lowercase, letters/numbers/dashes. Used in the URL.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-300 inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-emerald-400" />What should this dashboard show? <span className="text-neutral-500 font-normal">(optional but recommended)</span></span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={"e.g. 'I sell shoes online — I need to see monthly revenue, top-selling products, return rate, and orders by country. Highlight if any month drops more than 20%.'"}
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-y font-sans"
          />
          <span className="text-xs text-neutral-500 mt-1 block">
            An AI reads this + your data schema and picks the metrics/charts that answer your question. Leave blank to get sensible defaults.
          </span>
        </label>

        {kind === 'upload' && (
          <label className="block">
            <span className="text-sm font-medium text-neutral-300">Files</span>
            <input
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="mt-1 w-full text-sm text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-500 file:text-black file:font-medium hover:file:bg-emerald-600 file:cursor-pointer cursor-pointer"
            />
            <span className="text-xs text-neutral-500 mt-1 block">
              Up to 50 MB per file, 20 files max. .csv / .xlsx / .xls. Multiple files with the same columns are auto-merged and get a <code className="text-neutral-400">_source_file</code> column for filtering.
            </span>
            {files.length > 1 && (
              <div className="mt-2 text-xs bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                <div className="text-emerald-400 font-medium mb-1">{files.length} files selected — will be merged</div>
                <ul className="text-neutral-400 space-y-0.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <span className="text-neutral-500 flex-shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </label>
        )}

        {kind === 'google_sheet' && (
          <>
            {!connStatus?.google ? (
              <button onClick={() => connect('google')} className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium inline-flex items-center justify-center gap-2">
                <Sheet className="w-4 h-4" />Connect Google
              </button>
            ) : (
              <div className="text-sm text-emerald-400 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Connected to Google</div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-neutral-300">Sheet URL</span>
              <div className="mt-1 relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  disabled={!connStatus?.google}
                />
              </div>
              <span className="text-xs text-neutral-500 mt-1 block">The sheet must be shared with the Google account you connected.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-300">Tab name (optional)</span>
              <input
                value={sheetTab}
                onChange={(e) => setSheetTab(e.target.value)}
                placeholder="Sheet1"
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                disabled={!connStatus?.google}
              />
              <span className="text-xs text-neutral-500 mt-1 block">Defaults to the first tab.</span>
            </label>
          </>
        )}

        {kind === 'stripe' && (
          <>
            {!connStatus?.stripe ? (
              <button onClick={() => connect('stripe')} className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium inline-flex items-center justify-center gap-2">
                <CreditCard className="w-4 h-4" />Connect Stripe
              </button>
            ) : (
              <div className="text-sm text-emerald-400 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Connected to Stripe</div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-neutral-300">Include</span>
              <select
                value={stripeInclude}
                onChange={(e) => setStripeInclude(e.target.value as any)}
                disabled={!connStatus?.stripe}
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="both">Charges + Subscriptions</option>
                <option value="charges">Charges only</option>
                <option value="subscriptions">Subscriptions only</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-300">Look-back window (days)</span>
              <input
                type="number"
                min={7} max={365} value={stripeWindow}
                onChange={(e) => setStripeWindow(Math.max(7, Math.min(365, Number(e.target.value) || 90)))}
                disabled={!connStatus?.stripe}
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </>
        )}

        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-medium inline-flex items-center justify-center gap-2"
        >
          {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Build dashboard <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
    </div>
  )
}
