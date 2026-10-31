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
    return () => watcher.disconnect()
  }, [])

  const scale = size.w && size.w < width ? size.w / width : 1
  return (
    <div ref={box} className="h-full w-full overflow-hidden flex justify-center">
      {size.w > 0 && (
        <div style={{ width: width * scale, height: size.h, flexShrink: 0 }}>
          <div style={{ width, height: size.h / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      )}
    </div>
  )
}
