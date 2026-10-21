import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Health() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/health')
      .then(r => setStatus(r.data))
      .catch(e => setStatus({ error: e.message }))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 32 }}>
      <h2 style={{ marginBottom: 24, fontSize: 28, fontWeight: 700 }}>💚 Backend Health</h2>
      {loading ? (
        <p style={{ color: '#888' }}>Checking…</p>
      ) : status?.error ? (
        <div style={{ background: '#2d1b1b', borderRadius: 12, padding: 24, border: '1px solid #f87171' }}>
          <p style={{ color: '#f87171', fontWeight: 600 }}>❌ Backend unreachable</p>
          <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>{status.error}</p>
        </div>
      ) : (
        <div style={{ background: '#1a2e1a', borderRadius: 12, padding: 24, border: '1px solid #22c55e' }}>
          <p style={{ color: '#22c55e', fontWeight: 600, fontSize: 18 }}>✅ Backend is running</p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Status" value={status.status} />
            <Row label="Database" value={status.db === 'connected' ? '✅ MongoDB connected' : '❌ ' + status.db} />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ color: '#666', width: 80, fontSize: 14 }}>{label}</span>
      <span style={{ color: '#e2e2e2', fontSize: 14 }}>{value}</span>
    </div>
  )
}
