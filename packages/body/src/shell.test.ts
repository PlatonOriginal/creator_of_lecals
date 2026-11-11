import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BLOCKS, applyLayers, garmentProfile, typicalFigure } from '@lecals/core'
import { AnnyBody, type AnnyMeta } from './anny'
import { fitBody, type FitTarget } from './fit'
import { bodyLandmarks, bodyRegions } from './landmarks'
import { type V3, cross3, dot3, sub3 } from './plane'
import { garmentShell } from './shell'

const dir = fileURLToPath(new URL('../../../apps/web/public/body/', import.meta.url))
const meta = JSON.parse(readFileSync(`${dir}anny.json`, 'utf8')) as AnnyMeta
const buf = readFileSync(`${dir}anny.bin`)
const body = new AnnyBody(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

/** Distance along a ray to a triangle (Möller–Trumbore), or -1. */
function hit(o: V3, d: V3, a: V3, b: V3, c: V3): number {
  const e1 = sub3(b, a)
  const e2 = sub3(c, a)
  const p = cross3(d, e2)
  const det = dot3(e1, p)
  if (Math.abs(det) < 1e-12) return -1
  const t0 = sub3(o, a)
  const u = dot3(t0, p) / det
  if (u < 0 || u > 1) return -1
  const q = cross3(t0, e1)
  const w = dot3(d, q) / det
  if (w < 0 || u + w > 1) return -1
  return dot3(e2, q) / det
}

const at = (a: ArrayLike<number>, i: number): V3 => [a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!]

describe('dress shell', () => {
  // A large figure in a dress with long sleeves, and a slim one in puffed
  // sleeves: the bodice, the rings and the sleeves used to leave slits of
  // skin at the shoulders and between the breasts.
  it.each([
    { fig: { height: 1600, bust: 1200, hips: 1240 }, block: 'muller-dress', sleeve: { length: 450, puffCap: 0, puffHem: 0, capRaise: 0, cuff: 0 } },
    { fig: { height: 1640, bust: 880, hips: 960 }, block: 'emko-dress', sleeve: { length: 200, puffCap: 60, puffHem: 60, capRaise: 20, cuff: 30 } },
  ])('covers the upper body seen from the front ($block, $fig.bust)', ({ fig, block, sleeve }) => {
    const m = typicalFigure(fig)
    const t: FitTarget = { height: fig.height, bust: m.bust, waist: m.waist, hips: m.hips, upperArm: m.upperArm, shoulderLength: m.shoulderLength }
    const r = fitBody(body, t)
    const v = body.restVertices(r.phenotypes, r.local)
    for (let i = 0; i < v.length; i++) v[i]! *= r.scale
    const f = body.faces
    const mesh = { vertices: v, faces: f }
    const L = bodyLandmarks(mesh, bodyRegions(body))
    const bl = BLOCKS.find((b) => b.id === block)!
    const base = bl.draft(m, bl.defaults('semi'))
    const mod = applyLayers(bl, base, [{ sleeve }], m)
    const shell = garmentShell(mesh, L, garmentProfile(mod.panels, 'dress', base.panels), { color: () => [0, 0, 0] })
    const P = shell.positions
    const I = shell.indices

    // The camera of the «Верх» view: in front, a little above the chest.
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 1; i < v.length; i += 3) {
      minY = Math.min(minY, v[i]!)
      maxY = Math.max(maxY, v[i]!)
    }
    const h = maxY - minY
    const cam: V3 = [0, minY + 0.78 * h, (h * 0.34) / Math.tan((17.5 * Math.PI) / 180)]
    const nr = new Float64Array(v.length)
    for (let k = 0; k < f.length; k += 3) {
      const n = cross3(sub3(at(v, f[k + 1]!), at(v, f[k]!)), sub3(at(v, f[k + 2]!), at(v, f[k]!)))
      for (const i of [f[k]!, f[k + 1]!, f[k + 2]!]) for (let a = 0; a < 3; a++) nr[i * 3 + a]! += n[a]!
    }
    const neck = L.rings.neck
    const neckTop = Math.max(...neck.points.map((p) => p[1]))
    const open: V3[] = []
    for (let i = 0; i < v.length / 3; i++) {
      const p = at(v, i)
      // Skin between the bust line and the shoulders, off the neck, not down the arm.
      if (p[0] < 0 || p[1] < L.levels.bust || p[1] > neckTop) continue
      if (Math.hypot(p[0] - neck.centre[0], p[2] - neck.centre[2]) < 0.07 || p[0] > L.shoulderPoint[0] + 0.06) continue
      const d = sub3(p, cam)
      const len = Math.hypot(...d)
      const u: V3 = [d[0] / len, d[1] / len, d[2] / len]
      if (dot3(at(nr, i), u) >= 0) continue
      let hidden = false
      for (let k = 0; k < f.length && !hidden; k += 3) {
        if (f[k] === i || f[k + 1] === i || f[k + 2] === i) continue
        const s = hit(cam, u, at(v, f[k]!), at(v, f[k + 1]!), at(v, f[k + 2]!))
        if (s > 0 && s < len - 0.002) hidden = true
      }
      if (hidden) continue
      let covered = false
      for (let k = 0; k < I.length && !covered; k += 3) {
        const s = hit(cam, u, at(P, I[k]!), at(P, I[k + 1]!), at(P, I[k + 2]!))
        if (s > 0 && s < len) covered = true
      }
      if (!covered) open.push(p)
    }
    expect(open).toEqual([])
  }, 60000)
})
