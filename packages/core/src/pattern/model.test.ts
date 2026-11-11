import { describe, expect, it } from 'vitest'
import { BLOCKS } from '../blocks'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../measurements'
import { angleBetween, dist, sub, type Vec } from '../draft/geom'
import { edgeLengths, outlineOf, type Panel } from './panel'
import { applyLayers, applyModel, type ModelSpec } from './model'
import { changeLength, hemY, positionOn, transferDart } from './ops'
import { cutLine, DEFAULT_ALLOWANCES } from './allowance'

const byId = (id: string) => BLOCKS.find((b) => b.id === id)!
const emkoDress = byId('emko-dress')
const mullerDress = byId('muller-dress')
const emkoSkirt = byId('emko-skirt')

const dartOf = (p: Panel, id: string) => {
  const i = p.edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === id && e.dart.leg === 1)
  const l1 = p.edges[i]!
  const l2 = p.edges[i + 1]!
  return { l1, l2, angle: Math.abs(angleBetween(sub(l1.line.start, l1.line.end), sub(l2.line.end, l1.line.end))) }
}

const DRESS_MODEL: ModelSpec = {
  princess: { front: true, back: true, from: 'armhole' },
  neckline: { shape: 'round', widen: 20, front: 40, back: 10 },
  flare: { darts: 0, side: 40, princess: 30, slashes: 0 },
  sleeve: { length: 250, puffCap: 60, puffHem: 40, capRaise: 25, cuff: 30 },
  length: -100,
}

describe('перевод вытачки', () => {
  for (const block of [emkoDress, mullerDress]) {
    for (const to of ['armhole', 'side', 'neck', 'shoulder'] as const) {
      it(`${block.id}: нагрудная вытачка в «${to}» — угол и срезы сохраняются`, () => {
        const r = block.draft(SAMPLE_MEASUREMENTS, block.defaults('semi'))
        const front = r.panels.find((p) => p.role === 'front')!
        const pos = positionOn(front, to, { shoulder: 'neck', armhole: 'side', side: 'armhole', neck: 'shoulder' }[to], 0.5, true)!
        const moved = transferDart(front, 'bust', pos)
        const a = dartOf(front, 'bust')
        const b = dartOf(moved, 'bust')
        expect(b.angle).toBeCloseTo(a.angle, 6)
        expect(b.l1.line.length()).toBeCloseTo(b.l2.line.length(), 6)
        const before = edgeLengths(front)
        const after = edgeLengths(moved)
        // Müller's shoulder legs differ by a fraction of a mm (the seam is moved 1 cm after drafting).
        for (const id of ['shoulder', 'armhole', 'side', 'neck', 'hem']) expect(Math.abs(after[id]! - before[id]!), id).toBeLessThan(0.5)
        expect(moved.edges.filter((e) => e.kind === 'dart')).toHaveLength(2)
      })
    }
  }

  it('часть вытачки: остаются две вытачки, сумма углов прежняя', () => {
    const r = emkoDress.draft(SAMPLE_MEASUREMENTS, emkoDress.defaults('semi'))
    const front = r.panels[1]!
    const pos = positionOn(front, 'armhole', 'side', 0.4, true)!
    const moved = transferDart(front, 'bust', pos, 0.5)
    expect(dartOf(moved, 'bust').angle + dartOf(moved, 'bust2').angle).toBeCloseTo(dartOf(front, 'bust').angle, 6)
  })
})

describe('модель платья: рельефы, горловина, длина, клёш, фонарик с манжетой', () => {
  for (const block of [emkoDress, mullerDress]) {
    it(`${block.id}: детали, проверки срезов, линия кроя`, () => {
      const r = block.draft(SAMPLE_MEASUREMENTS, block.defaults('semi'))
      const res = applyModel(block, r, DRESS_MODEL, SAMPLE_MEASUREMENTS)
      const roles = res.panels.map((p) => p.role)
      expect(roles.filter((x) => x === 'front')).toHaveLength(2)
      expect(roles.filter((x) => x === 'back')).toHaveLength(2)
      expect(roles).toContain('cuff')
      for (const c of res.checks) expect(c.ok, `${c.id} ${c.a}/${c.b}`).toBe(true)
      expect(res.warnings).toEqual([])
      // Centre front stays on the fold, the side part has no fold.
      const centre = res.panels.find((p) => p.id.endsWith('front-centre'))!
      expect(centre.edges.some((e) => e.kind === 'fold')).toBe(true)
      const sleeve = res.panels.find((p) => p.role === 'sleeve')!
      const top = Math.min(...sleeve.edges.flatMap((e) => e.line.points(8)).map((q) => q.y))
      expect(hemY(sleeve) - top).toBeGreaterThan(250 - 30 - 30)
      expect(hemY(sleeve) - top).toBeLessThan(250 - 30 + 30)
      for (const p of res.panels) expect(cutLine(p, DEFAULT_ALLOWANCES).length).toBeGreaterThanOrEqual(4)
    })
  }

  it('строится на типовых фигурах ГОСТ, рельефы совпадают по длине', () => {
    for (const g of GOST_FIGURES.filter((_, i) => i % 9 === 0)) {
      const m = { ...SAMPLE_MEASUREMENTS, ...typicalFigure(g) }
      for (const block of [emkoDress, mullerDress]) {
        const res = applyModel(block, block.draft(m, block.defaults('semi')), DRESS_MODEL, m)
        for (const c of res.checks.filter((x) => x.id.startsWith('princess'))) expect(c.ok, `${g.label} ${block.id} ${c.id}`).toBe(true)
      }
    }
  })
})

