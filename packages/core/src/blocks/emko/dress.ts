import { Line, add, along, circlesX, dist, lineX, mid, mul, norm, rotate, sub, v, type Vec } from '../../draft/geom'
import { Outline, netPiece, type FishDart, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Платье полуприлегающего силуэта с втачным одношовным рукавом, ЕМКО СЭВ
 * (базовая конструкция, без припусков).
 *
 * After «Единая методика конструирования одежды СЭВ», vol. 2 «Базовые
 * конструкции женской одежды», 1988: table 6 (pp. 67–71, 73, 75), БК of back
 * and front (fig. 29), ИМК darts (fig. 30) and БК of the sleeve (fig. 31).
 * Point numbers are the book's. Book constants in cm are ×10 here. T-codes are
 * the size features of ОСТ 17-326-81 / ГОСТ 31396-2009:
 *
 *   Т7 waist height, Т12 gluteal fold height, Т13 neck, Т14/Т15/Т16 bust
 *   girths 1/2/3, Т18 waist, Т19 hips, Т25/Т26 waist to floor at the side and
 *   in front, Т29 wrist, Т32/Т33 neck point to elbow/wrist, Т34–Т36 neck point
 *   to the Ог1 line / bust point / front waist, Т38 arc over the shoulder
 *   joint, Т39 back armhole depth, Т40 back waist length, Т44 arc over the
 *   neck point, Т45 chest width, Т46 bust span, Т47 back width, Т57 arm depth.
 *
 * Deviations and readings where the book leaves room:
 *  - Т35 − Т34 (bust point below the Ог1 line) has no measurement in the app;
 *    it is estimated from table 12 of the book as 0,1·Т16 + 0,5 cm.
 *  - β34, the back shoulder dart angle without ease, is taken from table 12
 *    (12,5° for Ог3 88, 13° for 92–108, 14° from 112). The book reduces it by
 *    2,2° for the semi-fitted ease (13,5° → 11,3°); the reduction is scaled
 *    with the chest ease, since the ease terms of its formula are not legible.
 *  - The shoulder dart length 122–22 is 0,45·|122–32| (the book: 0,4–0,5).
 *  - The front neck and shoulder are built rotated about the bust point as in
 *    fig. 29; the centre-front dart 372–36–372′ is then moved into the
 *    shoulder at 16–162 = 4,5 cm, as fig. 30 does.
 *  - Waist darts as in fig. 30 («по модели»: back dart under the middle of
 *    the back width, 18 cm above the waist; front dart from the bust point).
 *    The book's dт and dб come out a few mm off its own formulas; we follow
 *    the formulas.
 *  - Below the hip line the sides go straight down; length below the waist
 *    is Ди. The front hem is 1,5 cm lower at the centre front, as in the book.
 *  - The sleeve is drafted folded, as in fig. 31, and unfolded about the two
 *    fold lines; the seam runs from the armhole bottom 341 to the middle of
 *    the wrist 94. The wrist line is straight.
 *
 * Frame: x to the right from the centre back, y down from the back neck point
 * 11. Back on the left, front on the right as in the book; the sleeve is
 * drawn separately with its cap top at the origin.
 */
export interface EmkoDressOptions extends Record<string, number> {
  /** Прибавка к полуобхвату груди Пг (ширина сетки), mm. */
  chestEase: number
  /** Прибавка к полуобхвату талии Пт, mm. */
  waistEase: number
  /** Прибавка к полуобхвату бёдер Пб, mm. */
  hipEase: number
  /** Углубление проймы 33–331, mm. */
  armholeDrop: number
  /** Посадка оката Н, доля длины проймы. */
  capEase: number
}

const EASE: Record<Silhouette, Pick<EmkoDressOptions, 'chestEase' | 'waistEase' | 'hipEase'>> = {
  fitted: { chestEase: 35, waistEase: 25, hipEase: 25 },
  semi: { chestEase: 51, waistEase: 70, hipEase: 55 },
  straight: { chestEase: 65, waistEase: 100, hipEase: 65 },
}

export const EMKO_DRESS_REQUIRED = [
  'bust', 'bustUpper', 'bustFull', 'waist', 'hips', 'neck',
  'backLength', 'armholeDepth', 'backWidth', 'chestWidth', 'bustSpan', 'bustHeight', 'frontLength',
  'armholeArc', 'torsoArc', 'armDepth',
  'waistToFloorBack', 'glutealFoldHeight', 'waistToFloor', 'waistToFloorFront', 'skirtLength',
  'shoulderLength', 'armLength', 'elbowLength', 'wrist',
] as const

export const emkoDress: BlockDef<EmkoDressOptions> = {
  id: 'emko-dress',
  title: 'Платье с втачным рукавом',
  method: 'emko',
  garment: 'dress',
  required: EMKO_DRESS_REQUIRED,
  options: [
    { id: 'chestEase', short: 'Пг', title: 'Прибавка по груди (к полуобхвату)', min: 20, max: 100, step: 1 },
    { id: 'waistEase', short: 'Пт', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 150, step: 1 },
    { id: 'hipEase', short: 'Пб', title: 'Прибавка по бёдрам (к полуобхвату)', min: 0, max: 100, step: 1 },
    { id: 'armholeDrop', title: 'Углубление проймы', min: 10, max: 60, step: 1, hint: 'Насколько низ проймы ниже уровня подмышек. В учебнике 3,5 см.' },
    {
      id: 'capEase', short: 'Н', title: 'Посадка оката (доля длины проймы)', min: 0, max: 0.12, step: 0.01,
      hint: 'Насколько окат длиннее проймы. В учебнике 0,08 для шерсти; для тонких и плотных тканей меньше.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], armholeDrop: 35, capEase: 0.08 }),
  draft: draftEmkoDress,
}

type M = Record<(typeof EMKO_DRESS_REQUIRED)[number], number>

const DEG = Math.PI / 180

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

/** Tangent point from an outside point p to the circle (c, r), the one picked. */
function tangentPoint(p: Vec, c: Vec, r: number, pick: (a: Vec, b: Vec) => Vec): Vec {
  const m = mid(p, c)
  return circlesX(m, dist(m, c), c, r, pick)
}

const mirrorX = (p: Vec, x: number): Vec => v(2 * x - p.x, p.y)

/** Shoulder dart angle without ease, table 12 of the book. */
function beta34(bustMm: number): number {
  const b = bustMm / 10
  if (b <= 88) return 12.5
  if (b <= 92) return 12.5 + ((b - 88) / 4) * 0.5
  if (b <= 108) return 13
  if (b <= 112) return 13 + (b - 108) / 4
  return 14
}

export function draftEmkoDress(m: M, o: EmkoDressOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []

  // Ease of the grid, split as in the book: 1,35 / 2,90 / 0,85 of 5,10 cm.
  const eB = (o.chestEase * 13.5) / 51
  const eA = (o.chestEase * 29) / 51
  const eF = (o.chestEase * 8.5) / 51
  const T35_34 = 0.1 * m.bust + 5

  // ---- Grid (fig. 29) ----
  const y21 = c('11–21', 'Уровень лопаток', '0,3·Т40 + П', 0.3 * m.backLength + 10.3)
  const y31 = c('11–31', 'Уровень груди (глубина проймы)', 'Т39 + П', m.armholeDepth + 10.9)
  const y41 = c('11–41', 'Линия талии', 'Т40 + П', m.backLength + 13.2)
  const hipD = c('41–51', 'Линия бёдер от талии', '0,65·(Т7 − Т12) + П', 0.65 * (m.waistToFloorBack - m.glutealFoldHeight) + 1.9)
  const w31_33 = c('31–33', 'Ширина спинки', '0,5·Т47 + П', 0.5 * m.backWidth + eB)
  const w33_35 = c('33–35', 'Ширина проймы', 'Т57 + П', m.armDepth + eA)
  const w35_37 = c('35–37', 'Ширина полочки', '0,5·(Т45 + Т15 − 1,2 − Т14) + П', 0.5 * (m.chestWidth + m.bustFull - 12 - m.bustUpper) + eF)
  const W = c('31–37', 'Ширина сетки', '|31–33| + |33–35| + |35–37|', w31_33 + w33_35 + w35_37)
  const h37_47 = c('37–47', 'Перед: от линии груди до талии', 'Т40 − Т39 + П', m.backLength - m.armholeDepth + 2)
  const len = c('41–91', 'Длина от талии до низа', 'Ди', m.skirtLength)

  const x33 = w31_33
  const x35 = w31_33 + w33_35
  const yW = y31 + h37_47
  const y51 = y41 + hipD

  // ---- Armhole (fig. 29) ----
  const h13 = c('33–13', 'Высота проймы спинки', '0,49·Т38 + П', 0.49 * m.armholeArc + 9.1)
  const h15 = c('35–15', 'Высота проймы полочки', '0,43·Т38 + П', 0.43 * m.armholeArc + 8.9)
  const drop = c('33–331', 'Углубление проймы', 'П', o.armholeDrop)
  const rB = c('331–341', 'Радиус низа проймы спинки', '0,62·|33–35| + 0,5', 0.62 * w33_35 + 5)
  const rF = c('351–341′', 'Радиус низа проймы полочки', '0,38·|33–35| − 0,5', 0.38 * w33_35 - 5)
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

  // ---- Back neck and shoulder ----
  const nB = c('11–12', 'Ширина горловины спинки', '0,18·Т13 + П', 0.18 * m.neck + 2)
  const hB = c('12–121', 'Высота горловины спинки', '0,07·Т13 + П', 0.07 * m.neck - 3.5)
  const P11 = v(0, 0)
  const P12 = v(nB, 0)
  const P121 = v(nB, -hB)
  const P112 = v(0.25 * nB, 0)
  const d13_14 = c('13–14', 'Конец плеча спинки от вертикали проймы', '3,5 − 0,08·Т47', 35 - 0.08 * m.backWidth)
  const P14 = v(x33 + d13_14, P13.y)
  const shoulder = c('121–14', 'Плечо спинки без вытачки', '|121–14|', dist(P121, P14))
  const P32 = v(c('31–32', 'Ось вытачки спинки', '0,17·Т47 + П', 0.17 * m.backWidth + 7), y31)
  const P122 = along(P121, P14, 0.4 * shoulder)
  const P22 = along(P122, P32, c('122–22', 'Длина плечевой вытачки', '0,45·|122–32|', 0.45 * dist(P122, P32)))
  const b34 = c('β34', 'Угол вытачки без прибавок (табл. 12)', 'β34', beta34(m.bust), '°')
  const dartB = c('122–22–122′', 'Угол плечевой вытачки', 'β34 − 2,2°·Пг/5,1', b34 - (2.2 * o.chestEase) / 51, '°')
  const P122r = rotate(P122, dartB, P22)
  const P14r = rotate(P14, dartB, P22)

  // ---- Front (fig. 29), first in the rotated position ----
  const P47 = v(W, yW)
  const P46 = v(W - c('47–46', 'Центр груди от середины переда', '0,5·Т46 + П', 0.5 * m.bustSpan + 4), yW)
  const P36 = v(P46.x, yW - c('46–36', 'Высота центра груди от талии', 'Т36 − Т35 + П', m.frontLength - m.bustHeight + 1.5))
  const P371 = v(W, P36.y)
  const r372 = c('36–372', 'Радиус нагрудной вытачки', 'Т35 − Т34 + П (Т35 − Т34 ≈ 0,1·Т16 + 0,5)', T35_34 + 4)
  const chord = c('372–372′', 'Раствор нагрудной вытачки', '0,5·(Т15 − 1,2 − Т14)', 0.5 * (m.bustFull - 12 - m.bustUpper))
  const gamma = c('γ', 'Угол нагрудной вытачки', '2·arcsin(|372–372′| / 2|36–372|)', (2 * Math.asin(Math.min(1, chord / (2 * r372)))) / DEG, '°')
  const P371r = rotate(P371, -gamma, P36)
  const nF = c('371′–361', 'Ширина горловины полочки', '0,18·Т13 + П', 0.18 * m.neck + 3)
  const P361 = along(P371r, P36, nF)
  const R16 = c('36–16', 'От центра груди до плеча у шеи', 'Т44 − (Т40 + 0,07·Т13) − (Т36 − Т35) + П',
    m.torsoArc - (m.backLength + 0.07 * m.neck) - (m.frontLength - m.bustHeight) + 9.5)
  const up = norm(rotate(sub(P371r, P36), -90)) // perpendicular to 36–371′, pointing up
  const d361 = dist(P36, P361)
  const P16 = add(P361, mul(up, Math.sqrt(Math.max(0, R16 * R16 - d361 * d361))))
  const P161 = along(P16, P361, c('16–161', 'Глубина горловины полочки', '0,205·Т13 + П', 0.205 * m.neck + 4))
  const P17 = add(P161, sub(P371r, P361))
  const P14f = circlesX(P16, shoulder, v(x35, y31), h15, (a, b) => (a.x < b.x ? a : b))

  // ---- Move the centre-front dart into the shoulder (fig. 30) ----
  const P162 = along(P16, P14f, 45)
  const back = (p: Vec) => rotate(p, gamma, P36)
  const Q16 = back(P16)
  const Q17 = back(P17)
  const Q161 = back(P161)
  const Q162 = back(P162)
  const frontNeck = new Line(Q17).smooth(sub(Q161, Q17), sub(Q16, Q161), Q16, 0.55)
  // Equalise the shoulder dart legs.
  const legF = Math.max(dist(P36, Q162), dist(P36, P162))
  const D1 = along(P36, Q162, legF)
  const D2 = along(P36, P162, legF)

  // ---- Waist and hips, darts (fig. 30) ----
  const wl = c('411–470', 'Талия с прибавкой', '0,5·Т18 + Пт', 0.5 * m.waist + o.waistEase)
  const hl = c('511–570', 'Бёдра с прибавкой', '0,5·Т19 + Пб', 0.5 * m.hips + o.hipEase)
  const dt = c('dт', 'Сумма вытачек по талии', '|31–37| − (|41–411| + |411–470|)', W - (7.5 + wl))
  const db = c('dб', 'Расширение по бёдрам', '(|51–511| + |511–570|) − |31–37|', 7.5 + hl - W)
  const sB = c('42–421', 'Вытачка спинки (половина)', '0,18·dт', 0.18 * Math.max(0, dt))
  const sS = c('442–443', 'Боковая вытачка (половина)', '0,12·dт', 0.12 * Math.max(0, dt))
  const sF = c('46–461', 'Вытачка полочки (половина)', '0,2·dт', 0.2 * Math.max(0, dt))
  const shift = c('441–442', 'Смещение бока по талии', 'Т25 − Т26 − 0,8', m.waistToFloor - m.waistToFloorFront - 8)
  const P42 = v(0.5 * x33, y41)
  const P321 = v(P42.x, y41 - 180)
  const P521 = v(P42.x, y41 + 0.7 * hipD)
  const P56 = v(P46.x, y51)
  const P442 = v(xSide - shift, y41)
  const P443 = v(P442.x - sS, y41)
  const P443f = v(P442.x + sS, y41)
  const P542b = v(xSide + 0.5 * db, y51)
  const P542f = v(xSide - 0.5 * db, y51)
  const yHem = y41 + len
  const P911 = v(7.5, yHem)
  const P411 = v(7.5, y41)
  const P511 = v(7.5, y51)
  const P97 = v(W, yW + len + 15)

  if (dt < 0) warnings.push('Талия с прибавкой шире сетки по груди: вытачки по талии не нужны.')
  if (db < 0) warnings.push('Бёдра с прибавкой у́же сетки по груди: бок от бёдер вниз сужается.')
  if (2 * sF > 50) warnings.push(`Вытачка полочки по талии ${fmt(2 * sF)}: шире 5 см, лучше разложить на две или в рельеф.`)
  if (R16 <= d361) warnings.push('Мерки дуги через основание шеи (Т44) и длины спины не сходятся: плечо полочки построено условно.')

  // ---- Back outline ----
  const backNeck = new Line(P11).to(P112).smooth(v(1, 0), v(0.35, -1), P121)
  const backArmhole = new Line(P14r).smooth(rotate(sub(P14r, P122r), 90), v(0, 1), P332, 0.45)
  arc(backArmhole, P342, P332, P341)
  const backEdges = new Outline(P911, 'cb')
    .to(P511)
    .to(P411)
    .to(v(0, y31))
    .to(P11)
    .edge('neck')
    .append(backNeck)
    .edge('shoulder')
    .to(P122)
    .dart('shoulder', P22, P122r, 'a')
    .to(P14r)
    .edge('armhole')
    .append(backArmhole)
    .edge('side')
    .to(P443)
    .to(P542b)
    .to(v(P542b.x, yHem))
    .edge('hem')
    .close()
  const backFish: FishDart = { id: 'waist', top: P321, left: v(P42.x - sB, y41), bottom: P521, right: v(P42.x + sB, y41) }

  // ---- Front outline ----
  const frontArmhole = arc(new Line(P341), P343, P341, P352).smooth(v(0, -1), rotate(sub(P14f, P16), 90), P14f, 0.45)
  const frontEdges = new Outline(v(P542f.x, yHem), 'side')
    .to(P542f)
    .to(P443f)
    .to(P341)
    .edge('armhole')
    .append(frontArmhole)
    .edge('shoulder')
    .to(D2)
    .dart('bust', P36, D1, 'b', 20)
    .to(Q16)
    .edge('neck')
    .append(frontNeck.reversed())
    .edge('cf', 'fold')
    .to(P47)
    .to(P97)
    .edge('hem')
    .close()
  const frontFish: FishDart = { id: 'waist', top: P36, left: v(P46.x - sF, y41), bottom: P56, right: v(P46.x + sF, y41) }

  // ---- Measured seams ----
  const backArmLen = backArmhole.length()
  const frontArmLen = frontArmhole.length()
  const armhole = backArmLen + frontArmLen
  const shoulderBack = dist(P121, P122) + dist(P122r, P14r)
  const shoulderFront = dist(Q16, D1) + dist(D2, P14f)
  const sideBack = dist(P341, P443) + dist(P443, P542b) + (yHem - y51)
  const sideFront = dist(P341, P443f) + dist(P443f, P542f) + (yHem - y51)

  // ---- Sleeve (fig. 31) ----
  const DP = c('ДП', 'Длина проймы по формуле', '0,93·Т38 + (П33–13 + П35–15) + 0,57·(Т57 + П33–35) + 2·|33–331|',
    0.93 * m.armholeArc + 18 + 0.57 * (m.armDepth + eA) + 2 * drop)
  const POR = c('ПОР', 'Посадка оката', 'Н·ДП', o.capEase * DP)
  const DOR = c('ДОР', 'Длина оката', '(1 + Н)·ДП', DP + POR)
  const SHOR = c('351–333', 'Ширина рукава в сложенном виде (ШОР)', 'Т57 + 4,5 + П', m.armDepth + 45 + 29.5)
  const VOR = c('333–13', 'Высота оката (ВОР)', '0,885·ДОР·√(0,25 − (ШОР/ДОР)²)',
    0.885 * DOR * Math.sqrt(Math.max(0, 0.25 - (SHOR / DOR) ** 2)))
  const sl = c('13–93', 'Длина рукава', 'Т33 − |121–14| + П', m.shoulderLength + m.armLength - shoulder + 37)
  const el = c('13–43', 'Длина рукава до локтя', 'Т32 − |121–14| + П', m.shoulderLength + m.elbowLength - shoulder + 20.6)
  const wr = c('95–931', 'Ширина рукава внизу (в сложенном виде)', '0,5·Т29 + П', 0.5 * m.wrist + 47.8)

  // Folded sleeve frame: 333 at the left fold, 351 at the right, cap top at y = 0.
  const S13 = v(0, 0)
  const S333 = v(0, VOR)
  const S351 = v(SHOR, VOR)
  const S15 = v(SHOR, 0)
  const S331 = v(SHOR - w33_35, VOR)
  const S342 = add(S331, v(rB, -rB))
  const S341 = add(S331, v(rB, 0))
  const S343 = add(S351, v(-rF, -rF))
  const S131 = v(0, c('13–131', 'Точка оката на заднем сгибе', '0,3·|333–13|', 0.3 * VOR))
  const S14 = v(0.45 * SHOR, 0)
  const S141 = v(0.73 * SHOR, 0)
  const S141r = mirrorX(S141, SHOR)
  const S345 = tangentPoint(S131, S342, rB, (a, b) => (a.x < b.x ? a : b))
  const S354 = tangentPoint(S141r, S343, rF, (a, b) => (a.y > b.y ? a : b))
  const S355 = lineX(S354, S141r, S15, S351)
  const S133r = lineX(S345, S131, S13, S15)
  const S133 = mirrorX(S133r, 0)
  const S134 = mid(S133, S131)
  const S144 = mid(S133, S141)
  const S143 = mid(S14, S141)
  const S142 = along(S141, S355, dist(S141, S15))
  const capTop = new Line(S131).curve(S134, S144, S14).curve(S143, S142, S355)
  // Lower cap parts, unfolded about the fold lines.
  const lowBack = arc(new Line(S341), S342, S341, S345).to(S131).map((p) => mirrorX(p, 0))
  const lowFront = new Line(S355).to(S354)
  arc(lowFront, S343, S354, S341)
  const lowFrontU = lowFront.map((p) => mirrorX(p, SHOR))
  const cap = lowBack.length() + capTop.length() + lowFrontU.length()

  // Folds below the armhole: 2° inwards to the elbow, then to the wrist.
  const tilt = Math.tan(2 * DEG)
  const yE = el
  const yWr = sl
  const L43 = v((yE - VOR) * tilt, yE)
  const R451 = v(SHOR - (yE - VOR) * tilt, yE)
  const R951 = v(SHOR - (yWr - VOR) * tilt, yWr)
  const L931 = v(SHOR - wr, yWr)
  // Inner seam (ИМК, fig. 32): parallel to the front fold at |351–341|; the
  // back half of the under sleeve is longer, the excess goes into an elbow dart.
  const foldL = (y: number) => (y <= yE ? ((y - VOR) * L43.x) / (yE - VOR) : L43.x + ((L931.x - L43.x) * (y - yE)) / (yWr - yE))
  const foldR = (y: number) => SHOR - (y - VOR) * tilt
  const seamAt = (y: number) => foldR(y) - rF
  const SL = (y: number) => v(2 * foldL(y) - seamAt(y), y)
  const SR = (y: number) => v(2 * foldR(y) - seamAt(y), y)
  const seamR = dist(SR(VOR), SR(yE)) + dist(SR(yE), SR(yWr))
  const seamLraw = dist(SL(VOR), SL(yE)) + dist(SL(yE), SL(yWr))
  const elbowDart = c('ВЛ', 'Вытачка по линии локтя', 'разница срезов шва', Math.max(0, seamLraw - seamR))
  const E1 = SL(yE)
  const E2 = along(E1, SL(yWr), elbowDart)
  const Etip = add(mid(E1, E2), v(Math.min(100, 0.3 * (SR(yE).x - E1.x)), 0))
  const seamL = seamLraw - elbowDart
  const sleeveEdges = new Outline(SL(yWr), 'seamBack')
    .to(E2)
    .dart('elbow', Etip, E1, 'a')
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
  if (elbowDart > 40) warnings.push(`Вытачка на локоть ${fmt(elbowDart)}: проверьте длину рукава и обхват запястья.`)

  // ---- Pieces ----
  const levels = { chest: y31, waist: y41, hip: y51 }
  const backPanel: Panel = {
    id: 'emko-dress-back',
    title: 'Спинка',
    role: 'back',
    method: 'ЕМКО СЭВ',
    edges: backEdges,
    fish: [backFish],
    marks: [
      { role: 'mark', line: new Line(v(0, y41)).to(P443) },
      { role: 'mark', line: new Line(v(0, y51)).to(v(P542b.x, y51)) },
    ],
    grain: [v(P42.x, y51 + 40), v(P42.x, yHem - 60)],
    cut: 'Крой 2 (шов посередине)',
    labelAt: v(12, y51 + 70),
    notes: [
      { at: v(12, y41 - 6), text: 'линия талии', size: 4 },
      { at: v(12, y51 - 6), text: 'линия бёдер', size: 4 },
    ],
    levels,
    notches: [],
    seams: { shoulder: shoulderBack, side: sideBack, armhole: backArmLen },
  }
  const frontPanel: Panel = {
    id: 'emko-dress-front',
    title: 'Полочка',
    role: 'front',
    method: 'ЕМКО СЭВ',
    edges: frontEdges,
    fish: [frontFish],
    marks: [
      { role: 'mark', line: new Line(P443f).to(P47) },
      { role: 'mark', line: new Line(v(P542f.x, y51)).to(v(W, y51)) },
    ],
    grain: [v(P46.x - 60, y51 + 40), v(P46.x - 60, yHem - 60)],
    cut: 'Крой 1 со сгибом',
    labelAt: v(xSide + 20, y51 + 70),
    notes: [],
    levels,
    notches: [],
    seams: { shoulder: shoulderFront, side: sideFront, armhole: frontArmLen },
  }
  const sleevePanel: Panel = {
    id: 'emko-dress-sleeve',
    title: 'Рукав',
    role: 'sleeve',
    method: 'ЕМКО СЭВ',
    edges: sleeveEdges,
    fish: [],
    marks: [
      { role: 'mark', line: new Line(S131).to(S333).to(L43).to(L931) },
      { role: 'mark', line: new Line(S355).to(S351).to(R451).to(R951) },
      { role: 'mark', line: new Line(Etip).to(SR(yE)) },
    ],
    grain: [v(S14.x, VOR + 40), v(S14.x, yWr - 60)],
    cut: 'Крой 2 (зеркально)',
    labelAt: v(S14.x - 40, VOR + 70),
    notes: [{ at: v(S14.x - 40, yE - 6), text: 'линия локтя', size: 4 }],
    levels: { chest: VOR, elbow: yE },
    notches: [],
    seams: { cap, seam: seamL },
  }

  return {
    panels: [backPanel, frontPanel, sleevePanel],
    pieces: [backPanel, frontPanel, sleevePanel].map(netPiece),
    points: {
      P11, P12, P121, P112, P13, P14, P14r, P122, P122r, P22, P32,
      P15, P331, P332, P341, P342, P343, P351, P352,
      P47, P46, P36, P371, P371r, P361, P16, P161, P17, P14f, P162,
      Q16, Q17, Q162, P42, P321, P521, P442, P443, P443f, P542b, P542f, P56,
      S131, S14, S141, S141r, S345, S354, S355, S133, S351, S333,
      chestBack: v(0, y31), waistBack: v(0, y41), hipBack: v(0, y51), shoulderMark: v(0, y21),
    },
    steps,
    checks: [
      check('shoulder', 'Плечевые срезы: спинка и полочка (без вытачек)', shoulderBack, shoulderFront, 0, 3),
      check('side', 'Боковые срезы: спинка и полочка (±1 см)', sideBack, sideFront, 0, 10),
      check('armhole', 'Длина проймы: по чертежу и по формуле ДП', armhole, DP, 0, 30),
      check('cap', 'Окат минус пройма = посадка ПОР', cap - armhole, POR, 0, 15),
      check('sleeveSeam', 'Шов рукава: два среза', seamL, seamR, 0, 5),
    ],
    warnings,
  }
}

const fmt = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`
