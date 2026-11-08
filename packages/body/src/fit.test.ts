import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AnnyBody, type AnnyMeta } from './anny'
import { FEMALE_BASE, fitBody } from './fit'
import { findLevels, hullPerimeter, measureBody, verticalExtent } from './measure'

const dir = fileURLToPath(new URL('../../../apps/web/public/body/', import.meta.url))
const meta = JSON.parse(readFileSync(`${dir}anny.json`, 'utf8')) as AnnyMeta
const buf = readFileSync(`${dir}anny.bin`)
const body = new AnnyBody(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

describe('measure', () => {
  it('takes the hull perimeter like a tape', () => {
    // A unit square with a dent: the tape bridges the dent.
    const pts = Float64Array.from([0, 0, 1, 0, 1, 1, 0.5, 0.8, 0, 1])
    expect(hullPerimeter(pts)).toBeCloseTo(4, 9)
  })

  it('finds hips below the waist below the bust on the base body', () => {
    const mesh = { vertices: body.restVertices(FEMALE_BASE), faces: body.faces }
    const lv = findLevels(mesh)
    const { minY, maxY } = verticalExtent(mesh.vertices)
    const f = (y: number) => (y - minY) / (maxY - minY)
    expect(f(lv.hips)).toBeGreaterThan(0.45)
    expect(f(lv.hips)).toBeLessThan(f(lv.waist))
    expect(f(lv.waist)).toBeLessThan(f(lv.bust))
    expect(f(lv.bust)).toBeLessThan(0.78)
    const m = measureBody(mesh, lv)
    // The base body is an ordinary adult woman.
    expect(m.height).toBeGreaterThan(1600)
    expect(m.waist).toBeLessThan(m.bust)
    expect(m.bust).toBeGreaterThan(800)
    expect(m.bust).toBeLessThan(1000)
    expect(m.hips).toBeGreaterThan(m.waist + 150)
  })
})

describe('fitBody', () => {
  it.each([
    { height: 1640, bust: 880, waist: 700, hips: 940 },
    { height: 1580, bust: 960, waist: 800, hips: 1060 },
    { height: 1700, bust: 840, waist: 640, hips: 900 },
    { height: 1520, bust: 1160, waist: 1000, hips: 1240 },
  ])('fits %o within 1 cm', (t) => {
    const r = fitBody(body, t)
    expect(r.measured.height).toBeCloseTo(t.height, 3)
    expect(Math.abs(r.measured.bust - t.bust)).toBeLessThan(10)
    expect(Math.abs(r.measured.waist - t.waist)).toBeLessThan(10)
    expect(Math.abs(r.measured.hips - t.hips)).toBeLessThan(10)
  })

  it('fits height only when no girths are given', () => {
    const r = fitBody(body, { height: 1600 })
    expect(r.measured.height).toBeCloseTo(1600, 3)
    expect(r.local).toEqual({})
  })
})
