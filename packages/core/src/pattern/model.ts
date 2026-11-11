import { v } from '../draft/geom'
import type { BlockResult, GarmentKind, SeamCheck } from '../blocks/types'
import { check } from '../blocks/types'
import type { Measurements, MeasurementId } from '../measurements'
import { edgeLengths, type Panel } from './panel'
import {
  changeLength,
  cuffPanel,
  dartsToHem,
  flareSeam,
  hemWidth,
  hemY,
  neckline,
  positionOn,
  princess,
  puffSleeve,
  slashFlare,
  transferDart,
  trimBelow,
  type NeckShape,
} from './ops'

/**
 * A model is «block + method + modelling steps + parameters», not a drawing
 * (prototype plan, principle 1). The steps are a fixed form applied in a
 * fixed order: dart → princess → neckline → length → flare → sleeve.
 * Every number is mm unless said otherwise; 0 or absent means «as the block».
 */
export interface ModelSpec {
  /** Where the bust dart of the front goes. */
  frontDart?: { to: 'shoulder' | 'armhole' | 'side' | 'neck'; share: number }
  /** Where the shoulder dart of the back goes. */
  backDart?: { to: 'shoulder' | 'armhole' | 'neck'; share: number }
  /** Princess seams instead of darts. */
  princess?: { front: boolean; back: boolean; from: 'armhole' | 'shoulder' }
  neckline?: { shape: NeckShape; widen: number; front: number; back: number }
  /** Change of length of the garment, mm (+ longer, − shorter). */
  length?: number
  flare?: {
    /** Share of the skirt waist darts moved into the hem (0…1). */
    darts: number
    /** Added at the hem at each side seam, mm. */
    side: number
    /** Added at the hem at each princess seam, mm. */
    princess: number
    /** Extra flare by slashes over the whole hem of each skirt panel, mm. */
    slashes: number
  }
  sleeve?: {
    /** Sleeve length from the cap top, mm; 0 = as the block. */
    length: number
    /** Puff: extra width at the cap, at the hem, and how much the cap rises. */
    puffCap: number
    puffHem: number
    capRaise: number
    /** Cuff height (finished), mm; 0 = no cuff. */
    cuff: number
  }
}

export interface ModelResult {
  panels: Panel[]
  checks: SeamCheck[]
  warnings: string[]
}

const DART_FROM: Record<string, string> = { shoulder: 'neck', armhole: 'side', side: 'armhole', neck: 'shoulder' }
/** Where on the edge the dart goes: mm from the named neighbour, or a fraction. */
const DART_AT: Record<string, { d: number; frac: boolean }> = {
  shoulder: { d: 0.5, frac: true },
  armhole: { d: 0.42, frac: true },
  side: { d: 60, frac: false },
  neck: { d: 0.5, frac: true },
}

function moveDart(p: Panel, id: string, to: string, share: number, warnings: string[]): Panel {
  if (!p.edges.some((e) => e.kind === 'dart' && e.dart?.id === id)) return p
  const pos = positionOn(p, to, DART_FROM[to]!, DART_AT[to]!.d, DART_AT[to]!.frac)
  if (!pos) {
    warnings.push(`Перевод вытачки: у детали «${p.title}» нет среза «${to}».`)
    return p
  }
  return transferDart(p, id, pos, Math.min(1, Math.max(0, share)))
}

/** Lengthening line: halfway between the hips and the hem (knee and hem for trousers). */
function lengthLine(panels: Panel[], garment: GarmentKind): number | undefined {
  const body = panels.filter((p) => p.role !== 'sleeve' && p.role !== 'cuff')
  if (!body.length) return undefined
  const top = garment === 'trousers' ? body[0]!.levels.knee : body[0]!.levels.hip
  if (top === undefined) return undefined
  const bottom = Math.min(...body.map(hemY))
  return top + (bottom - top) / 2
}

export function applyModel(block: { garment: GarmentKind }, base: BlockResult, spec: ModelSpec, m: Partial<Measurements>): ModelResult {
  return applyLayers(block, base, [spec], m)
}

