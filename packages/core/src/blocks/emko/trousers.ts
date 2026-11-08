import { Line, add, along, atY, circlesX, dist, mid, mul, norm, rotate, sub, toPiece, v, type Vec } from '../../draft/geom'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Женские брюки, ЕМКО СЭВ (базовая конструкция, без припусков).
 *
 * After «Единая методика конструирования одежды СЭВ», vol. 2, trousers of
 * semi-fitted silhouette: table 9 (pp. 98, 100–101), БК fig. 42 and the
 * waist darts of ИМК fig. 43. Point numbers are the book's, book constants in
 * cm are ×10 here. T-codes (ОСТ 17-326-81 / ГОСТ 31396-2009): Т1 height,
 * Т7 waist height, Т9 knee height (= Т7 − Дтк), Т12 gluteal fold height,
 * Т18 waist, Т19 hips, Т22 knee girth, Т25/Т26 waist to floor at the side and
 * in front, Т27 inside leg length, Т51 instep girth.
 *
 *   41–51 = 0,65·(Т7 − Т12) − 2,0 + П     hip line
 *   51–57 = 0,5·Т19 + П                   width at the hips; back 0,53, front 0,47
 *   51–58 = 0,665·(0,2·Т19 − 2,0) + П     back crotch extension
 *   57–58′ = 0,335·(0,2·Т19 − 2,0) + П    front crotch extension
 *   floor 940: front waist Т26, side waist Т25 + 0,1, crotch line Т27 + 3,0,
 *   knee Т9 + 0,9, hem 0,04·Т1 − 5,0 above the floor
 *   creases in the middle of each half; knee 0,275 / 0,225·Т22 + П,
 *   hem 0,275 / 0,225·Т51 + П either side of the crease
 *   the back is turned about 54 so that its hip line is square to the side
 *   line 742–54 (72–742 = 0,75·|52–54| − 2,5)
 *   crotch curves are arcs: back through 512 and 681 (68–681 = 0,5…3,5 cm),
 *   front through 57 and 68′
 *   waist (ИМК): dт = (0,5·Т19 + П) − (0,5·Т18 + П); two back darts
 *   0,2·dт each, side 0,2·dт on each half, front dart 0,13·dт, centre front 0,07·dт
 *
 * Deviations: 57–58′ is computed by the formula; the book prints 6,10 cm where
 * the formula gives 6,30. The marker 440 (Т8, gluteal point height) is not
 * drawn: it has no measurement in the app and does not shape the base.
 *
 * Frame: x to the right from the back hip point 51, y down from the front
 * waist line (4′–47). Back on the left, front on the right, as in fig. 42.
 */
export interface EmkoTrousersOptions extends Record<string, number> {
  waistEase: number
  hipEase: number
  /** Прибавка к полуширине по колену (сумма для задней и передней половин), mm. */
  kneeEase: number
  /** Прибавка к полуширине по низу, mm. */
  hemEase: number
  /** Прогиб среднего шва сзади 68–681, mm. */
  crotchCurve: number
}

const EASE: Record<Silhouette, { waistEase: number; hipEase: number; kneeEase: number; hemEase: number }> = {
  fitted: { waistEase: 10, hipEase: 10, kneeEase: 50, hemEase: 45 },
  semi: { waistEase: 21.5, hipEase: 20, kneeEase: 73.7, hemEase: 65 },
  straight: { waistEase: 25, hipEase: 30, kneeEase: 90, hemEase: 90 },
}

export const EMKO_TROUSERS_REQUIRED = [
  'height', 'waist', 'hips', 'waistToFloorBack', 'glutealFoldHeight', 'waistToFloor', 'waistToFloorFront',
  'inseam', 'waistToKnee', 'knee', 'instep',
] as const

export const emkoTrousers: BlockDef<EmkoTrousersOptions> = {
  id: 'emko-trousers',
  title: 'Брюки',
  method: 'emko',
  required: EMKO_TROUSERS_REQUIRED,
  options: [
    { id: 'waistEase', short: 'Пт', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 40, step: 1 },
    { id: 'hipEase', short: 'Пб', title: 'Прибавка по бёдрам (к полуобхвату)', min: 0, max: 60, step: 1 },
    { id: 'kneeEase', title: 'Прибавка по колену (к ширине половины брюк)', min: 20, max: 150, step: 1 },
    { id: 'hemEase', title: 'Прибавка по низу (к ширине половины брюк)', min: 20, max: 200, step: 1 },
    {
      id: 'crotchCurve', title: 'Прогиб среднего шва сзади', min: 5, max: 35, step: 1,
      hint: 'Насколько внутрь уходит низ заднего среднего шва (68–681). В учебнике от 0,5 до 3,5 см, по умолчанию 1,5.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], crotchCurve: 15 }),
  draft: draftEmkoTrousers,
}

type M = Record<(typeof EMKO_TROUSERS_REQUIRED)[number], number>

/** Circular arc as cubic Béziers, from `a` around `c` to `b` (short way). */
function arc(line: Line, c: Vec, a: Vec, b: Vec): Line {
  const r = dist(c, a)
  const a0 = Math.atan2(a.y - c.y, a.x - c.x)
  let da = Math.atan2(b.y - c.y, b.x - c.x) - a0
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2)))
  const step = da / n
  const k = (4 / 3) * Math.tan(step / 4) * r
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * step
    const t1 = t0 + step
    const p0 = v(c.x + r * Math.cos(t0), c.y + r * Math.sin(t0))
    const p1 = v(c.x + r * Math.cos(t1), c.y + r * Math.sin(t1))
    line.curve(add(p0, mul(v(-Math.sin(t0), Math.cos(t0)), k)), sub(p1, mul(v(-Math.sin(t1), Math.cos(t1)), k)), p1)
  }
  return line
}

