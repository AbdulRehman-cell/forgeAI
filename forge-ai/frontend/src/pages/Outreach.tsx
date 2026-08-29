import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Send, Plus, Trash2, RefreshCw, Download, Upload, Search,
  Globe, Mail, MapPin, Building2, User,
  Sparkles, BarChart3, BookTemplate, Star, Clock, Activity,
  CheckCircle, AlertCircle, TrendingUp, Zap, MessageSquare,
  Layers, Calendar, Copy, Instagram, Linkedin,
  Inbox, Bell,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Types ─────────────────────────────────────────────────────

type ProspectStatus = 'new' | 'researched' | 'ready' | 'sent' | 'replied' | 'converted' | 'lost'
type EmailTone = 'professional' | 'friendly' | 'bold' | 'concise'
type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'linkedin' | 'status_change'
type ViewMode = 'prospects' | 'analytics' | 'templates'
type DetailTab = 'email' | 'research' | 'timeline' | 'followup' | 'sequence'
type SequencePlatform = 'linkedin' | 'instagram' | 'email' | 'twitter'
type SequenceAction = 'connect' | 'message' | 'comment' | 'dm' | 'email' | 'follow_up'
type SequenceStepStatus = 'pending' | 'done' | 'skipped'

interface SequenceStep {
  day: number
  platform: SequencePlatform
  action: SequenceAction
  message: string
  subject?: string
  status: SequenceStepStatus
  doneAt?: string
}

interface ProspectActivity { type: ActivityType; body: string; createdAt: string }
interface EmailVariant { label: string; subject: string; body: string; tone: string }

interface Prospect {
  _id: string
  companyName: string
  website?: string
  contactName?: string
  contactEmail?: string
  industry?: string
  location?: string
  linkedinUrl?: string
  scrapedSummary?: string
  scrapedEmails: string[]
  phone?: string
  painPoints?: string
  generatedSubject?: string
  generatedEmail?: string
  emailTone?: EmailTone
  personalizedOpener?: string
  variants: EmailVariant[]
  campaignName?: string
  score: number
  tags: string[]
  followUpAt?: string
  followUpNote?: string
  lastContactedAt?: string
  activities: ProspectActivity[]
  sequence: SequenceStep[]
  status: ProspectStatus
  notes?: string
  scrapedAt?: string
  sentAt?: string
  repliedAt?: string
  createdAt: string
}

interface OutreachTemplate {
  _id: string
  name: string
  subject: string
  body: string
  tone?: string
  industry?: string
  timesUsed: number
  lastUsedAt?: string
  createdAt: string
}

interface Stats {
  total: number
  thisWeek: number
  byStatus: Record<string, number>
  campaigns: string[]
}

interface Analytics {
  total: number
  byStatus: Record<string, number>
  sent: number
  replied: number
  converted: number
  replyRate: number
  conversionRate: number
  avgScore: number
  byCampaign: { name: string; total: number; sent: number; replied: number; converted: number; replyRate: number }[]
  byWeek: { week: string; count: number; sent: number }[]
  byIndustry: { industry: string; count: number; converted: number }[]
}

