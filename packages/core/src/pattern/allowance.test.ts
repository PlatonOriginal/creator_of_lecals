import { describe, expect, it } from 'vitest'
import { BLOCKS } from '../blocks'
import { SAMPLE_MEASUREMENTS, GOST_FIGURES, typicalFigure } from '../measurements'
import { pointInPolygon, signedArea } from '../draft/geom'
import { DEFAULT_ALLOWANCES, allowanceOf, cutLine, cutPiece, notchesOf } from './allowance'
import { outlineOf } from './panel'

describe('припуски', () => {
  for (const block of BLOCKS) {
    const r = block.draft(SAMPLE_MEASUREMENTS, block.defaults('semi'))
    it(`${block.id}: линия кроя охватывает деталь на величину припуска`, () => {
      for (const p of r.panels) {
        const cut = cutLine(p, DEFAULT_ALLOWANCES)
        // Every seam point lies inside the cut line (fold edges lie on it).
        for (const e of p.edges) {
          if (e.kind === 'fold' || e.kind === 'dart') continue
          const a = allowanceOf(e, DEFAULT_ALLOWANCES)
          const pts = e.line.points(8)
          const far = (q: { x: number; y: number }) =>
            Math.hypot(q.x - e.line.start.x, q.y - e.line.start.y) > 15 && Math.hypot(q.x - e.line.end.x, q.y - e.line.end.y) > 15
          for (const q of pts.filter(far)) {
            expect(pointInPolygon(q, cut), `${p.id}.${e.id}`).toBe(true)
            // The nearest cut point is about one allowance away.
            const d = Math.min(...cut.map((c, i) => segDist(q, c, cut[(i + 1) % cut.length]!)))
            expect(Math.abs(d - a), `${p.id}.${e.id}`).toBeLessThan(1.5)
          }
        }
        // The cut area is larger than the net area.
        expect(Math.abs(signedArea(cut))).toBeGreaterThan(Math.abs(signedArea(outlineOf(p).points(8))))
      }
    })
    it(`${block.id}: деталь с припусками печатается, надсечки на линиях талии и бёдер`, () => {
      for (const p of r.panels) {
        const piece = cutPiece(p, DEFAULT_ALLOWANCES, { model: 'Тест' })
        expect(piece.paths.some((x) => x.role === 'cut')).toBe(true)
        expect(piece.labels.some((l) => l.text === 'Тест')).toBe(true)
        if (p.role !== 'sleeve' && p.levels.hip !== undefined) {
          expect(notchesOf(p).some((n) => n.edge.id === 'side'), p.id).toBe(true)
        }
      }
    })
  }

  it('строится на всех типовых фигурах ГОСТ без выбросов линии кроя', () => {
    // Big bust darts give a tall cap over the dart; that is real, not a spike.
    for (const g of GOST_FIGURES.filter((_, i) => i % 7 === 0)) {
      const m = { ...SAMPLE_MEASUREMENTS, ...typicalFigure(g) }
      for (const block of BLOCKS) {
        const r = block.draft(m, block.defaults('semi'))
        for (const p of r.panels) {
          const cut = cutLine(p, DEFAULT_ALLOWANCES)
          const net = outlineOf(p).points(8)
          const xs = net.map((q) => q.x)
          const ys = net.map((q) => q.y)
          for (const c of cut) {
            expect(c.x).toBeGreaterThan(Math.min(...xs) - 160)
            expect(c.x).toBeLessThan(Math.max(...xs) + 160)
            expect(c.y).toBeGreaterThan(Math.min(...ys) - 160)
            expect(c.y).toBeLessThan(Math.max(...ys) + 160)
          }
        }
      }
    }
  })
})

function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
