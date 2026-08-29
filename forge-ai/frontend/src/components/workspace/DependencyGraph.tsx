import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DependencyGraph as DGraph, GraphNode, ImpactResult } from '@/types'
import { Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Target } from 'lucide-react'

interface Props {
  repositoryId: string
  onFileOpen?: (path: string) => void
}

const LANG_COLORS: Record<string, string> = {
  typescript: '#3b82f6',
  javascript: '#f59e0b',
  python:     '#10b981',
  go:         '#06b6d4',
  rust:       '#f97316',
  java:       '#ef4444',
  csharp:     '#8b5cf6',
  ruby:       '#ec4899',
  php:        '#6366f1',
  vue:        '#22c55e',
  svelte:     '#f97316',
  css:        '#a855f7',
  html:       '#f43f5e',
  unknown:    '#6b7280',
}

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number
  fy?: number
}

export default function DependencyGraph({ repositoryId, onFileOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const simRef = useRef<{ nodes: SimNode[]; edges: any[]; running: boolean }>({ nodes: [], edges: [], running: false })
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef<{ node: SimNode | null; panStart: { x: number; y: number } | null }>({ node: null, panStart: null })

  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null)
  const [impact, setImpact] = useState<ImpactResult | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)

  const { data, isLoading, error } = useQuery<DGraph>({
    queryKey: ['graph', repositoryId],
    queryFn: () => api.get(`/repositories/${repositoryId}/graph`).then((r) => r.data),
    staleTime: 60_000 * 5,
  })

  // ── Build simulation when data arrives ──────────────────
  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    if (!canvas) return

    const W = canvas.width = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight

    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
      vx: 0, vy: 0,
    }))

    simRef.current = { nodes, edges: data.edges, running: true }
    viewRef.current = { x: 0, y: 0, scale: 1 }
    startLoop(canvas, nodes, data.edges)

    return () => {
      cancelAnimationFrame(animRef.current)
      simRef.current.running = false
    }
  }, [data])

  function startLoop(canvas: HTMLCanvasElement, nodes: SimNode[], edges: any[]) {
    const ctx = canvas.getContext('2d')!
    const nodeIndex = new Map(nodes.map((n) => [n.id, n]))

    let tick = 0

    function step() {
      if (!simRef.current.running) return
      animRef.current = requestAnimationFrame(step)
      tick++

      const W = canvas.width
      const H = canvas.height
      const alpha = Math.max(0.001, 1 - tick / 300)

      // Force simulation
      if (alpha > 0.005) {
        // Repulsion (all pairs — optimized with grid skip)
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i]
          if (a.fx !== undefined) continue
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j]
            const dx = b.x - a.x || 0.01
            const dy = b.y - a.y || 0.01
            const dist2 = dx * dx + dy * dy
            if (dist2 > 90_000) continue // skip far nodes
            const force = (3000 / dist2) * alpha
            a.vx -= dx * force; a.vy -= dy * force
            b.vx += dx * force; b.vy += dy * force
          }
        }

        // Attraction (edges — spring)
        for (const e of edges) {
          const a = nodeIndex.get(e.source)
          const b = nodeIndex.get(e.target)
          if (!a || !b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const ideal = 120
          const force = ((dist - ideal) / dist) * 0.15 * alpha
          if (a.fx === undefined) { a.vx += dx * force; a.vy += dy * force }
          if (b.fx === undefined) { b.vx -= dx * force; b.vy -= dy * force }
        }

        // Gravity toward center
        const cx = W / 2, cy = H / 2
        for (const n of nodes) {
          if (n.fx !== undefined) continue
          n.vx += (cx - n.x) * 0.002 * alpha
          n.vy += (cy - n.y) * 0.002 * alpha
        }

        // Apply velocities + damping
        for (const n of nodes) {
          if (n.fx !== undefined) { n.x = n.fx; n.y = n.fy!; continue }
          n.vx *= 0.88; n.vy *= 0.88
          n.x += n.vx; n.y += n.vy
          n.x = Math.max(20, Math.min(W - 20, n.x))
          n.y = Math.max(20, Math.min(H - 20, n.y))
        }
      }

      // Draw
      draw(ctx, canvas, nodes, edges, nodeIndex)
    }
    step()
  }

  function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, nodes: SimNode[], edges: any[], nodeIndex: Map<string, SimNode>) {
    const { x: ox, y: oy, scale } = viewRef.current
    const hov = hoveredNode
    const sel = selectedNode
    const impactSet = new Set(impact?.affected.map((a) => a.path) ?? [])
    const directSet = new Set(impact?.directImporters ?? [])

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)

    // Edges
    for (const e of edges) {
      const a = nodeIndex.get(e.source)
      const b = nodeIndex.get(e.target)
      if (!a || !b) continue

      const isHighlight = hov && (e.source === hov.id || e.target === hov.id)
      const isImpact = sel && (e.source === sel.id || impactSet.has(e.source))

      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)

      if (isHighlight) {
        ctx.strokeStyle = 'rgba(99,102,241,0.8)'
        ctx.lineWidth = 1.5
      } else if (isImpact) {
        ctx.strokeStyle = 'rgba(239,68,68,0.5)'
        ctx.lineWidth = 1
      } else {
        ctx.strokeStyle = 'rgba(80,80,100,0.25)'
        ctx.lineWidth = 0.75
      }
      ctx.stroke()

      // Arrow tip
      if (isHighlight || isImpact) {
        const dx = b.x - a.x; const dy = b.y - a.y
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        const r = nodeRadius(b) + 2
        const tx = b.x - (dx / len) * r
        const ty = b.y - (dy / len) * r
        const angle = Math.atan2(dy, dx)
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - 7 * Math.cos(angle - 0.4), ty - 7 * Math.sin(angle - 0.4))
        ctx.lineTo(tx - 7 * Math.cos(angle + 0.4), ty - 7 * Math.sin(angle + 0.4))
        ctx.closePath()
        ctx.fillStyle = isHighlight ? 'rgba(99,102,241,0.8)' : 'rgba(239,68,68,0.5)'
        ctx.fill()
      }
    }

    // Nodes
    for (const n of nodes) {
      const r = nodeRadius(n)
      const isHov = hov?.id === n.id
      const isSel = sel?.id === n.id
      const isImp = impactSet.has(n.id)
      const isDirect = directSet.has(n.id)

      const color = LANG_COLORS[n.language] ?? LANG_COLORS.unknown

      // Glow
      if (isHov || isSel || isDirect) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2)
        const grd = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 6)
        grd.addColorStop(0, isDirect ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.4)')
        grd.addColorStop(1, 'transparent')
        ctx.fillStyle = grd
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = isDirect ? '#ef4444' : isImp ? 'rgba(239,68,68,0.5)' : color
      ctx.fill()

      ctx.strokeStyle = isSel ? '#fff' : isHov ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = isSel ? 2 : 1
      ctx.stroke()

      // Label
      const showLabel = isHov || isSel || r > 7
      if (showLabel) {
        ctx.font = `${Math.min(11, Math.max(9, r * 0.9))}px Inter, sans-serif`
        ctx.fillStyle = 'rgba(220,220,230,0.9)'
        ctx.textAlign = 'center'
        ctx.fillText(n.label.length > 22 ? n.label.slice(0, 19) + '…' : n.label, n.x, n.y + r + 11)
      }
    }

    ctx.restore()

    // Legend
    const langs = [...new Set(nodes.map((n) => n.language))].slice(0, 7)
    ctx.save()
    let lx = 12, ly = canvas.height - 12 - langs.length * 18
    for (const lang of langs) {
      ctx.beginPath()
      ctx.arc(lx + 5, ly + 5, 5, 0, Math.PI * 2)
      ctx.fillStyle = LANG_COLORS[lang] ?? LANG_COLORS.unknown
      ctx.fill()
      ctx.font = '10px Inter, sans-serif'
      ctx.fillStyle = 'rgba(180,180,200,0.8)'
      ctx.textAlign = 'left'
      ctx.fillText(lang, lx + 14, ly + 9)
      ly += 18
    }
    ctx.restore()
  }

  function nodeRadius(n: SimNode) {
    return Math.min(14, Math.max(4, 4 + n.inDegree * 1.2 + Math.log1p(n.size / 1000) * 0.8))
  }

  // ── Pointer events ───────────────────────────────────────
  function toWorld(cx: number, cy: number): { x: number; y: number } {
    const { x, y, scale } = viewRef.current
    return { x: (cx - x) / scale, y: (cy - y) / scale }
  }

  function hitNode(wx: number, wy: number): SimNode | null {
    const nodes = simRef.current.nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const r = nodeRadius(n) + 4
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 <= r * r) return n
    }
    return null
  }

  const fetchImpact = useCallback(async (node: SimNode) => {
    setLoadingImpact(true)
    try {
      const { data } = await api.get(`/repositories/${repositoryId}/impact?file=${encodeURIComponent(node.path)}`)
      setImpact(data)
    } catch { setImpact(null) }
    finally { setLoadingImpact(false) }
  }, [repositoryId])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const wx = (e.clientX - rect.left - viewRef.current.x) / viewRef.current.scale
    const wy = (e.clientY - rect.top - viewRef.current.y) / viewRef.current.scale

    if (dragRef.current.node) {
      dragRef.current.node.fx = wx
      dragRef.current.node.fy = wy
      return
    }
    if (dragRef.current.panStart) {
      viewRef.current.x += e.movementX
      viewRef.current.y += e.movementY
      return
    }

    const hit = hitNode(wx, wy)
    setHoveredNode(hit)
    canvasRef.current!.style.cursor = hit ? 'pointer' : 'grab'
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x: wx, y: wy } = toWorld(e.clientX - rect.left, e.clientY - rect.top)
    const hit = hitNode(wx, wy)
    if (hit) {
      dragRef.current.node = hit
    } else {
      dragRef.current.panStart = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDraggingNode = dragRef.current.node
    if (wasDraggingNode) {
      wasDraggingNode.fx = undefined
      wasDraggingNode.fy = undefined
    }
    const wasPanning = dragRef.current.panStart
    dragRef.current.node = null
    dragRef.current.panStart = null

    if (!wasDraggingNode && !wasPanning) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const { x: wx, y: wy } = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      const hit = hitNode(wx, wy)
      if (hit) {
        setSelectedNode((prev) => prev?.id === hit.id ? null : hit)
        if (!selectedNode || selectedNode.id !== hit.id) fetchImpact(hit)
        else setImpact(null)
      } else {
        setSelectedNode(null)
        setImpact(null)
      }
    }
  }, [selectedNode, fetchImpact])

  const handleDblClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x: wx, y: wy } = toWorld(e.clientX - rect.left, e.clientY - rect.top)
    const hit = hitNode(wx, wy)
    if (hit && onFileOpen) onFileOpen(hit.path)
  }, [onFileOpen])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.91
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    viewRef.current.x = cx - (cx - viewRef.current.x) * factor
    viewRef.current.y = cy - (cy - viewRef.current.y) * factor
    viewRef.current.scale *= factor
  }, [])

  const zoom = (factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2, cy = canvas.height / 2
    viewRef.current.x = cx - (cx - viewRef.current.x) * factor
    viewRef.current.y = cy - (cy - viewRef.current.y) * factor
    viewRef.current.scale *= factor
  }

  const resetView = () => {
    viewRef.current = { x: 0, y: 0, scale: 1 }
    simRef.current.running = false
    if (data && canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const nodes: SimNode[] = data.nodes.map((n) => ({
        ...n,
        x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.6,
        y: canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.6,
        vx: 0, vy: 0,
      }))
      simRef.current = { nodes, edges: data.edges, running: true }
      startLoop(canvas, nodes, data.edges)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
        <Loader2 size={22} className="animate-spin text-brand-500" />
        <span className="text-sm">Building dependency graph…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
        <AlertCircle size={22} />
        <span className="text-sm">Could not load graph (Python service may be offline)</span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#0d0d14]">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 h-full w-full"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
      />

      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button onClick={() => zoom(1.2)} className="w-8 h-8 rounded-lg bg-surface-800/90 border border-surface-600 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-brand-500 transition-colors" title="Zoom in"><ZoomIn size={13} /></button>
        <button onClick={() => zoom(0.83)} className="w-8 h-8 rounded-lg bg-surface-800/90 border border-surface-600 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-brand-500 transition-colors" title="Zoom out"><ZoomOut size={13} /></button>
        <button onClick={resetView} className="w-8 h-8 rounded-lg bg-surface-800/90 border border-surface-600 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-brand-500 transition-colors" title="Reset"><RotateCcw size={13} /></button>
      </div>

      {/* Stats bar */}
      <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-900/80 backdrop-blur border border-surface-700 text-xs text-zinc-400">
        <span>{data.nodes.length} files</span>
        <span className="text-zinc-700">·</span>
        <span>{data.edges.length} imports</span>
        <span className="text-zinc-700">·</span>
        <span className="text-zinc-500">Double-click to open · Click for impact</span>
      </div>

      {/* Hovered tooltip */}
      {hoveredNode && !selectedNode && (
        <div className="absolute bottom-4 left-4 px-3 py-2 rounded-xl bg-surface-900/95 backdrop-blur border border-surface-700 text-xs">
          <p className="text-zinc-100 font-mono">{hoveredNode.path}</p>
          <p className="text-zinc-500 mt-0.5">
            <span className="mr-2" style={{ color: LANG_COLORS[hoveredNode.language] }}>{hoveredNode.language}</span>
            <span>{hoveredNode.inDegree} importers · {(hoveredNode.size / 1024).toFixed(1)} KB</span>
          </p>
        </div>
      )}

      {/* Selected node + impact panel */}
      {selectedNode && (
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-surface-950/95 backdrop-blur border-l border-surface-700 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-surface-700">
            <div className="flex items-center gap-2 mb-1">
              <Target size={13} className="text-brand-400 shrink-0" />
              <p className="text-xs font-semibold text-zinc-100">Impact Analysis</p>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 break-all">{selectedNode.path}</p>
            <p className="text-[10px] text-zinc-600 mt-1">
              <span style={{ color: LANG_COLORS[selectedNode.language] }}>{selectedNode.language}</span>
              {' · '}{(selectedNode.size / 1024).toFixed(1)} KB
            </p>
          </div>

          {loadingImpact ? (
            <div className="flex items-center justify-center flex-1 gap-2 text-zinc-600">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Tracing impact…</span>
            </div>
          ) : impact ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="px-3 py-2 rounded-lg bg-surface-800 border border-surface-700">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Affected files</p>
                <p className="text-2xl font-bold text-zinc-100">{impact.affectedCount}</p>
                <p className="text-[10px] text-zinc-600">change this file → these break</p>
              </div>

              {impact.directImporters.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Direct importers</p>
                  <div className="space-y-1">
                    {impact.directImporters.slice(0, 8).map((p) => (
                      <button
                        key={p}
                        onClick={() => onFileOpen?.(p)}
                        className="w-full text-left px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        <p className="text-[10px] font-mono text-red-300 truncate">{p}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {impact.affected.filter((a) => a.distance > 1).length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Transitive ({impact.affected.filter(a => a.distance > 1).length})</p>
                  <div className="space-y-0.5">
                    {impact.affected.filter((a) => a.distance > 1).slice(0, 12).map((a) => (
                      <button
                        key={a.path}
                        onClick={() => onFileOpen?.(a.path)}
                        className="w-full text-left px-2 py-1 rounded hover:bg-surface-700 transition-colors"
                      >
                        <p className="text-[10px] font-mono text-zinc-400 truncate">{a.path}</p>
                        <p className="text-[9px] text-zinc-600">{a.distance} hops away</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
