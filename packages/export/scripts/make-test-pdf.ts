// Prints the M0 test piece to PDF: `pnpm make-test-pdf [out-dir]`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { SAMPLE_MEASUREMENTS, draftTestPanel } from '@lecals/core'
import { A0, A4, pieceToSvg, piecesToPdf } from '@lecals/export'

const require = createRequire(import.meta.url)
const fontBytes = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'))
const out = process.argv[2] ?? 'out'
mkdirSync(out, { recursive: true })

const piece = draftTestPanel(SAMPLE_MEASUREMENTS)
for (const paper of [A4, A0]) {
  const res = await piecesToPdf([piece], { fontBytes, paper, title: piece.title })
  writeFileSync(join(out, `test-panel-${paper.name}.pdf`), res.bytes)
  console.log(`${paper.name}: ${res.pages} pages (${res.cols}×${res.rows}), ${res.bytes.length} bytes`)
}
writeFileSync(join(out, 'test-panel.svg'), pieceToSvg(piece))
console.log('seams', piece.seams)
