import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from 'pdf-lib'
import type { Piece } from '@lecals/core'
import { CONTROL_SQUARE, layoutPieces } from './layout'
import { STROKES } from './svg'

const PT_PER_MM = 72 / 25.4
const pt = (mm: number) => mm * PT_PER_MM

export interface PaperSize {
  name: string
  width: number
  height: number
}

export const A4: PaperSize = { name: 'A4', width: 210, height: 297 }
export const A0: PaperSize = { name: 'A0', width: 841, height: 1189 }

export interface PdfOptions {
  paper?: PaperSize
  /** Unprintable margin of a home printer, mm. */
  margin?: number
  /** TrueType font with Cyrillic glyphs. Standard PDF fonts have none. */
  fontBytes: Uint8Array | ArrayBuffer
  title?: string
}

export interface PdfResult {
  bytes: Uint8Array
  pages: number
  cols: number
  rows: number
}

const ROW_NAMES = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ'

function tileName(row: number, col: number): string {
  return `${ROW_NAMES[row % ROW_NAMES.length]}${col + 1}`
}

/**
 * Prints pieces at 1:1, split into pages with a frame, tile names and
 * matching marks on the inner edges so the sheets can be glued together.
 * The first page carries a 10×10 cm control square to check the printer scale.
 */
export async function piecesToPdf(pieces: Piece[], opts: PdfOptions): Promise<PdfResult> {
  const paper = opts.paper ?? A4
  const margin = opts.margin ?? 10
  const tileW = paper.width - 2 * margin
  const tileH = paper.height - 2 * margin
  const layout = layoutPieces(pieces)
  const cols = Math.max(1, Math.ceil(layout.width / tileW))
  const rows = Math.max(1, Math.ceil(layout.height / tileH))

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(opts.title ?? 'Выкройка')
  doc.setCreator('Создатель выкроек')
  const font = await doc.embedFont(opts.fontBytes, { subset: true })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const page = doc.addPage([pt(paper.width), pt(paper.height)])
      // Layout origin in page coordinates: mm from the page's top-left corner.
      const ox = margin - col * tileW
      const oy = margin - row * tileH

      page.pushOperators(
        pushGraphicsState(),
        rectangle(pt(margin), pt(margin), pt(tileW), pt(tileH)),
        clip(),
        endPath(),
      )
      for (const { piece, dx, dy } of layout.placed) {
        drawPiece(page, font, piece, ox + dx, oy + dy, paper.height)
      }
      if (row === 0 && col === 0) drawControlSquare(page, font, ox + 10, oy + 10, paper.height)
      page.pushOperators(popGraphicsState())

      drawFrame(page, font, paper, margin, row, col, rows, cols)
    }
  }

  const bytes = await doc.save()
  return { bytes, pages: rows * cols, cols, rows }
}

/** Draws SVG path data given in mm, with its origin at (x, y) mm from the page's top-left. */
function drawPath(
  page: PDFPage,
  d: string,
  x: number,
  y: number,
  pageH: number,
  width: number,
  dash?: number[],
) {
  page.drawSvgPath(d, {
    x: pt(x),
    y: pt(pageH - y),
    scale: PT_PER_MM,
    borderColor: rgb(0, 0, 0),
    // pdf-lib applies the scale to the line width and dash too, so these stay in mm.
    borderWidth: width,
    ...(dash ? { borderDashArray: dash } : {}),
  })
}

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, sizeMm: number, pageH: number) {
  page.drawText(text, { x: pt(x), y: pt(pageH - y), size: pt(sizeMm), font, color: rgb(0, 0, 0) })
}

function drawPiece(page: PDFPage, font: PDFFont, piece: Piece, x: number, y: number, pageH: number) {
  for (const p of piece.paths) {
    const s = STROKES[p.role]
    drawPath(page, p.d, x, y, pageH, s.width, s.dash)
  }
  for (const l of piece.labels) drawText(page, font, l.text, x + l.x, y + l.y, l.size, pageH)
}

function drawControlSquare(page: PDFPage, font: PDFFont, x: number, y: number, pageH: number) {
  const s = CONTROL_SQUARE
  drawPath(page, `M 0,0 L ${s},0 L ${s},${s} L 0,${s} Z`, x, y, pageH, 0.4)
  for (let i = 10; i < s; i += 10) {
    drawPath(page, `M ${i},0 L ${i},4 M 0,${i} L 4,${i}`, x, y, pageH, 0.2)
  }
  drawText(page, font, 'Контрольный квадрат', x + 8, y + 45, 5, pageH)
  drawText(page, font, '10 × 10 см', x + 8, y + 53, 5, pageH)
  drawText(page, font, 'Печатайте в масштабе 100 %', x + 8, y + 63, 3.5, pageH)
}

function drawFrame(
  page: PDFPage,
  font: PDFFont,
  paper: PaperSize,
  m: number,
  row: number,
  col: number,
  rows: number,
  cols: number,
) {
  const w = paper.width - 2 * m
  const h = paper.height - 2 * m
  const H = paper.height
  drawPath(page, `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`, m, m, H, 0.15, [1, 1])
  drawText(page, font, `${tileName(row, col)}  (${row * cols + col + 1} из ${rows * cols})`, m + 2, m - 3, 3.5, H)

  // Half-diamond marks in the middle of each inner edge, with the neighbour's name.
  const mark = 6
  if (col < cols - 1) {
    drawPath(page, `M ${w},${h / 2 - mark} L ${w - mark},${h / 2} L ${w},${h / 2 + mark}`, m, m, H, 0.3)
    drawText(page, font, `→ ${tileName(row, col + 1)}`, m + w - 18, m + h / 2 + mark + 5, 3.5, H)
  }
  if (col > 0) {
    drawPath(page, `M 0,${h / 2 - mark} L ${mark},${h / 2} L 0,${h / 2 + mark}`, m, m, H, 0.3)
    drawText(page, font, `${tileName(row, col - 1)} ←`, m + 2, m + h / 2 + mark + 5, 3.5, H)
  }
  if (row < rows - 1) {
    drawPath(page, `M ${w / 2 - mark},${h} L ${w / 2},${h - mark} L ${w / 2 + mark},${h}`, m, m, H, 0.3)
    drawText(page, font, `↓ ${tileName(row + 1, col)}`, m + w / 2 + mark + 2, m + h - 2, 3.5, H)
  }
  if (row > 0) {
    drawPath(page, `M ${w / 2 - mark},0 L ${w / 2},${mark} L ${w / 2 + mark},0`, m, m, H, 0.3)
    drawText(page, font, `↑ ${tileName(row - 1, col)}`, m + w / 2 + mark + 2, m + 5, 3.5, H)
  }
}
