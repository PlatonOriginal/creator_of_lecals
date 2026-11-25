import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  DEFAULT_ALLOWANCES,
  SAMPLE_MEASUREMENTS,
  cutPiece,
  draftTestPanel,
  emkoMaleJacket,
  emkoMaleShirt,
  emkoMaleTrousers,
  maleTypicalFigure,
} from '@lecals/core'
import { A0, A4, piecesToPdf } from './pdf'
import { pieceToSvg, piecesToSvg } from './svg'

const require = createRequire(import.meta.url)
const fontBytes = readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'))
const piece = draftTestPanel({ ...SAMPLE_MEASUREMENTS, waist: 700, hips: 960, waistToHips: 190, skirtLength: 600 })

const MALE_176_100_88 = {
  ...maleTypicalFigure({ height: 1760, chest3: 1000, waist: 880 }),
  chest1: 975,
  chest2: 1005,
  neck: 400,
  upperArm: 315,
  wrist: 175,
  shoulderSlope: 148,
  neckToRadial: 355,
  neckToWrist: 610,
  napeToChest1Front: 210,
  bustHeight: 272,
  frontLength: 464,
  armholeArc: 365,
  armholeDepthBack: 216,
  backLength: 460,
  upperTorsoArc: 935,
  chestWidth: 374,
  chestPointDistance: 215,
  backWidth: 408,
  armDepth: 124,
} as const

describe('piecesToPdf', () => {
  it('tiles the test panel onto A4 pages of the right size', async () => {
    const res = await piecesToPdf([piece], { fontBytes, paper: A4 })
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

describe('base block to PDF', () => {
  it('prints the ЕМКО skirt (two pieces) on A4 tiles and on one A0 sheet', async () => {
    const { emkoSkirt } = await import('@lecals/core')
    const r = emkoSkirt.draft(SAMPLE_MEASUREMENTS, emkoSkirt.defaults('semi'))
    const a4 = await piecesToPdf(r.pieces, { fontBytes, paper: A4 })
    expect(a4.pages).toBeGreaterThan(4)
    expect((await PDFDocument.load(a4.bytes)).getPageCount()).toBe(a4.pages)
    const a0 = await piecesToPdf(r.pieces, { fontBytes, paper: A0 })
    expect(a0.pages).toBe(1)
  })
})

describe('dress to PDF', () => {
  it('prints the ЕМКО dress with sleeve on A0', async () => {
    const { emkoDress } = await import('@lecals/core')
    const r = emkoDress.draft(SAMPLE_MEASUREMENTS, emkoDress.defaults('semi'))
    expect(r.pieces).toHaveLength(3)
    const a0 = await piecesToPdf(r.pieces, { fontBytes, paper: A0 })
    expect(a0.pages).toBeLessThanOrEqual(2)
  })
})

describe('male garments to PDF and SVG', () => {
  it('exports male trousers, 7-piece shirt and 4-piece jacket with allowances to PDF and SVG', async () => {
    const trousers = emkoMaleTrousers.draft(MALE_176_100_88 as never, emkoMaleTrousers.defaults('semi'))
    const trousersCut = trousers.panels.map((p) => cutPiece(p, DEFAULT_ALLOWANCES, { model: 'Брюки ЕМКО' }))
    const trousersPdf = await piecesToPdf(trousersCut, { fontBytes, paper: A0, title: 'Мужские брюки' })
    expect(trousersPdf.pages).toBeLessThanOrEqual(2)

    const shirt = emkoMaleShirt.draft(MALE_176_100_88 as never, emkoMaleShirt.defaults('semi'))
    const shirtCut = shirt.panels.map((p) => cutPiece(p, DEFAULT_ALLOWANCES, { model: 'Сорочка ЕМКО' }))
    expect(shirtCut).toHaveLength(7)
    const shirtSvg = piecesToSvg(shirtCut)
    expect(shirtSvg).toContain('Стойка воротника')
    expect(shirtSvg).toContain('Манжета')
    const shirtPdf = await piecesToPdf(shirtCut, { fontBytes, paper: A0, title: 'Мужская сорочка' })
    expect(shirtPdf.pages).toBeLessThanOrEqual(2)

    const jacket = emkoMaleJacket.draft(MALE_176_100_88 as never, emkoMaleJacket.defaults('semi'))
    const jacketCut = jacket.panels.map((p) => cutPiece(p, DEFAULT_ALLOWANCES, { model: 'Пиджак ЕМКО' }))
    expect(jacketCut).toHaveLength(4)
    const jacketPdf = await piecesToPdf(jacketCut, { fontBytes, paper: A0, title: 'Мужской пиджак' })
    expect(jacketPdf.pages).toBeLessThanOrEqual(2)
  })
})
