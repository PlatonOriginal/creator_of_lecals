import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AnnyBody, type AnnyMeta, interpolationCoefficients } from './anny'

const dir = fileURLToPath(new URL('../../../apps/web/public/body/', import.meta.url))
const meta = JSON.parse(readFileSync(`${dir}anny.json`, 'utf8')) as AnnyMeta
const buf = readFileSync(`${dir}anny.bin`)
const body = new AnnyBody(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

describe('interpolationCoefficients', () => {
  it('matches the Python helper on and between anchors', () => {
    expect(interpolationCoefficients(0.5, [0, 0.5, 1])).toEqual([0, 1, 0])
    expect(interpolationCoefficients(0.25, [0, 0.5, 1])).toEqual([0.5, 0.5, 0])
    expect(interpolationCoefficients(2, [0, 1])).toEqual([0, 1])
  })
})

describe('AnnyBody', () => {
  it('ports the phenotype weight formula exactly', () => {
    for (const ref of meta.references) {
      const w = body.phenotypeWeights(ref.phenotypes)
      const nonZero = w.filter((x) => Math.abs(x) > 1e-12).length
      expect(nonZero).toBe(ref.nonZeroWeights)
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(ref.weightSum, 9)
    }
  })

  it('reproduces the Python body within 6 mm (compression error)', () => {
    let worst = 0
    for (const ref of meta.references) {
      const v = body.restVertices(ref.phenotypes, ref.localChanges)
      for (const [i, p] of Object.entries(ref.probe)) {
        const k = Number(i) * 3
        const err = Math.hypot(v[k]! - p[0], v[k + 1]! - p[1], v[k + 2]! - p[2])
        worst = Math.max(worst, err)
      }
    }
    expect(worst * 1000).toBeLessThan(6)
  })
})
