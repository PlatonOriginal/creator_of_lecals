import { useEffect, useRef, useState, type ReactNode } from 'react'

type View = { k: number; x: number; y: number }
const FIT: View = { k: 1, x: 0, y: 0 }
const MIN = 1
const MAX = 16

/**
 * A magnifier for the pattern preview: buttons +/−, pinch or Ctrl + wheel,
 * double click to zoom in at a point, drag to move when zoomed in, and
 * «Вписать» to go back to the whole pattern.
 */
export function ZoomView({ svg, banner }: { svg: string; banner?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FIT)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; k: number } | null>(null)

  const local = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }
  /** Zoom to k keeping the point (px, py) of the box in place. */
  const zoomAt = (k: number, px: number, py: number) =>
    setView((v) => {
      const k2 = Math.min(MAX, Math.max(MIN, k))
      if (k2 === MIN) return FIT
      return { k: k2, x: px - ((px - v.x) * k2) / v.k, y: py - ((py - v.y) * k2) / v.k }
    })
  /** Zoom by a factor about the point (px, py) of the box. */
  const zoomBy = (f: number, px: number, py: number) =>
    setView((v) => {
      const k2 = Math.min(MAX, Math.max(MIN, v.k * f))
      if (k2 === MIN) return FIT
      return { k: k2, x: px - ((px - v.x) * k2) / v.k, y: py - ((py - v.y) * k2) / v.k }
    })
  // Ctrl + wheel (and a trackpad pinch) zooms; a plain wheel scrolls the page.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const centre = () => {
    const r = box.current!.getBoundingClientRect()
    return { x: r.width / 2, y: r.height / 2 }
  }

  return (
    <div className="preview zoom">
      {banner}
      <div className="zoom-tools">
        <button aria-label="Уменьшить" onClick={() => zoomBy(1 / 1.5, centre().x, centre().y)} disabled={view.k <= MIN}>
          −
        </button>
        <span className="num">{Math.round(view.k * 100)} %</span>
        <button aria-label="Увеличить" onClick={() => zoomBy(1.5, centre().x, centre().y)} disabled={view.k >= MAX}>
          +
        </button>
        <button className="secondary" onClick={() => setView(FIT)} disabled={view.k === 1}>
          Вписать
        </button>
      </div>
      <div
        ref={box}
        className={`zoom-box${view.k > 1 ? ' zoomed' : ''}`}
        onDoubleClick={(e) => {
          const p = local(e.clientX, e.clientY)
          zoomBy(2, p.x, p.y)
        }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: view.k }
          }
          if (view.k > 1 || pointers.current.size === 2) e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId)
          if (!prev) return
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()]
            const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
            const m = local((a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
            zoomAt((pinch.current.k * d) / pinch.current.d, m.x, m.y)
          } else if (pointers.current.size === 1 && view.k > 1) {
            setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }))
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId)
          if (pointers.current.size < 2) pinch.current = null
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId)
          pinch.current = null
        }}
      >
        <div
          className="zoom-content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <p className="hint zoom-hint">Двойной щелчок или два пальца — увеличить, перетаскивание — двигать, «Вписать» — вся выкройка.</p>
    </div>
  )
}
