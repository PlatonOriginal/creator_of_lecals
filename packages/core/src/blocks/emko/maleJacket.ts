import { Line, add, along, circlesX, dist, lineX, mid, mul, rotate, sub, v, type Vec } from '../../draft/geom'
import type { MaleMeasurements } from '../../measurements/male/schema'
import { Outline, netPiece, type FishDart, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Мужская плечевая основа: пиджак (разд. 1, табл. 1.2–1.4) и летняя куртка
 * (разд. 4, табл. 4.2–4.4), ЕМКО СЭВ т. 3 (базовая конструкция без припусков).
 *
 * Источник: ЕМКО СЭВ, т. 3, табл. 1.2 (с. 6), табл. 1.3 (с. 13–16),
 * табл. 1.4 (с. 19–22), табл. 11 (с. 125), табл. 12 (с. 126);
 * техническая спецификация мужской одежды, разд. 7.
 * Константы методики (см) переведены в мм (×10).
 */
export interface EmkoMaleJacketOptions extends Record<string, number> {
  /** Конструктивная прибавка ПК по груди (табл. 12), мм (60…150). */
  chestEase: number
  /** Конструктивная прибавка ПК по талии (табл. 12), мм (50…140). */
  waistEase: number
  /** Конструктивная прибавка ПК по бёдрам (табл. 12), мм (50…140). */
  hipsEase: number
  /** Прибавка к обхвату плеча (табл. 12), мм (50…110). */
  upperArmEase: number
  /** Углубление проймы (33–331, 35–351), мм (25…55). */
  armholeDrop: number
  /** Норма посадки оката N (доля длины проймы ДП; 0,07 для пиджака), 0,04…0,09. */
  capEase: number
  /** Ширина низа рукава Шн.рук (контрольный минимум ≥ 0,5·Оп + 45 мм), мм. */
  sleeveHemWidth: number
  /** Модельный параметр баланса талии переда `а` в формуле 47–471 (15 мм для 176-100-88), мм. */
  abdomenBalance: number
  /** Припуск на длину изделия ниже линии бёдер 91 (0 для пиджака до бёдер; для куртки по модели), мм. */
  lengthDelta: number
}

/**
 * Нормативные прибавки полуприлегающего пиджака (табл. 1.2, табл. 11)
 * для контрольной фигуры 176-100-88, мм: ПК = ПС + ПП, П = ПК + ПТ.
 */
export const EMKO_MALE_JACKET_ALLOWANCES = {
  y11_91: { ps: 12.0, pp: 4.0, pt: 6.4 },   // П = 22,4 мм => 773,4 мм
  y11_21: { ps: 12.0, pp: 4.0, pt: 0.8 },   // П = 16,8 мм => 154,8 мм
  y11_31: { ps: 12.0, pp: 4.0, pt: 1.5 },   // П = 17,5 мм => 233,5 мм
  y11_41: { ps: 12.0, pp: 4.0, pt: 2.1 },   // П = 18,1 мм => 478,1 мм
  w31_33: { ps: 15.0, pp: 4.0, pt: 1.5 },   // ПК = 19,0; П = 20,5 мм => 224,5 мм
  w33_35: { ps: 26.0, pp: 8.5, pt: 1.5 },   // ПК = 34,5; П = 36,0 мм => 160,0 мм
  w35_37: { ps: 9.0, pp: 10.0, pt: 0.0 },   // ПК = 19,0; П = 19,0 мм => 217,0 мм
  h33_13: { ps: 2.0, pp: 13.5, pt: 0.0 },   // ПК = 15,5; П = 15,5 мм => 198,0 мм
  h35_15: { ps: 2.0, pp: 16.0, pt: 2.0 },   // ПК = 18,0; П = 20,0 мм => 180,6 мм
  drop33_331: { ps: 25.0, pp: 15.0, pt: 0.0 }, // ПК = 40,0 мм
  waist411_470_pp: 42.5,                    // ПП по талии (табл. 11)
  hips511_570_pp: 23.0,                     // ПП по бёдрам (табл. 11)
  neck16_161_pp: 4.5,                       // ПП горловины (табл. 11)
  shorExtra: 47.0,                          // Эффективная добавка к Т57 + 40 в табл. 1.4 (§ 7.7)
} as const

/** Профили конструктивных прибавок ПК пиджака по силуэтам (табл. 12, с. 126), мм. */
const JACKET_SILHOUETTES: Record<
  Silhouette,
  { chestEase: number; waistEase: number; hipsEase: number; upperArmEase: number; armholeDrop: number }
> = {
  fitted: { chestEase: 60, waistEase: 50, hipsEase: 50, upperArmEase: 50, armholeDrop: 35 },
  semi: { chestEase: 72.5, waistEase: 70, hipsEase: 70, upperArmEase: 60, armholeDrop: 40 },
  straight: { chestEase: 100, waistEase: 90, hipsEase: 90, upperArmEase: 80, armholeDrop: 45 },
}

export const EMKO_MALE_JACKET_REQUIRED = [
  'height',
  'chest1',
  'chest2',
  'chest3',
  'waist',
  'hips',
  'neck',
  'waistHeight',
  'glutealFoldHeight',
  'armholeArc',
  'armholeDepthBack',
  'backLength',
  'upperTorsoArc',
  'chestWidth',
  'chestPointDistance',
  'backWidth',
  'armDepth',
] as const

export type EmkoMaleJacketMeasurements = Pick<
  MaleMeasurements,
  (typeof EMKO_MALE_JACKET_REQUIRED)[number]
> &
  Partial<
    Pick<
      MaleMeasurements,
      | 'shoulderSlope'
      | 'neckToRadial'
      | 'neckToWrist'
      | 'upperArm'
      | 'wrist'
      | 'frontLength'
      | 'bustHeight'
      | 'napeToChest1Front'
    >
  >

const JACKET_OPTIONS: (BlockDef<EmkoMaleJacketOptions, EmkoMaleJacketMeasurements>['options'][number])[] = [
  { id: 'chestEase', short: 'ПКг', title: 'Прибавка ПК по груди (табл. 12)', min: 60, max: 150, step: 2.5 },
  { id: 'waistEase', short: 'ПКт', title: 'Прибавка ПК по талии (табл. 12)', min: 50, max: 140, step: 2.5 },
  { id: 'hipsEase', short: 'ПКб', title: 'Прибавка ПК по бёдрам (табл. 12)', min: 50, max: 140, step: 2.5 },
  { id: 'upperArmEase', short: 'ПКоп', title: 'Прибавка по обхвату плеча (табл. 12)', min: 50, max: 110, step: 2.5 },
  { id: 'armholeDrop', title: 'Углубление проймы (33–331)', min: 25, max: 55, step: 1 },
  { id: 'capEase', short: 'N', title: 'Норма посадки оката N (доля ДП)', min: 0.04, max: 0.09, step: 0.005 },
  { id: 'sleeveHemWidth', short: 'Шн.рук', title: 'Ширина низа рукава в готовом виде', min: 130, max: 220, step: 2 },
  { id: 'abdomenBalance', short: 'а', title: 'Параметр баланса талии переда `а` (47–471)', min: 0, max: 35, step: 1 },
  { id: 'lengthDelta', title: 'Изменение длины относительно линии бёдер 91', min: -120, max: 120, step: 5 },
]

export const emkoMaleJacket: BlockDef<EmkoMaleJacketOptions, EmkoMaleJacketMeasurements> = {
  id: 'emko-male-jacket',
  title: 'Мужской пиджак',
  gender: 'male',
  method: 'emko',
  garment: 'jacket',
  required: EMKO_MALE_JACKET_REQUIRED,
  options: JACKET_OPTIONS,
  defaults: (s) => ({
    ...JACKET_SILHOUETTES[s],
    capEase: 0.07,
    sleeveHemWidth: 165,
    abdomenBalance: 15,
    lengthDelta: 0,
  }),
  draft: (m, o) => draftEmkoMaleJacket(m, o, 'jacket'),
}

export const emkoMaleSummerJacket: BlockDef<EmkoMaleJacketOptions, EmkoMaleJacketMeasurements> = {
  id: 'emko-male-summer-jacket',
  title: 'Мужская летняя куртка',
  gender: 'male',
  method: 'emko',
  garment: 'jacket',
  required: EMKO_MALE_JACKET_REQUIRED,
  options: JACKET_OPTIONS,
  defaults: (s) => {
    // ПРОЕКТ (§ 7.6): общая свобода по груди 11–15 см (130 мм), по бёдрам 11–14 см (120 мм)
    const delta = s === 'fitted' ? -15 : s === 'straight' ? 15 : 0
    return {
      chestEase: 130 + delta,
      waistEase: 120 + delta,
      hipsEase: 120 + delta,
      upperArmEase: 90 + delta,
      armholeDrop: 45,
      capEase: 0.05,
      sleeveHemWidth: 175,
      abdomenBalance: 10,
      lengthDelta: -30,
    }
  },
  draft: (m, o) => draftEmkoMaleJacket(m, o, 'summer'),
}

/** Расчёт ключевых конструктивных отрезков базисной сетки пиджака ЕМКО СЭВ т. 3 (§ 7.3, § 7.9), мм. */
export function emkoMaleJacketGrid(m: EmkoMaleJacketMeasurements, o: EmkoMaleJacketOptions) {
  const A = EMKO_MALE_JACKET_ALLOWANCES
  const scale = o.chestEase / 72.5

  const p11_91 = A.y11_91.ps + A.y11_91.pp + A.y11_91.pt
  const p11_21 = A.y11_21.ps + A.y11_21.pp + A.y11_21.pt
  const p11_31 = A.y11_31.ps + A.y11_31.pp + A.y11_31.pt
  const p11_41 = A.y11_41.ps + A.y11_41.pp + A.y11_41.pt

  const p31_33 = (A.w31_33.ps + A.w31_33.pp) * scale + A.w31_33.pt
  const p33_35 = (A.w33_35.ps + A.w33_35.pp) * scale + A.w33_35.pt
  const p35_37 = (A.w35_37.ps + A.w35_37.pp) * scale + A.w35_37.pt

  const p33_13 = A.h33_13.ps + A.h33_13.pp + A.h33_13.pt
  const p35_15 = A.h35_15.ps + A.h35_15.pp + A.h35_15.pt

  const s11_91 = m.backLength + (m.waistHeight - m.glutealFoldHeight) + p11_91
  const s11_21 = 0.3 * m.backLength + p11_21
  const s11_31 = m.armholeDepthBack + p11_31
  const s11_41 = m.backLength + p11_41
  const s41_51 = 0.65 * (m.waistHeight - m.glutealFoldHeight)

  const s31_33 = 0.5 * m.backWidth + p31_33
  const s33_35 = m.armDepth + p33_35
  const s35_37 = 0.5 * (m.chestWidth + m.chest2 - 8 - m.chest1) + p35_37
  const s31_87 = s31_33 + s33_35 + s35_37

  const s33_13 = 0.5 * m.armholeArc + p33_13
  const s35_15 = 0.44 * m.armholeArc + p35_15

  const shor = m.armDepth + 40 + A.shorExtra * (o.upperArmEase / 60)

  return {
    p31_33,
    p33_35,
    p35_37,
    p33_13,
    p35_15,
    s11_91,
    s11_21,
    s11_31,
    s11_41,
    s41_51,
    s31_33,
    s33_35,
    s35_37,
    s31_87,
    s33_13,
    s35_15,
    shor,
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

function tangentPoint(p: Vec, c: Vec, r: number, pick: (a: Vec, b: Vec) => Vec): Vec {
  const m = mid(p, c)
  return circlesX(m, dist(m, c), c, r, pick)
}

const mirrorX = (p: Vec, x: number): Vec => v(2 * x - p.x, p.y)

export function draftEmkoMaleJacket(
  m: EmkoMaleJacketMeasurements,
  o: EmkoMaleJacketOptions,
  variant: 'jacket' | 'summer' = 'jacket',
): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const A = EMKO_MALE_JACKET_ALLOWANCES
  const g = emkoMaleJacketGrid(m, o)

  const upperArm = m.upperArm ?? Math.round(0.315 * m.chest3)
  const shoulderSlope = m.shoulderSlope ?? Math.round(0.195 * m.neck + 70)
  const neckToRadial = m.neckToRadial ?? Math.round(0.2 * m.height)
  const neckToWrist = m.neckToWrist ?? Math.round(0.345 * m.height)
  const bustHeight = m.bustHeight ?? Math.round(0.272 * m.chest3)
  const frontLength = m.frontLength ?? m.backLength + 4
  const napeToChest1Front = m.napeToChest1Front ?? Math.round(bustHeight - 62)

  // ---- Базисная сетка (§ 7.3) ----
  const y91 = c('11–91', 'Длина спинки до линии бёдер', 'Т40 + (Т7 − Т12) + П', g.s11_91)
  const y21 = c('11–21', 'Уровень лопаток', '0,3·Т40 + П', g.s11_21)
  const y31 = c('11–31', 'Уровень груди (глубина проймы)', 'Т39 + П', g.s11_31)
  const y41 = c('11–41', 'Линия талии спинки', 'Т40 + П', g.s11_41)
  const hipDrop = c('41–51', 'Линия бёдер от талии', '0,65·(Т7 − Т12)', g.s41_51)
  const y51 = y41 + hipDrop
  const yHem = y91 + o.lengthDelta

  const w31_33 = c('31–33', 'Ширина спинки', '0,5·Т47 + П', g.s31_33)
  const w33_35 = c('33–35', 'Ширина проймы', 'Т57 + П', g.s33_35)
  const w35_37 = c('35–37', 'Ширина полочки', '0,5·(Т45 + Т15 − 0,8 − Т14) + П', g.s35_37)
  const W = c('31–87', 'Суммарная ширина сетки по груди', '(31–33) + (33–35) + (35–37)', g.s31_87)

  const x33 = w31_33
  const x35 = w31_33 + w33_35
  const h37_47 = c('37–47', 'Перед: от линии груди до талии', 'Т40 − Т39 + П', m.backLength - m.armholeDepthBack + 2)
  const yW = y31 + h37_47

  // ---- Пройма (§ 7.3.6, § 7.8.7) ----
  const h13 = c('33–13', 'Высота проймы спинки', '0,5·Т38 + П', g.s33_13)
  const h15 = c('35–15', 'Высота проймы полочки', '0,44·Т38 + П', g.s35_15)
  const drop = c('33–331', 'Углубление проймы', 'ПС + ПП', o.armholeDrop)
  const rB = c('331–341', 'Радиус низа проймы спинки', '0,62·|33–35| − 1,0', Math.max(20, 0.62 * w33_35 - 10))
  const rF = c('351–346', 'Радиус низа проймы полочки', '0,38·|33–35| − 1,0', Math.max(15, 0.38 * w33_35 - 10))
  const yA = y31 + drop

  const P13 = v(x33, y31 - h13)
  const P15 = v(x35, y31 - h15)
  const P331 = v(x33, yA)
  const P351 = v(x35, yA)
  const P332 = v(x33, yA - rB)
  const P342 = v(x33 + rB, yA - rB)
  const P341 = v(x33 + rB, yA)
  const P352 = v(x35, yA - rF)
  const P343 = v(x35 - rF, yA - rF)
  const P346 = v(x35 - rF, yA)
  const xSide = 0.5 * (P341.x + P346.x)

  // ---- Горловина, грудь и талия (§ 7.4) ----
  const nB = c('11–12', 'Ширина горловины спинки', '0,18·Т13 + П', 0.18 * m.neck + 2)
  const hB = c('12–121', 'Глубина горловины спинки', '0,08·Т13 + П', 0.08 * m.neck)
  const P11 = v(0, 0)
  const P12 = v(nB, 0)
  const P121 = v(nB, -hB)
  const P112 = v(0.25 * nB, 0)

  const shLen = c('121–14', 'Длина плеча спинки', 'Т31 + П', shoulderSlope + 8)
  const dyB = P13.y - P121.y
  const P14 = v(P121.x + Math.sqrt(Math.max(100, shLen * shLen - dyB * dyB)), P13.y)

  const nF = c('371′–361', 'Ширина горловины переда', '0,18·Т13 + П', 0.18 * m.neck + 3)
  const dF = c('16–161', 'Длина плеча/горловины переда', '0,195·Т13 + П', 0.195 * m.neck + A.neck16_161_pp)

  const w47_471 = c(
    '47–471',
    'Смещение/вытачка живота на линии талии',
    '0,24·Т18 − 0,5·(Т45 + Т15 − 0,8 − Т14) + а',
    0.24 * m.waist - 0.5 * (m.chestWidth + m.chest2 - 8 - m.chest1) + o.abdomenBalance,
  )
  const w471_46 = c('471–46', 'Ширина от центра переда до вытачки', '0,5·Т46 + П', 0.5 * m.chestPointDistance + 3)
  const h47_36 = c('47–36', 'Длина переда от центра груди до талии', 'Т36 − Т35 + П', frontLength - bustHeight + 1.5)
  const h36_372 = c('36–372', 'Высота груди от линии груди', 'Т35 − Т34 + П', bustHeight - napeToChest1Front + 3)

  const P47 = v(W, yW)
  const P471 = v(W - Math.max(0, w47_471), yW)
  const P46 = v(P471.x - w471_46, yW)
  const P36 = v(P46.x, yW - h47_36)
  const Q16 = v(W - nF, P121.y)
  const Q17 = v(W, P121.y + dF)
  const Q161 = v(W - nF, P121.y + dF)

  const dyF = P15.y - Q16.y
  const P14f = v(Q16.x - Math.sqrt(Math.max(100, shLen * shLen - dyF * dyF)), P15.y)

  // ---- Талия, бёдра и ИМК (§ 7.3.7, § 7.6) ----
  const wl = c('411–470', 'Ширина пояса', '0,5·Т18 + ПКт', 0.5 * m.waist + 0.5 * o.waistEase)
  const hl = c('511–570', 'Ширина бёдер', '0,5·Т19 + ПКб', 0.5 * m.hips + 0.5 * o.hipsEase)

  const cbSuppression = variant === 'jacket' ? 10 : 5
  const dt = c('dт', 'Суммарный раствор вытачек по талии', '|31–87| − (отвод + |411–470|)', W - (cbSuppression + wl))
  const db = c('dб', 'Расширение по бёдрам', '(отвод + |511–570|) − |31–87|', cbSuppression + hl - W)

  const dtPos = Math.max(0, dt)
  const sBack = variant === 'jacket' ? 0.25 * dtPos : 0.15 * dtPos
  const sSide = variant === 'jacket' ? 0.45 * dtPos : 0.55 * dtPos
  const sFront = variant === 'jacket' ? 0.30 * dtPos : 0.30 * dtPos

  const P411 = v(cbSuppression, y41)
  const P511 = v(0.5 * cbSuppression, y51)
  const P911 = v(0.5 * cbSuppression, yHem)

  const P443 = v(xSide - 0.5 * sSide, y41)
  const P443f = v(xSide + 0.5 * sSide, yW)
  const P542b = v(xSide + 0.5 * db, y51)
  const P542f = v(xSide - 0.5 * db, y51)

  const P42 = v(0.5 * x33, y41)
  const backFish: FishDart = {
    id: 'waist',
    top: v(P42.x, y31 + 25),
    left: v(P42.x - 0.5 * sBack, y41),
    bottom: v(P42.x, y51 - 20),
    right: v(P42.x + 0.5 * sBack, y41),
  }

  const frontFish: FishDart = {
    id: 'waist',
    top: v(P46.x, P36.y + 0.2 * h36_372),
    left: v(P46.x - 0.5 * sFront, yW),
    bottom: v(P46.x, y51 - 15),
    right: v(P46.x + 0.5 * sFront, yW),
  }

  // ---- Контуры спинки и полочки ----
  const backNeck = new Line(P11).to(P112).smooth(v(1, 0), v(0.35, -1), P121)
  const backArmhole = new Line(P14).smooth(rotate(sub(P14, P121), 90), v(0, 1), P332, 0.45)
  arc(backArmhole, P342, P332, P341).to(v(xSide, yA))

  const backSide = new Line(v(xSide, yA))
    .smooth(v(0, 1), v(0, 1), P443, 0.35)
    .smooth(v(0, 1), v(0, 1), P542b, 0.35)
    .to(v(P542b.x, yHem))

  const backEdges = new Outline(P911, 'cb')
    .to(P511)
    .to(P411)
    .to(v(0, y31))
    .to(P11)
    .edge('neck')
    .append(backNeck)
    .edge('shoulder')
    .to(P14)
    .edge('armhole')
    .append(backArmhole)
    .edge('side')
    .append(backSide)
    .edge('hem')
    .close()

  const frontNeck = new Line(Q17).smooth(sub(Q161, Q17), sub(Q16, Q161), Q16, 0.55)
  const frontArmhole = new Line(v(xSide, yA)).to(P346)
  arc(frontArmhole, P343, P346, P352).smooth(v(0, -1), rotate(sub(P14f, Q16), 90), P14f, 0.45)

  const frontSide = new Line(v(P542f.x, yHem))
    .to(P542f)
    .smooth(v(0, -1), v(0, -1), P443f, 0.35)
    .smooth(v(0, -1), v(0, -1), v(xSide, yA), 0.35)

  const frontEdges = new Outline(v(P542f.x, yHem), 'side')
    .append(frontSide)
    .edge('armhole')
    .append(frontArmhole)
    .edge('shoulder')
    .to(Q16)
    .edge('neck')
    .append(frontNeck.reversed())
    .edge('cf')
    .to(P47)
    .to(v(W, yHem))
    .edge('hem')
    .close()

  const backArmLen = backArmhole.length()
  const frontArmLen = frontArmhole.length()
  const armhole = backArmLen + frontArmLen
  const shoulderBack = dist(P121, P14)
  const shoulderFront = dist(Q16, P14f)
  const sideBack = backSide.length()
  const sideFront = frontSide.length()

  // ---- Двухшовный рукав пиджака / куртки (§ 7.7) ----
  const SHOR = c('ШОР', 'Ширина рукава под проймой (ШОР)', 'Т57 + 4,0 + П', g.shor)
  const DP = c(
    'ДП',
    'Длина проймы по формуле ЕМКО',
    '0,95·Т38 + (П33–13 + П35–15) + 0,57·(Т57 + П33–35) + 2·(33–331)',
    0.95 * m.armholeArc + (g.p33_13 + g.p35_15) + 0.57 * (m.armDepth + g.p33_35) + 2 * drop,
  )
  const POR = c('ПОР', 'Посадка оката', 'N·ДП', o.capEase * DP)
  const DOR = c('ДОР', 'Длина оката', '(1 + N)·ДП', DP + POR)
  const VOR = c(
    'ВОР',
    'Высота оката (ВОР)',
    '0,885·ДОР·√(0,25 − (ШОР/ДОР)²)',
    0.885 * DOR * Math.sqrt(Math.max(0.01, 0.25 - (SHOR / DOR) ** 2)),
  )

  const sleeveLen = c('13–93', 'Длина рукава', 'Т33 − Т31 + П', neckToWrist - shoulderSlope + 15)
  const elbowLen = c('13–43', 'Длина рукава до локтя', 'Т32 − Т31 + П', neckToRadial - shoulderSlope + 10)
  const minHemWidth = c('Шн.рук_мин', 'Минимальная ширина низа рукава (Мюллер)', '0,5·Оп + 4,5', 0.5 * upperArm + 45)

  if (2 * o.sleeveHemWidth < minHemWidth) {
    warnings.push(`Обхват низа рукава (${2 * o.sleeveHemWidth} мм) меньше контрольного минимума ${Math.round(minHemWidth)} мм.`)
  }
  if (variant === 'jacket' && (POR < 35 || POR > 80)) {
    warnings.push(`Посадка рукава ПОР = ${(POR / 10).toFixed(1)} см выходит за диапазон 3,5–8,0 см.`)
  }

  // Строим базовый окат в развёрнутой сетке и разделяем на верхнюю и нижнюю половинки
  const S13 = v(0, 0)
  const S333 = v(0, VOR)
  const S351 = v(SHOR, VOR)
  const S15 = v(SHOR, 0)
  const wArmEf = Math.min(w33_35, SHOR - 10)
  const S331 = v(SHOR - wArmEf, VOR)
  const rArmB = Math.max(20, 0.62 * wArmEf - 10)
  const rArmF = Math.max(15, 0.38 * wArmEf - 10)
  const S342 = add(S331, v(rArmB, -rArmB))
  const S341 = add(S331, v(rArmB, 0))
  const S343 = add(S351, v(-rArmF, -rArmF))

  const S131 = v(0, 0.3 * VOR)
  const S14 = v(0.45 * SHOR, 0)
  const S141 = v(0.73 * SHOR, 0)
  const S141r = mirrorX(S141, SHOR)
  const S345 = tangentPoint(S131, S342, rArmB, (a, b) => (a.y > b.y ? a : b))
  const S354 = tangentPoint(S141r, S343, rArmF, (a, b) => (a.y > b.y ? a : b))
  const S355 = lineX(S354, S141r, S15, S351)
  const S133r = lineX(S345, S131, S13, S15)
  const S133 = mirrorX(S133r, 0)
  const S134 = mid(S133, S131)
  const S144 = mid(S133, S141)
  const S143 = mid(S14, S141)
  const S142 = along(S141, S355, dist(S141, S15))

  const capTopFull = new Line(S131).curve(S134, S144, S14).curve(S143, S142, S355)
  const lowBack = arc(new Line(S341), S342, S341, S345).to(S131).map((p) => mirrorX(p, 0))
  const lowFront = new Line(S355).to(S354)
  arc(lowFront, S343, S354, S341)
  const lowFrontU = lowFront.map((p) => mirrorX(p, SHOR))

  // Перекаты переднего (frontRoll = 25 мм) и локтевого (backRoll = 20 мм) швов для двухшовного рукава
  const frontRoll = 25
  const backRoll = 20
  const yE = elbowLen
  const yWr = sleeveLen
  const elbowBend = 14 // отвод локтевого среза вперед на уровне локтя, мм

  const bendAt = (y: number) =>
    y <= yE ? elbowBend * ((y - VOR) / Math.max(1, yE - VOR)) : elbowBend * (1 - 0.3 * ((y - yE) / Math.max(1, yWr - yE)))

  // Верхняя половинка (шире нижней на сумму перекатов спереди и сзади)
  const topLeftAt = (y: number) => {
    const t = Math.max(0, (y - VOR) / Math.max(1, yWr - VOR))
    return -backRoll + 0.5 * (SHOR - o.sleeveHemWidth) * t + bendAt(y)
  }
  const topRightAt = (y: number) => {
    const t = Math.max(0, (y - VOR) / Math.max(1, yWr - VOR))
    return SHOR - frontRoll - 0.5 * (SHOR - o.sleeveHemWidth) * t + bendAt(y)
  }

  const topCapCurve = new Line(v(topLeftAt(VOR), VOR))
    .curve(v(topLeftAt(VOR) - 10, 0.45 * VOR), v(S14.x - 35, 0), S14)
    .curve(v(S14.x + 35, 0), v(topRightAt(VOR) + 12, 0.55 * VOR), v(topRightAt(VOR), VOR))

  const topFrontSeam = new Line(v(topRightAt(VOR), VOR)).to(v(topRightAt(yE), yE)).to(v(topRightAt(yWr), yWr))
  const topBackSeam = new Line(v(topLeftAt(yWr), yWr)).to(v(topLeftAt(yE), yE)).to(v(topLeftAt(VOR), VOR))

  const topSleeveEdges = new Outline(v(topLeftAt(yWr), yWr), 'seamBack')
    .append(topBackSeam)
    .edge('cap')
    .append(topCapCurve)
    .edge('seamFront')
    .append(topFrontSeam)
    .edge('hem')
    .close()

  // Нижняя половинка (смещена вправо для отдельной раскладки и повторяет отвод локтевого среза)
  const underOffsetX = SHOR + 90
  const underWAt = (y: number) => topRightAt(y) - topLeftAt(y) - (frontRoll + backRoll)
  const underLeftAt = (y: number) => underOffsetX + bendAt(y)
  const underRightAt = (y: number) => underOffsetX + bendAt(y) + Math.max(60, underWAt(y))
  const underCapY = VOR
  const underDipY = VOR + 28

  const underCapCurve = new Line(v(underRightAt(VOR), underCapY)).smooth(
    v(-0.4, 0.8),
    v(-0.4, -0.8),
    v(underLeftAt(VOR), underCapY),
    0.45,
  )

  const topFrontLen = topFrontSeam.length()
  const topBackLen = topBackSeam.length()

  const underFrontRaw = new Line(v(underLeftAt(yWr), yWr)).to(v(underLeftAt(yE), yE)).to(v(underLeftAt(VOR), underCapY))
  const underBackRaw = new Line(v(underRightAt(VOR), underCapY)).to(v(underRightAt(yE), yE)).to(v(underRightAt(yWr), yWr))

  const underSleeveEdges = new Outline(v(underLeftAt(yWr), yWr), 'seamFront')
    .append(underFrontRaw)
    .edge('cap')
    .append(underCapCurve)
    .edge('seamBack')
    .append(underBackRaw)
    .edge('hem')
    .close()

  const capCombined = lowBack.length() + capTopFull.length() + lowFrontU.length()
  const topSeamFrontLen = topFrontLen
  const underSeamFrontLen = underFrontRaw.length()
  const topSeamBackLen = topBackLen
  const underSeamBackLen = underBackRaw.length()

  // ---- Формирование панелей ----
  const isSummer = variant === 'summer'
  const levels = { chest: y31, waist: y41, hip: y51 }

  const backPanel: Panel = {
    id: isSummer ? 'emko-male-summer-jacket-back' : 'emko-male-jacket-back',
    title: isSummer ? 'Спинка куртки' : 'Спинка пиджака',
    role: 'back',
    method: 'ЕМКО СЭВ',
    edges: backEdges,
    fish: [backFish],
    marks: [
      { role: 'mark', line: new Line(v(0, y21)).to(v(x33, y21)) },
      { role: 'mark', line: new Line(v(0, y31)).to(v(xSide, y31)) },
      { role: 'mark', line: new Line(P411).to(P443) },
      { role: 'mark', line: new Line(P511).to(P542b) },
    ],
    grain: [v(0.5 * x33, y31 + 50), v(0.5 * x33, yHem - 60)],
    cut: 'Крой 2 (шов посередине)',
    labelAt: v(20, y41 + 40),
    notes: [
      { at: v(15, y31 - 6), text: 'линия груди', size: 4 },
      { at: v(15, y41 - 6), text: 'линия талии', size: 4 },
    ],
    levels,
    notches: [],
    seams: { shoulder: shoulderBack, side: sideBack, armhole: backArmLen, neck: backNeck.length() },
  }

  const frontPanel: Panel = {
    id: isSummer ? 'emko-male-summer-jacket-front' : 'emko-male-jacket-front',
    title: isSummer ? 'Полочка куртки' : 'Полочка пиджака',
    role: 'front',
    method: 'ЕМКО СЭВ',
    edges: frontEdges,
    fish: [frontFish],
    marks: [
      { role: 'mark', line: new Line(v(xSide, y31)).to(v(W, y31)) },
      { role: 'mark', line: new Line(P443f).to(P47) },
      { role: 'mark', line: new Line(P542f).to(v(W, y51)) },
    ],
    grain: [v(P46.x, y31 + 50), v(P46.x, yHem - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(xSide + 25, y41 + 40),
    notes: [],
    levels,
    notches: [],
    seams: { shoulder: shoulderFront, side: sideFront, armhole: frontArmLen, neck: frontNeck.length() },
  }

  const topSleevePanel: Panel = {
    id: isSummer ? 'emko-male-summer-jacket-sleeve-top' : 'emko-male-jacket-sleeve-top',
    title: 'Верхняя половинка рукава',
    role: 'sleeveTop',
    method: 'ЕМКО СЭВ',
    edges: topSleeveEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(v(topLeftAt(yE), yE)).to(v(topRightAt(yE), yE)) }],
    grain: [v(S14.x, VOR + 40), v(S14.x, yWr - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(S14.x - 55, VOR + 70),
    notes: [{ at: v(S14.x - 50, yE - 6), text: 'линия локтя', size: 4 }],
    levels: { chest: VOR, elbow: yE },
    notches: [],
    seams: { cap: topCapCurve.length(), seamFront: topSeamFrontLen, seamBack: topSeamBackLen },
  }

  const underSleevePanel: Panel = {
    id: isSummer ? 'emko-male-summer-jacket-sleeve-under' : 'emko-male-jacket-sleeve-under',
    title: 'Нижняя половинка рукава',
    role: 'sleeveUnder',
    method: 'ЕМКО СЭВ',
    edges: underSleeveEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(v(underLeftAt(yE), yE)).to(v(underRightAt(yE), yE)) }],
    grain: [v(underOffsetX + 45, underDipY + 30), v(underOffsetX + 45, yWr - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(underOffsetX + 12, VOR + 70),
    notes: [],
    levels: { chest: VOR, elbow: yE },
    notches: [],
    seams: { cap: underCapCurve.length(), seamFront: underSeamFrontLen, seamBack: underSeamBackLen },
  }

  const panels = [backPanel, frontPanel, topSleevePanel, underSleevePanel]

  return {
    panels,
    pieces: panels.map(netPiece),
    points: {
      P11, P12, P121, P112, P13, P14, P15, P331, P332, P341, P342, P343, P346, P351, P352,
      Q16, Q17, Q161, P14f, P411, P511, P911, P443, P443f, P542b, P542f, P47, P471, P46, P36,
      S131, S14, S141, S141r, S345, S354, S355, S133, S351, S333,
      chestBack: v(0, y31),
      waistBack: v(0, y41),
      hipBack: v(0, y51),
      shoulderMark: v(0, y21),
    },
    steps,
    checks: [
      check('grid', 'Тождество ширины сетки 31–87 = (31–33) + (33–35) + (35–37)', W, w31_33 + w33_35 + w35_37, 0, 0.1),
      check('shoulder', 'Плечевые срезы спинки и полочки (±2 мм)', shoulderBack, shoulderFront, 0, 2),
      check('side', 'Боковые срезы спинки и полочки (±15 мм)', sideBack, sideFront, 0, 15),
      check('armhole', 'Длина проймы: по чертежу и по формуле ДП', armhole, DP, 0, 45),
      check('cap', 'Окат минус пройма = посадка ПОР', capCombined - armhole, POR, 0, 45),
      check('sleeveFrontSeam', 'Передний перекат рукава: верхняя и нижняя половинки', topSeamFrontLen, underSeamFrontLen, 0, 5),
      check('sleeveBackSeam', 'Локтевой шов рукава: верхняя и нижняя половинки', topSeamBackLen, underSeamBackLen, 0, 8),
      check('shor', 'Ширина рукава под проймой не меньше расчётной ШОР', SHOR, m.armDepth + 40, 47 * (o.upperArmEase / 60), 1),
    ],
    warnings,
  }
}