function applySpec(block: { garment: GarmentKind }, base: BlockResult, spec: ModelSpec, m: Partial<Measurements>): ModelResult {
  const warnings: string[] = []
  let panels = base.panels
  const isBody = (p: Panel) => p.role === 'front' || p.role === 'back'
  const garment = block.garment

  // 1. Darts.
  const pr = spec.princess
  panels = panels.map((p) => {
    const want = p.role === 'front' ? (pr?.front ? { to: pr.from, share: 1 } : spec.frontDart)
      : p.role === 'back' ? (pr?.back ? { to: pr.from, share: 1 } : spec.backDart) : undefined
    if (!want) return p
    return moveDart(p, p.role === 'front' ? 'bust' : 'shoulder', want.to, want.share, warnings)
  })

  // 2. Princess seams.
  if (pr && (pr.front || pr.back)) {
    panels = panels.flatMap((p) => {
      const want = (p.role === 'front' && pr.front) || (p.role === 'back' && pr.back)
      if (!want) return [p]
      const r = princess(p, p.role === 'front' ? 'bust' : 'shoulder')
      if (!r) {
        warnings.push(`Рельеф: деталь «${p.title}» не удалось разрезать.`)
        return [p]
      }
      return [r.centre, r.side]
    })
  }

  // 3. Neckline.
  const nk = spec.neckline
  if (nk && (nk.widen > 0 || nk.front > 0 || nk.back > 0 || nk.shape !== 'round')) {
    panels = panels.map((p) => {
      if (!isBody(p) || !p.edges.some((e) => e.id === 'neck')) return p
      const depth = p.role === 'front' ? nk.front : nk.back
      const shape = p.role === 'front' ? nk.shape : nk.shape === 'v' && nk.back > 30 ? 'v' : 'round'
      return neckline(p, shape, nk.widen, depth, warnings)
    })
  }

  // 4. Length.
  if (spec.length) {
    const y = lengthLine(panels, garment)
    if (y !== undefined) {
      const room = Math.min(...panels.filter((p) => p.role !== 'sleeve' && p.role !== 'cuff').map(hemY)) - y
      let d = spec.length
      if (d < 0 && -d > room - 20) {
        // Shorten from higher up: the line moves towards the hips.
        const hip = panels[0]!.levels[garment === 'trousers' ? 'knee' : 'hip'] ?? y
        const y2 = hip + 20
        d = Math.max(d, -(Math.min(...panels.map(hemY)) - y2 - 30))
        panels = panels.map((p) => (p.role === 'sleeve' || p.role === 'cuff' ? p : changeLength(p, y2, d)))
        if (d !== spec.length) warnings.push('Длина: укоротить сильнее нельзя, линия бёдер слишком близко.')
      } else panels = panels.map((p) => (p.role === 'sleeve' || p.role === 'cuff' ? p : changeLength(p, y, d)))
    }
  }

  // 5. Flare.
  const fl = spec.flare
  if (fl) {
    panels = panels.map((p) => {
      if (p.role === 'sleeve' || p.role === 'cuff') return p
      let q = p
      const pivot = p.levels.hip ?? p.levels.waist ?? 0
      if (garment === 'skirt' && fl.darts > 0) q = dartsToHem(q, fl.darts)
      if (garment === 'skirt' && fl.slashes > 0) q = slashFlare(q, fl.slashes, Math.min(8, Math.max(2, Math.ceil(fl.slashes / 60))))
      if (fl.side > 0) q = flareSeam(q, 'side', fl.side, garment === 'skirt' && fl.darts > 0 ? 0 : pivot)
      if (fl.princess > 0) q = flareSeam(q, 'princess', fl.princess, p.fish.length ? pivot : (p.levels.waist ?? pivot))
      return q
    })
  }

  // 6. Sleeve.
  const sl = spec.sleeve
  if (sl) {
    const extra: Panel[] = []
    panels = panels.map((p) => {
      if (p.role !== 'sleeve') return p
      let q = p
      const pts = q.edges.flatMap((e) => e.line.points(8))
      const top = Math.min(...pts.map((pt) => pt.y))
      const full = hemY(q) - top
      const want = sl.length > 0 ? sl.length : full
      const target = sl.cuff > 0 ? want - sl.cuff : want
      if (target < full - 1) q = trimBelow(q, top + target)
      else if (target > full + 1) {
        const y = (q.levels.elbow ?? top + full / 2) + 40
        q = changeLength(q, Math.min(y, hemY(q) - 40), target - full)
      }
      const baseHem = hemWidth(q)
      if (sl.puffCap > 0 || sl.puffHem > 0 || sl.capRaise > 0) q = puffSleeve(q, sl.puffCap, sl.puffHem, sl.capRaise)
      if (sl.cuff > 0) {
        const longSleeve = q.levels.elbow !== undefined && top + target > q.levels.elbow + 50
        const wrist = (m as Record<MeasurementId, number>).wrist
        const len = longSleeve && wrist ? wrist + 40 + 20 : baseHem + 20
        q = { ...q, edges: q.edges.map((e) => (e.id === 'hem' ? { ...e, id: 'cuff', kind: 'seam' as const } : e)) }
        const ptsQ = q.edges.flatMap((e) => e.line.points(8))
        const maxX = Math.max(...ptsQ.map((pt) => pt.x))
        const minY = Math.min(...ptsQ.map((pt) => pt.y))
        extra.push(cuffPanel(`${p.id}-cuff`, p.method, len, sl.cuff, v(maxX + 40, minY)))
        if (longSleeve) q.notes = [...q.notes, { at: v(q.labelAt.x, hemY(q) - 30), text: 'разрез 8 см у локтевого шва', size: 4 }]
      }
      return q
    })
    panels = [...panels, ...extra]
  }

  return { panels, checks: [], warnings }
}

