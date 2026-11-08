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
 * Lays pieces out in one row after the control square.
 * A real nesting (and layout on fabric) is outside the prototype.
 */
export function layoutPieces(pieces: Piece[], gap = 20): Layout {
  let x = CONTROL_AREA
  let height = CONTROL_AREA
  const placed: PlacedPiece[] = []
  for (const piece of pieces) {
    const b: BBox = piece.bbox
    placed.push({ piece, dx: x - b.minX, dy: -b.minY })
    x += b.maxX - b.minX + gap
    height = Math.max(height, b.maxY - b.minY)
  }
  return { placed, width: x - gap, height }
}
