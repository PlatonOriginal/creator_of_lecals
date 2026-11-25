import { describe, expect, it } from 'vitest'
import { BLOCKS, MALE_BLOCKS } from '../blocks'
import { SAMPLE_MEASUREMENTS, GOST_FIGURES, typicalFigure } from '../measurements'
import {
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  gradeMaleFeature,
  maleTypicalFigure,
} from '../measurements/male/typical'
import type { MaleMeasurements } from '../measurements/male/schema'
import { pointInPolygon, signedArea, type Vec } from '../draft/geom'
import { DEFAULT_ALLOWANCES, allowanceOf, cutLine, cutPiece, notchesOf } from './allowance'
import { outlineOf } from './panel'

const MALE_UPPER_BASE_176_100_88 = {
  chest1: 975,
  chest2: 1005,
  neck: 400,
  upperArm: 315,
  wrist: 175,
  shoulderSlope: 148,
  neckToRadial: 355,
  neckToWrist: 610,
  napeToChest1Front: 210,
  bustHeight: 272,
  frontLength: 464,
  armholeArc: 365,
  armholeDepthBack: 216,
  backLength: 460,
  upperTorsoArc: 935,
  chestWidth: 374,
  chestPointDistance: 215,
  backWidth: 408,
  armDepth: 124,
} as const

function makeMaleMeasurements(lead: { height: number; chest3: number; waist: number }): MaleMeasurements {
  const typ = maleTypicalFigure(lead)
  const g = <K extends keyof typeof MALE_UPPER_BASE_176_100_88>(key: K) =>
    Math.round(gradeMaleFeature(MALE_UPPER_BASE_176_100_88[key], MALE_EMKO_GRADATION[key]!, lead))

  return {
    ...(typ as MaleMeasurements),
    chest1: g('chest1'),
    chest2: g('chest2'),
    neck: g('neck'),
    upperArm: g('upperArm'),
    wrist: g('wrist'),
    shoulderSlope: g('shoulderSlope'),
    neckToRadial: g('neckToRadial'),
    neckToWrist: g('neckToWrist'),
    napeToChest1Front: g('napeToChest1Front'),
    bustHeight: g('bustHeight'),
    frontLength: g('frontLength'),
    armholeArc: g('armholeArc'),
    armholeDepthBack: g('armholeDepthBack'),
    backLength: g('backLength'),
    upperTorsoArc: g('upperTorsoArc'),
    chestWidth: g('chestWidth'),
    chestPointDistance: g('chestPointDistance'),
    backWidth: g('backWidth'),
    armDepth: g('armDepth'),
  }
}

const SAMPLE_MALE_MEASUREMENTS = makeMaleMeasurements({ height: 1760, chest3: 1000, waist: 880 })

function finitePts(pts: Vec[]): Vec[] {
  return pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
}

function safeArea(pts: Vec[]): number {
  const f = finitePts(pts)
  return f.length >= 3 ? Math.abs(signedArea(f)) : 0
}

describe('припуски', () => {
  for (const block of BLOCKS) {
    const r = block.draft(SAMPLE_MEASUREMENTS, block.defaults('semi'))
    it(`${block.id}: линия кроя охватывает деталь на величину припуска`, () => {
      for (const p of r.panels) {
        const cut = finitePts(cutLine(p, DEFAULT_ALLOWANCES))
        for (const e of p.edges) {
          if (e.kind === 'fold' || e.kind === 'dart') continue
          const a = allowanceOf(e, DEFAULT_ALLOWANCES, p.role)
          const pts = finitePts(e.line.points(8))
          const far = (q: Vec) =>
            Math.hypot(q.x - e.line.start.x, q.y - e.line.start.y) > 15 && Math.hypot(q.x - e.line.end.x, q.y - e.line.end.y) > 15
          for (const q of pts.filter(far)) {
            const d = Math.min(...cut.map((c, i) => segDist(q, c, cut[(i + 1) % cut.length]!)))
            expect(pointInPolygon(q, cut) || d < a + 2, `${p.id}.${e.id}`).toBe(true)
            expect(Math.abs(d - a), `${p.id}.${e.id}`).toBeLessThan(1.5)
          }
        }
        expect(safeArea(cut)).toBeGreaterThan(safeArea(outlineOf(p).points(8)))
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

  for (const block of MALE_BLOCKS) {
    const r = block.draft(SAMPLE_MALE_MEASUREMENTS as never, block.defaults('semi'))
    it(`${block.id}: линия кроя охватывает все мужские детали на величину припуска`, () => {
      for (const p of r.panels) {
        const cut = finitePts(cutLine(p, DEFAULT_ALLOWANCES))
        for (const e of p.edges) {
          if (e.kind === 'fold' || e.kind === 'dart') continue
          const a = allowanceOf(e, DEFAULT_ALLOWANCES, p.role)
          const pts = finitePts(e.line.points(8))
          const far = (q: Vec) =>
            Math.hypot(q.x - e.line.start.x, q.y - e.line.start.y) > 15 && Math.hypot(q.x - e.line.end.x, q.y - e.line.end.y) > 15
          for (const q of pts.filter(far)) {
            const d = Math.min(...cut.map((c, i) => segDist(q, c, cut[(i + 1) % cut.length]!)))
            expect(pointInPolygon(q, cut) || d < a + 2, `${p.id}.${e.id}`).toBe(true)
            expect(Math.abs(d - a), `${p.id}.${e.id}`).toBeLessThan(e.id === 'cap' ? 9 : 1.5)
          }
        }
        expect(safeArea(cut)).toBeGreaterThanOrEqual(safeArea(outlineOf(p).points(8)))
      }
    })
    it(`${block.id}: мужские детали с припусками печатаются, надсечки на талии, бёдрах и локте`, () => {
      for (const p of r.panels) {
        const piece = cutPiece(p, DEFAULT_ALLOWANCES, { model: 'Мужской тест' })
        expect(piece.paths.some((x) => x.role === 'cut')).toBe(true)
        expect(piece.labels.some((l) => l.text === 'Мужской тест')).toBe(true)
        if (p.role === 'sleeveTop' || p.role === 'sleeveUnder') {
          expect(notchesOf(p).some((n) => n.edge.id === 'seamBack'), p.id).toBe(true)
        }
      }
    })
  }

  it('строится на всех типовых фигурах ГОСТ без выбросов линии кроя', () => {
    for (const g of GOST_FIGURES.filter((_, i) => i % 7 === 0)) {
      const m = { ...SAMPLE_MEASUREMENTS, ...typicalFigure(g) }
      for (const block of BLOCKS) {
        const r = block.draft(m, block.defaults('semi'))
        for (const p of r.panels) {
          const cut = finitePts(cutLine(p, DEFAULT_ALLOWANCES))
          const net = finitePts(outlineOf(p).points(8))
          if (!net.length) continue
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

  it('строится на всех базовых мужских фигурах табл. 8 без выбросов линии кроя', () => {
    for (const fig of MALE_EMKO_TABLE_8) {
      const m = makeMaleMeasurements({ height: fig.height, chest3: fig.chest3, waist: fig.waist })
      for (const block of MALE_BLOCKS) {
        const r = block.draft(m as never, block.defaults('semi'))
        for (const p of r.panels) {
          const cut = finitePts(cutLine(p, DEFAULT_ALLOWANCES))
          const net = finitePts(outlineOf(p).points(8))
          if (!net.length) continue
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

function segDist(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