/** Matching seams after modelling. */
export function modelChecks(panels: Panel[], base: BlockResult): SeamCheck[] {
  const sum = (role: Panel['role'] | Panel['role'][], id: string) =>
    panels
      .filter((p) => (Array.isArray(role) ? role.includes(p.role) : p.role === role))
      .reduce((s, p) => s + (edgeLengths(p)[id] ?? 0), 0)
  const checks: SeamCheck[] = []
  const baseCheck = (id: string) => base.checks.find((c) => c.id === id)
  const has = (id: string, role: Panel['role']) => panels.some((p) => p.role === role && edgeLengths(p)[id])
  if (has('side', 'front') && has('side', 'back')) {
    const b = baseCheck('side')
    checks.push(check('side', 'Боковые срезы: спинка и полочка', sum('back', 'side'), sum('front', 'side'), b?.expected ?? 0, b?.tolerance ?? 10))
  }
  if (has('side', 'skirtFront') && has('side', 'skirtBack')) {
    checks.push(check('side', 'Боковые срезы юбки', sum('skirtBack', 'side'), sum('skirtFront', 'side'), 0, 5))
  }
  if (has('shoulder', 'front') && has('shoulder', 'back')) {
    const b = baseCheck('shoulder')
    checks.push(check('shoulder', 'Плечевые срезы', sum('back', 'shoulder'), sum('front', 'shoulder'), b?.expected ?? 0, b?.tolerance ?? 3))
  }
  for (const role of ['front', 'back'] as const) {
    const parts = panels.filter((p) => p.role === role && edgeLengths(p).princess)
    if (parts.length === 2) {
      const [a, b] = parts.map((p) => edgeLengths(p).princess!)
      checks.push(check(`princess-${role}`, `Рельефы ${role === 'front' ? 'полочки' : 'спинки'}: два среза`, a!, b!, 0, 10))
    }
  }
  const arm = sum(['front', 'back'], 'armhole')
  const cap = sum('sleeve', 'cap')
  if (arm && cap) checks.push(check('cap', 'Окат минус пройма (посадка или сборка)', cap - arm, 0, 0, Infinity))
  return checks
}

/** Armhole and sleeve cap matching notches: front single, back double, cap top to the shoulder seam. */
export function matchNotches(panels: Panel[], base: BlockResult, puffCap = 0): Panel[] {
  const DF = 75
  const DB = 85
  const len = (roles: Panel['role'][], id: string, list = base.panels) =>
    list.filter((p) => roles.includes(p.role)).reduce((s, p) => s + (edgeLengths(p)[id] ?? 0), 0)
  const armF = len(['front'], 'armhole')
  const armB = len(['back'], 'armhole')
  const capBase = len(['sleeve'], 'cap')
  if (!armF || !armB || !capBase) return panels
  const e = capBase / (armF + armB) - 1
  return panels.map((p) => {
    const q = { ...p, notches: [...p.notches] }
    if ((p.role === 'front' || p.role === 'back') && p.edges.some((x) => x.id === 'side')) {
      const pos = positionOn(p, 'armhole', 'side', p.role === 'front' ? DF : DB)
      if (pos) q.notches.push({ edge: 'armhole', at: pos.at, ...(p.role === 'back' ? { double: true } : {}) })
    }
    if (p.role === 'sleeve' && p.edges.some((x) => x.id === 'cap')) {
      const f = positionOn(p, 'cap', 'seamFront', DF * (1 + e))
      const b = positionOn(p, 'cap', 'seamBack', DB * (1 + e))
      const t = positionOn(p, 'cap', 'seamFront', armF * (1 + e) + puffCap / 2)
      if (f) q.notches.push({ edge: 'cap', at: f.at })
      if (b) q.notches.push({ edge: 'cap', at: b.at, double: true })
      if (t) q.notches.push({ edge: 'cap', at: t.at })
    }
    return q
  })
}

/**
 * A model built on another model («взять модель как основу»): the layers are
 * applied one after another, each on the pieces the previous one produced.
 */
export function applyLayers(block: { garment: GarmentKind }, base: BlockResult, layers: ModelSpec[], m: Partial<Measurements>): ModelResult {
  let cur: BlockResult = base
  const warnings: string[] = []
  let puff = 0
  for (const layer of layers) {
    const res = applySpec(block, cur, layer, m)
    warnings.push(...res.warnings)
    cur = { ...cur, panels: res.panels }
    puff += layer.sleeve?.puffCap ?? 0
  }
  const panels = matchNotches(cur.panels, base, puff)
  return { panels, checks: modelChecks(panels, base), warnings }
}
