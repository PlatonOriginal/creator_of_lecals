/**
 * Neutral geometry that leaves the core. Everything is in millimetres,
 * with y pointing down (as in SVG). Export and UI depend only on these types,
 * not on the drafting engine, so the engine can be replaced later.
 */
export type PathRole = 'seam' | 'cut' | 'mark' | 'grain' | 'fold'

export interface PiecePath {
  role: PathRole
  /** SVG path data using only M, L, C and Z commands, in mm. */
  d: string
}

export interface PieceLabel {
  x: number
  y: number
  text: string
  /** Font size in mm. */
  size: number
}

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Piece {
  id: string
  title: string
  paths: PiecePath[]
  labels: PieceLabel[]
  bbox: BBox
  /** Lengths of named seams in mm, used later to check matching seams. */
  seams: Record<string, number>
}

export function bboxWidth(b: BBox): number {
  return b.maxX - b.minX
}

export function bboxHeight(b: BBox): number {
  return b.maxY - b.minY
}