/** Dart with legs equalised to the longer one. */
function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

export function draftEmkoTrousers(m: M, o: EmkoTrousersOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const T9 = m.waistToFloorBack - m.waistToKnee
  const kB = (o.kneeEase * 39.6) / 73.7
  const kF = o.kneeEase - kB
  const hB = (o.hemEase * 35.8) / 65
  const hF = o.hemEase - hB

  // ---- Grid (fig. 42) ----
  const hip = c('41–51', 'Линия бёдер от талии', '0,65·(Т7 − Т12) − 2,0 + П', 0.65 * (m.waistToFloorBack - m.glutealFoldHeight) - 20 + 1.7)
  const W = c('51–57', 'Ширина брюк по бёдрам', '0,5·Т19 + П', 0.5 * m.hips + o.hipEase)
  const wB = c('51–54', 'Задняя половина', '0,53·|51–57|', 0.53 * W)
  const wF = c('54′–57', 'Передняя половина', '0,47·|51–57|', 0.47 * W)
  const extB = c('51–58', 'Шаговый выступ сзади', '0,665·(0,2·Т19 − 2,0) + П', 0.665 * (0.2 * m.hips - 20) + 3.9)
  const extF = c('57–58′', 'Шаговый выступ спереди', '0,335·(0,2·Т19 − 2,0) + П', 0.335 * (0.2 * m.hips - 20) + 3.9)
  const yF = c('44′–940', 'От талии спереди до пола', 'Т26', m.waistToFloorFront)
  const raise = c('940–441′', 'Талия у бока над полом', 'Т25 + 0,1', m.waistToFloor + 1)
  const crotchH = c('940–64', 'Линия шага над полом', 'Т27 + 1,5 + П', m.inseam + 30)
  const kneeH = c('940–74', 'Линия колена над полом', 'Т9 + П (Т9 = Т7 − Дтк)', T9 + 9)
  const hemH = c('940–94', 'Низ брюк над полом', '0,04·Т1 − 5,0', 0.04 * m.height - 50)

  const y51 = hip
  const y64 = yF - crotchH
  const y74 = yF - kneeH
  const y94 = yF - hemH
  const ySide = yF - raise
  if (y64 <= y51 + 20) warnings.push('Линия шага почти на уровне бёдер: проверьте длину ноги по внутренней поверхности и высоту талии.')

  const x51 = 0
  const x54 = wB
  const x57 = W
  const x58 = -extB
  const x58f = W + extF
  const x52 = c('58–52', 'Линия стрелки сзади', '0,5·(|58–51| + |51–54|)', 0.5 * (extB + wB)) + x58
  const x56 = x54 + c('54′–56', 'Линия стрелки спереди', '0,5·(|54′–57| + |57–58′|)', 0.5 * (wF + extF))

  // Legs
  const kneeB = c('72–78', 'Задняя половина по колену (от стрелки)', '0,275·Т22 + П', 0.275 * m.knee + kB)
  const kneeF = c('76–741′', 'Передняя половина по колену (от стрелки)', '0,225·Т22 + П', 0.225 * m.knee + kF)
  const hemB = c('92–98', 'Задняя половина по низу (от стрелки)', '0,275·Т51 + П', 0.275 * m.instep + hB)
  const hemF = c('96–941′', 'Передняя половина по низу (от стрелки)', '0,225·Т51 + П', 0.225 * m.instep + hF)
  const off742 = c('72–742', 'Наклон бока задней половины', '0,75·|52–54| − 2,5', 0.75 * (x54 - x52) - 25)

  const P54 = v(x54, y51)
  const P58 = v(x58, y51)
  const P51 = v(x51, y51)
  const P41 = v(x51, 0)
  const P57 = v(x57, y51)
  const P47 = v(x57, 0)
  const P58f = v(x58f, y51)
  const P68 = v(x58, y64)
  const P68f = v(x58f, y64)
  const P742 = v(x52 + off742, y74)

  // ---- Back turned about 54 ----
  const d = norm(sub(P54, P742)) // up the back side line
  const perp = v(d.y, -d.x) // square to it, towards the back
  const theta = (Math.atan2(perp.y, perp.x) - Math.atan2(0, -1)) * (180 / Math.PI)
  const turn = (p: Vec) => rotate(p, ((theta + 540) % 360) - 180, P54)
  const P511 = turn(P51)
  const P411 = turn(P41)
  const P581 = turn(P58)
  const sideF = y51 - ySide
  const P441 = add(P54, mul(d, sideF))
  const P512 = mid(P51, P511)
  const P681 = add(P68, v(o.crotchCurve, 0))
  const rB = dist(P68, P581)
  const P582 = circlesX(P681, rB, P512, rB, (a, b) => (a.x < b.x ? a : b))
  const rF = y64 - y51
  const P582f = circlesX(P68f, rF, P57, rF, (a, b) => (a.x > b.x ? a : b))

  // ---- Waist and darts (fig. 43) ----
  const wl = c('41–470', 'Талия с прибавкой', '0,5·Т18 + П', 0.5 * m.waist + o.waistEase)
  const dt = c('dт', 'Сумма вытачек', '(0,5·Т19 + П) − (0,5·Т18 + П)', W - wl)
  const sSide = c('441–442', 'Бок по талии (на каждой половине)', '0,2·dт', 0.2 * Math.max(0, dt))
  const sBack = c('421–422', 'Задние вытачки (половина каждой)', '0,1·dт', 0.1 * Math.max(0, dt))
  const sFront = c('46–461', 'Передняя вытачка (половина)', '0,065·dт', 0.065 * Math.max(0, dt))
  const cf = c('47–471', 'Середина переда по талии', '0,07·dт', 0.07 * Math.max(0, dt))
  if (dt <= 0) warnings.push('Талия с прибавкой не меньше бёдер: вытачки не нужны.')

  // Back waist: straight 411–441, side point moved in by 0,2·dт.
  const P442 = along(P441, P411, sSide)
  const ax = norm(sub(P441, P411))
  const down = v(-ax.y, ax.x)
  const onBackWaist = (dist0: number) => add(P411, mul(ax, dist0))
  const d1 = c('411–421', 'Первая задняя вытачка', '0,3·|51–54|', 0.3 * wB)
  const d2 = c('411–43', 'Вторая задняя вытачка', '0,6·|51–54|', 0.6 * wB)
  const l1 = c('421–521', 'Длина первой вытачки', '0,65·|41–51|', 0.65 * hip)
  const l2 = c('43–531', 'Длина второй вытачки', '0,5·|41–51|', 0.5 * hip)
  const bd1 = dart(onBackWaist(d1 - sBack), onBackWaist(d1 + sBack), add(onBackWaist(d1), mul(down, l1)))
  const bd2 = dart(onBackWaist(d2 - sBack), onBackWaist(d2 + sBack), add(onBackWaist(d2), mul(down, l2)))

  // Front waist: level at the centre, rising to the side point 442′.
  const P471 = v(x57 - cf, 0)
  const P441f = v(x54, ySide)
  const P442f = v(x54 + sSide, ySide)
  const lead = 0.1 * wl
  const P460 = v(x57 - lead, 0)
  const lf = c('46–561', 'Длина передней вытачки', '0,45·|41–51|', 0.45 * hip)
  const ease01 = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2
  const frontWaistY = (x: number) => ySide * ease01((P460.x - x) / (P460.x - P442f.x))
  const fdL = v(x56 - sFront, frontWaistY(x56 - sFront))
  const fdR = v(x56 + sFront, frontWaistY(x56 + sFront))
  const fd = dart(fdL, fdR, v(x56, frontWaistY(x56) + lf))

  // ---- Back outline ----
  const P78 = v(x52 - kneeB, y74)
  const P741 = v(x52 + kneeB, y74)
  const P98 = v(x52 - hemB, y94)
  const P941 = v(x52 + hemB, y94)
  const backCrotch = arc(new Line(P512), P582, P512, P681)
  const backSide = new Line(P442).smooth(sub(P54, P442), d.y < 0 ? mul(d, -1) : d, P54, 0.4)
  const backOutline = new Line(P98)
    .to(P78)
    .to(P681)
    .append(backCrotch.reversed())
    .to(P511)
    .to(P411)
    .to(bd1.left)
    .to(bd1.tip)
    .to(bd1.right)
    .to(bd2.left)
    .to(bd2.tip)
    .to(bd2.right)
    .to(P442)
    .append(backSide)
    .to(P741)
    .to(P941)
    .to(P98)

  // ---- Front outline ----
  const P78f = v(x56 + kneeF, y74)
  const P741f = v(x56 - kneeF, y74)
  const P98f = v(x56 + hemF, y94)
  const P941f = v(x56 - hemF, y94)
  const frontCrotch = arc(new Line(P57), P582f, P57, P68f)
  const frontSide = new Line(P442f).smooth(v(-0.2, 1), v(0, 1), P54, 0.4)
  const waistSeg = (a: Vec, b: Vec) => {
    const s = (x: number) => v(1, (frontWaistY(x + 0.5) - frontWaistY(x - 0.5)))
    return new Line(a).smooth(s(a.x), s(b.x), b)
  }
  const frontWaist1 = waistSeg(P442f, fd.left)
  const frontWaist2 = new Line(fd.right).append(waistSeg(fd.right, P460)).to(P471)
  const frontOutline = new Line(P941f)
    .to(P741f)
    .to(P54)
    .append(frontSide.reversed())
    .append(frontWaist1)
    .to(fd.tip)
    .append(frontWaist2)
    .to(P57)
    .append(frontCrotch)
    .to(P78f)
    .to(P98f)
    .to(P941f)

  // ---- Checks ----
  const inseamB = dist(P681, P78) + dist(P78, P98)
  const inseamF = dist(P68f, P78f) + dist(P78f, P98f)
  const sideB = backSide.length() + dist(P54, P741) + dist(P741, P941)
  const sideF2 = frontSide.length() + dist(P54, P741f) + dist(P741f, P941f)
  const waistB = dist(P411, bd1.left) + dist(bd1.right, bd2.left) + dist(bd2.right, P442)
  const waistF = frontWaist1.length() + frontWaist2.length()
  const waistTotal = 2 * (waistB + waistF)

  const backPiece = toPiece({
    id: 'emko-trousers-back',
    title: 'Задняя половина брюк',
    outline: backOutline,
    extra: [
      { role: 'mark', line: new Line(v(x52, y51)).to(v(x52, y94)) },
      { role: 'mark', line: new Line(P511).to(P54) },
      { role: 'mark', line: new Line(P681).to(atY(P54, P741, y64)) },
      { role: 'mark', line: new Line(P78).to(P741) },
    ],
    grain: [v(x52 + 15, y64 + 60), v(x52 + 15, y74 - 60)],
    labels: [
      { at: v(x52 - 70, y64 + 100), text: 'Задняя половина', size: 7 },
      { at: v(x52 - 70, y64 + 112), text: 'Крой 2 (зеркально)' },
      { at: v(x52 - 70, y64 + 122), text: 'ЕМКО СЭВ · без припусков' },
      { at: v(x52 + 4, y94 - 70), text: 'стрелка', size: 4 },
    ],
    seams: { inseam: inseamB, side: sideB, waist: waistB },
  })
  const frontPiece = toPiece({
    id: 'emko-trousers-front',
    title: 'Передняя половина брюк',
    outline: frontOutline,
    extra: [
      { role: 'mark', line: new Line(v(x56, y51)).to(v(x56, y94)) },
      { role: 'mark', line: new Line(P54).to(P57) },
      { role: 'mark', line: new Line(atY(P54, P741f, y64)).to(P68f) },
      { role: 'mark', line: new Line(P741f).to(P78f) },
    ],
    grain: [v(x56 - 15, y64 + 60), v(x56 - 15, y74 - 60)],
    labels: [
      { at: v(x56 - 60, y64 + 100), text: 'Передняя половина', size: 7 },
      { at: v(x56 - 60, y64 + 112), text: 'Крой 2 (зеркально)' },
      { at: v(x56 - 60, y64 + 122), text: 'ЕМКО СЭВ · без припусков' },
    ],
    seams: { inseam: inseamF, side: sideF2, waist: waistF },
  })

  return {
    pieces: [backPiece, frontPiece],
    points: {
      P41, P51, P54, P57, P47, P58, P58f, P68, P68f, P681, P742, P511, P411, P581, P441, P512, P582, P582f,
      P442, P471, P441f, P442f, P460, P78, P741, P98, P941, P78f, P741f, P98f, P941f,
      dartBack1Tip: bd1.tip, dartBack2Tip: bd2.tip, dartFrontTip: fd.tip,
      crease52: v(x52, y51), crease56: v(x56, y51),
    },
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний (±1,5 см)', sideB, sideF2, 0, 15),
      check('inseam', 'Шаговые срезы: задний и передний (±1,5 см, сзади посадка)', inseamB, inseamF, 0, 15),
      check('waist', 'Талия брюк и обхват талии с прибавкой (От + 2·Пт)', waistTotal, m.waist + 2 * o.waistEase, 0, 15),
    ],
    warnings,
  }
}
