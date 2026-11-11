import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BLOCKS, applyLayers, garmentProfile, typicalFigure } from '@lecals/core'
import { AnnyBody, type AnnyMeta } from './anny'
import { SkirtCloth } from './cloth'
import { fitBody } from './fit'
import { bodyLandmarks, bodyRegions } from './landmarks'
import { garmentShell } from './shell'

const dir = fileURLToPath(new URL('../../../apps/web/public/body/', import.meta.url))
const meta = JSON.parse(readFileSync(`${dir}anny.json`, 'utf8')) as AnnyMeta
const buf = readFileSync(`${dir}anny.bin`)
const body = new AnnyBody(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

describe('shell and cloth', () => {
  const m = typicalFigure({ height: 1640, bust: 880, hips: 960 })
  const r = fitBody(body, { height: 1640, bust: 880, waist: m.waist, hips: 960 })
  const v = body.restVertices(r.phenotypes, r.local)
  for (let i = 0; i < v.length; i++) v[i]! *= r.scale
  const mesh = { vertices: v, faces: body.faces }
  const L = bodyLandmarks(mesh, bodyRegions(body))
  const skirt = BLOCKS.find((b) => b.id === 'muller-skirt')!
  const base = skirt.draft(m, skirt.defaults('semi'))
  const mod = applyLayers(skirt, base, [{ flare: { darts: 1, side: 40, princess: 0, slashes: 100 } }], m)
  const shell = garmentShell(mesh, L, garmentProfile(mod.panels, 'skirt', base.panels), { color: () => [0, 0, 0] })

  it('puts the skirt between the waist and the hem, round the body', () => {
    expect(shell.grid).toBeDefined()
    const ys = []
    for (let i = 1; i < shell.positions.length; i += 3) ys.push(shell.positions[i]!)
    expect(Math.max(...ys)).toBeCloseTo(L.levels.waist, 2)
    expect(shell.bands.map((b) => b.id)).toEqual(['waist', 'hips'])
  })

  it('hangs under gravity without stretching or going into the body', () => {
    const sim = new SkirtCloth(shell.positions.slice(), shell.grid!)
    const low = (p: Float32Array) => {
      let y = Infinity
      for (let i = 1; i < shell.grid!.rows * shell.grid!.cols * 3; i += 3) y = Math.min(y, p[i]!)
      return y
    }
    const before = low(shell.positions)
    for (let i = 0; i < 120; i++) sim.step()
    // The hem drops a little as the flare hangs straight, not by tens of centimetres.
    expect(before - low(sim.pos)).toBeLessThan(0.1)
    const s = sim.stats()
    expect(s.particles).toBeGreaterThan(1000)
    expect(s.stepMs).toBeGreaterThan(0)
  })
})
