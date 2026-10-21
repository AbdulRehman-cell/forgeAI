import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import Notes from './pages/Notes'
import Health from './pages/Health'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: '#1a1a2e', padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', gap: 32, borderBottom: '1px solid #2a2a3e'
      }}>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#7c6aff' }}>ForgeAI Test</span>
        <Link to="/"       style={{ color: '#aaa', fontSize: 14 }}>Home</Link>
        <Link to="/notes"  style={{ color: '#aaa', fontSize: 14 }}>Notes</Link>
        <Link to="/health" style={{ color: '#aaa', fontSize: 14 }}>Health</Link>
      </nav>
      <main style={{ flex: 1, padding: 32 }}>
        <Routes>
          <Route path="/"       element={<Home />} />
          <Route path="/notes"  element={<Notes />} />
          <Route path="/health" element={<Health />} />
        </Routes>
      </main>
    </div>
  )
}
