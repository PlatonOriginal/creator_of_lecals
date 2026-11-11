import { Line, along, dist, norm, sub, through, v, type Vec } from '../../draft/geom'
import { Outline, netPiece, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Прямая юбка, система М. Мюллер и сын (основа, без припусков).
 *
 * After «М. Мюллер и сын. Основные конструкции. Сборник» (Библиотека журнала
 * «Ательє», 2005), pp. 1–4, fig. 1–4: straight skirt with one dart in each
 * half of the front and one or two darts in each half of the back. Point
 * numbers are the book's. All values in mm; the book's cm are ×10.
 *
 *   1–2   = ВБ (высота бёдер, 20–22 см)        hip line
 *   2–4   = 0,5·ОБ + 1…2                       half-skirt width at the hips
 *   4–5   = 0,5·|2–4|                          side line (front and back equal)
 *   1–11  = 0,5·ОТ + 1                         waist with ease
 *   11–8  = |2–4| − |1–11|                     all waist suppression of a half
 *   6–10  = 1…1,5                              side waist raise
 *   side:  half the suppression (+0…1 см), 3,5 + 3,5 in the example;
 *   front dart 1,5–2,5, its axis 6–8 from the side, length 9–10;
 *   back: the rest. Up to 3–4 см — one dart in the middle of the back waist,
 *   length 13–15; more (sum over 12–13 см) — two darts: the first 3–4 at 5–7
 *   from the centre back, length 13–15, legs raised 0,3–0,4; the second 2–3
 *   halfway between the first and the side, length 12–13; the side seam is then
 *   moved 0,5 to the front at the top.
 *   Dart legs are raised 0,5–0,7 above the top line of the grid.
 *
 * The book's example (size 40, ОТ 76, ОБ 100, ВБ 20,8): 51 − 39 = 12 см,
 * side 7, front 2, back 3.
 *
 * The book draws the front on the left. To compare with ЕМКО in one frame we
 * draw it as ЕМКО does: x to the right from the centre back, y down from the
 * top line of the grid; the back half on the left, the front half on the right.
 * The length (Ди) is taken at the side, as everywhere in the app.
 */
export interface MullerSkirtOptions extends Record<string, number> {
  /** Прибавка к полуобхвату талии, mm (в книге 1 см, при шитье сутюживается). */
  waistEase: number
  /** Прибавка к полуобхвату бёдер, mm (в книге 1–2 см). */
  hipEase: number
  /** Подъём талии у бока, точка 10, mm (в книге 1–1,5 см). */
  sideRaise: number
  /** Раствор передней вытачки, mm (в книге 1,5–2,5 см). */
  frontDart: number
  /** Сколько сверх половины суммы вытачек уходит в бок, mm (в книге 0–1 см). */
  sideExtra: number
}

const EASE: Record<Silhouette, { waistEase: number; hipEase: number }> = {
  fitted: { waistEase: 10, hipEase: 10 },
  semi: { waistEase: 10, hipEase: 15 },
  straight: { waistEase: 10, hipEase: 20 },
}

export const MULLER_SKIRT_REQUIRED = ['waist', 'hips', 'waistToHips', 'skirtLength'] as const

export const mullerSkirt: BlockDef<MullerSkirtOptions> = {
  id: 'muller-skirt',
  title: 'Прямая юбка',
  method: 'muller',
  garment: 'skirt',
  required: MULLER_SKIRT_REQUIRED,
  options: [
    { id: 'waistEase', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 20, step: 1 },
    { id: 'hipEase', title: 'Прибавка по бёдрам (к полуобхвату)', min: 0, max: 40, step: 1 },
    { id: 'sideRaise', title: 'Подъём талии у бока', min: 0, max: 20, step: 1, hint: 'В книге 1–1,5 см, больше — при пышных бёдрах.' },
    { id: 'frontDart', title: 'Раствор передней вытачки', min: 0, max: 30, step: 1, hint: 'В книге 1,5–2,5 см.' },
    { id: 'sideExtra', title: 'Добавка к боковым срезам', min: 0, max: 10, step: 1, hint: 'Сколько сверх половины суммы вытачек забрать в боковые швы (в книге 0–1 см).' },
  ],
  defaults: (s) => ({ ...EASE[s], sideRaise: 10, frontDart: 20, sideExtra: 10 }),
  draft: draftMullerSkirt,
}

type M = Record<(typeof MULLER_SKIRT_REQUIRED)[number], number>

/** Dart with legs equalised to the longer one. */
function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

const LEVEL = v(1, 0)

export function draftMullerSkirt(m: M, o: MullerSkirtOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []

  const hip = c('1–2', 'Линия бёдер от талии', 'ВБ', m.waistToHips)
  const W = c('2–4', 'Ширина юбки по бёдрам', '0,5·ОБ + прибавка', 0.5 * m.hips + o.hipEase)
  const half = c('4–5', 'Положение бокового шва', '0,5·|2–4|', 0.5 * W)
  const wl = c('1–11', 'Талия с прибавкой', '0,5·ОТ + прибавка', 0.5 * m.waist + o.waistEase)
  const d = Math.max(0, c('11–8', 'Сумма вытачек', '|2–4| − |1–11|', W - wl))
  const raise = c('6–10', 'Подъём талии у бока', '1…1,5 см', o.sideRaise)
  const len = c('1–3', 'Длина юбки на сетке', 'Ди − подъём у бока', m.skirtLength - raise)

  const side = c('бок', 'В боковые срезы', '0,5·(11–8) + 0…1 см', Math.min(d, 0.5 * d + o.sideExtra))
  const front = c('в. пер.', 'Передняя вытачка', '1,5–2,5 см', Math.min(o.frontDart, d - side))
  const back = c('в. зад.', 'Вытачки сзади', '(11–8) − бок − перед', d - side - front)
  const two = back > 40
  // Two darts: the first takes 3–4 см, the second the rest (2–3 см in the book).
  const back1 = two ? Math.min(40, Math.max(30, back - 30)) : back
  const back2 = back - back1
  const shift = two ? 5 : 0

  if (d <= 0) warnings.push('Талия с прибавкой не меньше бёдер: вытачки не нужны.')
  if (back2 > 30) warnings.push(`Сумма вытачек ${fmt(d)} больше, чем допускает книга: вторая задняя вытачка ${fmt(back2)} шире 3 см.`)
  if (side > 90) warnings.push(`Боковой срез забирает ${fmt(side)} на талии: бок получится очень крутым, проверьте мерки.`)

  // Side (fig. 2): from 10 to either side by half of the side amount; with two
  // back darts the seam is moved 0,5 to the front at the top (fig. 4).
  const P10 = v(half, -raise)
  const Pb = v(half - side / 2 + shift, -raise)
  const Pf = v(half + side / 2 + shift, -raise)
  const P5 = v(half, hip)
  const P1b = v(0, 0) // centre back
  const P2b = v(0, hip)
  const P3b = v(0, len)
  const P1f = v(W, 0) // centre front
  const P2f = v(W, hip)
  const P3f = v(W, len)
  const P7 = v(half, len)

  const lift = 6 // legs raised 0,5–0,7 above the grid line
  const mk = (x: number, w: number, length: number, up = lift) =>
    dart(v(x - w / 2, -up), v(x + w / 2, -up), v(x, length))

  const xf = c('пер. ось', 'Ось передней вытачки от бока', '6–8 см', 70)
  const lf = c('пер. длина', 'Длина передней вытачки', '9–10 см', 95)
  const dF = mk(Pf.x + xf, front, lf)

  const backDarts = two
    ? (() => {
        const x1 = c('зад. ось 1', 'Ось задней вытачки от середины', '5–7 см', 60)
        const l1 = c('зад. длина 1', 'Длина задней вытачки', '13–15 см', 140)
        const x2 = c('зад. ось 2', 'Ось задней боковой вытачки', 'посередине до бока', (x1 + Pb.x) / 2)
        const l2 = c('зад. длина 2', 'Длина задней боковой вытачки', '12–13 см', 125)
        return [mk(x1, back1, l1, 3.5), mk(x2, back2, l2)]
      })()
    : back > 0
      ? (() => {
          const x1 = c('зад. ось', 'Ось задней вытачки', 'середина талии сзади', Pb.x / 2)
          const l1 = c('зад. длина', 'Длина задней вытачки', '13–15 см', 140)
          return [mk(x1, back1, l1)]
        })()
      : []

  // Side curves: square to the waist at the top, vertical at the hip line.
  const sideDir = (top: Vec) => sub(v(half, hip * 0.5), top)
  const sideBack = through([Pb, P5], sideDir(Pb), v(0, 1))
  const sideFront = through([Pf, P5], sideDir(Pf), v(0, 1))
  const square = (dir: Vec) => {
    const n = norm(dir)
    return v(n.y, -n.x) // the perpendicular pointing right
  }
  const atBackSide = square(sideDir(Pb))
  const atFrontSide = square(sideDir(Pf))

  // Waist of the back: centre → darts → side.
  const backPts: Vec[] = [P1b]
  for (const k of backDarts) backPts.push(k.left, k.right)
  backPts.push(Pb)
  const backOut = new Outline(P3b, 'cb', 'fold').to(P2b).to(P1b).edge('waist')
  let waistBack = 0
  for (let i = 0; i < backPts.length; i += 2) {
    const a = backPts[i]!
    const b = backPts[i + 1]!
    const seg = through([a, b], LEVEL, b === Pb ? atBackSide : LEVEL)
    waistBack += seg.length()
    backOut.append(seg)
    const k = backDarts[i / 2]
    if (k && b === k.left) backOut.dart(i === 0 ? 'waist' : 'waist2', k.tip, k.right, 'a')
  }
  const backEdges = backOut.edge('side').append(sideBack).to(P7).edge('hem').close()

  const waistF1 = through([Pf, dF.left], atFrontSide, LEVEL)
  const waistF2 = through([dF.right, P1f], LEVEL, LEVEL)
  const waistFront = waistF1.length() + waistF2.length()
  const frontEdges = new Outline(P7, 'side')
    .to(P5)
    .append(sideFront.reversed())
    .edge('waist')
    .append(waistF1)
    .dart('waist', dF.tip, dF.right, 'b')
    .append(waistF2)
    .edge('cf', 'fold')
    .to(P3f)
    .edge('hem')
    .close()

  const sideBackLen = sideBack.length() + (len - hip)
  const sideFrontLen = sideFront.length() + (len - hip)

  const levels = { hip }
  const backPanel: Panel = {
    id: 'muller-skirt-back',
    title: 'Заднее полотнище юбки',
    role: 'skirtBack',
    method: 'Мюллер',
    edges: backEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(P2b).to(P5) }],
    grain: [v(half * 0.4, hip + 40), v(half * 0.4, len - 60)],
    cut: 'Крой 1 со сгибом',
    labelAt: v(12, hip + 70),
    notes: [{ at: v(12, hip - 6), text: 'линия бёдер', size: 4 }],
    levels,
    notches: [],
    seams: { side: sideBackLen, waist: waistBack, hem: half, dart: back },
  }
  const frontPanel: Panel = {
    id: 'muller-skirt-front',
    title: 'Переднее полотнище юбки',
    role: 'skirtFront',
    method: 'Мюллер',
    edges: frontEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(P5).to(P2f) }],
    grain: [v(half + half * 0.6, hip + 40), v(half + half * 0.6, len - 60)],
    cut: 'Крой 1 со сгибом',
    labelAt: v(half + 12, hip + 70),
    notes: [{ at: v(half + 12, hip - 6), text: 'линия бёдер', size: 4 }],
    levels,
    notches: [],
    seams: { side: sideFrontLen, waist: waistFront, hem: W - half, dart: front },
  }

  const waistTotal = 2 * (waistBack + waistFront)
  const points: Record<string, Vec> = {
    waistCB: P1b, hipCB: P2b, hemCB: P3b,
    waistCF: P1f, hipCF: P2f, hemCF: P3f,
    hipSide: P5, hemSide: P7, waistSideTop: P10,
    waistSideBack: Pb, waistSideFront: Pf,
    dartFrontLeft: dF.left, dartFrontRight: dF.right, dartFrontTip: dF.tip,
  }
  const names = backDarts.length === 2 ? ['dartBack', 'dartBackSide'] : ['dartBack']
  backDarts.forEach((k, i) => {
    points[`${names[i]}Left`] = k.left
    points[`${names[i]}Right`] = k.right
    points[`${names[i]}Tip`] = k.tip
  })

  return {
    panels: [backPanel, frontPanel],
    pieces: [backPanel, frontPanel].map(netPiece),
    points,
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний', sideBackLen, sideFrontLen, 0, 3),
      check('waist', 'Талия юбки и обхват талии с прибавкой (ОТ + 2·прибавка)', waistTotal, m.waist + 2 * o.waistEase, 0, 15),
    ],
    warnings,
  }
}

const fmt = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`
