import { emkoDress, SAMPLE_MEASUREMENTS, trimBelow, hemY, hemWidth } from '@lecals/core'
const r = emkoDress.draft(SAMPLE_MEASUREMENTS, emkoDress.defaults('semi'))
const s = r.panels[2]!
const top = Math.min(...s.edges.flatMap(e=>e.line.points(8)).map(p=>p.y))
const t = trimBelow(s, top + 220)
for (const e of t.edges) console.log(e.id, e.kind, JSON.stringify(e.line.start), JSON.stringify(e.line.end), e.line.length().toFixed(1))
console.log(hemY(t), hemWidth(t))
