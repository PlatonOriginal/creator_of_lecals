import { Line, add, along, dist, lineX, mid, mul, norm, sub, through, v, type Vec } from '../../draft/geom'
import { Outline, netPiece, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Стандартные брюки, система М. Мюллер и сын (основа, без припусков).
 *
 * After «М. Мюллер и сын. Основные конструкции. Сборник» (Библиотека журнала
 * «Ателье», 2005), pp. 6–9, fig. 1–7: «Построение основы чертежа
 * стандартных брюк» on a typical figure, size 40. Point numbers are the
 * book's; values in mm.
 *
 * Front (fig. 1–3), on a vertical that is the side line:
 *   1–2 = 1…1,5 (side raise), 1–3 = Вс (crotch depth), 3–4 = Вк = 0,4·Дш
 *   (Дш = Дсб − Вс), 1–5 = Дсб, 5–6 = 3–4 (shortened for the heel),
 *   3–7 = 1/10·½Об + 3 up (hip line), 7–8 = Шпп = ¼Об − 1,
 *   8–9 = 1/10·½Об + 0,5…1 (front crotch extension), 11 = middle of 7–9,
 *   crease 11–12, 12–15 = 12–16 = ¼Шн − 1, 15a/16a 4–8 above the hem,
 *   lines 7–15a and 9–16a give 3a, 17, 18, 19; 10–20 = 0,5…1, fly through
 *   8 + 0,5; 8a–8b = ½|8a–17|; 20–21 = ¼От + dart 1,5…2,5 + 0…0,5;
 *   21–22 = 1…1,5 up; dart 9–10 long in the middle of 14–22.
 * Back (fig. 4–6): 11–25 = 1…2 towards the crotch, 25–26 = ¼Шзп
 *   (Шзп = ¼Об + 1 + 0…1), 27 on the side 3–5 above 3a; the centre back
 *   line is square to 26–27 at 26; 26–27 moved up to 28–29 with |28–29| = Шзп
 *   and 29 on the hip line; 25–30 = |25–29|; knee and hem lines 2 wider than
 *   the front each side (31–34); 32→29 to the waist = 35; 13–36 =
 *   |13–35| − 0…1 on the centre back; 36–37 = 0,5…1; 37–38 = ¼От + dart 3…4
 *   + 0…0,5; dart 13–15 long square to the waist; inseam 39 on 31–30 so that
 *   it is 0…0,5 shorter than the front inseam.
 *
 * Measurements: От, Об, Дсб (waist to floor at the side), Вс (crotch depth)
 * and the instep for the hem width (the book gives Шн 42 for size 40 without
 * a formula; we take Опс + ease).
 *
 * Frame: y down from the front waist line (point 1). The front is drawn as in
 * the book with the side on the left of its piece; the back is mirrored and
 * put on the left, so the side seams face each other as in ЕМКО.
 */
export interface MullerTrousersOptions extends Record<string, number> {
  /** Прибавка к ¼От спереди и сзади (на посадку), mm. */
  waistEase: number
  /** Прибавка к ширине задней половинки, mm (в книге 0–1 см). */
  hipEase: number
  frontDart: number
  backDart: number
  /** Подъём талии у бока, mm (1–1,5 см). */
  sideRaise: number
  /** Расстояние 3a–27, mm: 3 см для выпуклых ягодиц, 5 см для плоских. */
  seatSlant: number
  /** Укорочение на каблук, mm (3–4 см). */
  shorten: number
  /** Прибавка к обхвату подъёма для ширины низа, mm. */
  hemEase: number
}

const EASE: Record<Silhouette, Pick<MullerTrousersOptions, 'waistEase' | 'hipEase'>> = {
  fitted: { waistEase: 0, hipEase: 0 },
  semi: { waistEase: 3, hipEase: 5 },
  straight: { waistEase: 5, hipEase: 10 },
}

export const MULLER_TROUSERS_REQUIRED = ['waist', 'hips', 'waistToFloor', 'crotchDepth', 'instep'] as const

export const mullerTrousers: BlockDef<MullerTrousersOptions> = {
  id: 'muller-trousers',
  title: 'Брюки',
  method: 'muller',
  garment: 'trousers',
  required: MULLER_TROUSERS_REQUIRED,
  options: [
    { id: 'waistEase', title: 'Прибавка по талии (к ¼От, на посадку)', min: 0, max: 10, step: 1, hint: 'В книге 0–0,5 см.' },
    { id: 'hipEase', title: 'Прибавка к ширине задней половинки', min: 0, max: 30, step: 1, hint: 'В книге 0–1 см.' },
    { id: 'frontDart', title: 'Вытачка передней половинки', min: 0, max: 30, step: 1, hint: 'В книге 1,5–2,5 см.' },
    { id: 'backDart', title: 'Вытачка задней половинки', min: 0, max: 50, step: 1, hint: 'В книге 3–4 см.' },
    { id: 'sideRaise', title: 'Подъём талии у бока', min: 0, max: 20, step: 1, hint: 'В книге 1–1,5 см.' },
    { id: 'seatSlant', title: 'Наклон среднего шва сзади (3a–27)', min: 20, max: 60, step: 5, hint: '3 см для выпуклых ягодиц, 5 см для плоских.' },
    { id: 'shorten', title: 'Укорочение на каблук', min: 0, max: 60, step: 5, hint: 'В книге 3–4 см от пола.' },
    { id: 'hemEase', title: 'Ширина низа: прибавка к обхвату подъёма', min: 0, max: 300, step: 10, hint: 'В книге низ 42 см для размера 40.' },
  ],
  defaults: (s) => ({ ...EASE[s], frontDart: 20, backDart: 35, sideRaise: 12, seatSlant: 40, shorten: 35, hemEase: 100 }),
  draft: draftMullerTrousers,
}

type M = Record<(typeof MULLER_TROUSERS_REQUIRED)[number], number>

function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

export function draftMullerTrousers(m: M, o: MullerTrousersOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []

  const Vs = c('1–3', 'Высота сидения', 'Вс', m.crotchDepth)
  const Dsh = c('Дш', 'Длина шага', 'Дсб − Вс', m.waistToFloor - Vs)
  const Vk = c('3–4', 'Высота колена от линии шага', '½Дш − 1/10·Дш', 0.4 * Dsh)
  const len = c('1–6', 'Длина брюк сбоку', 'Дсб − 3…4', m.waistToFloor - o.shorten)
  const hipUp = c('3–7', 'Линия бёдер над линией шага', '1/10·½Об + 3', 0.05 * m.hips + 30)
  const Wf = c('7–8', 'Ширина передней половинки', '¼Об − 1', 0.25 * m.hips - 10)
  const ext = c('8–9', 'Ширина шага передней половинки', '1/10·½Об + 0,5…1', 0.05 * m.hips + 7.5)
  const Wb = c('Шзп', 'Ширина задней половинки', '¼Об + 1 + 0…1', 0.25 * m.hips + 10 + o.hipEase)
  const Shn = c('Шн', 'Ширина низа', 'Опс + прибавка', m.instep + o.hemEase)

  // Front grid
  const y3 = Vs
  const y7 = Vs - hipUp
  const y4 = Vs + Vk
  const P7 = v(0, y7)
  const P8 = v(Wf, y7)
  const P9 = v(Wf + ext, y7)
  const x11 = (Wf + ext) / 2
  const P11 = v(x11, y7)
  const P12 = v(x11, len)
  const P13 = v(x11, y4)
  const P14 = v(x11, 0)
  const hf = c('12–15', 'Половина низа передней половинки', '¼Шн − 1', 0.25 * Shn - 10)
  const P15 = v(x11 - hf, len)
  const P16 = v(x11 + hf, len)
  const up = 60 // 15–15a, 4–8 см
  const P15a = v(P15.x, len - up)
  const P16a = v(P16.x, len - up)
  const P3a = lineX(P7, P15a, v(0, y3), v(1, y3))
  const P17 = lineX(P9, P16a, v(0, y3), v(1, y3))
  const P18 = lineX(P7, P15a, v(0, y4), v(1, y4))
  const P19 = lineX(P9, P16a, v(0, y4), v(1, y4))
  const P8a = v(Wf, y3)
  const P10 = v(Wf, 0)
  const P20 = v(Wf - c('10–20', 'Отклонение банта', '0,5…1', 7.5), 0)
  const P8c = v(Wf + 5, y7)
  const P8b = lineX(P20, P8c, v(0, y3 - dist(P8a, P17) / 2), v(1, y3 - dist(P8a, P17) / 2))
  const P21 = v(P20.x - c('20–21', 'Талия передней половинки', '¼От + вытачка + 0…0,5', 0.25 * m.waist + o.frontDart + o.waistEase), 0)
  const P22 = v(P21.x, -o.sideRaise)
  const P23 = v(P18.x + 5, y4)
  const P24 = v(P19.x - 5, y4)

  // Front dart in the middle of 14–22, square to the hip line, 9–10 long.
  const xd = (P14.x + P22.x) / 2
  const fd = dart(v(xd - o.frontDart / 2, 0), v(xd + o.frontDart / 2, 0), v(xd, 95))

  const frontSide = through([P22, P7, P3a, P23, P15a], v(-0.15, 1), v(0, 1)).to(P15)
  const frontInseam = through([P17, P24, P16a], sub(P24, P17), v(0, 1)).to(P16)
  const frontCrotch = new Line(P20).to(P8b).smooth(sub(P8b, P20), v(1, 0), P17, 0.55)
  const frontWaist1 = new Line(P22).smooth(v(1, 0.05), v(1, 0), fd.left)
  const frontWaist2 = new Line(fd.right).to(P20)
  const frontEdges = new Outline(P15, 'side')
    .append(frontSide.reversed())
    .edge('waist')
    .append(frontWaist1)
    .dart('waist', fd.tip, fd.right, 'b')
    .append(frontWaist2)
    .edge('crotch')
    .append(frontCrotch)
    .edge('inseam')
    .append(frontInseam)
    .edge('hem')
    .close()

  // Back (fig. 4–6), in the same grid.
  const P25 = v(x11 + c('11–25', 'Смещение сгиба задней половинки', '1…2', 15), y7)
  const P26 = v(P25.x + Wb / 4, y7)
  const P27 = lineX(P7, P15a, v(0, y3 - o.seatSlant), v(1, y3 - o.seatSlant))
  const u = norm(sub(P27, P26))
  let n = v(-u.y, u.x)
  if (n.y > 0) n = mul(n, -1) // upwards
  // 28 on the centre back line so that 29 = 28 + Шзп·u lies on the hip line.
  const t = (y7 - Wb * u.y - P26.y) / n.y
  const P28 = add(P26, mul(n, t))
  const P29 = add(P28, mul(u, Wb))
  const P30 = v(P25.x + dist(P25, P29), y7)
  const P31 = v(P19.x + 20, y4)
  const P32 = v(P18.x - 20, y4)
  const P33 = v(P15.x - 20, len)
  const P34 = v(P16.x + 20, len)
  const P33a = v(P33.x, len - up)
  const P34a = v(P34.x, len - up)
  const P35 = lineX(P32, P29, v(0, 0), v(1, 0))
  // 36 on the centre back line with |13–36| = |13–35| − 0,5.
  const r36 = dist(P13, P35) - 5
  const P36 = (() => {
    // Solve |P26 + s·n − P13| = r36 for the upper root.
    const d = sub(P26, P13)
    const b = d.x * n.x + d.y * n.y
    const cc = d.x * d.x + d.y * d.y - r36 * r36
    const s = -b + Math.sqrt(Math.max(0, b * b - cc))
    return add(P26, mul(n, s))
  })()
  const P37 = along(P36, P35, 7.5)
  const wb = c('37–38', 'Талия задней половинки', '¼От + вытачка + 0…0,5', 0.25 * m.waist + o.backDart + o.waistEase)
  const P38 = along(P37, P35, wb)
  const wDir = norm(sub(P35, P37))
  const bdC = mid(P37, P38)
  const bdDown = norm(v(-wDir.y, wDir.x).y > 0 ? v(-wDir.y, wDir.x) : v(wDir.y, -wDir.x))
  const bd = dart(along(bdC, P37, o.backDart / 2), along(bdC, P38, o.backDart / 2), add(bdC, mul(bdDown, 140)))

  const backSide = through([P38, P29, P32, P33a], sub(P29, P38), v(0, 1)).to(P33)
  // Inseam: 39 on the line 31–30 so that the back inseam is 0,25 shorter.
  const inseamF = frontInseam.length()
  const lowerB = dist(P31, P34a) + dist(P34a, P34)
  const P39 = along(P31, P30, Math.max(10, inseamF - 2.5 - lowerB))
  const backInseam = through([P39, P31, P34a], sub(P31, P39), v(0, 1)).to(P34)
  const backCrotch = new Line(P37).to(P28).smooth(sub(P28, P37), v(1, 0.15), P39, 0.6)

  const backWaist1 = new Line(P38).to(bd.right)
  const backWaist2 = new Line(bd.left).to(P37)
  const backRaw = new Outline(P33, 'side')
    .append(backSide.reversed())
    .edge('waist')
    .append(backWaist1)
    .dart('waist', bd.tip, bd.left, 'b')
    .append(backWaist2)
    .edge('crotch')
    .append(backCrotch)
    .edge('inseam')
    .append(backInseam)
    .edge('hem')
    .close()

  // Put the back on the left, mirrored, side seams facing each other.
  const gap = 40
  const flip = (q: Vec) => v(-q.x - gap, q.y)
  const backEdges = backRaw.map((e) => ({ ...e, line: e.line.map(flip) }))

  const sideF = frontSide.length()
  const sideB = backSide.length()
  const inseamB = backInseam.length()
  const waistF = frontWaist1.length() + frontWaist2.length()
  const waistB = backWaist1.length() + backWaist2.length()
  const waistTotal = 2 * (waistF + waistB)

  if (P39.y < y7) warnings.push('Задний шаговый срез получился короче нормы: проверьте высоту сидения и длину сбоку.')
  if (P28.y > P26.y) warnings.push('Средний шов сзади построился ниже линии бёдер: проверьте мерки.')

  const levels = { hip: y7, knee: y4 }
  const front: Panel = {
    id: 'muller-trousers-front',
    title: 'Передняя половинка брюк',
    role: 'trousersFront',
    method: 'Мюллер',
    edges: frontEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(P7).to(P9) },
      { role: 'mark', line: new Line(P3a).to(P17) },
      { role: 'mark', line: new Line(P18).to(P19) },
    ],
    grain: [v(x11, y3 + 60), v(x11, len - 120)],
    cut: 'Крой 2',
    labelAt: v(x11 - 60, y4 - 120),
    notes: [],
    levels,
    notches: [],
    seams: { side: sideF, inseam: inseamF, waist: waistF },
  }
  const back: Panel = {
    id: 'muller-trousers-back',
    title: 'Задняя половинка брюк',
    role: 'trousersBack',
    method: 'Мюллер',
    edges: backEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(flip(P29)).to(flip(P30)) },
      { role: 'mark', line: new Line(flip(P32)).to(flip(P31)) },
    ],
    grain: [flip(v(P25.x, y3 + 60)), flip(v(P25.x, len - 120))],
    cut: 'Крой 2',
    labelAt: flip(v(P25.x + 60, y4 - 120)),
    notes: [],
    levels,
    notches: [],
    seams: { side: sideB, inseam: inseamB, waist: waistB },
  }

  return {
    panels: [back, front],
    pieces: [back, front].map(netPiece),
    points: {
      P3a, P7, P8, P8a, P8b, P9, P10, P11, P12, P13, P14, P15, P15a, P16, P16a, P17, P18, P19, P20, P21, P22, P23, P24,
      P25, P26, P27, P28, P29, P30, P31, P32, P33, P34, P35, P36, P37, P38, P39,
      waistCF: P20, waistSideFront: P22, hipSideFront: P7, crotchFront: P17, kneeFront: P13, hemFront: P12,
      waistCB: flip(P37), waistSideBack: flip(P38), hipSideBack: flip(P29), crotchBack: flip(P39),
      dartFrontTip: fd.tip, dartBackTip: flip(bd.tip),
    },
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний (±1,5 см)', sideB, sideF, 0, 15),
      check('inseam', 'Шаговые срезы: задний на 0–0,5 см короче', inseamB, inseamF, -2.5, 5),
      check('waist', 'Талия брюк и обхват талии с прибавкой (От + 4·П)', waistTotal, m.waist + 4 * o.waistEase, 0, 15),
    ],
    warnings,
  }
}
