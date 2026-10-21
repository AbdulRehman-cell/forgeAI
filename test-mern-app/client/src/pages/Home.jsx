import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 64 }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>
        🚀 ForgeAI Test App
      </h1>
      <p style={{ color: '#888', marginBottom: 40, lineHeight: 1.7 }}>
        A MERN app to test ForgeAI's self-hosted deployment.<br />
        Frontend on R2 · Backend proxied through ForgeAI · MongoDB Atlas
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Link to="/notes" style={btnStyle('#7c6aff')}>
          📝 View Notes
        </Link>
        <Link to="/health" style={btnStyle('#22c55e')}>
          💚 Check Health
        </Link>
      </div>
    </div>
  )
}

const btnStyle = (bg) => ({
  background: bg, color: '#fff', padding: '12px 28px',
  borderRadius: 10, fontWeight: 600, fontSize: 15,
})
