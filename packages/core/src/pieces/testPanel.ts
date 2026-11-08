// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient typings for the untyped engine
/// <reference path="../drafting/freesewing.d.ts" />
import { Design, type FsPath, type PartDefinition } from '@freesewing/core'
import type { Measurements } from '../measurements'
import type { BBox, Piece } from '../geometry'

/**
 * M0 test piece: a quarter of a straight skirt (front) with one waist dart.
 * This is NOT a real drafting method yet. It only exercises the engine:
 * points, Bézier curves, a dart, seam allowance by offset, seam lengths.
 */
export interface TestPanelOptions {
  /** Ease at the hip line, added to the quarter, mm. */
  hipEase: number
  /** Seam allowance, mm. */
  seamAllowance: number
  /** Dart length, mm. */
  dartLength: number
}

export const DEFAULT_TEST_PANEL_OPTIONS: TestPanelOptions = {
  hipEase: 10,
  seamAllowance: 10,
  dartLength: 90,
}

type M = 'waist' | 'hips' | 'waistToHips' | 'skirtLength'
type O = 'hipEase' | 'seamAllowance' | 'dartLength'

const PART = 'lecals.testPanel'

const testPanelPart: PartDefinition<M, O> = {
  name: PART,
  measurements: ['waist', 'hips', 'waistToHips', 'skirtLength'],
  options: {
    hipEase: { mm: 10, min: 0, max: 50 },
    seamAllowance: { mm: 10, min: 0, max: 30 },
    dartLength: { mm: 90, min: 50, max: 150 },
  },
  draft: ({ Point, Path, points, paths, measurements: m, options: o, store, part }) => {
    const width = m.hips / 4 + o.hipEase
    const waistQuarter = m.waist / 4 + 5
    const excess = Math.max(0, width - waistQuarter)
    // Half of the excess goes into the side seam, half into the dart.
    const sideIn = excess / 2
    const dartWidth = excess / 2

    points.waistCenter = new Point(0, 0)
    points.hipCenter = new Point(0, m.waistToHips)
    points.hemCenter = new Point(0, m.skirtLength)
    points.hemSide = new Point(width, m.skirtLength)
    points.hipSide = new Point(width, m.waistToHips)
    // Side waist rises 10 mm, as is usual on skirts.
    points.waistSide = new Point(width - sideIn, -10)

    const dartCenterX = width * 0.4
    points.dartLeft = new Point(dartCenterX - dartWidth / 2, 0)
    points.dartRight = new Point(dartCenterX + dartWidth / 2, -2)
    points.dartTip = new Point(dartCenterX, o.dartLength)

    points.sideCp1 = points.waistSide.shift(-80, m.waistToHips * 0.35)
    points.sideCp2 = points.hipSide.shift(90, m.waistToHips * 0.45)

    const side = new Path().move(points.hipSide).curve(points.sideCp2, points.sideCp1, points.waistSide)

    paths.seam = new Path()
      .move(points.waistCenter)
      .line(points.hemCenter)
      .line(points.hemSide)
      .line(points.hipSide)
      .join(side)
      .line(points.dartRight)
      .line(points.dartTip)
      .line(points.dartLeft)
      .close()

    // Cut line: the centre front is on the fold, so it gets no allowance.
    // The hem and side are offset outwards; the waist allowance runs parallel
    // to the waist line (with the dart closed over) until it meets the fold.
    const hemAndSide = new Path().move(points.hemCenter).line(points.hemSide).line(points.hipSide).join(side)
    const offset = hemAndSide.offset(o.seamAllowance)
    const sa = o.seamAllowance
    const wdx = points.waistCenter.x - points.waistSide.x
    const wdy = points.waistCenter.y - points.waistSide.y
    const wlen = Math.hypot(wdx, wdy)
    // Outward normal of the waist line (pointing up, away from the piece).
    const nx = wdy / wlen
    const ny = -wdx / wlen
    points.cutWaistSide = new Point(points.waistSide.x + nx * sa, points.waistSide.y + ny * sa)
    points.cutWaistFold = new Point(0, points.cutWaistSide.y + ((0 - points.cutWaistSide.x) / wdx) * wdy)
    points.cutHemFold = new Point(0, offset.start().y)
    paths.cut = new Path()
      .move(points.cutHemFold)
      .join(offset)
      .line(points.cutWaistSide)
      .line(points.cutWaistFold)
      .close()

    points.grainTop = new Point(width * 0.6, m.waistToHips * 0.6)
    points.grainBottom = new Point(width * 0.6, m.skirtLength - 60)

    store.set('seam.side', side.length() + points.hipSide.dist(points.hemSide))
    store.set('seam.waist', points.waistCenter.dist(points.dartLeft) + points.dartRight.dist(points.waistSide))
    store.set('dart.width', dartWidth)
    return part
  },
}

const TestPanelDesign = new Design({ parts: [testPanelPart as PartDefinition<string, string>] })

function toBBox(paths: FsPath[]): BBox {
  const b: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of paths) {
    const { topLeft, bottomRight } = p.bbox()
    b.minX = Math.min(b.minX, topLeft.x)
    b.minY = Math.min(b.minY, topLeft.y)
    b.maxX = Math.max(b.maxX, bottomRight.x)
    b.maxY = Math.max(b.maxY, bottomRight.y)
  }
  return b
}

function arrowLine(x: number, y1: number, y2: number): string {
  const a = 6
  return (
    `M ${x},${y1} L ${x},${y2} ` +
    `M ${x - a / 2},${y1 + a} L ${x},${y1} L ${x + a / 2},${y1 + a} ` +
    `M ${x - a / 2},${y2 - a} L ${x},${y2} L ${x + a / 2},${y2 - a}`
  )
}

export function draftTestPanel(
  measurements: Measurements,
  options: TestPanelOptions = DEFAULT_TEST_PANEL_OPTIONS,
): Piece {
  const pattern = new TestPanelDesign({ measurements: { ...measurements }, options: { ...options } }).draft()
  const errors = pattern.setStores[0]?.logs.error ?? []
  if (errors.length > 0) throw new Error(`FreeSewing: ${errors.join('; ')}`)
  const fsPart = pattern.parts[0]?.[PART]
  if (!fsPart) throw new Error('FreeSewing did not draft the test panel')
  const store = pattern.setStores[0]!
  const { seam, cut } = fsPart.paths as Record<'seam' | 'cut', FsPath>
  const p = fsPart.points

  const bbox = toBBox([cut!, seam!])
  const midX = (bbox.minX + bbox.maxX) / 2
  return {
    id: 'test-panel',
    title: 'Тестовая деталь: перед юбки',
    paths: [
      { role: 'cut', d: cut!.asPathstring() },
      { role: 'seam', d: seam!.asPathstring() },
      { role: 'grain', d: arrowLine(p.grainTop!.x, p.grainTop!.y, p.grainBottom!.y) },
      { role: 'fold', d: `M 0,0 L 0,${measurements.skirtLength}` },
    ],
    labels: [
      { x: midX - 40, y: measurements.waistToHips + 60, text: 'Перед юбки', size: 7 },
      { x: midX - 40, y: measurements.waistToHips + 72, text: 'Крой 1 со сгибом', size: 5 },
    ],
    bbox,
    seams: {
      side: store.get('seam.side') as number,
      waist: store.get('seam.waist') as number,
      dartWidth: store.get('dart.width') as number,
    },
  }
}
