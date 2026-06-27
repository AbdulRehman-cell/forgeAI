import { useNavigate } from 'react-router-dom'
import { Zap, GitBranch, FileCode2, RefreshCcw, ArrowRight } from 'lucide-react'

const features = [
  { icon: GitBranch, title: 'Connect GitHub', desc: 'Import any repository in seconds.' },
  { icon: FileCode2, title: 'AI Analysis', desc: 'ForgeAI reads and understands your entire codebase.' },
  { icon: Zap, title: 'Fix Workspace', desc: 'Auto-fix lint errors, build failures, and test regressions across all files.' },
  { icon: RefreshCcw, title: 'Review & Push', desc: 'Inspect diffs, then push a PR directly to GitHub.' },
]

export default function Landing() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <header className="border-b border-surface-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-semibold text-zinc-100">ForgeAI</span>
        </div>
        <button onClick={() => navigate('/login')} className="btn-primary">
          Get Started
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-600/30 text-brand-400 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <Zap size={12} /> Autonomous AI Software Engineer
        </div>

        <h1 className="text-5xl font-bold text-zinc-100 max-w-3xl leading-tight mb-6">
          Fix your entire codebase{' '}
          <span className="text-brand-500">automatically.</span>
        </h1>

        <p className="text-zinc-400 text-xl max-w-xl mb-10">
          ForgeAI connects to your GitHub repositories, analyzes every file, and autonomously fixes
          errors — then opens a pull request.
        </p>

        <div className="flex gap-4">
          <button onClick={() => navigate('/login')} className="btn-primary flex items-center gap-2 text-base px-6 py-3">
            Start for free <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-24 max-w-4xl w-full">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-5 text-left">
              <div className="w-9 h-9 bg-brand-600/15 rounded-lg flex items-center justify-center mb-3">
                <Icon size={18} className="text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100 mb-1">{title}</h3>
              <p className="text-xs text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
