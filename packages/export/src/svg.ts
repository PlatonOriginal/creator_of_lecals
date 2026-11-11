import type { PathRole, Piece } from '@lecals/core'

export const STROKES: Record<PathRole, { width: number; dash?: number[] }> = {
  net: { width: 0.5 },
  cut: { width: 0.5 },
  seam: { width: 0.25, dash: [3, 1.5] },
  mark: { width: 0.25 },
  grain: { width: 0.25 },
  fold: { width: 0.35, dash: [6, 1.5, 1, 1.5] },
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
}

/** SVG of one piece at 1:1 scale (width and height in mm). */
export function pieceToSvg(piece: Piece, margin = 5): string {
  const { minX, minY, maxX, maxY } = piece.bbox
  const w = maxX - minX + 2 * margin
  const h = maxY - minY + 2 * margin
  const paths = piece.paths
    .map((p) => {
      const s = STROKES[p.role]
      const dash = s.dash ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''
      return `<path d="${p.d}" fill="none" stroke="currentColor" stroke-width="${s.width}"${dash} data-role="${p.role}"/>`
    })
    .join('')
  const labels = piece.labels
    .map((l) => `<text x="${l.x}" y="${l.y}" font-size="${l.size}" fill="currentColor">${escapeXml(l.text)}</text>`)
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" ` +
    `viewBox="${minX - margin} ${minY - margin} ${w} ${h}">${paths}${labels}</svg>`
  )
}

/** SVG of several pieces side by side at 1:1, for previews. */
export function piecesToSvg(pieces: Piece[], gap = 20, margin = 5, aspect?: number): string {
  // With `aspect` (width / height) the pieces wrap into rows of about that shape.
  const ws = pieces.map((p) => p.bbox.maxX - p.bbox.minX)
  const hs = pieces.map((p) => p.bbox.maxY - p.bbox.minY)
  const rowW = aspect
    ? Math.max(...ws, Math.sqrt(ws.reduce((a, b) => a + b + gap, 0) * Math.max(...hs) * aspect))
    : Infinity
  let x = 0
  let y = 0
  let rowH = 0
  let w0 = 0
  const groups = pieces.map((p, i) => {
    const { minX, minY } = p.bbox
    if (x > 0 && x + ws[i]! > rowW) {
      y += rowH + gap
      x = 0
      rowH = 0
    }
    const g = `<g transform="translate(${x - minX} ${y - minY})">${pieceToSvg(p, 0).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`
    x += ws[i]! + gap
    w0 = Math.max(w0, x - gap)
    rowH = Math.max(rowH, hs[i]!)
    return g
  })
  const h = y + rowH
  const w = Math.max(0, w0)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 2 * margin}mm" height="${h + 2 * margin}mm" ` +
    `viewBox="${-margin} ${-margin} ${w + 2 * margin} ${h + 2 * margin}">${groups.join('')}</svg>`
  )
}
