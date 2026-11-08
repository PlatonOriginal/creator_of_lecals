import { describe, expect, it } from 'vitest'
import { draftTestPanel } from './testPanel'
import { SAMPLE_MEASUREMENTS, validateMeasurements } from '../measurements'

describe('draftTestPanel', () => {
  const piece = draftTestPanel(SAMPLE_MEASUREMENTS)

  it('builds seam and cut paths in mm', () => {
    const roles = piece.paths.map((p) => p.role)
    expect(roles).toEqual(expect.arrayContaining(['seam', 'cut', 'grain']))
    for (const p of piece.paths) expect(p.d).toMatch(/^M /)
  })

  it('has the expected width: hips/4 + ease, plus allowance on the side only', () => {
    const width = piece.bbox.maxX - piece.bbox.minX
    // 960/4 + 10 = 250 mm net, +10 mm on the side seam; the centre is on the fold.
    expect(width).toBeGreaterThan(258)
    expect(width).toBeLessThan(263)
    expect(piece.bbox.minX).toBeCloseTo(0, 5)
  })

  it('puts half of the waist excess into the dart', () => {
    // excess = 250 - (175 + 5) = 70; dart = 35
    expect(piece.seams.dartWidth).toBeCloseTo(35, 5)
  })

  it('recomputes from measurements', () => {
    const bigger = draftTestPanel({ ...SAMPLE_MEASUREMENTS, hips: 1100 })
    expect(bigger.bbox.maxX).toBeGreaterThan(piece.bbox.maxX + 30)
  })
})

describe('validateMeasurements', () => {
  it('accepts the sample figure', () => {
    expect(validateMeasurements(SAMPLE_MEASUREMENTS)).toEqual([])
  })
  it('catches waist larger than hips', () => {
    expect(validateMeasurements({ ...SAMPLE_MEASUREMENTS, waist: 1000 })).toContain(
      'Обхват талии больше обхвата бёдер: проверьте мерки',
    )
  })
})
