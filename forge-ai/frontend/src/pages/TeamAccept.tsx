import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Zap, CheckCircle, XCircle, Loader } from 'lucide-react'

export default function TeamAccept() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Invalid invitation link.')
      return
    }

    api.post('/teams/accept', { token })
      .then(({ data }) => {
        setStatus('success')
        setMessage(data.ownerName ? `You've joined ${data.ownerName}'s team on ForgeAI.` : 'Invitation accepted.')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.message ?? 'This invitation link is invalid or has already been used.')
      })
  }, [])

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-zinc-100">ForgeAI</span>
        </div>

        <div className="card p-8">
          {status === 'loading' && (
            <>
              <Loader size={40} className="text-brand-400 animate-spin mx-auto mb-4" />
              <p className="text-zinc-400">Accepting invitation…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">You're in!</h2>
              <p className="text-sm text-zinc-400 mb-6">{message}</p>
              <button onClick={() => navigate('/login')} className="btn-primary w-full py-2.5">
                Sign in to get started
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={40} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Invalid link</h2>
              <p className="text-sm text-zinc-400 mb-6">{message}</p>
              <button onClick={() => navigate('/')} className="btn-primary w-full py-2.5">
                Go to homepage
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
