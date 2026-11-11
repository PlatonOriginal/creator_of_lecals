import { describe, expect, it } from 'vitest'
import { BLOCKS } from '../blocks'
import { SAMPLE_MEASUREMENTS } from '../measurements'
import { SILHOUETTES } from '../blocks/types'
import { dist } from '../draft/geom'
import { edgeLengths } from './panel'

describe('панели основ: именованные срезы', () => {
  for (const block of BLOCKS) {
    for (const s of SILHOUETTES) {
      const r = block.draft(SAMPLE_MEASUREMENTS, block.defaults(s.id))
      it(`${block.id} (${s.id}): контур замкнут, срезы совпадают с длинами из основы`, () => {
        for (const p of r.panels) {
          for (let i = 0; i < p.edges.length; i++) {
            const a = p.edges[i]!
            const b = p.edges[(i + 1) % p.edges.length]!
            expect(dist(a.line.end, b.line.start), `${p.id} ${a.id}→${b.id}`).toBeLessThan(1e-6)
            expect(a.line.segs.length).toBeGreaterThan(0)
          }
          const legs = p.edges.filter((e) => e.kind === 'dart')
          expect(legs.length % 2).toBe(0)
          const len = edgeLengths(p)
          for (const id of ['side', 'shoulder', 'armhole', 'cap', 'inseam', 'waist']) {
            if (p.seams?.[id] !== undefined && len[id] !== undefined) {
              expect(Math.abs(len[id]! - p.seams[id]!), `${p.id}.${id}`).toBeLessThan(1)
            }
          }
          expect(p.edges.some((e) => e.id === 'hem')).toBe(true)
        }
      })
    }
  }
})
