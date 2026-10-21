import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = ['#fff9c4','#c8e6c9','#bbdefb','#f8bbd0','#e1bee7']

export default function Notes() {
  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [form, setForm]       = useState({ title: '', content: '', color: COLORS[0] })
  const [saving, setSaving]   = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await axios.get('/api/notes')
      setNotes(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    try {
      await axios.post('/api/notes', form)
      setForm({ title: '', content: '', color: COLORS[0] })
      await load()
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const del = async (id) => {
    await axios.delete(`/api/notes/${id}`)
    setNotes(n => n.filter(x => x._id !== id))
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24, fontSize: 28, fontWeight: 700 }}>📝 Notes</h2>

      {/* Add form */}
      <form onSubmit={submit} style={{
        background: '#1a1a2e', borderRadius: 12, padding: 24,
        marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 12,
        border: '1px solid #2a2a3e'
      }}>
        <h3 style={{ color: '#aaa', fontSize: 14, marginBottom: 4 }}>Add a note</h3>
        <input
          placeholder="Title"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          style={inputStyle}
        />
        <textarea
          placeholder="Content"
          rows={3}
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
                cursor: 'pointer', outline: form.color === c ? '2px solid #7c6aff' : 'none',
              }}
            />
          ))}
          <button type="submit" disabled={saving} style={{
            marginLeft: 'auto', background: '#7c6aff', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 20px',
            cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}>
            {saving ? 'Saving…' : 'Add Note'}
          </button>
        </div>
      </form>

      {/* Notes grid */}
      {loading && <p style={{ color: '#888' }}>Loading…</p>}
      {error   && <p style={{ color: '#f87171' }}>Error: {error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
        {notes.map(note => (
          <div key={note._id} style={{
            background: note.color, borderRadius: 12, padding: 20,
            color: '#1a1a1a', position: 'relative',
          }}>
            <h4 style={{ fontWeight: 700, marginBottom: 8 }}>{note.title}</h4>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{note.content}</p>
            <button onClick={() => del(note._id)} style={{
              position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.1)',
              border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12,
            }}>✕</button>
            <p style={{ fontSize: 11, color: '#666', marginTop: 12 }}>
              {new Date(note.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
        {!loading && notes.length === 0 && (
          <p style={{ color: '#666', gridColumn: '1/-1' }}>No notes yet — add one above.</p>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  background: '#0f0f13', border: '1px solid #2a2a3e', borderRadius: 8,
  padding: '10px 14px', color: '#e2e2e2', fontSize: 14, width: '100%',
}