describe('длина и клёш', () => {
  it('удлинение сдвигает низ, боковые срезы растут на ту же величину', () => {
    const r = emkoSkirt.draft(SAMPLE_MEASUREMENTS, emkoSkirt.defaults('semi'))
    for (const d of [60, -60]) {
      const res = applyModel(emkoSkirt, r, { length: d }, SAMPLE_MEASUREMENTS)
      for (const [i, p] of res.panels.entries()) {
        expect(hemY(p)).toBeCloseTo(hemY(r.panels[i]!) + d, 3)
        expect(edgeLengths(p).side).toBeCloseTo(edgeLengths(r.panels[i]!).side! + d, 3)
      }
    }
  })

  it('вытачки юбки уходят в низ, низ расширяется', () => {
    const r = emkoSkirt.draft(SAMPLE_MEASUREMENTS, emkoSkirt.defaults('semi'))
    const res = applyModel(emkoSkirt, r, { flare: { darts: 1, side: 40, princess: 0, slashes: 100 } }, SAMPLE_MEASUREMENTS)
    for (const [i, p] of res.panels.entries()) {
      expect(p.edges.some((e) => e.kind === 'dart')).toBe(false)
      expect(edgeLengths(p).hem!).toBeGreaterThan(edgeLengths(r.panels[i]!).hem! + 100)
      // The waist keeps its length.
      expect(edgeLengths(p).waist!).toBeCloseTo(edgeLengths(r.panels[i]!).waist!, 0)
    }
    expect(res.checks.every((c) => c.ok)).toBe(true)
  })

  it('клёш разрезами: обе юбки, с вытачками, контур не перекручивается', () => {
    for (const id of ['emko-skirt', 'muller-skirt']) {
      const b = byId(id)
      for (const sil of ['straight', 'semi'] as const) {
        const r = b.draft(SAMPLE_MEASUREMENTS, b.defaults(sil))
        for (const slashes of [50, 150, 550]) {
          const base = applyModel(b, r, { flare: { darts: 0.1, side: 20, princess: 0, slashes: 0 } }, SAMPLE_MEASUREMENTS)
          const res = applyModel(b, r, { flare: { darts: 0.1, side: 20, princess: 0, slashes } }, SAMPLE_MEASUREMENTS)
          for (const [i, p] of res.panels.entries()) {
            const added = edgeLengths(p).hem! - edgeLengths(base.panels[i]!).hem!
            expect(added, `${id} ${sil} ${slashes} ${p.id}`).toBeGreaterThan(slashes * 0.9)
            expect(added, `${id} ${sil} ${slashes} ${p.id}`).toBeLessThan(slashes * 1.3)
            expect(selfCrossings(p), `${id} ${sil} ${slashes} ${p.id}`).toBe(0)
            expect(edgeLengths(p).waist!).toBeCloseTo(edgeLengths(base.panels[i]!).waist!, 0)
          }
        }
      }
    }
  })

  it('все основы принимают пустую модель и длину', () => {
    for (const b of BLOCKS) {
      const r = b.draft(SAMPLE_MEASUREMENTS, b.defaults('semi'))
      expect(applyModel(b, r, {}, SAMPLE_MEASUREMENTS).panels).toHaveLength(r.panels.length)
      const res = applyModel(b, r, { length: 50 }, SAMPLE_MEASUREMENTS)
      expect(Math.max(...res.panels.map(hemY))).toBeCloseTo(Math.max(...r.panels.filter((p) => p.role !== 'sleeve').map(hemY)) + 50, 3)
    }
  })

  it('changeLength сохраняет непрерывность контура', () => {
    const r = emkoDress.draft(SAMPLE_MEASUREMENTS, emkoDress.defaults('semi'))
    const p = changeLength(r.panels[0]!, 900, -120)
    for (let i = 0; i < p.edges.length; i++) {
      expect(dist(p.edges[i]!.line.end, p.edges[(i + 1) % p.edges.length]!.line.start)).toBeLessThan(1e-6)
    }
  })
})

describe('модель как основа', () => {
  it('слои применяются по очереди: рельефы из первой модели, длина из второй', () => {
    const r = emkoDress.draft(SAMPLE_MEASUREMENTS, emkoDress.defaults('semi'))
    const first = applyLayers(emkoDress, r, [{ princess: { front: true, back: false, from: 'armhole' } }], SAMPLE_MEASUREMENTS)
    const both = applyLayers(emkoDress, r, [{ princess: { front: true, back: false, from: 'armhole' } }, { length: 70 }], SAMPLE_MEASUREMENTS)
    expect(both.panels).toHaveLength(first.panels.length)
    for (const [i, p] of both.panels.entries()) {
      if (p.role === 'sleeve') continue
      expect(hemY(p)).toBeCloseTo(hemY(first.panels[i]!) + 70, 3)
    }
    expect(both.checks.every((c) => c.ok)).toBe(true)
  })
})

/** Number of crossings of the outline with itself (a twisted piece has some). */
function selfCrossings(p: Panel): number {
  const pts = outlineOf(p).points(6)
  const n = pts.length
  const cross = (a: Vec, b: Vec, c: Vec, d: Vec) => {
    const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
  }
  let k = 0
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue
      if (cross(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) k++
    }
  return k
}
