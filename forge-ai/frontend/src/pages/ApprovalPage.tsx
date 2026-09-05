import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { CheckCircle2, XCircle, ExternalLink, Loader2, Clock } from 'lucide-react'
import clsx from 'clsx'

const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' })

interface ApprovalData {
  siteName: string
  status: 'pending' | 'approved' | 'rejected' | null
  approvedAt: string | null
  note: string | null
  previewUrl: string | null
}

export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['approval', token],
    queryFn: () => publicApi.get(`/approve/${token}`).then((r) => r.data as ApprovalData),
  })

  const submitMutation = useMutation({
    mutationFn: ({ d, n }: { d: 'approved' | 'rejected'; n: string }) =>
      publicApi.post(`/approve/${token}`, { decision: d, note: n }),
    onSuccess: () => setSubmitted(true),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <XCircle size={40} className="mx-auto mb-3 text-red-400" />
          <p className="text-lg font-semibold">Link not found</p>
          <p className="text-sm text-zinc-500 mt-1">This approval link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  const alreadyDecided = data.status === 'approved' || data.status === 'rejected'

  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100 py-12 px-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 text-center">
        <div className="inline-flex items-center gap-2 text-brand-400 text-sm font-semibold mb-4 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          ForgeAI Client Review
        </div>
        <h1 className="text-3xl font-bold text-gradient mb-2">{data.siteName}</h1>
        <p className="text-zinc-400">Your website is ready for review. Preview it and let us know your decision.</p>
      </div>

      {/* Preview */}
      {data.previewUrl && (
        <div className="max-w-4xl mx-auto mb-8">
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-surface-900">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <span className="flex-1 text-center text-xs text-zinc-500 font-mono truncate">{data.previewUrl}</span>
              <a
                href={data.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ExternalLink size={13} />
              </a>
            </div>
            <iframe
              src={data.previewUrl}
              className="w-full"
              style={{ height: '500px', border: 'none' }}
              title="Site Preview"
            />
          </div>
        </div>
      )}

      {/* Status / Decision */}
      <div className="max-w-2xl mx-auto">
        {submitted || alreadyDecided ? (
          <div className={clsx(
            'glass rounded-2xl border p-8 text-center',
            (submitted ? decision : data.status) === 'approved'
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-red-500/30 bg-red-500/5',
          )}>
            {(submitted ? decision : data.status) === 'approved' ? (
              <>
                <CheckCircle2 size={48} className="mx-auto mb-3 text-green-400" />
                <h2 className="text-xl font-semibold text-green-300">Site Approved!</h2>
                <p className="text-zinc-400 mt-2">Thank you for your approval. We'll proceed with going live.</p>
              </>
            ) : (
              <>
                <XCircle size={48} className="mx-auto mb-3 text-red-400" />
                <h2 className="text-xl font-semibold text-red-300">Revision Requested</h2>
                <p className="text-zinc-400 mt-2">We've received your feedback and will make the requested changes.</p>
                {(data.note || note) && (
                  <p className="mt-3 text-sm text-zinc-500 italic">"{data.note || note}"</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="glass rounded-2xl border border-white/5 p-8">
            {data.status === 'pending' && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm mb-6">
                <Clock size={16} />
                <span>Awaiting your decision</span>
              </div>
            )}

            <h2 className="text-lg font-semibold text-zinc-100 mb-4">Your Decision</h2>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setDecision('approved')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all border',
                  decision === 'approved'
                    ? 'bg-green-500 border-green-400 text-white'
                    : 'border-white/10 text-zinc-300 hover:border-green-500/50 hover:text-green-400',
                )}
              >
                <CheckCircle2 size={18} /> Approve
              </button>
              <button
                onClick={() => setDecision('rejected')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all border',
                  decision === 'rejected'
                    ? 'bg-red-500 border-red-400 text-white'
                    : 'border-white/10 text-zinc-300 hover:border-red-500/50 hover:text-red-400',
                )}
              >
                <XCircle size={18} /> Request Revisions
              </button>
            </div>

            {decision === 'rejected' && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What changes would you like? (optional but helpful)"
                rows={4}
                className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-brand-500/50 mb-4"
              />
            )}

            <button
              disabled={!decision || submitMutation.isPending}
              onClick={() => decision && submitMutation.mutate({ d: decision, n: note })}
              className={clsx(
                'w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
                decision
                  ? 'gradient-btn text-white hover:opacity-90'
                  : 'bg-surface-800 text-zinc-600 cursor-not-allowed',
              )}
            >
              {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Submit Decision
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
