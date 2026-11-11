import { describe, expect, it } from 'vitest'
import { v } from '../draft/geom'
import { BLOCKS, SILHOUETTES } from '../blocks'
import { typicalFigure } from '../measurements'
import { applyLayers } from '../pattern/model'
import { easeVerdict, fitLevels, garmentProfile, widthAt } from '.'

const m = typicalFigure({ height: 1640, bust: 880, hips: 960 })

describe('widthAt', () => {
  it('measures across a polygon with a notch', () => {
    // 100 wide with a 20 wide notch from the top down to y = 50.
    const poly = [v(0, 0), v(40, 0), v(50, 50), v(60, 0), v(100, 0), v(100, 100), v(0, 100)]
    expect(widthAt(poly, 80)).toBeCloseTo(100, 6)
    expect(widthAt(poly, 25)).toBeCloseTo(90, 6)
  })
})

describe('ease map', () => {
  it.each(BLOCKS.flatMap((b) => SILHOUETTES.map((s) => [b.id, s.id] as const)))('%s %s: sane ease on every level', (id, sil) => {
    const b = BLOCKS.find((x) => x.id === id)!
    const r = b.draft(m, b.defaults(sil))
    const levels = fitLevels(garmentProfile(r.panels, b.garment, r.panels), m)
    const ids = levels.map((l) => l.id)
    expect(ids).toContain('waist')
    expect(ids).toContain('hips')
    if (b.garment === 'dress') expect(ids).toEqual(expect.arrayContaining(['bust', 'upperArm']))
    if (b.garment === 'trousers') expect(ids).toEqual(expect.arrayContaining(['thigh', 'knee']))
    for (const l of levels) {
      // Every block has ease: never tighter than the body, never more than 25 cm.
      expect(l.ease, l.title).toBeGreaterThanOrEqual(0)
      expect(l.ease, l.title).toBeLessThan(250)
    }
  })

  it('grows with the silhouette', () => {
    for (const b of BLOCKS) {
      const hip = (sil: 'fitted' | 'straight') => {
        const r = b.draft(m, b.defaults(sil))
        return fitLevels(garmentProfile(r.panels, b.garment), m).find((l) => l.id === 'hips')!.ease
      }
      expect(hip('straight'), b.id).toBeGreaterThan(hip('fitted'))
    }
  })

  it('flare by side and princess seams keeps the hip girth (it opens below the hips)', () => {
    for (const b of BLOCKS.filter((x) => x.garment === 'dress')) {
      const r = b.draft(m, b.defaults('semi'))
      const base = garmentProfile(r.panels, 'dress', r.panels)
      const mod = applyLayers(b, r, [{ princess: { front: true, back: true, from: 'armhole' }, flare: { darts: 0, side: 60, princess: 40, slashes: 0 } }], m)
      const flared = garmentProfile(mod.panels, 'dress', r.panels)
      expect(flared.girthAt(base.levels.hip!), b.id).toBeGreaterThan(base.girthAt(base.levels.hip!) - 3)
      // Well below the hips the hem has opened by several centimetres.
      const low = base.levels.hip! + 0.8 * (base.hem - base.levels.hip!)
      expect(flared.girthAt(low), b.id).toBeGreaterThan(base.girthAt(low) + 150)
    }
  })

  it('sleeve: puff widens the top, the cuff closes the end', () => {
    const b = BLOCKS.find((x) => x.id === 'emko-dress')!
    const r = b.draft(m, b.defaults('semi'))
    const mod = applyLayers(b, r, [{ sleeve: { length: 200, puffCap: 60, puffHem: 60, capRaise: 20, cuff: 30 } }], m)
    const sl = garmentProfile(mod.panels, 'dress', r.panels).sleeve!
    const plain = garmentProfile(r.panels, 'dress', r.panels).sleeve!
    expect(sl.length).toBeGreaterThan(200)
    expect(sl.length).toBeLessThan(240)
    expect(sl.girthAt(sl.underarm + 10)).toBeGreaterThan(plain.girthAt(plain.underarm + 10))
    expect(sl.girthAt(sl.length - 5)).toBeLessThan(sl.girthAt(sl.length - 40))
  })

  it('verdicts', () => {
    expect(easeVerdict(-5)).toBe('tight')
    expect(easeVerdict(5)).toBe('snug')
    expect(easeVerdict(40)).toBe('fitted')
    expect(easeVerdict(90)).toBe('loose')
    expect(easeVerdict(200)).toBe('veryLoose')
  })
})
