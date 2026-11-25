import { Line, add, along, atY, circlesX, dist, mid, mul, norm, rotate, sub, v, type Vec } from '../../draft/geom'
import type { MaleMeasurements } from '../../measurements/male/schema'
import { Outline, netPiece, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Мужские классические/повседневные брюки, ЕМКО СЭВ (базовая конструкция без припусков).
 *
 * Источник: «Единая методика конструирования одежды СЭВ», т. 3, разд. 7,
 * табл. 7.2 (с. 112), табл. 7.3 (с. 115), табл. 7.4 (с. 117–118).
 * Константы методики (см) переведены в мм (×10).
 *
 * Прибавки разделены на пользовательскую свободу ПС (опции), пакет ПП и
 * технологический припуск ПТ: П = ПС + ПП + ПТ.
 */
export interface EmkoMaleTrousersOptions extends Record<string, number> {
  /** ПС по талии (к полуширине 0,5·Т18), мм. */
  waistEase: number
  /** ПС по бёдрам (к полуширине 0,5·Т19), мм. */
  hipEase: number
  /** ПС по колену (к полуширине задней половины), мм. */
  kneeEase: number
  /** ПС по низу (к полуширине задней половины), мм. */
  hemEase: number
  /** ПС положения низа над полом (940–94 = 0,04·Т1 − ПС), мм (0…70). */
  hemHeightEase: number
  /** Прогиб среднего шва сзади (68–681), мм (5…35). */
  crotchCurve: number
}

/** Пакет (ПП) и технологический припуск (ПТ) по табл. 7.2 ЕМКО СЭВ т. 3, мм. */
export const EMKO_MALE_TROUSERS_ALLOWANCES = {
  hipRisePt: 1.6,        // ПТ в 41–51
  hipPp: 12.5,           // ПП по бёдрам 51–57
  hipPt: 5.4,            // ПТ по бёдрам 51–57
  crotchBackPs: 10.0,    // ПС шагового выступа сзади 51–58
  crotchBackPp: 3.0,     // ПП шагового выступа сзади 51–58
  crotchBackPt: 1.4,     // ПТ шагового выступа сзади 51–58
  crotchFrontPs: 5.0,    // ПС шагового выступа спереди 57–58′
  crotchFrontPp: 3.0,    // ПП шагового выступа спереди 57–58′
  crotchFrontPt: 0.7,    // ПТ шагового выступа спереди 57–58′
  kneePp: 3.5,           // ПП по колену
  kneePt: 1.3,           // ПТ по колену
  hemPp: 2.0,            // ПП по низу
  hemPt: 1.2,            // ПТ по низу
  waistPp: 16.5,         // ПП по поясу 41–470
  waistPt: 4.7,          // ПТ по поясу 41–470
} as const

const EASE: Record<Silhouette, { waistEase: number; hipEase: number; kneeEase: number; hemEase: number; hemHeightEase: number }> = {
  fitted: { waistEase: 5, hipEase: 5, kneeEase: 15, hemEase: 18, hemHeightEase: 40 },
  semi: { waistEase: 10, hipEase: 10, kneeEase: 22, hemEase: 25, hemHeightEase: 30 },
  straight: { waistEase: 20, hipEase: 25, kneeEase: 45, hemEase: 50, hemHeightEase: 15 },
}

export const EMKO_MALE_TROUSERS_REQUIRED = [
  'height',
  'waistHeight',
  'frontAsisHeight',
  'kneeHeight',
  'glutealFoldHeight',
  'waist',
  'hips',
  'knee',
  'waistToFloorSide',
  'waistToFloorFront',
  'inseam',
  'instep',
] as const

export type EmkoMaleTrousersMeasurements = Pick<
  MaleMeasurements,
  (typeof EMKO_MALE_TROUSERS_REQUIRED)[number]
>

export const emkoMaleTrousers: BlockDef<EmkoMaleTrousersOptions, EmkoMaleTrousersMeasurements> = {
  id: 'emko-male-trousers',
  title: 'Мужские брюки',
  gender: 'male',
  method: 'emko',
  garment: 'trousers',
  required: EMKO_MALE_TROUSERS_REQUIRED,
  options: [
    { id: 'waistEase', short: 'Пт', title: 'Свобода по талии ПС (к полуобхвату)', min: 0, max: 50, step: 1 },
    { id: 'hipEase', short: 'Пб', title: 'Свобода по бёдрам ПС (к полуобхвату)', min: 0, max: 60, step: 1 },
    { id: 'kneeEase', title: 'Свобода по колену ПС (к полуширине)', min: 5, max: 120, step: 1 },
    { id: 'hemEase', title: 'Свобода по низу ПС (к полуширине)', min: 10, max: 130, step: 1 },
    {
      id: 'hemHeightEase',
      title: 'Подъём низа над полом ПС',
      min: 0,
      max: 70,
      step: 1,
      hint: 'Параметр ПС в формуле 940–94 = 0,04·Т1 − ПС (0…70 мм). Чем уже брюки, тем больше значение.',
    },
    {
      id: 'crotchCurve',
      title: 'Прогиб среднего шва сзади',
      min: 5,
      max: 35,
      step: 1,
      hint: 'Отклонение заднего среднего шва 68–681 (5…35 мм). Меньшее значение — для плоских ягодиц.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], crotchCurve: 15 }),
  draft: draftEmkoMaleTrousers,
}

/** Расчёт ключевых конструктивных отрезков сетки ЕМКО СЭВ т. 3 (табл. 7.2–7.3), мм. */
export function emkoMaleTrouserGrid(m: EmkoMaleTrousersMeasurements, o: EmkoMaleTrousersOptions) {
  const A = EMKO_MALE_TROUSERS_ALLOWANCES
  const pHip = o.hipEase + A.hipPp + A.hipPt
  const pCrotchB = A.crotchBackPs + A.crotchBackPp + A.crotchBackPt
  const pCrotchF = A.crotchFrontPs + A.crotchFrontPp + A.crotchFrontPt
  const pKneeB = o.kneeEase + A.kneePp + A.kneePt
  const pKneeF = o.kneeEase * (16.3 / 22) + A.kneePp + A.kneePt
  const pHemB = o.hemEase + A.hemPp + A.hemPt
  const pHemF = o.hemEase * (16.8 / 25) + A.hemPp + A.hemPt
  const pWaist = o.waistEase + A.waistPp + A.waistPt

  const hipRise = 0.65 * (m.waistHeight - m.glutealFoldHeight) + A.hipRisePt - 30 // 41–51
  const hipWidth = 0.5 * m.hips + pHip                                             // 51–57
  const backHalf = 0.53 * hipWidth                                                 // 51–54
  const frontHalf = 0.47 * hipWidth                                                // 54′–57
  const crotchBack = 0.665 * (0.2 * m.hips - 20) + pCrotchB                        // 51–58
  const crotchFront = 0.335 * (0.2 * m.hips - 20) + pCrotchF                       // 57–58′
  const creaseBack = 0.5 * (crotchBack + backHalf)                                 // 58–52
  const creaseFront = 0.5 * (frontHalf + crotchFront)                              // 54′–56

  const kneeBack = 0.275 * m.knee + pKneeB                                         // 72–78, 72–741
  const kneeFront = 0.225 * m.knee + pKneeF                                        // 76–741′, 76–78′
  const hemBack = 0.275 * m.instep + pHemB                                         // 92–98, 92–941
  const hemFront = 0.225 * m.instep + pHemF                                        // 96–941′, 96–98′

  const waistHalf = 0.5 * m.waist + pWaist                                         // 41–470
  const dt = hipWidth - waistHalf                                                  // dт
  const sideTilt742 = 0.375 * (backHalf + crotchBack) - 25                         // 72–742

  return {
    pHip,
    pWaist,
    hipRise,
    hipWidth,
    backHalf,
    frontHalf,
    crotchBack,
    crotchFront,
    creaseBack,
    creaseFront,
    kneeBack,
    kneeFront,
    hemBack,
    hemFront,
    waistHalf,
    dt,
    sideTilt742,
  }
}

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
    line.curve(
      add(p0, mul(v(-Math.sin(t0), Math.cos(t0)), k)),
      sub(p1, mul(v(-Math.sin(t1), Math.cos(t1)), k)),
      p1,
    )
  }
  return line
}

function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

export function draftEmkoMaleTrousers(
  m: EmkoMaleTrousersMeasurements,
  o: EmkoMaleTrousersOptions,
): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const g = emkoMaleTrouserGrid(m, o)

  // ---- Базисная сетка (табл. 7.2) ----
  const hip = c('41–51', 'Высота линии бёдер от талии', '0,65·(Т7 − Т12) + ПТ − 3,0', g.hipRise)
  const W = c('51–57', 'Общая ширина брюк по бёдрам', '0,5·Т19 + П', g.hipWidth)
  const wB = c('51–54', 'Задняя половина по бёдрам', '0,53·|51–57|', g.backHalf)
  const wF = c('54′–57', 'Передняя половина по бёдрам', '0,47·|51–57|', g.frontHalf)
  const extB = c('51–58', 'Шаговый выступ сзади', '0,665·(0,2·Т19 − 2,0) + П', g.crotchBack)
  const extF = c('57–58′', 'Шаговый выступ спереди', '0,335·(0,2·Т19 − 2,0) + П', g.crotchFront)

  const yF = c('44′–940', 'От талии спереди до пола', 'Т26 − 3,0', m.waistToFloorFront - 30)
  const raise = c('940–441′', 'Талия у бока над полом', 'Т25 − 3,0', m.waistToFloorSide - 30)
  c('940–440', 'Уровень передней точки подвздошной кости', 'Т8', m.frontAsisHeight)
  const crotchH = c('940–64', 'Линия шага над полом', 'Т27', m.inseam)
  const kneeH = c('940–74', 'Линия колена над полом', 'Т9', m.kneeHeight)
  const hemH = c('940–94', 'Низ брюк над полом', '0,04·Т1 − ПС', 0.04 * m.height - o.hemHeightEase)

  const y51 = hip
  const y64 = yF - crotchH
  const y74 = yF - kneeH
  const y94 = yF - hemH
  const ySide = yF - raise

  if (y64 <= y51 + 15) {
    warnings.push('Линия шага расположена слишком близко к линии бёдер: проверьте Т26 и Т27.')
  }

  const x51 = 0
  const x54 = wB
  const x57 = W
  const x58 = -extB
  const x58f = W + extF
  const x52 = x58 + c('58–52', 'Линия стрелки сзади', '0,5·(|51–58| + |51–54|)', g.creaseBack)
  const x56 = x54 + c('54′–56', 'Линия стрелки спереди', '0,5·(|57–58′| + |54′–57|)', g.creaseFront)

  const kneeB = c('72–78', 'Ширина задней половины по колену (от стрелки)', '0,275·Т22 + П', g.kneeBack)
  const kneeF = c('76–741′', 'Ширина передней половины по колену (от стрелки)', '0,225·Т22 + П', g.kneeFront)
  const hemB = c('92–98', 'Ширина задней половины по низу (от стрелки)', '0,275·Т51 + П', g.hemBack)
  const hemF = c('96–941′', 'Ширина передней половины по низу (от стрелки)', '0,225·Т51 + П', g.hemFront)
  const off742 = c('72–742', 'Наклон бокового среза задней половины', '0,375·(|51–54| + |51–58|) − 2,5', g.sideTilt742)

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

  // ---- Поворот верхней части задней половины вокруг 54 ----
  const d = norm(sub(P54, P742))
  const perp = v(d.y, -d.x)
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

  // ---- Талия и вытачки ИМК (табл. 7.3) ----
  const wl = c('41–470', 'Ширина пояса', '0,5·Т18 + П', g.waistHalf)
  const dt = c('dт', 'Суммарный раствор вытачек по талии', '(0,5·Т19 + П) − (0,5·Т18 + П)', g.dt)
  const dtPos = Math.max(0, dt)
  if (dt <= 0) {
    warnings.push('Талия с прибавкой не меньше бёдер (dт ≤ 0): вытачки по талии не строятся.')
  }

  const sSide = c('441–442', 'Перевод бокового среза по талии', '0,2·dт', 0.2 * dtPos)
  const sBackHalf = c('421–422', 'Полураствор задней вытачки', '0,2·dт', 0.2 * dtPos)
  const sFrontHalf = c('46–461', 'Полураствор передней вытачки', '0,1·dт', 0.1 * dtPos)

  // Задняя половина по талии
  const P442 = along(P441, P411, sSide)
  const ax = norm(sub(P441, P411))
  const down = v(-ax.y, ax.x)
  const onBackWaist = (dist0: number) => add(P411, mul(ax, dist0))

  const posBackDart = c('411–420', 'Положение задней вытачки от средней линии', '0,1·|41–470| + 0,5·|411–442|', 0.1 * wl + 0.35 * dist(P411, P442))
  const lenBackDart = c('411–421', 'Длина задней вытачки', '0,4·|411–441|', 0.4 * dist(P411, P441))
  const bd = dart(
    onBackWaist(posBackDart - sBackHalf),
    onBackWaist(posBackDart + sBackHalf),
    add(onBackWaist(posBackDart), mul(down, lenBackDart)),
  )

  // Передняя половина по талии
  const P441f = v(x54, ySide)
  const P442f = v(x54 + sSide, ySide)
  const frontDartOffset = c('47–460', 'Положение передней вытачки от линии сгиба', '0,1·|41–470|', 0.1 * wl)
  const P460 = v(x57 - frontDartOffset, 0)
  const lenFrontDart = c('46–561', 'Длина передней вытачки', '0,6·(|41–51| + 2,0)', 0.6 * (hip + 20))

  const ease01 = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2
  const frontWaistY = (x: number) => ySide * ease01((P460.x - x) / Math.max(1, P460.x - P442f.x))
  const fdX = Math.min(x56, P460.x - sFrontHalf - 5)
  const fd = dart(
    v(fdX - sFrontHalf, frontWaistY(fdX - sFrontHalf)),
    v(fdX + sFrontHalf, frontWaistY(fdX + sFrontHalf)),
    v(fdX, frontWaistY(fdX) + lenFrontDart),
  )

  // ---- Контур задней половины ----
  const P78 = v(x52 - kneeB, y74)
  const P741 = v(x52 + kneeB, y74)
  const P98 = v(x52 - hemB, y94)
  const P941 = v(x52 + hemB, y94)

  const backCrotch = arc(new Line(P512), P582, P512, P681)
  const backSide = new Line(P442).smooth(sub(P54, P442), d.y < 0 ? mul(d, -1) : d, P54, 0.4)
  const backEdges = new Outline(P98, 'inseam')
    .to(P78)
    .to(P681)
    .edge('crotch')
    .append(backCrotch.reversed())
    .to(P511)
    .to(P411)
    .edge('waist')
    .to(bd.left)
    .dart('waist', bd.tip, bd.right, 'a')
    .to(P442)
    .edge('side')
    .append(backSide)
    .to(P741)
    .to(P941)
    .edge('hem')
    .close()

  // ---- Контур передней половины ----
  const P78f = v(x56 + kneeF, y74)
  const P741f = v(x56 - kneeF, y74)
  const P98f = v(x56 + hemF, y94)
  const P941f = v(x56 - hemF, y94)

  const frontCrotch = arc(new Line(P57), P582f, P57, P68f)
  const frontSide = new Line(P442f).smooth(v(-0.2, 1), v(0, 1), P54, 0.4)
  const waistSeg = (a: Vec, b: Vec) => {
    const s = (x: number) => v(1, frontWaistY(x + 0.5) - frontWaistY(x - 0.5))
    return new Line(a).smooth(s(a.x), s(b.x), b)
  }
  const frontWaist1 = waistSeg(P442f, fd.left)
  const frontWaist2 = new Line(fd.right).append(waistSeg(fd.right, P460)).to(P47)

  const frontEdges = new Outline(P941f, 'side')
    .to(P741f)
    .to(P54)
    .append(frontSide.reversed())
    .edge('waist')
    .append(frontWaist1)
    .dart('waist', fd.tip, fd.right, 'b')
    .append(frontWaist2)
    .edge('crotch')
    .to(P57)
    .append(frontCrotch)
    .edge('inseam')
    .to(P78f)
    .to(P98f)
    .edge('hem')
    .close()

  // ---- Контроль срезов и обхватов ----
  const inseamB = dist(P681, P78) + dist(P78, P98)
  const inseamF = dist(P68f, P78f) + dist(P78f, P98f)
  const sideB = backSide.length() + dist(P54, P741) + dist(P741, P941)
  const sideF2 = frontSide.length() + dist(P54, P741f) + dist(P741f, P941f)
  const waistB = dist(P411, bd.left) + dist(bd.right, P442)
  const waistF = frontWaist1.length() + frontWaist2.length()
  const waistTotal = 2 * (waistB + waistF)
  const hipsTotal = 2 * (wB + wF)

  const levels = { hip: y51, knee: y74 }
  const backPanel: Panel = {
    id: 'emko-male-trousers-back',
    title: 'Задняя половина мужских брюк',
    role: 'trousersBack',
    method: 'ЕМКО СЭВ',
    edges: backEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(v(x52, y51)).to(v(x52, y94)) },
      { role: 'mark', line: new Line(P511).to(P54) },
      { role: 'mark', line: new Line(P681).to(atY(P54, P741, y64)) },
      { role: 'mark', line: new Line(P78).to(P741) },
    ],
    grain: [v(x52 + 15, y64 + 60), v(x52 + 15, y74 - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(x52 - 75, y64 + 100),
    notes: [{ at: v(x52 + 4, y94 - 70), text: 'стрелка', size: 4 }],
    levels,
    notches: [],
    seams: { inseam: inseamB, side: sideB, waist: waistB },
  }

  const frontPanel: Panel = {
    id: 'emko-male-trousers-front',
    title: 'Передняя половина мужских брюк',
    role: 'trousersFront',
    method: 'ЕМКО СЭВ',
    edges: frontEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(v(x56, y51)).to(v(x56, y94)) },
      { role: 'mark', line: new Line(P54).to(P57) },
      { role: 'mark', line: new Line(atY(P54, P741f, y64)).to(P68f) },
      { role: 'mark', line: new Line(P741f).to(P78f) },
    ],
    grain: [v(x56 - 15, y64 + 60), v(x56 - 15, y74 - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(x56 - 65, y64 + 100),
    notes: [],
    levels,
    notches: [],
    seams: { inseam: inseamF, side: sideF2, waist: waistF },
  }

  return {
    panels: [backPanel, frontPanel],
    pieces: [backPanel, frontPanel].map(netPiece),
    points: {
      P41, P51, P54, P57, P47, P58, P58f, P68, P68f, P681, P742,
      P511, P411, P581, P441, P512, P582, P582f, P442, P441f, P442f, P460,
      P78, P741, P98, P941, P78f, P741f, P98f, P941f,
      dartBackTip: bd.tip,
      dartFrontTip: fd.tip,
      crease52: v(x52, y51),
      crease56: v(x56, y51),
    },
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний (±1,5 см)', sideB, sideF2, 0, 15),
      check('inseam', 'Шаговые срезы: задний и передний (±1,5 см)', inseamB, inseamF, 0, 15),
      check('waist', 'Талия брюк (Т18 + 2·П_талии)', waistTotal, m.waist + 2 * g.pWaist, 0, 15),
      check('hips', 'Бёдра брюк (Т19 + 2·П_бёдер)', hipsTotal, m.hips + 2 * g.pHip, 0, 2),
    ],
    warnings,
  }
}