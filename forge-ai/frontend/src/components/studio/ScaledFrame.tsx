// Shows a page at a true device width, shrunk to fit the space it has, so "desktop"
// really is the desktop layout even beside the chat on a laptop.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function ScaledFrame({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(el)
    // Size changes can go unreported while a tab or panel is hidden
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', measure)
    return () => {
      watcher.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', measure)
    }
  }, [])

  // Not measured yet (a hidden panel): the page still shows, at full size, and never disappears
  const scale = size.w && size.w < width ? size.w / width : 1
  const measured = size.w > 0 && size.h > 0
  return (
    <div ref={box} className="h-full w-full overflow-hidden flex justify-center">
      <div style={{ width: measured ? width * scale : '100%', height: measured ? size.h : '100%', flexShrink: 0 }}>
        <div style={measured ? { width, height: size.h / scale, transform: `scale(${scale})`, transformOrigin: 'top left' } : { width: '100%', height: '100%' }}>{children}</div>
      </div>
    </div>
  )
}
