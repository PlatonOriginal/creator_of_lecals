import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { SAMPLE_MEASUREMENTS, draftTestPanel } from '@lecals/core'
import { A0, A4, piecesToPdf } from './pdf'
import { pieceToSvg } from './svg'

const require = createRequire(import.meta.url)
const fontBytes = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'))
const piece = draftTestPanel(SAMPLE_MEASUREMENTS)

describe('piecesToPdf', () => {
  it('tiles the test panel onto A4 pages of the right size', async () => {
    const res = await piecesToPdf([piece], { fontBytes, paper: A4 })
    // Layout: 120 mm for the control square + 260 mm piece = 380 mm wide, ~620 mm tall.
    // Printable tile 190 × 277 mm -> 2 columns × 3 rows.
    expect(res.cols).toBe(2)
    expect(res.rows).toBe(3)
    const doc = await PDFDocument.load(res.bytes)
    expect(doc.getPageCount()).toBe(6)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo((210 * 72) / 25.4, 1)
    expect(height).toBeCloseTo((297 * 72) / 25.4, 1)
  })

  it('fits on one A0 sheet', async () => {
    const res = await piecesToPdf([piece], { fontBytes, paper: A0 })
    expect(res.pages).toBe(1)
  })
})

describe('pieceToSvg', () => {
  it('produces a 1:1 SVG in millimetres', () => {
    const svg = pieceToSvg(piece)
    expect(svg).toMatch(/width="[\d.]+mm"/)
    expect(svg).toContain('data-role="cut"')
  })
})