// ─── Constants ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProspectStatus, { label: string; color: string; bg: string; dot: string }> = {
  new: { label: 'New', color: 'text-zinc-400', bg: 'bg-zinc-800', dot: 'bg-zinc-400' },
  researched: { label: 'Researched', color: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-400' },
  ready: { label: 'Ready', color: 'text-amber-400', bg: 'bg-amber-500/10', dot: 'bg-amber-400' },
  sent: { label: 'Sent', color: 'text-violet-400', bg: 'bg-violet-500/10', dot: 'bg-violet-400' },
  replied: { label: 'Replied', color: 'text-brand-400', bg: 'bg-brand-500/10', dot: 'bg-brand-500' },
  converted: { label: 'Converted', color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400' },
  lost: { label: 'Lost', color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-400' },
}

const TONE_CONFIG: Record<EmailTone, string> = {
  professional: 'text-blue-400',
  friendly: 'text-emerald-400',
  bold: 'text-red-400',
  concise: 'text-violet-400',
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  note: '📝', call: '📞', email: '📧', meeting: '🤝', linkedin: '💼', status_change: '🔄',
}

const PLATFORM_CONFIG: Record<SequencePlatform, { icon: string; label: string; color: string; bg: string; urlBase: string }> = {
  linkedin: { icon: '💼', label: 'LinkedIn', color: 'text-blue-400', bg: 'bg-blue-500/10', urlBase: 'https://www.linkedin.com/search/results/people/?keywords=' },
  instagram: { icon: '📸', label: 'Instagram', color: 'text-pink-400', bg: 'bg-pink-500/10', urlBase: 'https://www.instagram.com/' },
  email: { icon: '📧', label: 'Email', color: 'text-amber-400', bg: 'bg-amber-500/10', urlBase: '' },
  twitter: { icon: '𝕏', label: 'X / Twitter', color: 'text-zinc-300', bg: 'bg-zinc-700/50', urlBase: 'https://x.com/search?q=' },
}

const ACTION_LABELS: Record<SequenceAction, string> = {
  connect: 'Connection Request', message: 'Message', comment: 'Comment on Post',
  dm: 'Direct Message', email: 'Email', follow_up: 'Follow-up',
}

// ─── Helpers ───────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-400 bg-emerald-500/10'
  if (s >= 60) return 'text-brand-400 bg-brand-500/10'
  if (s >= 40) return 'text-amber-400 bg-amber-500/10'
  return 'text-zinc-400 bg-zinc-700/50'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isOverdue(date?: string) {
  if (!date) return false
  return new Date(date) < new Date()
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', scoreColor(score))}>
      {score}
    </span>
  )
}

// ─── Main component ─────────────────────────────────────────────

export default function Outreach() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // View state
  const [view, setView] = useState<ViewMode>('prospects')
  const [detailTab, setDetailTab] = useState<DetailTab>('email')

  // Prospect list state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [campaignFilter, setCampaignFilter] = useState<string>('')
  const [locationFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null)

  // Email editor state
  const [editedSubject, setEditedSubject] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [tone, setTone] = useState<EmailTone>('professional')
  const [bizDesc, setBizDesc] = useState(() => localStorage.getItem('outreach_biz_desc') ?? '')
  const [senderName, setSenderName] = useState(() => localStorage.getItem('outreach_sender_name') ?? '')
  const [senderTitle, setSenderTitle] = useState(() => localStorage.getItem('outreach_sender_title') ?? '')
  const [customInstructions, setCustomInstructions] = useState('')
  const [activeVariantIdx, setActiveVariantIdx] = useState<number | null>(null)

  // Activity state
  const [activityType, setActivityType] = useState<ActivityType>('note')
  const [activityBody, setActivityBody] = useState('')

  // Follow-up state
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')

  // Template state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Research modal state
  const [showResearch, setShowResearch] = useState(false)
  const [researchForm, setResearchForm] = useState({
    businessDescription: () => localStorage.getItem('outreach_biz_desc') ?? '',
    targetIndustry: '', targetRole: '', targetLocation: '', count: '10', campaignName: '',
  })
  const [researchDoc, setResearchDoc] = useState<File | null>(null)

  // Social research state
  const [showSocialPanel, setShowSocialPanel] = useState(false)
  const [socialPlatform, setSocialPlatform] = useState<'instagram' | 'linkedin'>('instagram')
  const [socialHandle, setSocialHandle] = useState('')

  // Personalize / variant loading states
  const [personalizingId, setPersonalizingId] = useState<string | null>(null)
  const [variantsLoadingId, setVariantsLoadingId] = useState<string | null>(null)

  // Sequence state
  const [sequenceLoadingId, setSequenceLoadingId] = useState<string | null>(null)
  const [liHandle, setLiHandle] = useState('')
  const [igHandle, setIgHandle] = useState('')
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('outreach_webhook_url') ?? '')
  const [dispatchingStep, setDispatchingStep] = useState<number | null>(null)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null)
  const [editingStepMsg, setEditingStepMsg] = useState('')

  // Auto-send state
  const [autoSend, setAutoSend] = useState(() => localStorage.getItem('outreach_auto_send') === 'true')
  const [autoSendStatus, setAutoSendStatus] = useState<string | null>(null)

  // Tag input
  const [tagInput, setTagInput] = useState('')

  // ─── Queries ─────────────────────────────────────────────────

  const { data: statsData } = useQuery<Stats>({
    queryKey: ['outreach-stats'],
    queryFn: () => api.get('/outreach/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: analyticsData } = useQuery<Analytics>({
    queryKey: ['outreach-analytics'],
    queryFn: () => api.get('/outreach/analytics').then(r => r.data),
    enabled: view === 'analytics',
  })

  const { data: followUpsData } = useQuery<{ prospects: Prospect[] }>({
    queryKey: ['outreach-follow-ups'],
    queryFn: () => api.get('/outreach/follow-ups').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: templatesData } = useQuery<{ templates: OutreachTemplate[] }>({
    queryKey: ['outreach-templates'],
    queryFn: () => api.get('/outreach/templates').then(r => r.data),
    enabled: view === 'templates' || showSaveTemplate,
  })

  const { data: listData, isLoading } = useQuery<{ prospects: Prospect[]; total: number }>({
    queryKey: ['outreach-list', search, statusFilter, campaignFilter, locationFilter],
    queryFn: () => api.get('/outreach', {
      params: { search: search || undefined, status: statusFilter || undefined, campaignName: campaignFilter || undefined, location: locationFilter || undefined, limit: 100 },
    }).then(r => r.data),
    staleTime: 15_000,
  })

  const { data: gmailStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['gmail-status'],
    queryFn: () => api.get('/auth/gmail/status').then(r => r.data).catch(() => ({ connected: false })),
    staleTime: 60_000,
  })

  const prospects = listData?.prospects ?? []

  // ─── Mutations ────────────────────────────────────────────────

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['outreach-list'] })
    qc.invalidateQueries({ queryKey: ['outreach-stats'] })
    qc.invalidateQueries({ queryKey: ['outreach-analytics'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/outreach/${id}`, data).then(r => r.data),
    onSuccess: ({ prospect }) => {
      if (activeProspect?._id === prospect._id) setActiveProspect(prospect)
      invalidateAll()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/outreach/${id}`),
    onSuccess: () => { setActiveProspect(null); invalidateAll() },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.delete('/outreach/bulk', { data: { ids } }),
    onSuccess: () => { setSelected(new Set()); invalidateAll() },
  })

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) => api.patch('/outreach/bulk-status', { ids, status }),
    onSuccess: () => { setSelected(new Set()); invalidateAll() },
  })

  const researchMutation = useMutation({
    mutationFn: (fd: FormData) => api.post('/outreach/research', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 }).then(r => r.data),
    onSuccess: (data) => {
      setShowResearch(false)
      invalidateAll()
      if (autoSend && data.prospects?.length) {
        triggerAutoSend(data.prospects)
      } else {
        setAutoSendStatus(null)
      }
    },
  })

  const scrapeMutation = useMutation({
    mutationFn: (id: string) => api.post('/outreach/scrape', { prospectId: id, url: activeProspect?.website }).then(r => r.data),
    onSuccess: ({ prospect }) => { if (prospect) setActiveProspect(prospect); invalidateAll() },
  })

  const generateMutation = useMutation({
    mutationFn: ({ id, biz, t, instr }: { id: string; biz: string; t: string; instr?: string }) =>
      api.post('/outreach/generate-email', {
        prospectId: id, businessDescription: biz, tone: t, customInstructions: instr,
        senderName, senderTitle,
      }).then(r => r.data),
    onSuccess: ({ prospect }) => {
      if (prospect) { setActiveProspect(prospect); setEditedSubject(prospect.generatedSubject ?? ''); setEditedBody(prospect.generatedEmail ?? '') }
      invalidateAll()
    },
  })

  const gmailSendMutation = useMutation({
    mutationFn: ({ to, subject, body, id }: { to: string; subject: string; body: string; id: string }) =>
      api.post('/outreach/send-gmail', { to, subject, body, prospectId: id }).then(r => r.data),
    onSuccess: ({ prospect }) => { if (prospect) setActiveProspect(prospect); invalidateAll() },
  })

  const bulkSendMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/outreach/bulk-send', { ids }).then(r => r.data),
    onSuccess: () => { setSelected(new Set()); invalidateAll() },
  })

  const importMutation = useMutation({
    mutationFn: (fd: FormData) => api.post('/outreach/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
    onSuccess: () => invalidateAll(),
  })

  const socialMutation = useMutation({
    mutationFn: ({ platform, handle, id }: { platform: string; handle: string; id: string }) =>
      api.post('/outreach/social-research', { platform, handle, prospectId: id }).then(r => r.data),
    onSuccess: () => { setShowSocialPanel(false); if (activeProspect) { qc.invalidateQueries({ queryKey: ['outreach-list'] }) } },
  })

  const addActivityMutation = useMutation({
    mutationFn: ({ id, type, body }: { id: string; type: string; body: string }) =>
      api.post(`/outreach/${id}/activity`, { type, body }).then(r => r.data),
    onSuccess: ({ activities }) => {
      if (activeProspect) setActiveProspect({ ...activeProspect, activities })
      setActivityBody('')
    },
  })

  const saveTemplateMutation = useMutation({
    mutationFn: (data: any) => api.post('/outreach/templates', data).then(r => r.data),
    onSuccess: () => { setShowSaveTemplate(false); setTemplateName(''); qc.invalidateQueries({ queryKey: ['outreach-templates'] }) },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (tid: string) => api.delete(`/outreach/templates/${tid}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-templates'] }),
  })

  const useTemplateMutation = useMutation({
    mutationFn: (tid: string) => api.post(`/outreach/templates/${tid}/use`),
  })

  const bulkScoreMutation = useMutation({
    mutationFn: () => api.post('/outreach/bulk-score').then(r => r.data),
    onSuccess: () => invalidateAll(),
  })

  const updateSequenceStepMutation = useMutation({
    mutationFn: ({ id, idx, data }: { id: string; idx: number; data: any }) =>
      api.patch(`/outreach/${id}/sequence/${idx}`, data).then(r => r.data),
    onSuccess: ({ sequence, activities }) => {
      setActiveProspect(prev => prev ? { ...prev, sequence: sequence ?? prev.sequence, activities: activities ?? prev.activities } : prev)
      setEditingStepIdx(null)
      invalidateAll()
    },
  })

  // ─── Handlers ─────────────────────────────────────────────────

  const openProspect = (p: Prospect) => {
    setActiveProspect(p)
    setEditedSubject(p.generatedSubject ?? '')
    setEditedBody(p.generatedEmail ?? '')
    setToEmail(p.contactEmail ?? p.scrapedEmails[0] ?? '')
    setDetailTab('email')
    setActiveVariantIdx(null)
    setFollowUpDate(p.followUpAt ? new Date(p.followUpAt).toISOString().slice(0, 10) : '')
    setFollowUpNote(p.followUpNote ?? '')
  }

  const handleGenerateSequence = async (p: Prospect) => {
    setSequenceLoadingId(p._id)
    try {
      const { data } = await api.post(`/outreach/${p._id}/generate-sequence`, {
        businessDescription: bizDesc,
        contactName: p.contactName,
        linkedinHandle: liHandle || p.linkedinUrl,
        instagramHandle: igHandle,
      })
      setActiveProspect(prev => prev ? { ...prev, sequence: data.sequence } : prev)
      invalidateAll()
    } finally {
      setSequenceLoadingId(null)
    }
  }

  const handleDispatchStep = async (prospectId: string, stepIdx: number) => {
    if (!webhookUrl) return
    setDispatchingStep(stepIdx)
    try {
      await api.post(`/outreach/${prospectId}/sequence/${stepIdx}/dispatch`, { webhookUrl })
    } finally {
      setDispatchingStep(null)
    }
  }

  const handleCopyStep = (msg: string, idx: number) => {
    navigator.clipboard.writeText(msg)
    setCopiedStep(idx)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  const buildProfileUrl = (p: Prospect, platform: SequencePlatform): string => {
    if (platform === 'linkedin') {
      if (p.linkedinUrl) return p.linkedinUrl
      const q = encodeURIComponent(`${p.contactName || ''} ${p.companyName}`.trim())
      return `https://www.linkedin.com/search/results/people/?keywords=${q}`
    }
    if (platform === 'instagram') {
      const h = igHandle.replace('@', '')
      if (h) return `https://www.instagram.com/${h}/`
      return `https://www.instagram.com/explore/tags/${encodeURIComponent(p.companyName)}/`
    }
    if (platform === 'email') return `mailto:${p.contactEmail ?? ''}`
    return '#'
  }

  const handlePersonalize = async (p: Prospect) => {
    setPersonalizingId(p._id)
    try {
      const { data } = await api.post(`/outreach/${p._id}/personalize`)
      setActiveProspect(prev => prev ? { ...prev, personalizedOpener: data.personalizedOpener } : prev)
    } finally {
      setPersonalizingId(null)
    }
  }

  const handleGenerateVariants = async (p: Prospect) => {
    setVariantsLoadingId(p._id)
    try {
      const { data } = await api.post(`/outreach/${p._id}/variants`, { businessDescription: bizDesc })
      setActiveProspect(prev => prev ? { ...prev, variants: data.variants } : prev)
      invalidateAll()
    } finally {
      setVariantsLoadingId(null)
    }
  }

  const applyVariant = (v: EmailVariant, idx: number) => {
    setEditedSubject(v.subject)
    setEditedBody(v.body)
    setActiveVariantIdx(idx)
  }

  const applyTemplate = (t: OutreachTemplate) => {
    setEditedSubject(t.subject)
    setEditedBody(t.body)
    useTemplateMutation.mutate(t._id)
  }

  const handleSend = () => {
    if (!activeProspect || !toEmail) return
    gmailSendMutation.mutate({ to: toEmail, subject: editedSubject, body: editedBody, id: activeProspect._id })
  }

  const handleSaveEdits = () => {
    if (!activeProspect) return
    updateMutation.mutate({ id: activeProspect._id, data: { generatedSubject: editedSubject, generatedEmail: editedBody, emailTone: tone } })
  }

  const handleFollowUpSave = () => {
    if (!activeProspect) return
    updateMutation.mutate({ id: activeProspect._id, data: { followUpAt: followUpDate || null, followUpNote } })
    setActiveProspect(prev => prev ? { ...prev, followUpAt: followUpDate, followUpNote } : prev)
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && activeProspect) {
      const newTags = [...(activeProspect.tags ?? []), tagInput.trim()]
      updateMutation.mutate({ id: activeProspect._id, data: { tags: newTags } })
      setActiveProspect(prev => prev ? { ...prev, tags: newTags } : prev)
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    if (!activeProspect) return
    const newTags = activeProspect.tags.filter(t => t !== tag)
    updateMutation.mutate({ id: activeProspect._id, data: { tags: newTags } })
    setActiveProspect(prev => prev ? { ...prev, tags: newTags } : prev)
  }

  const handleImportFile = useCallback((file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    importMutation.mutate(fd)
  }, [])

  // Auto-send pipeline: generate emails then send them
  const triggerAutoSend = async (newProspects: Prospect[]) => {
    if (!newProspects.length) return
    const ids = newProspects.map(p => p._id)
    setAutoSendStatus(`Generating emails for ${ids.length} prospect${ids.length !== 1 ? 's' : ''}…`)
    try {
      await api.post('/outreach/generate-bulk', {
        prospectIds: ids,
        businessDescription: bizDesc,
        tone,
        senderName,
        senderTitle,
      })
      invalidateAll()

      if (gmailStatus?.connected) {
        setAutoSendStatus(`Sending ${ids.length} email${ids.length !== 1 ? 's' : ''} via Gmail…`)
        const { data } = await api.post('/outreach/bulk-send', { ids })
        setAutoSendStatus(`✓ Auto-sent ${data.sent} email${data.sent !== 1 ? 's' : ''} successfully!`)
        invalidateAll()
      } else {
        setAutoSendStatus(`✓ Generated ${ids.length} emails — connect Gmail in Settings to enable auto-sending.`)
      }
    } catch (err: any) {
      setAutoSendStatus(`Auto-send failed: ${err?.response?.data?.message ?? err?.message}`)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === prospects.length) setSelected(new Set())
    else setSelected(new Set(prospects.map(p => p._id)))
  }

  // ─── Follow-up alert banner ────────────────────────────────────

  const overdueFollowUps = (followUpsData?.prospects ?? []).filter(p => isOverdue(p.followUpAt))
  const dueSoonFollowUps = (followUpsData?.prospects ?? []).filter(p => !isOverdue(p.followUpAt))

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Cold Outreach</h1>
          <p className="text-xs text-zinc-500">AI-powered prospect research, personalised emails & campaign analytics</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          {(['prospects', 'analytics', 'templates'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                view === v ? 'bg-brand-500/20 text-brand-400' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {v === 'prospects' && <Inbox size={13} />}
              {v === 'analytics' && <BarChart3 size={13} />}
              {v === 'templates' && <BookTemplate size={13} />}
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}

          <div className="w-px h-5 bg-white/10 mx-1" />

          {/* Auto-send toggle */}
          <button
            onClick={() => {
              const next = !autoSend
              setAutoSend(next)
              localStorage.setItem('outreach_auto_send', String(next))
              if (!next) setAutoSendStatus(null)
            }}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              autoSend
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'border-white/10 text-zinc-500 hover:text-zinc-300',
            )}
            title="When ON: after AI Research finishes, emails are automatically generated and sent via Gmail"
          >
            <Send size={12} />
            Auto-send {autoSend ? 'ON' : 'OFF'}
          </button>

          <button onClick={() => bulkScoreMutation.mutate()} disabled={bulkScoreMutation.isPending} className="btn-secondary text-xs gap-1.5 px-3 py-1.5">
            <Star size={13} /> Score All
          </button>
          <button onClick={() => setShowResearch(true)} className="btn-primary text-xs gap-1.5 px-3 py-1.5">
            <Plus size={13} /> AI Research
          </button>
        </div>
      </div>

      {/* Follow-up alert banner */}
      {overdueFollowUps.length > 0 && (
        <div className="mx-6 mt-3 flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
          <Bell size={13} className="text-amber-400 shrink-0" />
          <span className="text-amber-300 font-medium">{overdueFollowUps.length} overdue follow-up{overdueFollowUps.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-1.5 flex-wrap">
            {overdueFollowUps.slice(0, 3).map(p => (
              <button key={p._id} onClick={() => openProspect(p)} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full hover:bg-amber-500/30 transition-colors">
                {p.companyName}
              </button>
            ))}
            {overdueFollowUps.length > 3 && <span className="text-amber-400">+{overdueFollowUps.length - 3} more</span>}
          </div>
        </div>
      )}
      {dueSoonFollowUps.length > 0 && (
        <div className="mx-6 mt-2 flex items-center gap-3 px-4 py-2 bg-brand-500/5 border border-brand-500/10 rounded-xl text-xs">
          <Clock size={13} className="text-brand-400 shrink-0" />
          <span className="text-brand-300">{dueSoonFollowUps.length} follow-up{dueSoonFollowUps.length !== 1 ? 's' : ''} due within 48 h</span>
        </div>
      )}

      {/* Auto-send status banner */}
      {autoSendStatus && (
        <div className={clsx(
          'mx-6 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs border',
          autoSendStatus.startsWith('✓')
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : autoSendStatus.startsWith('Auto-send failed')
            ? 'bg-red-500/10 border-red-500/20 text-red-300'
            : 'bg-violet-500/10 border-violet-500/20 text-violet-300',
        )}>
          {autoSendStatus.startsWith('✓') ? <CheckCircle size={13} className="shrink-0" /> : <RefreshCw size={13} className="animate-spin shrink-0" />}
          <span className="flex-1">{autoSendStatus}</span>
          {(autoSendStatus.startsWith('✓') || autoSendStatus.startsWith('Auto-send failed')) && (
            <button onClick={() => setAutoSendStatus(null)} className="text-zinc-500 hover:text-zinc-300">×</button>
          )}
        </div>
      )}

      {/* ── View: Prospects ── */}
      {view === 'prospects' && (
        <div className="flex flex-1 min-h-0 overflow-hidden gap-0">
          {/* Left panel */}
          <div className="flex flex-col w-[380px] shrink-0 border-r border-white/5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-white/5 shrink-0">
              {[
                { label: 'Total', value: statsData?.total ?? 0, color: 'text-zinc-300' },
                { label: 'Replied', value: statsData?.byStatus?.replied ?? 0, color: 'text-brand-400' },
                { label: 'Converted', value: statsData?.byStatus?.converted ?? 0, color: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-surface-900/50 px-3 py-2 text-center">
                  <div className={clsx('text-lg font-bold', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-zinc-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/5 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prospects…" className="input w-full pl-8 text-xs h-8" />
              </div>
              <div className="flex gap-2">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input flex-1 text-xs h-8">
                  <option value="">All Status</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="input flex-1 text-xs h-8">
                  <option value="">All Campaigns</option>
                  {(statsData?.campaigns ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Bulk actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 border-b border-brand-500/20 shrink-0">
                <span className="text-xs text-brand-400 font-medium">{selected.size} selected</span>
                <select onChange={e => bulkStatusMutation.mutate({ ids: Array.from(selected), status: e.target.value })} className="input text-xs h-7 flex-1" defaultValue="">
                  <option value="" disabled>Change status…</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={() => bulkSendMutation.mutate(Array.from(selected))} disabled={bulkSendMutation.isPending} className="btn-secondary text-xs px-2 py-1 gap-1">
                  <Send size={11} /> Send
                </button>
                <button onClick={() => bulkDeleteMutation.mutate(Array.from(selected))} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* Prospect list */}
            <div className="flex-1 overflow-y-auto">
              {/* Select all row */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
                <input type="checkbox" checked={selected.size === prospects.length && prospects.length > 0} onChange={toggleSelectAll} className="rounded" />
                <span className="text-[10px] text-zinc-500 flex-1">
                  {listData?.total ?? 0} prospects
                </span>
                <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer hover:text-zinc-300">
                  <Upload size={11} />
                  <input type="file" accept=".csv,.xlsx" className="hidden" ref={fileInputRef} onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
                  Import
                </label>
                <a href={`${(import.meta as any).env?.VITE_API_URL ?? ''}/outreach/export`} download className="text-[10px] text-zinc-500 flex items-center gap-1 hover:text-zinc-300">
                  <Download size={11} /> Export
                </a>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">Loading…</div>
              ) : prospects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
                  <Send size={28} className="opacity-30" />
                  <p className="text-sm">No prospects yet</p>
                  <button onClick={() => setShowResearch(true)} className="btn-primary text-xs px-3 py-1.5">Research prospects</button>
                </div>
              ) : (
                prospects.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  const isActive = activeProspect?._id === p._id
                  const overdue = isOverdue(p.followUpAt)
                  return (
                    <div
                      key={p._id}
                      onClick={() => openProspect(p)}
                      className={clsx(
                        'flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-white/5 transition-colors hover:bg-white/3',
                        isActive && 'bg-brand-500/5 border-l-2 border-l-brand-500',
                        overdue && !isActive && 'border-l-2 border-l-amber-500',
                      )}
                    >
                      <input type="checkbox" checked={selected.has(p._id)} onClick={e => { e.stopPropagation(); toggleSelect(p._id) }} onChange={() => {}} className="mt-0.5 rounded shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100 truncate">{p.companyName}</span>
                          <ScoreBadge score={p.score} />
                        </div>
                        {p.contactName && <p className="text-xs text-zinc-400 truncate">{p.contactName}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={clsx('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full', sc.bg, sc.color)}>
                            <span className={clsx('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </span>
                          {p.campaignName && <span className="text-[10px] text-zinc-500">{p.campaignName}</span>}
                          {p.variants.length > 0 && <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">{p.variants.length} variants</span>}
                          {p.followUpAt && (
                            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full', overdue ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-500 bg-zinc-800')}>
                              <Clock size={9} className="inline mr-0.5" />{fmtDate(p.followUpAt)}
                            </span>
                          )}
                        </div>
                        {p.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {p.tags.slice(0, 3).map(t => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right detail panel */}
          {activeProspect ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
              {/* Prospect header */}
              <div className="px-6 py-4 border-b border-white/5 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-zinc-100">{activeProspect.companyName}</h2>
                      <ScoreBadge score={activeProspect.score} />
                      <span className={clsx('text-[10px] px-2 py-0.5 rounded-full', STATUS_CONFIG[activeProspect.status].bg, STATUS_CONFIG[activeProspect.status].color)}>
                        {STATUS_CONFIG[activeProspect.status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-zinc-500">
                      {activeProspect.contactName && <span className="flex items-center gap-1"><User size={11} />{activeProspect.contactName}</span>}
                      {activeProspect.industry && <span className="flex items-center gap-1"><Building2 size={11} />{activeProspect.industry}</span>}
                      {activeProspect.location && <span className="flex items-center gap-1"><MapPin size={11} />{activeProspect.location}</span>}
                      {activeProspect.website && (
                        <a href={activeProspect.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-zinc-300">
                          <Globe size={11} />{activeProspect.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                    {/* Tags */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {activeProspect.tags.map(t => (
                        <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {t}
                          <button onClick={() => handleRemoveTag(t)} className="hover:text-red-400">×</button>
                        </span>
                      ))}
                      <input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        placeholder="+ tag"
                        className="text-[10px] bg-transparent text-zinc-500 outline-none w-16 placeholder-zinc-600"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={activeProspect.status}
                      onChange={e => updateMutation.mutate({ id: activeProspect._id, data: { status: e.target.value } })}
                      className="input text-xs h-8"
                    >
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => deleteMutation.mutate(activeProspect._id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail tabs */}
              <div className="flex border-b border-white/5 shrink-0 px-6">
                {([
                  { tab: 'email', label: 'Email', icon: Mail },
                  { tab: 'sequence', label: 'Sequence', icon: Layers },
                  { tab: 'research', label: 'Research', icon: Globe },
                  { tab: 'timeline', label: 'Timeline', icon: Activity },
                  { tab: 'followup', label: 'Follow-up', icon: Calendar },
                ] as { tab: DetailTab; label: string; icon: any }[]).map(({ tab, label, icon: Icon }) => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                      detailTab === tab ? 'border-brand-500 text-brand-400' : 'border-transparent text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    <Icon size={12} />{label}
                    {tab === 'sequence' && activeProspect.sequence?.length > 0 && (
                      <span className={clsx('ml-1 text-[9px] px-1.5 py-0.5 rounded-full', activeProspect.sequence.filter(s => s.status === 'done').length === activeProspect.sequence.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400')}>
                        {activeProspect.sequence.filter(s => s.status === 'done').length}/{activeProspect.sequence.length}
                      </span>
                    )}
                    {tab === 'timeline' && activeProspect.activities.length > 0 && (
                      <span className="ml-1 text-[9px] bg-zinc-700 px-1.5 py-0.5 rounded-full">{activeProspect.activities.length}</span>
                    )}
                    {tab === 'followup' && activeProspect.followUpAt && (
                      <span className={clsx('ml-1 w-1.5 h-1.5 rounded-full', isOverdue(activeProspect.followUpAt) ? 'bg-amber-400' : 'bg-brand-500')} />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 pb-20">

                {/* ── Email tab ── */}
                {detailTab === 'email' && (
                  <div className="flex flex-col gap-5">
                    {/* Personalized opener */}
                    <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Sparkles size={12} className="text-violet-400" /> Personalised Opener</h3>
                        <button
                          onClick={() => handlePersonalize(activeProspect)}
                          disabled={personalizingId === activeProspect._id}
                          className="btn-secondary text-xs px-2 py-1 gap-1"
                        >
                          {personalizingId === activeProspect._id ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
                          {activeProspect.personalizedOpener ? 'Regenerate' : 'Generate'}
                        </button>
                      </div>
                      {activeProspect.personalizedOpener ? (
                        <div className="flex gap-2">
                          <p className="text-xs text-zinc-300 italic flex-1">"{activeProspect.personalizedOpener}"</p>
                          <button onClick={() => {
                            setEditedBody(`${activeProspect.personalizedOpener}\n\n${editedBody}`)
                          }} className="text-[10px] text-brand-400 hover:text-brand-300 shrink-0">
                            Prepend
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-600">AI generates a hyper-specific first sentence based on their scraped data — dramatically improves reply rates.</p>
                      )}
                    </div>

                    {/* A/B Variants */}
                    <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Layers size={12} className="text-amber-400" /> A/B Variants</h3>
                        <button
                          onClick={() => handleGenerateVariants(activeProspect)}
                          disabled={variantsLoadingId === activeProspect._id}
                          className="btn-secondary text-xs px-2 py-1 gap-1"
                        >
                          {variantsLoadingId === activeProspect._id ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {activeProspect.variants.length ? 'Regenerate' : 'Generate 3 variants'}
                        </button>
                      </div>
                      {activeProspect.variants.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {activeProspect.variants.map((v, i) => (
                            <button
                              key={i}
                              onClick={() => applyVariant(v, i)}
                              className={clsx(
                                'text-left p-3 rounded-lg border transition-colors',
                                activeVariantIdx === i
                                  ? 'border-brand-500/50 bg-brand-500/10'
                                  : 'border-white/5 bg-surface-800/50 hover:border-white/10',
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{v.label}</span>
                                <span className={clsx('text-[10px]', TONE_CONFIG[v.tone as EmailTone] ?? 'text-zinc-400')}>{v.tone}</span>
                                {activeVariantIdx === i && <CheckCircle size={11} className="text-brand-400 ml-auto" />}
                              </div>
                              <p className="text-xs text-zinc-300 font-medium">{v.subject}</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{v.body}</p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-600">Generate 3 different email angles (Pain Point, Results, Question) and test which gets the best reply rate.</p>
                      )}
                    </div>

                    {/* Business profile inputs */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] text-zinc-500 mb-1 block">Your business pitch</label>
                        <textarea
                          value={bizDesc}
                          onChange={e => { setBizDesc(e.target.value); localStorage.setItem('outreach_biz_desc', e.target.value) }}
                          rows={2}
                          placeholder="What you do + value prop…"
                          className="input w-full text-xs resize-none"
                        />
                      </div>
                      <div className="flex flex-col gap-2 w-32">
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Your name</label>
                          <input value={senderName} onChange={e => { setSenderName(e.target.value); localStorage.setItem('outreach_sender_name', e.target.value) }} className="input w-full text-xs h-8" placeholder="Name" />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Your title</label>
                          <input value={senderTitle} onChange={e => { setSenderTitle(e.target.value); localStorage.setItem('outreach_sender_title', e.target.value) }} className="input w-full text-xs h-8" placeholder="Title" />
                        </div>
                      </div>
                    </div>

                    {/* Tone + custom instructions */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] text-zinc-500 mb-1 block">Tone</label>
                        <select value={tone} onChange={e => setTone(e.target.value as EmailTone)} className="input w-full text-xs h-8">
                          <option value="professional">Professional</option>
                          <option value="friendly">Friendly</option>
                          <option value="bold">Bold</option>
                          <option value="concise">Concise</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-zinc-500 mb-1 block">Custom instructions</label>
                        <input value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} className="input w-full text-xs h-8" placeholder="Mention X, avoid Y…" />
                      </div>
                      <button
                        onClick={() => generateMutation.mutate({ id: activeProspect._id, biz: bizDesc, t: tone, instr: customInstructions })}
                        disabled={generateMutation.isPending || !bizDesc.trim()}
                        className="btn-primary text-xs px-3 self-end h-8 gap-1"
                      >
                        {generateMutation.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        Generate
                      </button>
                    </div>

                    {/* Email editor */}
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">To</label>
                        <div className="flex gap-2">
                          <input value={toEmail} onChange={e => setToEmail(e.target.value)} className="input flex-1 text-xs h-8" placeholder="recipient@company.com" />
                          {activeProspect.scrapedEmails.length > 1 && (
                            <select onChange={e => setToEmail(e.target.value)} className="input text-xs h-8 w-32">
                              <option value="">Other emails</option>
                              {activeProspect.scrapedEmails.map(em => <option key={em} value={em}>{em}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Subject</label>
                        <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} className="input w-full text-xs h-8" placeholder="Subject line…" />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Body</label>
                        <textarea
                          value={editedBody}
                          onChange={e => setEditedBody(e.target.value)}
                          rows={10}
                          className="input w-full text-xs resize-none font-mono"
                          placeholder="Email body…"
                        />
                      </div>
                    </div>

                    {/* Save template modal (inline) */}
                    {showSaveTemplate && (
                      <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 flex flex-col gap-3">
                        <h4 className="text-xs font-semibold text-zinc-300">Save as Template</h4>
                        <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name (e.g. Pain-point opener)" className="input text-xs h-8 w-full" />
                        <div className="flex gap-2">
                          <button onClick={() => saveTemplateMutation.mutate({ name: templateName, subject: editedSubject, body: editedBody, tone })} disabled={!templateName.trim() || saveTemplateMutation.isPending} className="btn-primary text-xs px-3 py-1.5">
                            {saveTemplateMutation.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setShowSaveTemplate(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Sequence tab ── */}
                {detailTab === 'sequence' && (
                  <div className="flex flex-col gap-5">
                    {/* Header + generate */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">Multi-Channel Outreach Sequence</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">AI generates a personalised step-by-step sequence across LinkedIn, Instagram, and Email</p>
                      </div>
                      <button
                        onClick={() => handleGenerateSequence(activeProspect)}
                        disabled={sequenceLoadingId === activeProspect._id}
                        className="btn-primary text-xs px-3 py-2 gap-1.5 flex items-center shrink-0"
                      >
                        {sequenceLoadingId === activeProspect._id
                          ? <><RefreshCw size={12} className="animate-spin" /> Generating…</>
                          : <><Sparkles size={12} /> {activeProspect.sequence?.length ? 'Regenerate' : 'Generate Sequence'}</>
                        }
                      </button>
                    </div>

                    {/* Profile handles input */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1">💼 LinkedIn handle / URL</label>
                        <input
                          value={liHandle || activeProspect.linkedinUrl || ''}
                          onChange={e => setLiHandle(e.target.value)}
                          placeholder="linkedin.com/in/name or just 'name'"
                          className="input w-full text-xs h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">📸 Instagram handle</label>
                        <input
                          value={igHandle}
                          onChange={e => setIgHandle(e.target.value)}
                          placeholder="@handle or username"
                          className="input w-full text-xs h-8"
                        />
                      </div>
                    </div>

                    {/* Progress bar */}
                    {activeProspect.sequence?.length > 0 && (() => {
                      const done = activeProspect.sequence.filter(s => s.status === 'done').length
                      const total = activeProspect.sequence.length
                      const pct = Math.round((done / total) * 100)
                      return (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 shrink-0">{done}/{total} steps done</span>
                        </div>
                      )
                    })()}

                    {/* Sequence steps */}
                    {activeProspect.sequence?.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {activeProspect.sequence.map((step, idx) => {
                          const pc = PLATFORM_CONFIG[step.platform]
                          const profileUrl = buildProfileUrl(activeProspect, step.platform)
                          const isDone = step.status === 'done'
                          const isSkipped = step.status === 'skipped'
                          return (
                            <div
                              key={idx}
                              className={clsx(
                                'rounded-xl border p-4 transition-colors',
                                isDone ? 'border-emerald-500/20 bg-emerald-500/5 opacity-75' :
                                isSkipped ? 'border-white/5 bg-surface-900/30 opacity-50' :
                                'border-white/8 bg-surface-900/50',
                              )}
                            >
                              {/* Step header */}
                              <div className="flex items-center gap-2 mb-3">
                                <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', pc.bg, pc.color)}>
                                  Day {step.day}
                                </span>
                                <span className="text-base">{pc.icon}</span>
                                <span className={clsx('text-xs font-semibold', pc.color)}>{pc.label}</span>
                                <span className="text-xs text-zinc-600">·</span>
                                <span className="text-xs text-zinc-500">{ACTION_LABELS[step.action]}</span>
                                {isDone && <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle size={10} /> Done {step.doneAt ? fmtDate(step.doneAt) : ''}</span>}
                                {isSkipped && <span className="ml-auto text-[10px] text-zinc-600">Skipped</span>}
                              </div>

                              {/* Message body */}
                              {editingStepIdx === idx ? (
                                <div className="flex flex-col gap-2">
                                  {step.platform === 'email' && (
                                    <input
                                      defaultValue={step.subject ?? ''}
                                      placeholder="Subject line"
                                      className="input w-full text-xs h-8"
                                      onBlur={e => updateSequenceStepMutation.mutate({ id: activeProspect._id, idx, data: { subject: e.target.value } })}
                                    />
                                  )}
                                  <textarea
                                    value={editingStepMsg}
                                    onChange={e => setEditingStepMsg(e.target.value)}
                                    rows={4}
                                    className="input w-full text-xs resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <button onClick={() => updateSequenceStepMutation.mutate({ id: activeProspect._id, idx, data: { message: editingStepMsg } })} className="btn-primary text-xs px-3 py-1.5">Save</button>
                                    <button onClick={() => setEditingStepIdx(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  {step.subject && <p className="text-xs font-medium text-zinc-300 mb-1">Subject: {step.subject}</p>}
                                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{step.message}</p>
                                </div>
                              )}

                              {/* Actions row */}
                              <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {/* Copy */}
                                <button
                                  onClick={() => handleCopyStep(step.subject ? `${step.subject}\n\n${step.message}` : step.message, idx)}
                                  className={clsx('flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors', copiedStep === idx ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-white/10 text-zinc-400 hover:text-zinc-200')}
                                >
                                  <Copy size={10} />
                                  {copiedStep === idx ? 'Copied!' : 'Copy'}
                                </button>

                                {/* Open profile */}
                                {step.platform !== 'email' && (
                                  <a
                                    href={profileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
                                  >
                                    <span className="text-xs">{pc.icon}</span>
                                    Open {pc.label} ↗
                                  </a>
                                )}
                                {step.platform === 'email' && activeProspect.contactEmail && (
                                  <a
                                    href={`mailto:${activeProspect.contactEmail}?subject=${encodeURIComponent(step.subject ?? '')}&body=${encodeURIComponent(step.message)}`}
                                    className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
                                  >
                                    📧 Open in Mail ↗
                                  </a>
                                )}

                                {/* Edit */}
                                {editingStepIdx !== idx && !isDone && (
                                  <button onClick={() => { setEditingStepIdx(idx); setEditingStepMsg(step.message) }} className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-500 hover:text-zinc-300 transition-colors">
                                    Edit
                                  </button>
                                )}

                                {/* Webhook dispatch */}
                                {webhookUrl && !isDone && (
                                  <button
                                    onClick={() => handleDispatchStep(activeProspect._id, idx)}
                                    disabled={dispatchingStep === idx}
                                    className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors"
                                    title="Send to Zapier/Make webhook"
                                  >
                                    {dispatchingStep === idx ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                                    Dispatch
                                  </button>
                                )}

                                {/* Mark done / skip */}
                                <div className="ml-auto flex gap-1.5">
                                  {!isDone && !isSkipped && (
                                    <>
                                      <button onClick={() => updateSequenceStepMutation.mutate({ id: activeProspect._id, idx, data: { status: 'done' } })} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                        <CheckCircle size={10} /> Done
                                      </button>
                                      <button onClick={() => updateSequenceStepMutation.mutate({ id: activeProspect._id, idx, data: { status: 'skipped' } })} className="text-[10px] px-2 py-1.5 text-zinc-600 hover:text-zinc-400 transition-colors">
                                        Skip
                                      </button>
                                    </>
                                  )}
                                  {(isDone || isSkipped) && (
                                    <button onClick={() => updateSequenceStepMutation.mutate({ id: activeProspect._id, idx, data: { status: 'pending' } })} className="text-[10px] px-2 py-1.5 text-zinc-600 hover:text-zinc-400 transition-colors">
                                      Undo
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border border-dashed border-white/10">
                        <div className="text-3xl">🎯</div>
                        <p className="text-sm text-zinc-400 font-medium">No sequence yet</p>
                        <p className="text-xs text-zinc-600 text-center max-w-xs">Generate a personalised LinkedIn → Instagram → Email sequence and track each step</p>
                        <button onClick={() => handleGenerateSequence(activeProspect)} disabled={sequenceLoadingId === activeProspect._id} className="btn-primary text-xs px-4 py-2 gap-1.5 flex items-center">
                          <Sparkles size={12} /> Generate Sequence
                        </button>
                      </div>
                    )}

                    {/* Webhook integration */}
                    <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                      <h4 className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                        <Zap size={12} className="text-violet-400" /> Automation Webhook
                      </h4>
                      <p className="text-[10px] text-zinc-600 mb-3">Paste a Zapier, Make (Integromat), or n8n webhook URL. Clicking "Dispatch" on any step will POST the prospect + message to your automation tool, which can then use Waalaxy, Expandi, or LinkedIn's own app to send it.</p>
                      <div className="flex gap-2">
                        <input
                          value={webhookUrl}
                          onChange={e => { setWebhookUrl(e.target.value); localStorage.setItem('outreach_webhook_url', e.target.value) }}
                          placeholder="https://hooks.zapier.com/hooks/catch/…"
                          className="input flex-1 text-xs h-8 font-mono"
                        />
                        <button
                          onClick={async () => {
                            if (!webhookUrl) return
                            await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, from: 'ForgeAI', companyName: activeProspect.companyName }) }).catch(() => {})
                          }}
                          className="btn-secondary text-xs px-3 h-8"
                          disabled={!webhookUrl}
                        >
                          Test
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-2">
                        💡 Free tools that connect to this webhook: <span className="text-violet-400">Waalaxy</span> (LinkedIn DMs), <span className="text-pink-400">Instabot</span> (Instagram), <span className="text-blue-400">Expandi</span> (LinkedIn sequences)
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Research tab ── */}
                {detailTab === 'research' && (
                  <div className="flex flex-col gap-5">
                    {/* Scraped summary */}
                    {activeProspect.scrapedSummary && (
                      <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                        <h3 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5"><Globe size={12} /> Scraped Summary</h3>
                        <p className="text-xs text-zinc-300 leading-relaxed">{activeProspect.scrapedSummary}</p>
                        <p className="text-[10px] text-zinc-600 mt-2">{activeProspect.scrapedAt ? `Scraped ${fmtDate(activeProspect.scrapedAt)}` : ''}</p>
                      </div>
                    )}

                    {/* Pain points */}
                    {activeProspect.painPoints && (
                      <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                        <h3 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5"><AlertCircle size={12} className="text-amber-400" /> Pain Points</h3>
                        <p className="text-xs text-zinc-300 leading-relaxed">{activeProspect.painPoints}</p>
                      </div>
                    )}

                    {/* Email quality */}
                    {activeProspect.scrapedEmails.length > 0 && (
                      <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4">
                        <h3 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5"><Mail size={12} /> Discovered Emails ({activeProspect.scrapedEmails.length})</h3>
                        <div className="flex flex-col gap-1.5">
                          {activeProspect.scrapedEmails.map(em => (
                            <div key={em} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-300 font-mono">{em}</span>
                              <button onClick={() => setToEmail(em)} className="text-[10px] text-brand-400 hover:text-brand-300">Use</button>
                              <button onClick={() => navigator.clipboard.writeText(em)} className="p-1 text-zinc-600 hover:text-zinc-400"><Copy size={10} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scrape / Social buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => scrapeMutation.mutate(activeProspect._id)}
                        disabled={scrapeMutation.isPending || !activeProspect.website}
                        className="btn-secondary text-xs px-3 py-2 gap-1.5"
                      >
                        {scrapeMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Globe size={12} />}
                        {activeProspect.scrapedSummary ? 'Re-scrape' : 'Scrape website'}
                      </button>
                      <button onClick={() => { setSocialPlatform('instagram'); setShowSocialPanel(true) }} className="btn-secondary text-xs px-3 py-2 gap-1.5">
                        <Instagram size={12} /> Instagram
                      </button>
                      <button onClick={() => { setSocialPlatform('linkedin'); setShowSocialPanel(true) }} className="btn-secondary text-xs px-3 py-2 gap-1.5">
                        <Linkedin size={12} /> LinkedIn
                      </button>
                    </div>

                    {/* Social panel inline */}
                    {showSocialPanel && (
                      <div className="rounded-xl border border-white/10 bg-surface-900/50 p-4 flex flex-col gap-3">
                        <div className="flex gap-2">
                          {(['instagram', 'linkedin'] as const).map(pl => (
                            <button key={pl} onClick={() => setSocialPlatform(pl)} className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium', socialPlatform === pl ? 'bg-brand-500/20 text-brand-400' : 'text-zinc-500 hover:text-zinc-300')}>
                              {pl === 'instagram' ? '📸 Instagram' : '💼 LinkedIn'}
                            </button>
                          ))}
                        </div>
                        <input value={socialHandle} onChange={e => setSocialHandle(e.target.value)} placeholder="@handle or profile URL" className="input text-xs h-8 w-full" />
                        <div className="flex gap-2">
                          <button onClick={() => socialMutation.mutate({ platform: socialPlatform, handle: socialHandle, id: activeProspect._id })} disabled={socialMutation.isPending || !socialHandle.trim()} className="btn-primary text-xs px-3 py-1.5">
                            {socialMutation.isPending ? 'Researching…' : 'Research'}
                          </button>
                          <button onClick={() => setShowSocialPanel(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 mb-2 block">Notes</label>
                      <textarea
                        defaultValue={activeProspect.notes ?? ''}
                        onBlur={e => updateMutation.mutate({ id: activeProspect._id, data: { notes: e.target.value } })}
                        rows={4}
                        className="input w-full text-xs resize-none"
                        placeholder="Internal notes…"
                      />
                    </div>
                  </div>
                )}

                {/* ── Timeline tab ── */}
                {detailTab === 'timeline' && (
                  <div className="flex flex-col gap-5">
                    {/* Add activity */}
                    <div className="rounded-xl bg-surface-900/50 border border-white/5 p-4 flex flex-col gap-3">
                      <h3 className="text-xs font-semibold text-zinc-300">Log Activity</h3>
                      <div className="flex gap-2">
                        <select value={activityType} onChange={e => setActivityType(e.target.value as ActivityType)} className="input text-xs h-8">
                          {(['note', 'call', 'email', 'meeting', 'linkedin'] as ActivityType[]).map(t => (
                            <option key={t} value={t}>{ACTIVITY_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                        <input
                          value={activityBody}
                          onChange={e => setActivityBody(e.target.value)}
                          placeholder="What happened…"
                          className="input flex-1 text-xs h-8"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && activityBody.trim()) {
                              addActivityMutation.mutate({ id: activeProspect._id, type: activityType, body: activityBody })
                            }
                          }}
                        />
                        <button
                          onClick={() => addActivityMutation.mutate({ id: activeProspect._id, type: activityType, body: activityBody })}
                          disabled={addActivityMutation.isPending || !activityBody.trim()}
                          className="btn-primary text-xs px-3 h-8"
                        >
                          Log
                        </button>
                      </div>
                    </div>

                    {/* Activity feed */}
                    <div className="flex flex-col gap-2">
                      {activeProspect.activities.length === 0 ? (
                        <p className="text-xs text-zinc-600 text-center py-8">No activities logged yet</p>
                      ) : (
                        [...activeProspect.activities].reverse().map((act, i) => (
                          <div key={i} className="flex gap-3 px-3 py-3 rounded-xl bg-surface-900/50 border border-white/5">
                            <span className="text-base shrink-0">{ACTIVITY_ICONS[act.type]}</span>
                            <div>
                              <p className="text-xs text-zinc-300">{act.body}</p>
                              <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDate(act.createdAt)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* ── Follow-up tab ── */}
                {detailTab === 'followup' && (
                  <div className="flex flex-col gap-5">
                    <div className="rounded-xl bg-surface-900/50 border border-white/5 p-5 flex flex-col gap-4">
                      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><Calendar size={14} className="text-brand-400" /> Schedule Follow-up</h3>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Follow-up date</label>
                        <input
                          type="date"
                          value={followUpDate}
                          onChange={e => setFollowUpDate(e.target.value)}
                          className="input w-full text-xs h-9"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Reminder note</label>
                        <textarea
                          value={followUpNote}
                          onChange={e => setFollowUpNote(e.target.value)}
                          rows={3}
                          className="input w-full text-xs resize-none"
                          placeholder="What to follow up on…"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleFollowUpSave} className="btn-primary text-xs px-4 py-2">Save Follow-up</button>
                        {activeProspect.followUpAt && (
                          <button onClick={() => { setFollowUpDate(''); updateMutation.mutate({ id: activeProspect._id, data: { followUpAt: null } }) }} className="btn-secondary text-xs px-3 py-2">
                            Clear
                          </button>
                        )}
                      </div>

                      {activeProspect.lastContactedAt && (
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Clock size={10} /> Last contacted {fmtDate(activeProspect.lastContactedAt)}
                        </p>
                      )}
                    </div>

                    {/* Quick follow-up templates */}
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 mb-2">Quick Reminders</h4>
                      <div className="flex flex-col gap-1.5">
                        {[
                          { label: 'Tomorrow', days: 1 },
                          { label: 'In 3 days', days: 3 },
                          { label: 'Next week', days: 7 },
                          { label: 'In 2 weeks', days: 14 },
                        ].map(({ label, days }) => (
                          <button
                            key={label}
                            onClick={() => {
                              const d = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
                              setFollowUpDate(d)
                            }}
                            className="text-left px-3 py-2 rounded-lg bg-surface-900/50 border border-white/5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* ── Sticky Send Footer (always visible) ── */}
              <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-surface-950/95 backdrop-blur-sm px-6 py-3 flex items-center gap-2">
                {gmailStatus?.connected ? (
                  <button
                    onClick={handleSend}
                    disabled={gmailSendMutation.isPending || !toEmail || !editedBody}
                    className="btn-primary text-sm px-5 py-2 gap-2 flex items-center"
                  >
                    {gmailSendMutation.isPending
                      ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                      : <><Send size={14} /> Send via Gmail</>
                    }
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: activeProspect._id, data: { status: 'sent', sentAt: new Date().toISOString() } })}
                      className="btn-primary text-sm px-5 py-2 gap-2 flex items-center"
                    >
                      <CheckCircle size={14} /> Mark as Sent
                    </button>
                    <span className="text-[11px] text-zinc-600">Connect Gmail in Settings to send directly</span>
                  </>
                )}
                <button onClick={handleSaveEdits} className="btn-secondary text-xs px-3 py-2">Save edits</button>
                <button onClick={() => setShowSaveTemplate(true)} className="btn-secondary text-xs px-3 py-2 gap-1 flex items-center">
                  <BookTemplate size={11} /> Template
                </button>
                <button onClick={() => navigator.clipboard.writeText(`${editedSubject}\n\n${editedBody}`)} className="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors" title="Copy email">
                  <Copy size={14} />
                </button>
                {gmailSendMutation.isSuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 ml-auto"><CheckCircle size={12} /> Sent!</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <Send size={40} className="opacity-20" />
              <p className="text-sm">Select a prospect to view details</p>
            </div>
          )}
        </div>
      )}

      {/* ── View: Analytics ── */}
      {view === 'analytics' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {analyticsData ? (
            <div className="flex flex-col gap-6 max-w-5xl">
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Prospects', value: analyticsData.total, color: 'text-zinc-300', icon: Inbox },
                  { label: 'Reply Rate', value: `${analyticsData.replyRate}%`, color: 'text-brand-400', icon: MessageSquare },
                  { label: 'Conversion Rate', value: `${analyticsData.conversionRate}%`, color: 'text-emerald-400', icon: TrendingUp },
                  { label: 'Avg Score', value: analyticsData.avgScore, color: 'text-amber-400', icon: Star },
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-surface-900/50 border border-white/5 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-zinc-500">{k.label}</span>
                      <k.icon size={14} className="text-zinc-600" />
                    </div>
                    <p className={clsx('text-2xl font-bold', k.color)}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Status funnel */}
              <div className="rounded-xl bg-surface-900/50 border border-white/5 p-5">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4">Pipeline Funnel</h3>
                <div className="flex flex-col gap-2">
                  {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                    const count = analyticsData.byStatus[status] ?? 0
                    const pct = analyticsData.total > 0 ? (count / analyticsData.total) * 100 : 0
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className={clsx('text-xs w-20 shrink-0', cfg.color)}>{cfg.label}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full', cfg.dot)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-10 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Campaign breakdown */}
              {analyticsData.byCampaign.length > 0 && (
                <div className="rounded-xl bg-surface-900/50 border border-white/5 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4">Campaign Performance</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-500 text-left">
                          <th className="pb-3 font-medium">Campaign</th>
                          <th className="pb-3 font-medium text-right">Total</th>
                          <th className="pb-3 font-medium text-right">Sent</th>
                          <th className="pb-3 font-medium text-right">Replied</th>
                          <th className="pb-3 font-medium text-right">Converted</th>
                          <th className="pb-3 font-medium text-right">Reply Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.byCampaign.map(c => (
                          <tr key={c.name} className="border-t border-white/5">
                            <td className="py-2.5 text-zinc-300 font-medium">{c.name}</td>
                            <td className="py-2.5 text-right text-zinc-400">{c.total}</td>
                            <td className="py-2.5 text-right text-zinc-400">{c.sent}</td>
                            <td className="py-2.5 text-right text-brand-400">{c.replied}</td>
                            <td className="py-2.5 text-right text-emerald-400">{c.converted}</td>
                            <td className="py-2.5 text-right">
                              <span className={clsx('px-2 py-0.5 rounded-full text-[10px]', c.replyRate >= 20 ? 'bg-emerald-500/10 text-emerald-400' : c.replyRate >= 10 ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500')}>
                                {c.replyRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Weekly trend chart */}
              {analyticsData.byWeek.length > 0 && (
                <div className="rounded-xl bg-surface-900/50 border border-white/5 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4">8-Week Trend</h3>
                  <div className="flex items-end gap-2 h-32">
                    {analyticsData.byWeek.slice(-8).map((w, i) => {
                      const max = Math.max(...analyticsData.byWeek.map(x => x.count), 1)
                      const h = Math.max(4, Math.round((w.count / max) * 100))
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div className="w-full bg-brand-500/80 rounded-t-sm transition-all hover:bg-brand-400" style={{ height: `${h}%` }} />
                          <span className="text-[9px] text-zinc-600 rotate-0">{w.week.split('-')[1] ? `W${w.week.split('-')[1]}` : w.week}</span>
                          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-surface-800 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{w.count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Industry breakdown */}
              {analyticsData.byIndustry.length > 0 && (
                <div className="rounded-xl bg-surface-900/50 border border-white/5 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4">By Industry</h3>
                  <div className="flex flex-col gap-2.5">
                    {analyticsData.byIndustry.map(ind => {
                      const max = Math.max(...analyticsData.byIndustry.map(x => x.count), 1)
                      const pct = Math.round((ind.count / max) * 100)
                      return (
                        <div key={ind.industry} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-400 w-32 truncate shrink-0">{ind.industry}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500/70 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-zinc-500 w-8 text-right">{ind.count}</span>
                          {ind.converted > 0 && <span className="text-[10px] text-emerald-400 w-14 text-right">{ind.converted} won</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-20 text-zinc-500">Loading analytics…</div>
          )}
        </div>
      )}

      {/* ── View: Templates ── */}
      {view === 'templates' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-zinc-300">Email Template Library</h2>
            <button onClick={() => setShowSaveTemplate(true)} className="btn-primary text-xs px-3 py-1.5 gap-1.5">
              <Plus size={12} /> New Template
            </button>
          </div>

          {/* New template form */}
          {showSaveTemplate && (
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-5 flex flex-col gap-4 mb-5">
              <h3 className="text-sm font-semibold text-zinc-200">Create Template</h3>
              <div className="flex gap-3">
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Template name" className="input flex-1 text-xs h-8" />
                <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} placeholder="Subject line" className="input flex-1 text-xs h-8" />
              </div>
              <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={6} className="input w-full text-xs resize-none" placeholder="Email body…" />
              <div className="flex gap-2">
                <button onClick={() => saveTemplateMutation.mutate({ name: templateName, subject: editedSubject, body: editedBody, tone })} disabled={!templateName.trim() || !editedSubject.trim() || saveTemplateMutation.isPending} className="btn-primary text-xs px-4 py-2">
                  {saveTemplateMutation.isPending ? 'Saving…' : 'Save Template'}
                </button>
                <button onClick={() => setShowSaveTemplate(false)} className="btn-secondary text-xs px-3 py-2">Cancel</button>
              </div>
            </div>
          )}

          {/* Template grid */}
          {(templatesData?.templates ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-600">
              <BookTemplate size={36} className="opacity-30" />
              <p className="text-sm">No templates yet — save your best emails for reuse</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(templatesData?.templates ?? []).map(t => (
                <div key={t._id} className="rounded-xl bg-surface-900/50 border border-white/5 p-4 flex flex-col gap-3 hover:border-white/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-zinc-200">{t.name}</h4>
                    <button onClick={() => deleteTemplateMutation.mutate(t._id)} className="p-1 text-zinc-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {t.tone && <span className={clsx('text-[10px] px-2 py-0.5 rounded-full w-fit', TONE_CONFIG[t.tone as EmailTone] ?? 'text-zinc-400', 'bg-zinc-800')}>{t.tone}</span>}
                  <p className="text-xs text-zinc-300 font-medium">{t.subject}</p>
                  <p className="text-xs text-zinc-500 line-clamp-3">{t.body}</p>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                    <span className="text-[10px] text-zinc-600">{t.timesUsed} uses · {fmtDate(t.createdAt)}</span>
                    <button
                      onClick={() => {
                        applyTemplate(t)
                        if (activeProspect) setView('prospects')
                      }}
                      className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                    >
                      Apply →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AI Research Modal ── */}
      {showResearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2"><Sparkles size={16} className="text-brand-400" /> AI Prospect Research</h2>
              <button onClick={() => setShowResearch(false)} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">What does your business do? *</label>
                <textarea
                  value={bizDesc}
                  onChange={e => { setBizDesc(e.target.value); localStorage.setItem('outreach_biz_desc', e.target.value) }}
                  rows={3}
                  className="input w-full text-sm resize-none"
                  placeholder="e.g. We build AI-powered websites for local restaurants that increase online orders by 30%…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Target industry</label>
                  <input
                    defaultValue={researchForm.targetIndustry}
                    onChange={e => setResearchForm(f => ({ ...f, targetIndustry: e.target.value }))}
                    className="input w-full text-sm h-9"
                    placeholder="e.g. restaurant, clinic…"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Target role</label>
                  <input
                    defaultValue={researchForm.targetRole}
                    onChange={e => setResearchForm(f => ({ ...f, targetRole: e.target.value }))}
                    className="input w-full text-sm h-9"
                    placeholder="e.g. owner, manager…"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Location</label>
                  <input
                    defaultValue={researchForm.targetLocation}
                    onChange={e => setResearchForm(f => ({ ...f, targetLocation: e.target.value }))}
                    className="input w-full text-sm h-9"
                    placeholder="e.g. Manchester, UK"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Number of prospects</label>
                  <input
                    type="number"
                    defaultValue={researchForm.count}
                    onChange={e => setResearchForm(f => ({ ...f, count: e.target.value }))}
                    min={1}
                    max={20}
                    className="input w-full text-sm h-9"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Campaign name</label>
                <input
                  defaultValue={researchForm.campaignName}
                  onChange={e => setResearchForm(f => ({ ...f, campaignName: e.target.value }))}
                  className="input w-full text-sm h-9"
                  placeholder="e.g. Q1 Manchester outreach"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Reference document (optional)</label>
                <input type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" onChange={e => setResearchDoc(e.target.files?.[0] ?? null)} className="text-xs text-zinc-400" />
                {researchDoc && <p className="text-[10px] text-zinc-500 mt-1">{researchDoc.name}</p>}
              </div>
            </div>

            {researchMutation.error && (
              <p className="text-xs text-red-400">{String((researchMutation.error as any)?.response?.data?.message ?? researchMutation.error)}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const fd = new FormData()
                  fd.append('businessDescription', bizDesc)
                  fd.append('targetIndustry', researchForm.targetIndustry)
                  fd.append('targetRole', researchForm.targetRole)
                  fd.append('targetLocation', researchForm.targetLocation)
                  fd.append('count', researchForm.count)
                  fd.append('campaignName', researchForm.campaignName)
                  if (researchDoc) fd.append('document', researchDoc)
                  researchMutation.mutate(fd)
                }}
                disabled={researchMutation.isPending || !bizDesc.trim()}
                className="btn-primary flex-1 gap-2"
              >
                {researchMutation.isPending ? (
                  <><RefreshCw size={14} className="animate-spin" /> Researching… (1–2 min)</>
                ) : (
                  <><Sparkles size={14} /> Start Research</>
                )}
              </button>
              <button onClick={() => setShowResearch(false)} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
