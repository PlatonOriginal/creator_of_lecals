import {
  Line,
  add,
  along,
  atX,
  circlesX,
  dist,
  mid,
  mul,
  norm,
  rotate,
  sub,
  through,
  toPiece,
  v,
  type Vec,
} from '../../draft/geom'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Лиф с втачным рукавом, ЕМКО СЭВ (основа до линии талии, без припусков).
 *
 * ЕМКО СЭВ gives every segment as a regression on body measurements, e.g.
 * РГ = Впрз + 1,09 or Г1А = 0,49·Дп + 0,91 (cm). The formulas below follow the
 * worked example of the ЕМКО dress and sleeve published at
 * blogremaking.blogspot.com (2016), which reproduces the textbook procedure.
 * Constants are written in mm here (1,09 cm → 10.9 mm).
 *
 * Where that source leaves the geometry open, we fill the gap with the usual
 * textbook practice and say so in a comment marked «Допущение».
 *
 * Frame: x to the right from the centre back, y down from Р (the level of the
 * 7th cervical vertebra). Back on the left, front on the right.
 */
export interface EmkoBodiceOptions extends Record<string, number> {
  /** Прибавка к ширине спинки, mm (СО спинки). */
  easeBack: number
  /** Прибавка к ширине проймы, mm. */
  easeArmhole: number
  /** Прибавка к ширине полочки, mm. */
  easeFront: number
  /** Прибавка по линии талии к полуобхвату, mm. */
  easeWaist: number
  /** Угол плечевой вытачки спинки по фигуре, градусы (∠β). */
  backDartAngle: number
  /** Толщина плечевой накладки, mm. */
  shoulderPad: number
  /** Прибавка по рукаву (тип рукава), mm. */
  easeSleeve: number
  /** Норма посадки оката на 1 см проймы (зависит от ткани), доли. */
  capEase: number
}

const EASE: Record<Silhouette, Pick<EmkoBodiceOptions, 'easeBack' | 'easeArmhole' | 'easeFront' | 'easeWaist' | 'easeSleeve'>> = {
  // Chest ease split: back ~25 %, armhole ~60 %, front ~15 % (the source allows 25–30 / 30–70 / 0–30 %).
  fitted: { easeBack: 9, easeArmhole: 21, easeFront: 5, easeWaist: 25, easeSleeve: 25 },
  semi: { easeBack: 11.5, easeArmhole: 27.5, easeFront: 6.5, easeWaist: 30, easeSleeve: 35 },
  straight: { easeBack: 16, easeArmhole: 38, easeFront: 11, easeWaist: 45, easeSleeve: 50 },
}

export const EMKO_BODICE_REQUIRED = [
  'neck', 'bustUpper', 'bustFull', 'waist', 'chestWidth', 'bustSpan', 'bustHeight', 'frontLength',
  'armholeDepthFront', 'backLength', 'armholeDepth', 'torsoArc', 'backWidth', 'armholeArc', 'armDepth',
  'waistToFloor', 'waistToFloorFront', 'upperArm', 'wrist', 'armLength', 'elbowLength', 'shoulderLength',
] as const

type M = Record<(typeof EMKO_BODICE_REQUIRED)[number], number>

export const emkoBodice: BlockDef<EmkoBodiceOptions> = {
  id: 'emko-bodice',
  title: 'Лиф с втачным рукавом',
  method: 'emko',
  required: EMKO_BODICE_REQUIRED,
  options: [
    { id: 'easeBack', short: 'СО сп', title: 'Прибавка к ширине спинки', min: 0, max: 30, step: 5 },
    { id: 'easeArmhole', short: 'СО пр', title: 'Прибавка к ширине проймы', min: 10, max: 60, step: 5 },
    { id: 'easeFront', short: 'СО п', title: 'Прибавка к ширине полочки', min: 0, max: 30, step: 5 },
    { id: 'easeWaist', short: 'СО т', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 80, step: 5 },
    { id: 'easeSleeve', short: 'СО р', title: 'Прибавка по рукаву', min: 20, max: 120, step: 5, hint: 'Плотно облегающий 2–4 см, узкий 4–6, средний 5–7, расширенный 8–10.' },
    { id: 'shoulderPad', title: 'Плечевая накладка', min: 0, max: 20, step: 5 },
  ],
  // Посадка 0,06 на 1 см проймы — для хлопка со смесовыми; макет из бязи можно шить так же.
  defaults: (s) => ({ ...EASE[s], backDartAngle: 13, shoulderPad: 0, capEase: 0.06 }),
  draft: draftEmkoBodice,
}

