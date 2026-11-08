import type { MeasurementId } from '@lecals/core'

/**
 * A schematic female figure with the measurement drawn on it.
 * Coordinates are in a 200 × 420 box, the figure faces the viewer.
 */
type Pt = readonly [number, number]

// Right half of the body outline, top to bottom; mirrored for the left half.
const BODY: Pt[] = [
  [108, 47], [108, 62], [140, 72], [133, 100], [137, 125], [129, 142], [121, 172], [139, 218], [137, 245],
  [121, 322], [124, 352], [111, 394], [119, 412], [101, 412], [103, 394], [104, 352], [104, 322], [102, 262], [100, 256],
]
const ARM: Pt[] = [
  [140, 72], [150, 82], [155, 125], [158, 168], [163, 212], [166, 236], [156, 238], [153, 214], [147, 170], [142, 128], [133, 100],
]

const mirror = (pts: Pt[]) => pts.map(([x, y]) => [200 - x, y] as Pt)
const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')
const bodyOutline = [...BODY, ...mirror(BODY).reverse()]

type Shape =
  | { girth: [cx: number, cy: number, rx: number] }
  | { line: Pt[]; ends?: boolean }
  | { dots: Pt[] }

interface Overlay {
  view: 'front' | 'back'
  shapes: Shape[]
}

const WAIST_Y = 172
const side = (y2: number, x = 152): Shape => ({ line: [[x, WAIST_Y], [x, y2]], ends: true })

const OVERLAYS: Record<MeasurementId, Overlay> = {
  height: { view: 'front', shapes: [{ line: [[182, 10], [182, 412]], ends: true }] },
  bust: { view: 'front', shapes: [{ girth: [100, 125, 37] }] },
  hips: { view: 'front', shapes: [{ girth: [100, 218, 40] }] },
  waist: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }] },
  bustUpper: { view: 'front', shapes: [{ girth: [100, 104, 33] }] },
  bustFull: { view: 'back', shapes: [{ girth: [100, 116, 37] }] },
  underbust: { view: 'front', shapes: [{ girth: [100, 142, 29] }] },
  neck: { view: 'front', shapes: [{ girth: [100, 58, 9] }] },
  shoulderLength: { view: 'front', shapes: [{ line: [[108, 62], [140, 72]], ends: true }] },
  backWidth: { view: 'back', shapes: [{ line: [[68, 100], [132, 100]], ends: true }] },
  chestWidth: { view: 'front', shapes: [{ line: [[68, 98], [132, 98]], ends: true }] },
  bustSpan: { view: 'front', shapes: [{ line: [[82, 125], [118, 125]], ends: true }, { dots: [[82, 125], [118, 125]] }] },
  bustHeight: { view: 'front', shapes: [{ line: [[108, 62], [118, 125]], ends: true }] },
  frontLength: { view: 'front', shapes: [{ line: [[108, 62], [118, 125], [116, WAIST_Y]], ends: true }] },
  backLength: { view: 'back', shapes: [{ line: [[100, 60], [100, WAIST_Y]], ends: true }, { dots: [[100, 60]] }] },
  shoulderSlantBack: { view: 'back', shapes: [{ line: [[100, WAIST_Y], [140, 72]], ends: true }] },
  armholeDepth: {
    view: 'back',
    shapes: [{ line: [[100, 60], [100, 100]], ends: true }, { line: [[66, 100], [134, 100]] }, { dots: [[100, 60]] }],
  },
  upperArm: { view: 'front', shapes: [{ girth: [148, 115, 7.5] }] },
  armDepth: { view: 'front', shapes: [{ line: [[141, 100], [155, 100]], ends: true }] },
  armholeDepthFront: { view: 'front', shapes: [{ line: [[108, 62], [108, 100]], ends: true }, { line: [[66, 100], [134, 100]] }] },
  armholeArc: { view: 'front', shapes: [{ line: [[133, 100], [137, 80], [146, 72], [152, 84], [150, 100]], ends: true }] },
  torsoArc: { view: 'front', shapes: [{ line: [[100, WAIST_Y], [100, 52], [108, 62], [118, 125], [116, WAIST_Y]], ends: true }] },
  wrist: { view: 'front', shapes: [{ girth: [158, 212, 5.5] }] },
  armLength: { view: 'front', shapes: [{ line: [[140, 72], [156, 168], [160, 212]], ends: true }] },
  elbowLength: { view: 'front', shapes: [{ line: [[140, 72], [156, 168]], ends: true }] },
  waistToHips: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, side(218, 148)] },
  crotchDepth: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, side(256)] },
  waistToKnee: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, side(322)] },
  waistToFloor: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, side(412)] },
  waistToFloorBack: { view: 'back', shapes: [{ girth: [100, WAIST_Y, 22] }, { line: [[100, WAIST_Y], [100, 412]], ends: true }] },
  waistToFloorFront: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, { line: [[100, WAIST_Y], [100, 412]], ends: true }] },
  glutealFoldHeight: { view: 'back', shapes: [{ line: [[84, 252], [116, 252]] }, { line: [[100, 252], [100, 412]], ends: true }] },
  inseam: { view: 'front', shapes: [{ line: [[100, 258], [100, 412]], ends: true }] },
  instep: { view: 'front', shapes: [{ girth: [111, 404, 9] }] },
  thigh: { view: 'front', shapes: [{ girth: [119, 250, 17] }] },
  knee: { view: 'front', shapes: [{ girth: [112.5, 322, 8.5] }] },
  calf: { view: 'front', shapes: [{ girth: [114, 350, 10] }] },
  ankle: { view: 'front', shapes: [{ girth: [107.5, 392, 4.5] }] },
  skirtLength: { view: 'front', shapes: [{ girth: [100, WAIST_Y, 22] }, side(300)] },
}

function ShapeView({ s }: { s: Shape }) {
  if ('girth' in s) {
    const [cx, cy, rx] = s.girth
    const ry = Math.max(2.5, rx * 0.22)
    const back = `M ${cx - rx},${cy} A ${rx},${ry} 0 0 1 ${cx + rx},${cy}`
    const front = `M ${cx - rx},${cy} A ${rx},${ry} 0 0 0 ${cx + rx},${cy}`
    return (
      <g className="m-girth">
        <path d={back} className="m-back" />
        <path d={front} />
      </g>
    )
  }
  if ('dots' in s) return <>{s.dots.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={2.6} className="m-dot" />)}</>
  return (
    <g>
      <polyline points={poly(s.line)} className="m-line" />
      {s.ends && [s.line[0]!, s.line.at(-1)!].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={2.2} className="m-dot" />)}
    </g>
  )
}

export function FigureSketch({ id }: { id: MeasurementId }) {
  const o = OVERLAYS[id]
  return (
    <svg className="sketch" viewBox="0 0 200 420" role="img" aria-label={o.view === 'front' ? 'Фигура спереди' : 'Фигура сзади'}>
      <g className="body">
        <circle cx={100} cy={28} r={18} />
        <polygon points={poly(bodyOutline)} />
        <polygon points={poly(ARM)} />
        <polygon points={poly(mirror(ARM))} />
        {o.view === 'back' && <line x1={100} y1={50} x2={100} y2={240} className="spine" />}
      </g>
      {o.shapes.map((s, i) => (
        <ShapeView key={i} s={s} />
      ))}
      <text x={6} y={414} className="view-label">
        {o.view === 'front' ? 'спереди' : 'сзади'}
      </text>
    </svg>
  )
}
