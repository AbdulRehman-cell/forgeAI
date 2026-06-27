import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center">
      <p className="text-8xl font-bold text-surface-700 mb-4">404</p>
      <h1 className="text-xl font-semibold text-zinc-300 mb-2">Page not found</h1>
      <p className="text-zinc-500 text-sm mb-6">The page you're looking for doesn't exist.</p>
      <button onClick={() => navigate('/dashboard')} className="btn-primary">Go to Dashboard</button>
    </div>
  )
}