/** Quarter-circle arc from a to b around centre c (|ca| = |cb|), as one cubic. */
function arc(line: Line, c: Vec, b: Vec): Line {
  const a = line.end
  const k = 0.5523
  const ta = norm(sub(b, c)) // tangent at a is parallel to cb
  const tb = norm(sub(a, c)) // tangent at b is parallel to ca, reversed
  const r = dist(a, c)
  return line.curve(add(a, mul(ta, k * r)), add(b, mul(tb, k * r)), b)
}

function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

export function draftEmkoBodice(m: M, o: EmkoBodiceOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const COsp = o.easeBack
  const COpr = o.easeArmhole
  const COp = o.easeFront

  // ---- Сетка
  const RG = c('РГ', 'Глубина проймы (линия груди)', 'Впрз + 1,09', m.armholeDepth + 10.9)
  const RT = c('РТ', 'Линия талии', 'Дтс + 1,31', m.backLength + 13.1)
  const GG1 = c('ГГ1', 'Ширина спинки', '0,5·Шс + СО + 0,2', 0.5 * m.backWidth + COsp + 2)
  const G1G2 = c('Г1Г2', 'Ширина проймы', 'dпзр + СО + 0,15', m.armDepth + COpr + 1.5)
  const G2G3 = c('Г2Г3', 'Ширина полочки', '0,5·(Шг + Ог2 − Ог1 − 1,2) + СО + 0,2', 0.5 * (m.chestWidth + m.bustFull - m.bustUpper - 12) + COp + 2)
  const GG3 = c('ГГ3', 'Ширина по линии груди', 'ГГ1 + Г1Г2 + Г2Г3', GG1 + G1G2 + G2G3)
  const G3T1 = c('Г3Т1', 'Полочка от линии груди до талии', 'Дтс − Впрз + 0,2', m.backLength - m.armholeDepth + 2)

  const P = v(0, 0)
  const G = v(0, RG)
  const G1 = v(GG1, RG)
  const G2 = v(GG1 + G1G2, RG)
  const T1 = v(GG3, RG + G3T1)

  // ---- Пройма
  const G1A = c('Г1А', 'Высота проймы спинки', '0,49·Дп + 0,91', 0.49 * m.armholeArc + 9.1)
  const G2A1 = c('Г2А1', 'Высота проймы полочки', '0,43·Дп + 0,89', 0.43 * m.armholeArc + 8.9)
  const G1O = c('Г1О', 'Опускание проймы', '3,5', 35)
  const OO2 = c('ОО2', 'Положение бокового шва', '0,62·Г1Г2 + 0,5', 0.62 * G1G2 + 5)
  const O1O2 = G1G2 - OO2
  const A = v(G1.x, RG - G1A)
  const A1 = v(G2.x, RG - G2A1)
  const O = v(G1.x, RG + G1O)
  const O1 = v(G2.x, RG + G1O)
  const O2 = v(G1.x + OO2, O.y)
  const O3 = v(O.x, O.y - OO2)
  const O4 = v(O1.x, O1.y - O1O2)

  // ---- Горловина и плечо спинки
  const RR1 = c('РР1', 'Ширина горловины спинки', '0,18·Ош + 0,2', 0.18 * m.neck + 2)
  const RR2 = 0.25 * RR1
  const R1R3 = c('Р1Р3', 'Глубина горловины спинки', '0,07·Ош − 0,35', 0.07 * m.neck - 3.5)
  const AP = c('АП', 'Плечевая точка от линии проймы', '3,5 − 0,08·Шс', 35 - 0.08 * m.backWidth)
  const R2 = v(RR2, 0)
  const R3 = v(RR1, -R1R3)
  const Pp = v(A.x + AP, A.y)
  const R3P = c('Р3П', 'Длина плеча', 'по чертежу', dist(R3, Pp))
  const vv = along(R3, Pp, 0.4 * R3P)
  const GG4 = c('ГГ4', 'Направление плечевой вытачки', '0,17·Шс + 0,5·СО + 0,7', 0.17 * m.backWidth + 0.5 * COsp + 7)
  const G4 = v(GG4, RG)
  const v1 = mid(vv, G4)
  const angle = c('∠в', 'Угол плечевой вытачки, °', 'β − 1,7·t − 0,9·СО', o.backDartAngle - 1.7 * (o.shoulderPad / 10) - 0.9 * (COsp / 10), '°')
  // The part of the shoulder beyond the dart turns about the dart tip, so the
  // seam keeps the length Р3П and the dart opens towards the armhole.
  const v2 = rotate(vv, angle, v1)
  const P1 = rotate(Pp, angle, v1)

  // ---- Полочка
  const T1T4 = c('Т1Т4', 'Центр груди от середины', '0,5·Цг + 0,5·СО + 0,4', 0.5 * m.bustSpan + 0.5 * COp + 4)
  const T4C = c('Т4Ц', 'Высота центра груди от талии', 'Дтп − Вг + 0,15', m.frontLength - m.bustHeight + 1.5)
  c('ЦЦ2', 'Радиус нагрудной вытачки (справочно)', 'Вг − Впрп + 0,5·СО + 0,4', m.bustHeight - m.armholeDepthFront + 0.5 * COp + 4)
  const C2C3 = c('Ц2Ц3', 'Раствор нагрудной вытачки', '0,5·(Ог2 − Ог1 − 1,2)', 0.5 * (m.bustFull - m.bustUpper - 12))
  const C4C5 = c('Ц4Ц5', 'Ширина горловины полочки', '0,18·Ош + 0,3', 0.18 * m.neck + 3)
  const CR4 = c('ЦР4', 'От центра груди до плечевой точки горловины', 'Двт − (Дтс + 0,07·Ош) − (Дтп − Вг) + СО + 0,3', m.torsoArc - (m.backLength + 0.07 * m.neck) - (m.frontLength - m.bustHeight) + COp + 3)
  const R4R5 = c('Р4Р5', 'Глубина горловины полочки', '0,205·Ош + 0,4', 0.205 * m.neck + 4)

  const T4 = v(T1.x - T1T4, T1.y)
  const C = v(T4.x, T1.y - T4C)
  // Горловина полочки: Р4 на вертикали горловины, на расстоянии ЦР4 от центра груди.
  const d5 = T1T4 - C4C5
  if (CR4 <= Math.abs(d5)) throw new Error('ЦР4 меньше расстояния до линии горловины: проверьте Двт, Дтс и Дтп')
  const R4 = v(T1.x - C4C5, C.y - Math.sqrt(CR4 * CR4 - d5 * d5))
  const R6 = v(T1.x, R4.y + R4R5)
  // Допущение: ширина полочки Г2Г3 включает половину разницы Ог2 − Ог1, то есть
  // раствор нагрудной вытачки Ц2Ц3. Открываем эту вытачку в плечо на 0,4 длины
  // плеча от горловины (как плечевую вытачку спинки); плечевую точку П3 находим
  // засечками от О4 радиусом О4А1 и от внешней стороны вытачки радиусом 0,6·Р3П,
  // так что плечо полочки без вытачки равно плечу спинки.
  const S = along(R4, A1, 0.4 * R3P)
  const beta = (2 * Math.asin(Math.min(1, C2C3 / 2 / dist(C, S))) * 180) / Math.PI
  const S2 = rotate(S, -beta, C)
  let P3: Vec
  try {
    P3 = circlesX(O4, dist(O4, A1), S2, 0.6 * R3P, (p, q) => (dist(p, A1) < dist(q, A1) ? p : q))
  } catch {
    // The shoulder does not reach the armhole circle: end it on the straight line to А1.
    P3 = along(S2, A1, 0.6 * R3P)
    warnings.push('Плечо полочки не дотягивается до проймы: проверьте Шг, Ог1, Ог2, Ош и Шс.')
  }
  const PA1 = c('ПА1', 'Плечевая точка полочки за линией проймы', 'по чертежу', A1.x - P3.x)
  if (PA1 < -10)
    warnings.push(`Плечевая точка полочки на ${(-PA1 / 10).toFixed(1)} см внутри линии проймы: проверьте Шг, Ог1, Ог2 и Шс. Если мерки верны, проверьте плечо на макете.`)

  // ---- Талия и вытачки
  const T2T5 = c('Т2Т5', 'Ширина по талии', '0,5·От + СО + 0,45', 0.5 * m.waist + o.easeWaist + 4.5)
  const TT2 = 7.5
  const Rvt = c('Рвт', 'Сумма вытачек по талии', 'ГГ3 − (ТТ2 + Т2Т5)', GG3 - (TT2 + T2T5))
  const T3T6 = c('Т3Т6', 'Подъём талии у бокового шва', 'Дсб − Дсп − 0,8', m.waistToFloor - m.waistToFloorFront - 8)
  const dCB = c('ТТ7', 'Отвод середины спинки по талии', '0,1·Рвт', 0.1 * Rvt)
  const dB = c('Вт сп', 'Вытачка спинки (половина)', '0,15·Рвт', 0.15 * Rvt)
  const dF = c('Вт п', 'Вытачка полочки (половина)', '0,12·Рвт', 0.12 * Rvt)
  const dS = c('Вт б', 'Боковая вытачка (половина)', '0,18·Рвт', 0.18 * Rvt)
  if (Rvt < 0) warnings.push('Талия с прибавкой шире груди: вытачки по талии не нужны.')

  const T7 = v(TT2 + dCB, RT)
  const T6 = v(O2.x, RT - T3T6)
  const sideB = v(T6.x - dS, T6.y)
  const sideF = v(T6.x + dS, T6.y)
  // Допущение: ось вытачки спинки — середина ширины спинки, вершина на 2 см ниже линии груди;
  // вершина вытачки полочки на 3 см ниже центра груди.
  const xB = GG1 / 2
  const backDart = dart(atX(T7, sideB, xB - dB), atX(T7, sideB, xB + dB), v(xB, RG + 20))
  const frontDart = dart(atX(sideF, T1, T4.x - dF), atX(sideF, T1, T4.x + dF), v(T4.x, C.y + 30))

  // ---- Контуры
  const backNeck = new Line(P).to(R2).smooth(v(1, 0), v(norm(sub(vv, R3)).y, -norm(sub(vv, R3)).x), R3, 0.45)
  const sB = norm(sub(P1, v2))
  const backArmhole = arc(new Line(P1).smooth(v(-sB.y, sB.x), v(0, 1), O3, 0.45), v(O.x + OO2, O.y - OO2), O2)
  const backOutline = new Line(T7)
    .to(G)
    .to(P)
    .append(backNeck)
    .to(vv)
    .to(v1)
    .to(v2)
    .to(P1)
    .append(backArmhole)
    .to(sideB)
    .to(backDart.right)
    .to(backDart.tip)
    .to(backDart.left)
    .to(T7)

  const sF = norm(sub(S2, P3))
  const frontArmhole = arc(new Line(O2), v(O1.x - O1O2, O1.y - O1O2), O4).smooth(v(0, -1), v(sF.y, -sF.x), P3, 0.45)
  const frontNeck = new Line(R4).smooth(v(0, 1), v(1, 0), R6, 0.55)
  const frontOutline = new Line(T1)
    .to(frontDart.right)
    .to(frontDart.tip)
    .to(frontDart.left)
    .to(sideF)
    .to(O2)
    .append(frontArmhole)
  frontOutline.to(S2).to(C).to(S).to(R4).append(frontNeck).to(T1)

  const armholeBack = backArmhole.length()
  const armholeFront = frontArmhole.length()
  const armhole = armholeBack + armholeFront
  const shoulderBack = dist(R3, vv) + dist(v2, P1)
  const shoulderFront = dist(R4, S) + dist(S2, P3)
  const sideBack = dist(O2, sideB)
  const sideFront = dist(O2, sideF)
  const waistBack = dist(T7, backDart.left) + dist(backDart.right, sideB)
  const waistFront = dist(sideF, frontDart.left) + dist(frontDart.right, T1)

  // ---- Рукав
  const SHPr = c('ШПр', 'Ширина проймы', 'Г1Г2', G1G2)
  const DPr = c('ДПр', 'Длина проймы по формуле', '0,93·Дп + 0,57·ШПр + 2·Г1О + 1,8', 0.93 * m.armholeArc + 0.57 * SHPr + 2 * G1O + 18)
  c('ДПр ч', 'Длина проймы по чертежу', 'спинка + полочка', armhole)
  const POR = c('ПОР', 'Посадка оката', 'Н·ДПр', o.capEase * DPr)
  const DOR = c('ДОР', 'Длина оката', 'ДПр·(1 + Н)', DPr + POR)
  const SHOR = c('ШОР', 'Ширина оката', 'dпзр + 4,5 + СО + 0,2', m.armDepth + 45 + o.easeSleeve + 2)
  const t = 0.25 - (SHOR / DOR) ** 2
  if (t <= 0) throw new Error('Окат не строится: ширина оката больше половины его длины')
  const VOR = c('ВОР', 'Высота оката', '0,885·ДОР·√(0,25 − (ШОР/ДОР)²)', 0.885 * DOR * Math.sqrt(t))
  const lenSleeve = c('АН', 'Длина рукава от вершины оката', 'Дзап − Р3П + 3,7', m.armLength + m.shoulderLength - R3P + 37)
  const lenElbow = c('АЛ', 'Линия локтя от вершины оката', 'Длуч − Р3П + 2,06', m.elbowLength + m.shoulderLength - R3P + 20.6)
  const hemHalf = c('Н1Н2', 'Половина ширины низа рукава', '0,5·Оз + 4,78', 0.5 * m.wrist + 47.8)

  // Допущение: окат строим плавной кривой через вспомогательные точки на 1/4 и 3/4
  // ширины, а ширину рукава подбираем так, чтобы окат был длиннее проймы
  // по чертежу ровно на посадку ПОР.
  // Рукав одношовный прямой, без локтевой вытачки (её добавит моделирование).
  const cap = (w: number) => {
    const top = v(w / 2 + 10, 0)
    const back = through([v(0, VOR), v(w * 0.25, VOR * 0.42), top], v(1, -0.35), v(1, 0))
    const front = through([top, v(w * 0.75, VOR * 0.5), v(w, VOR)], v(1, 0), v(1, 0.5))
    return { top, back, front, len: back.length() + front.length() }
  }
  let lo = VOR
  let hi = 4 * VOR
  for (let i = 0; i < 60; i++) {
    const w = (lo + hi) / 2
    if (cap(w).len < armhole + POR) lo = w
    else hi = w
  }
  const W = c('ШР', 'Ширина рукава (по длине оката)', 'подбор', (lo + hi) / 2)
  const capC = cap(W)
  const sleeveEaseArm = c('ШР − Оп', 'Свобода рукава по обхвату плеча', 'ШР − Оп', W - m.upperArm)
  if (sleeveEaseArm < 20) warnings.push(`Рукав шире руки всего на ${(sleeveEaseArm / 10).toFixed(1)} см: увеличьте прибавку по рукаву или посадку оката.`)

  const hemB = v(W / 2 - hemHalf, lenSleeve)
  const hemF = v(W / 2 + hemHalf, lenSleeve)
  const sleeveOutline = new Line(v(0, VOR)).append(capC.back).append(capC.front).to(hemF).to(hemB).to(v(0, VOR))

  const backPiece = toPiece({
    id: 'emko-bodice-back',
    title: 'Спинка',
    outline: backOutline,
    extra: [{ role: 'mark', line: new Line(G).to(v(G1.x, RG)) }],
    grain: [v(GG1 * 0.35, RG + 30), v(GG1 * 0.35, RT - 40)],
    labels: [
      { at: v(10, RG - 40), text: 'Спинка', size: 7 },
      { at: v(10, RG - 28), text: 'Крой 2 (шов посередине)' },
      { at: v(10, RG - 18), text: 'ЕМКО СЭВ · без припусков' },
    ],
    seams: { shoulder: shoulderBack, side: sideBack, armhole: armholeBack, waist: waistBack },
  })
  const frontPiece = toPiece({
    id: 'emko-bodice-front',
    title: 'Полочка',
    outline: frontOutline,
    fold: [R6, T1],
    grain: [v(T1.x - 25, RG), v(T1.x - 25, T1.y - 40)],
    labels: [
      { at: v(G2.x + 15, RG + 40), text: 'Полочка', size: 7 },
      { at: v(G2.x + 15, RG + 52), text: 'Крой 1 со сгибом' },
      { at: v(G2.x + 15, RG + 62), text: 'ЕМКО СЭВ · без припусков' },
    ],
    seams: { shoulder: shoulderFront, side: sideFront, armhole: armholeFront, waist: waistFront },
  })
  const sleevePiece = toPiece({
    id: 'emko-sleeve',
    title: 'Рукав',
    outline: sleeveOutline,
    extra: [
      { role: 'mark', line: new Line(v(0, VOR)).to(v(W, VOR)) },
      { role: 'mark', line: new Line(atXY(v(0, VOR), hemB, lenElbow)).to(atXY(v(W, VOR), hemF, lenElbow)) },
    ],
    grain: [v(capC.top.x, VOR * 0.6), v(capC.top.x, lenSleeve - 60)],
    labels: [
      { at: v(W * 0.3, VOR + 40), text: 'Рукав', size: 7 },
      { at: v(W * 0.3, VOR + 52), text: 'Крой 2' },
      { at: v(W * 0.3, VOR + 62), text: 'ЕМКО СЭВ · без припусков' },
      { at: v(W * 0.3, lenElbow - 4), text: 'линия локтя', size: 4 },
    ],
    seams: { cap: capC.len, underarm: dist(v(0, VOR), hemB) },
  })

  return {
    pieces: [backPiece, frontPiece, sleevePiece],
    points: {
      neckCB: P, chestCB: G, waistCB: T7, waistLevelCB: v(0, RT),
      neckSideBack: R3, shoulderBack: P1, backDartTip: v1, backDartLeft: vv, backDartRight: v2,
      armholeBottom: O2, armholeBackNotch: O3, armholeFrontNotch: O4,
      waistSideBack: sideB, waistSideFront: sideF,
      waistCF: T1, neckCF: R6, neckSideFront: R4, shoulderFront: P3, bustPoint: C,
      bustDartLeft: S2, bustDartRight: S,
      waistDartBackTip: backDart.tip, waistDartFrontTip: frontDart.tip,
      capTop: capC.top,
    },
    steps,
    checks: [
      check('shoulder', 'Плечевые срезы: спинка и полочка', shoulderBack, shoulderFront, 0, 2),
      check('side', 'Боковые срезы: спинка и полочка', sideBack, sideFront, 0, 2),
      check('armhole', 'Пройма по чертежу и по формуле ДПр', armhole, DPr, 0, 30),
      check('cap', `Окат и пройма: посадка ${(POR / 10).toFixed(1)} см`, capC.len, armhole, POR, 3),
      check('underarm', 'Нижние срезы рукава', dist(v(0, VOR), hemB), dist(v(W, VOR), hemF), 0, 1),
      check('waist', 'Талия лифа и ширина по талии Т2Т5 (половина)', waistBack + waistFront, T2T5, 0, 10),
    ],
    warnings,
  }
}

/** Point on line ab at height y (sleeve lines are almost vertical). */
function atXY(a: Vec, b: Vec, y: number): Vec {
  return add(a, mul(sub(b, a), (y - a.y) / (b.y - a.y)))
}
