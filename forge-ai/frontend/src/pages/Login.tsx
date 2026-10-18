import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { Zap, Github } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setAuth, token } = useAuthStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Handle GitHub OAuth callback token
  useEffect(() => {
    const t = params.get('token')
    const err = params.get('error')
    if (err) { toast.error('GitHub login failed'); return }
    if (t) {
      api.get('/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then(({ data }) => { setAuth(t, data.user); navigate('/dashboard') })
        .catch(() => toast.error('Authentication failed'))
    }
  }, [params])

  useEffect(() => { if (token) navigate('/dashboard') }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const { data } = await api.post(endpoint, { email, password })
      setAuth(data.token, data.user)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const githubLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || '/api'}/auth/github`
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-violet-600 rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gradient">ForgeAI</span>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
            {isRegister ? 'Create account' : 'Welcome back'}
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>
            {isRegister ? 'Start fixing code with AI.' : 'Sign in to your workspace.'}
          </p>

          <button
            onClick={githubLogin}
            className="w-full flex items-center justify-center gap-2 font-medium py-2.5 rounded-lg text-sm transition-all duration-200 mb-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
          >
            <Github size={16} /> Continue with GitHub
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: '1px solid var(--border)' }} />
            </div>
            <div
              className="relative flex justify-center text-xs px-2 w-fit mx-auto"
              style={{ background: 'var(--bg-card)', color: 'var(--text-3)' }}
            >
              or email
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Loading…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--text-3)' }}>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => setIsRegister(!isRegister)} className="text-indigo-600 dark:text-brand-400 hover:underline">
              {isRegister ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
