import type { BBox, Piece } from '@lecals/core'

export interface PlacedPiece {
  piece: Piece
  /** Translation applied to piece coordinates, mm. */
  dx: number
  dy: number
}

export interface Layout {
  placed: PlacedPiece[]
  width: number
  height: number
}

/** Size of the reserved area for the 10×10 cm control square, mm. */
export const CONTROL_SQUARE = 100
const CONTROL_AREA = CONTROL_SQUARE + 20

/**
 * Lays pieces out in rows after the control square, starting a new row when
 * the next piece would cross `maxWidth`. A real nesting (and layout on
 * fabric) is outside the prototype.
 */
export function layoutPieces(pieces: Piece[], gap = 20, maxWidth = Infinity): Layout {
  let x = CONTROL_AREA
  let y = 0
  let rowH = CONTROL_AREA
  let width = 0
  const placed: PlacedPiece[] = []
  for (const piece of pieces) {
    const b: BBox = piece.bbox
    const w = b.maxX - b.minX
    if (placed.length > 0 && x + w > maxWidth) {
      y += rowH + gap
      x = 0
      rowH = 0
    }
    placed.push({ piece, dx: x - b.minX, dy: y - b.minY })
    x += w + gap
    width = Math.max(width, x - gap)
    rowH = Math.max(rowH, b.maxY - b.minY)
  }
  return { placed, width, height: y + rowH }
}
