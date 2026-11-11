// Dev helper: renders cut pieces of blocks and sample models to SVG files for a visual check.
import { writeFileSync } from 'node:fs'
import { BLOCKS, SAMPLE_MEASUREMENTS, applyModel, cutPiece, type ModelSpec } from '@lecals/core'
import { piecesToSvg } from '../src/svg'

const out = process.argv[2] ?? '.'
const specs: Record<string, ModelSpec> = {
  base: {},
  princess: {
    princess: { front: true, back: true, from: 'armhole' },
    neckline: { shape: 'round', widen: 20, front: 40, back: 10 },
    flare: { darts: 0, side: 40, princess: 30, slashes: 0 },
    sleeve: { length: 250, puffCap: 60, puffHem: 40, capRaise: 25, cuff: 30 },
    length: -100,
  },
  armholeDart: { frontDart: { to: 'armhole', share: 1 }, neckline: { shape: 'v', widen: 15, front: 120, back: 0 } },
  sideDart: { frontDart: { to: 'side', share: 1 }, backDart: { to: 'armhole', share: 1 }, neckline: { shape: 'square', widen: 30, front: 80, back: 20 } },
  flare: { flare: { darts: 1, side: 50, princess: 0, slashes: 150 }, length: 80 },
  trapeze: { flare: { darts: 0.5, side: 40, princess: 0, slashes: 0 }, length: -50 },
}
const only = process.argv[3]
for (const b of BLOCKS) {
  const r = b.draft(SAMPLE_MEASUREMENTS, b.defaults('semi'))
  for (const [name, spec] of Object.entries(specs)) {
    if (only && name !== only) continue
    const res = applyModel(b, r, spec, SAMPLE_MEASUREMENTS)
    if (res.warnings.length) console.log(b.id, name, res.warnings)
    console.log(b.id, name, res.checks.map((c) => `${c.id}:${c.ok ? 'ok' : 'BAD'} ${Math.round(c.a)}/${Math.round(c.b)}`).join(' '))
    const pieces = res.panels.map((p) => cutPiece(p))
    writeFileSync(`${out}/${b.id}-${name}.svg`, piecesToSvg(pieces).replace('<svg ', '<svg style="background:white;color:black" '))
  }
}
