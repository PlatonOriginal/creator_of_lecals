import { Line, add, along, circlesX, dist, lineX, mid, mul, rotate, sub, v, type Vec } from '../../draft/geom'
import type { MaleMeasurements } from '../../measurements/male/schema'
import { Outline, netPiece, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Мужская сорочка с втачным одношовным рукавом, воротником на стойке,
 * планкой и манжетой, ЕМКО СЭВ (базовая конструкция без припусков).
 *
 * Источник: ЕМКО СЭВ, т. 3, табл. 1.2 (базисная сетка верхней части тела),
 * табл. 11 (с. 125, нормативные прибавки на пакет ПП для мужской сорочки)
 * и т. 1 (общие формулы расчёта проймы и оката); спецификация разд. 6.
 * Константы методики (см) переведены в мм (×10).
 */
export interface EmkoMaleShirtOptions extends Record<string, number> {
  /** Общая свобода по груди ПС (к полному обхвату Т16), мм (60…140). */
  chestEase: number
  /** Свобода по талии ПС (к полному обхвату Т18), мм (40…140). */
  waistEase: number
  /** Свобода по бёдрам ПС (к полному обхвату Т19), мм (40…140). */
  hipsEase: number
  /** Углубление проймы (33–331, 35–351), мм (20…35). */
  armholeDrop: number
  /** Свобода обхвата шеи (к полному обхвату Т13), мм (10…30). */
  neckEase: number
  /** Свобода обхвата плеча/рукава (к полному обхвату Т28), мм (60…140). */
  sleeveBicepEase: number
  /** Прибавка к обхвату запястья Т29 для манжеты, мм (30…60). */
  cuffEase: number
  /** Норма посадки оката N (доля длины проймы ДП), 0,04…0,07. */
  capEase: number
  /** Длина изделия от линии основания шеи 11 до низа по средней линии спинки, мм. */
  garmentLength: number
  /** Высота стойки воротника, мм (35…45). */
  standHeight: number
  /** Высота отлёта воротника, мм (35…60). */
  collarHeight: number
  /** Ширина планки в развороте, мм (70…90). */
  placketWidth: number
  /** Высота манжеты, мм (50…60). */
  cuffHeight: number
}

/** Нормативные прибавки на пакет ПП из ЕМКО СЭВ т. 3, табл. 11 (с. 125), строка «Сорочка», мм. */
export const EMKO_MALE_SHIRT_PACKAGE = {
  y11_91: 1.5,       // 0,15 см
  y11_21: 1.5,       // 0,15 см
  y11_31: 1.5,       // 0,15 см
  y11_41: 1.5,       // 0,15 см
  w31_33: 1.0,       // 0,10 см
  w33_35: 2.0,       // 0,20 см
  w35_37: 2.0,       // 0,20 см
  w31_87: 5.0,       // 0,50 см (= 1.0 + 2.0 + 2.0)
  drop33_331: 5.0,   // 0,50 см
  drop35_351: 5.0,   // 0,50 см
  h33_13: 1.5,       // 0,15 см
  h35_15: 1.5,       // 0,15 см
  neck111_12: 1.5,   // 0,15 см
  neck12_121: 1.0,   // 0,10 см
  neck32_121: 1.0,   // 0,10 см
  neck371_361: 1.5,  // 0,15 см
  neck16_161: 1.5,   // 0,15 см
  front36_16: 1.1,   // 0,11 см
  waist411_470: 5.5, // 0,55 см
  hips511_570: 5.5,  // 0,55 см
  shor351_333: 1.5,  // 0,15 см
  hem95_931: 5.0,    // 0,50 см
  sleeve13_43: 1.0,  // 0,10 см
  sleeve13_93: 1.0,  // 0,10 см
} as const

const EASE: Record<
  Silhouette,
  { chestEase: number; waistEase: number; hipsEase: number; armholeDrop: number; sleeveBicepEase: number }
> = {
  fitted: { chestEase: 70, waistEase: 50, hipsEase: 50, armholeDrop: 20, sleeveBicepEase: 70 },
  semi: { chestEase: 100, waistEase: 80, hipsEase: 80, armholeDrop: 25, sleeveBicepEase: 100 },
  straight: { chestEase: 130, waistEase: 120, hipsEase: 120, armholeDrop: 30, sleeveBicepEase: 130 },
}

export const EMKO_MALE_SHIRT_REQUIRED = [
  'height',
  'chest1',
  'chest2',
  'chest3',
  'waist',
  'hips',
  'neck',
  'waistHeight',
  'glutealFoldHeight',
  'shoulderSlope',
  'neckToRadial',
  'neckToWrist',
  'armholeArc',
  'armholeDepthBack',
  'backLength',
  'chestWidth',
  'backWidth',
  'armDepth',
] as const

export type EmkoMaleShirtMeasurements = Pick<
  MaleMeasurements,
  (typeof EMKO_MALE_SHIRT_REQUIRED)[number]
> &
  Partial<Pick<MaleMeasurements, 'upperArm' | 'wrist' | 'chestPointDistance' | 'bustHeight' | 'frontLength' | 'napeToChest1Front'>>

export const emkoMaleShirt: BlockDef<EmkoMaleShirtOptions, EmkoMaleShirtMeasurements> = {
  id: 'emko-male-shirt',
  title: 'Мужская сорочка',
  gender: 'male',
  method: 'emko',
  garment: 'shirt',
  required: EMKO_MALE_SHIRT_REQUIRED,
  options: [
    { id: 'chestEase', short: 'Пг', title: 'Свобода по груди (к полному обхвату Т16)', min: 60, max: 140, step: 2 },
    { id: 'waistEase', short: 'Пт', title: 'Свобода по талии (к полному обхвату Т18)', min: 40, max: 140, step: 2 },
    { id: 'hipsEase', short: 'Пб', title: 'Свобода по бёдрам (к полному обхвату Т19)', min: 40, max: 140, step: 2 },
    { id: 'armholeDrop', title: 'Углубление проймы', min: 20, max: 35, step: 1, hint: 'Проектный диапазон для сорочки 2–3,5 см.' },
    { id: 'neckEase', title: 'Свобода обхвата шеи', min: 10, max: 30, step: 1, hint: 'Прибавка к обхвату шеи Т13 (1–3 см).' },
    { id: 'sleeveBicepEase', title: 'Свобода рукава по обхвату плеча', min: 60, max: 140, step: 2 },
    { id: 'cuffEase', title: 'Прибавка к обхвату запястья для манжеты', min: 30, max: 60, step: 1 },
    { id: 'capEase', short: 'N', title: 'Посадка оката (доля длины проймы)', min: 0.04, max: 0.07, step: 0.005 },
    { id: 'garmentLength', short: 'Ди', title: 'Длина сорочки от основания шеи 11 до низа', min: 620, max: 900, step: 5 },
    { id: 'standHeight', title: 'Высота стойки воротника', min: 35, max: 45, step: 1 },
    { id: 'collarHeight', title: 'Высота отлёта воротника', min: 35, max: 65, step: 1 },
    { id: 'placketWidth', title: 'Ширина планки (в развороте)', min: 70, max: 90, step: 1 },
    { id: 'cuffHeight', title: 'Высота манжеты', min: 50, max: 60, step: 1 },
  ],
  defaults: (s) => ({
    ...EASE[s],
    neckEase: 20,
    cuffEase: 40,
    capEase: 0.05,
    garmentLength: 760,
    standHeight: 38,
    collarHeight: 45,
    placketWidth: 80,
    cuffHeight: 55,
  }),
  draft: draftEmkoMaleShirt,
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

export function draftEmkoMaleShirt(
  m: EmkoMaleShirtMeasurements,
  o: EmkoMaleShirtOptions,
): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const PP = EMKO_MALE_SHIRT_PACKAGE

  const upperArm = m.upperArm ?? Math.round(0.315 * m.chest3)
  const wrist = m.wrist ?? Math.round(0.175 * m.neck + 105)
  const frontLength = m.frontLength ?? m.backLength + 3

  // Распределение половины свободы по груди по участкам базисной сетки
  const halfChestEase = o.chestEase / 2
  const eB = 0.25 * halfChestEase
  const eA = 0.55 * halfChestEase
  const eF = 0.20 * halfChestEase

  // ---- Базисная сетка верхней части тела (§ 6.3, § 6.4.1) ----
  const y21 = c('11–21', 'Уровень лопаток', '0,3·Т40 + ПП', 0.3 * m.backLength + PP.y11_21)
  const y31 = c('11–31', 'Уровень груди (глубина проймы)', 'Т39 + ПП', m.armholeDepthBack + PP.y11_31)
  const y41 = c('11–41', 'Линия талии спинки', 'Т40 + ПП', m.backLength + PP.y11_41)
  const hipDrop = c('41–51', 'Линия бёдер от талии', '0,65·(Т7 − Т12)', 0.65 * (m.waistHeight - m.glutealFoldHeight))
  const y51 = y41 + hipDrop
  const y11_91 = c('11–91', 'Контрольная длина до линии бёдер', 'Т40 + (Т7 − Т12) + ПП', m.backLength + (m.waistHeight - m.glutealFoldHeight) + PP.y11_91)
  const yHem = c('11–низ', 'Длина сорочки от основания шеи 11', 'garmentLength', o.garmentLength)

  const w31_33 = c('31–33', 'Ширина спинки', '0,5·Т47 + ПС + ПП', 0.5 * m.backWidth + eB + PP.w31_33)
  const w33_35 = c('33–35', 'Ширина проймы', 'Т57 + ПС + ПП', m.armDepth + eA + PP.w33_35)
  const w35_37 = c(
    '35–37',
    'Ширина полочки',
    '0,5·(Т45 + Т15 − 0,8 − Т14) + ПС + ПП',
    0.5 * (m.chestWidth + m.chest2 - 8 - m.chest1) + eF + PP.w35_37,
  )
  const W = c('31–87', 'Ширина сетки по груди', '(31–33) + (33–35) + (35–37)', w31_33 + w33_35 + w35_37)

  const x33 = w31_33
  const x35 = w31_33 + w33_35

  // ---- Баланс осанки (§ 6.5.7) ----
  const postureCorrection = c('Баланс', 'Поправка на осанку (Дтп − Дтс)', 'Т36 − Т40', frontLength - m.backLength)
  const yW = y41 + 0.5 * postureCorrection

  // ---- Пройма (§ 6.3, § 6.4.1, § 7.8) ----
  const h13 = c('33–13', 'Высота проймы спинки', '0,5·Т38 + ПП', 0.5 * m.armholeArc + PP.h33_13)
  const h15 = c('35–15', 'Высота проймы полочки', '0,44·Т38 + ПП', 0.44 * m.armholeArc + PP.h35_15)
  const drop = c('33–331', 'Углубление проймы', 'ПС + ПП', o.armholeDrop + PP.drop33_331)
  const rB = c('331–341', 'Радиус низа проймы спинки', '0,62·|33–35|', 0.62 * w33_35)
  const rF = c('351–346', 'Радиус низа проймы полочки', '0,38·|33–35|', 0.38 * w33_35)
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
  const xSide = P341.x

  // ---- Горловина и плечо спинки и полочки (§ 6.4.1, § 6.5.5–6) ----
  const neckHalfEase = o.neckEase / 2
  const nB = c('11–12', 'Ширина горловины спинки', '0,168·Т13 + ПС + ПП', 0.168 * m.neck + 0.35 * neckHalfEase + PP.neck111_12)
  const hB = c('12–121', 'Глубина горловины спинки', '0,075·Т13 + ПП', 0.075 * m.neck + PP.neck12_121)

  const P11 = v(0, 0)
  const P12 = v(nB, 0)
  const P121 = v(nB, -hB)
  const P112 = v(0.3 * nB, 0)

  const shLen = c('121–14', 'Длина плечевого среза', 'Т31 + П', m.shoulderSlope + 5)
  const dyB = P13.y - P121.y
  const x14 = P121.x + Math.sqrt(Math.max(100, shLen * shLen - dyB * dyB))
  const P14 = v(x14, P13.y)

  const nF = c('371′–361', 'Ширина горловины полочки', '0,168·Т13 + ПС + ПП', 0.168 * m.neck + 0.35 * neckHalfEase + PP.neck371_361)
  const dF = c('16–161', 'Глубина горловины полочки', '0,178·Т13 + ПС + ПП', 0.178 * m.neck + 0.35 * neckHalfEase + PP.neck16_161)

  const yNeckFrontTop = P121.y + 0.5 * postureCorrection
  const Q16 = v(W - nF, yNeckFrontTop)
  const Q17 = v(W, yNeckFrontTop + dF)
  const Q161 = v(W - nF, yNeckFrontTop + dF)

  const dyF = P15.y - Q16.y
  const x14f = Q16.x - Math.sqrt(Math.max(100, shLen * shLen - dyF * dyF))
  const P14f = v(x14f, P15.y)

  // ---- Талия и бёдра (§ 6.4.2, § 6.5.6) ----
  const chestHalfTarget = c('Ог/2_цель', 'Контрольный полуобхват по груди', '0,5·Т16 + 0,5·ПС', 0.5 * m.chest3 + 0.5 * o.chestEase)
  const waistHalfTarget = c('411–470', 'Ширина по талии', '0,5·Т18 + 0,5·ПС + ПП', 0.5 * m.waist + 0.5 * o.waistEase + PP.waist411_470)
  const hipsHalfTarget = c('511–570', 'Ширина по бёдрам', '0,5·Т19 + 0,5·ПС + ПП', 0.5 * m.hips + 0.5 * o.hipsEase + PP.hips511_570)

  const dWaist = waistHalfTarget - W
  const dHipsRaw = hipsHalfTarget - W
  const dHips = Math.max(-20, dHipsRaw)

  if (yHem < y51) {
    warnings.push('Длина сорочки меньше уровня линии бёдер: низ сорочки построен выше уровня бёдер.')
  }
  if (Math.abs(postureCorrection) > 35) {
    warnings.push('Большая разница длины переда и спины (Т36 − Т40): проверьте баланс сорочки на макете.')
  }

  const P443 = v(xSide + 0.5 * dWaist, y41)
  const P443f = v(xSide - 0.5 * dWaist, yW)
  const P542b = v(xSide + 0.5 * dHips, y51)
  const P542f = v(xSide - 0.5 * dHips, y51)

  // ---- Контуры спинки и полочки ----
  const backNeck = new Line(P11).to(P112).smooth(v(1, 0), v(0.35, -1), P121)
  const backArmhole = new Line(P14).smooth(rotate(sub(P14, P121), 90), v(0, 1), P332, 0.45)
  arc(backArmhole, P342, P332, P341)

  const backSide = new Line(P341)
    .smooth(v(0, 1), v(0, 1), P443, 0.35)
    .smooth(v(0, 1), v(0, 1), P542b, 0.35)
    .to(v(P542b.x, yHem))

  const backEdges = new Outline(v(0, yHem), 'cb', 'fold')
    .to(v(0, y51))
    .to(v(0, y41))
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
  const frontArmhole = arc(new Line(P341), P343, P341, P352).smooth(
    v(0, -1),
    rotate(sub(P14f, Q16), 90),
    P14f,
    0.45,
  )

  const frontSide = new Line(v(P542f.x, yHem))
    .to(P542f)
    .smooth(v(0, -1), v(0, -1), P443f, 0.35)
    .smooth(v(0, -1), v(0, -1), P341, 0.35)

  const frontEdges = new Outline(v(P542f.x, yHem), 'side')
    .append(frontSide)
    .edge('armhole')
    .append(frontArmhole)
    .edge('shoulder')
    .to(Q16)
    .edge('neck')
    .append(frontNeck.reversed())
    .edge('cf')
    .to(v(W, yW))
    .to(v(W, yHem))
    .edge('hem')
    .close()

  // ---- Измеренные срезы спинки и полочки ----
  const backArmLen = backArmhole.length()
  const frontArmLen = frontArmhole.length()
  const armhole = backArmLen + frontArmLen
  const shoulderBack = dist(P121, P14)
  const shoulderFront = dist(Q16, P14f)
  const sideBack = backSide.length()
  const sideFront = frontSide.length()
  const neckFull = 2 * (backNeck.length() + frontNeck.length())

  // ---- Одношовный сорочечный рукав (§ 6.5.8–9) ----
  const DP = c(
    'ДП',
    'Длина проймы по формуле ЕМКО',
    '0,95·Т38 + (ПП33–13 + ПП35–15) + 0,57·(Т57 + П33–35) + 2·|33–331|',
    0.95 * m.armholeArc + (PP.h33_13 + PP.h35_15) + 0.57 * (m.armDepth + eA + PP.w33_35) + 2 * drop,
  )
  const POR = c('ПОР', 'Посадка оката', 'N·ДП', o.capEase * DP)
  const DOR = c('ДОР', 'Длина оката', '(1 + N)·ДП', DP + POR)
  const SHOR = c(
    '351–333',
    'Ширина рукава под проймой (ШОР)',
    '0,5·(Т28 + ПС) + ПП',
    0.5 * (upperArm + o.sleeveBicepEase) + PP.shor351_333,
  )
  const VOR = c(
    '333–13',
    'Высота оката (ВОР)',
    '0,885·ДОР·√(0,25 − (ШОР/ДОР)²)',
    0.885 * DOR * Math.sqrt(Math.max(0.01, 0.25 - (SHOR / DOR) ** 2)),
  )
  const sl = c('13–93', 'Длина рукава от плечевой точки', 'Т33 − Т31 + ПП', m.neckToWrist - m.shoulderSlope + PP.sleeve13_93)
  const el = c('13–43', 'Длина рукава до локтя', 'Т32 − Т31 + ПП', m.neckToRadial - m.shoulderSlope + PP.sleeve13_43)
  const wr = c('95–931', 'Ширина рукава внизу (в сложенном виде)', '0,5·(Т29 + ПС) + ПП', 0.5 * (wrist + o.cuffEase) + PP.hem95_931)

  const S13 = v(0, 0)
  const S333 = v(0, VOR)
  const S351 = v(SHOR, VOR)
  const S15 = v(SHOR, 0)
  const wArmEf = Math.min(w33_35, SHOR - 10)
  const S331 = v(SHOR - wArmEf, VOR)
  const rArmB = 0.62 * wArmEf
  const rArmF = 0.38 * wArmEf
  const S342 = add(S331, v(rArmB, -rArmB))
  const S341 = add(S331, v(rArmB, 0))
  const S343 = add(S351, v(-rArmF, -rArmF))

  const S131 = v(0, c('13–131', 'Точка оката на заднем сгибе', '0,3·|333–13|', 0.3 * VOR))
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

  const capTop = new Line(S131).curve(S134, S144, S14).curve(S143, S142, S355)
  const lowBack = arc(new Line(S341), S342, S341, S345).to(S131).map((p) => mirrorX(p, 0))
  const lowFront = new Line(S355).to(S354)
  arc(lowFront, S343, S354, S341)
  const lowFrontU = lowFront.map((p) => mirrorX(p, SHOR))
  const cap = lowBack.length() + capTop.length() + lowFrontU.length()

  const yE = el
  const yWr = sl
  const widthAt = (y: number) => SHOR + ((wr - SHOR) * (y - VOR)) / (yWr - VOR)
  const foldL = (y: number) => 0.5 * (SHOR - widthAt(y))
  const foldR = (y: number) => 0.5 * (SHOR + widthAt(y))
  const L43 = v(foldL(yE), yE)
  const R451 = v(foldR(yE), yE)
  const R951 = v(foldR(yWr), yWr)
  const L931 = v(foldL(yWr), yWr)

  const seamAt = SHOR - rArmF
  const SL = (y: number) => v(2 * foldL(y) - seamAt, y)
  const SR = (y: number) => v(2 * foldR(y) - seamAt, y)

  const seamL = dist(SL(VOR), SL(yE)) + dist(SL(yE), SL(yWr))
  const seamR = dist(SR(VOR), SR(yE)) + dist(SR(yE), SR(yWr))

  const sleeveEdges = new Outline(SL(yWr), 'seamBack')
    .to(SL(yE))
    .to(SL(VOR))
    .edge('cap')
    .append(lowBack)
    .append(capTop)
    .append(lowFrontU)
    .edge('seamFront')
    .to(SR(yE))
    .to(SR(yWr))
    .edge('hem')
    .close()

  // ---- Отделочные детали (§ 6.5.10 — ПРОЕКТ) ----
  const neckTarget = m.neck + o.neckEase
  const standHalfLen = neckFull / 2 + 15 // +15 мм заход на застёжку
  const standRise = 6
  const standEdges = new Outline(v(0, 0), 'cb', 'fold')
    .to(v(0, o.standHeight))
    .edge('neck')
    .append(new Line(v(0, o.standHeight)).smooth(v(1, 0), v(1, -0.1), v(standHalfLen, o.standHeight - standRise), 0.35))
    .edge('cf')
    .to(v(standHalfLen, -standRise))
    .edge('collar')
    .append(new Line(v(standHalfLen, -standRise)).smooth(v(-1, 0.1), v(-1, 0), v(0, 0), 0.35))
    .close()

  const collarHalfLen = neckFull / 2
  const collarTipOut = 18
  const collarEdges = new Outline(v(0, 0), 'cb', 'fold')
    .to(v(0, o.collarHeight))
    .edge('neck')
    .append(new Line(v(0, o.collarHeight)).smooth(v(1, 0), v(1, 0.08), v(collarHalfLen, o.collarHeight + 4), 0.35))
    .edge('cf')
    .to(v(collarHalfLen + collarTipOut, -8))
    .edge('collar')
    .append(new Line(v(collarHalfLen + collarTipOut, -8)).smooth(v(-1, 0.05), v(-1, 0), v(0, 0), 0.35))
    .close()

  const placketLen = yHem - Q17.y
  const placketEdges = new Outline(v(0, 0), 'cf')
    .to(v(o.placketWidth, 0))
    .edge('side')
    .to(v(o.placketWidth, placketLen))
    .edge('hem')
    .to(v(0, placketLen))
    .edge('cf')
    .close()

  const cuffLen = wrist + o.cuffEase
  const cuffEdges = new Outline(v(0, 0), 'seam')
    .to(v(cuffLen, 0))
    .edge('side')
    .to(v(cuffLen, o.cuffHeight))
    .edge('hem')
    .to(v(0, o.cuffHeight))
    .edge('side')
    .close()

  // ---- Формирование панелей ----
  const levels = { chest: y31, waist: y41, hip: y51 }
  const backPanel: Panel = {
    id: 'emko-male-shirt-back',
    title: 'Спинка сорочки',
    role: 'back',
    method: 'ЕМКО СЭВ',
    edges: backEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(v(0, y21)).to(v(x33, y21)) },
      { role: 'mark', line: new Line(v(0, y31)).to(P341) },
      { role: 'mark', line: new Line(v(0, y41)).to(P443) },
      { role: 'mark', line: new Line(v(0, y51)).to(P542b) },
    ],
    grain: [v(0.5 * x33, y31 + 50), v(0.5 * x33, yHem - 60)],
    cut: 'Крой 1 со сгибом',
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
    id: 'emko-male-shirt-front',
    title: 'Полочка сорочки',
    role: 'front',
    method: 'ЕМКО СЭВ',
    edges: frontEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(P341).to(v(W, y31)) },
      { role: 'mark', line: new Line(P443f).to(v(W, yW)) },
      { role: 'mark', line: new Line(P542f).to(v(W, y51)) },
    ],
    grain: [v(x35 + 40, y31 + 50), v(x35 + 40, yHem - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(xSide + 25, y41 + 40),
    notes: [],
    levels,
    notches: [],
    seams: { shoulder: shoulderFront, side: sideFront, armhole: frontArmLen, neck: frontNeck.length() },
  }

  const sleevePanel: Panel = {
    id: 'emko-male-shirt-sleeve',
    title: 'Рукав сорочки',
    role: 'sleeve',
    method: 'ЕМКО СЭВ',
    edges: sleeveEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(S131).to(S333).to(L43).to(L931) },
      { role: 'mark', line: new Line(S355).to(S351).to(R451).to(R951) },
    ],
    grain: [v(S14.x, VOR + 40), v(S14.x, yWr - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(S14.x - 45, VOR + 70),
    notes: [{ at: v(S14.x - 45, yE - 6), text: 'линия локтя', size: 4 }],
    levels: { chest: VOR, elbow: yE },
    notches: [],
    seams: { cap, seamFront: seamR, seamBack: seamL },
  }

  const standPanel: Panel = {
    id: 'emko-male-shirt-collar-stand',
    title: 'Стойка воротника',
    role: 'collarStand',
    method: 'ЕМКО СЭВ',
    edges: standEdges,
    fish: [],
    marks: [],
    grain: [v(20, o.standHeight / 2), v(standHalfLen - 20, o.standHeight / 2)],
    cut: 'Крой 2 со сгибом',
    labelAt: v(20, o.standHeight / 2 + 4),
    notes: [],
    levels: {},
    notches: [],
    seams: { neck: standHalfLen },
  }

  const collarPanel: Panel = {
    id: 'emko-male-shirt-collar',
    title: 'Воротник',
    role: 'collar',
    method: 'ЕМКО СЭВ',
    edges: collarEdges,
    fish: [],
    marks: [],
    grain: [v(20, o.collarHeight / 2), v(collarHalfLen - 20, o.collarHeight / 2)],
    cut: 'Крой 2 со сгибом',
    labelAt: v(20, o.collarHeight / 2 + 4),
    notes: [],
    levels: {},
    notches: [],
    seams: { neck: collarHalfLen },
  }

  const placketPanel: Panel = {
    id: 'emko-male-shirt-placket',
    title: 'Планка переда',
    role: 'placket',
    method: 'ЕМКО СЭВ',
    edges: placketEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(v(o.placketWidth / 2, 0)).to(v(o.placketWidth / 2, placketLen)) }],
    grain: [v(o.placketWidth / 2, 30), v(o.placketWidth / 2, placketLen - 30)],
    cut: 'Крой 1',
    labelAt: v(10, 60),
    notes: [],
    levels: {},
    notches: [],
    seams: { cf: placketLen },
  }

  const cuffPanel: Panel = {
    id: 'emko-male-shirt-cuff',
    title: 'Манжета',
    role: 'cuff',
    method: 'ЕМКО СЭВ',
    edges: cuffEdges,
    fish: [],
    marks: [],
    grain: [v(20, o.cuffHeight / 2), v(cuffLen - 20, o.cuffHeight / 2)],
    cut: 'Крой 2',
    labelAt: v(20, o.cuffHeight / 2 + 4),
    notes: [],
    levels: {},
    notches: [],
    seams: { hem: cuffLen },
  }

  const panels = [backPanel, frontPanel, sleevePanel, standPanel, collarPanel, placketPanel, cuffPanel]

  return {
    panels,
    pieces: panels.map(netPiece),
    points: {
      P11, P12, P121, P112, P13, P14, P15, P331, P332, P341, P342, P343, P351, P352,
      Q16, Q17, Q161, P14f, P443, P443f, P542b, P542f,
      S131, S14, S141, S141r, S345, S354, S355, S133, S351, S333,
      chestBack: v(0, y31),
      waistBack: v(0, y41),
      hipBack: v(0, y51),
      shoulderMark: v(0, y21),
      chestTargetPoint: v(chestHalfTarget, y31),
      hipControlPoint: v(0, y11_91),
    },
    steps,
    checks: [
      check('grid', 'Тождество ширины сетки 31–87 = (31–33) + (33–35) + (35–37)', W, w31_33 + w33_35 + w35_37, 0, 0.1),
      check('shoulder', 'Плечевые срезы спинки и полочки (±2 мм)', shoulderBack, shoulderFront, 0, 2),
      check('side', 'Боковые срезы спинки и полочки (±15 мм)', sideBack, sideFront, 0, 15),
      check('armhole', 'Длина проймы: по чертежу и по формуле ДП', armhole, DP, 0, 25),
      check('cap', 'Окат минус пройма = посадка ПОР', cap - armhole, POR, 0, 25),
      check('sleeveSeam', 'Шов рукава: передний и задний срезы', seamR, seamL, 0, 5),
      check('sleeveLength', 'Длина рукава по сгибу (±2 мм)', yWr, sl, 0, 2),
      check('neck', 'Обхват горловины и Т13 + П_шеи (±5 мм)', neckFull, neckTarget, 0, 5),
      check('cuff', 'Длина манжеты и Т29 + П_манжеты (±2 мм)', cuffLen, wrist + o.cuffEase, 0, 2),
    ],
    warnings,
  }
}
