import { Line, add, along, circlesX, dist, lineX, mid, mul, norm, rotate, sub, through, toPiece, v, type Vec } from '../../draft/geom'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Платье прилегающего силуэта с одношовным втачным рукавом, система
 * М. Мюллер и сын (основа, без припусков).
 *
 * After «М. Мюллер и сын. Основные конструкции. Сборник» (Библиотека журнала
 * «Ателье», 2005), pp. 49–51, fig. 1–4: «Основной чертёж платья прилегающего
 * силуэта, размер 48», built on a typical figure. Point numbers are the
 * book's; values in mm (the book's cm ×10).
 *
 * Main measurements: Ог (bust), От, Об, Дсп (back length), Гпр (armhole
 * depth), Вб (hip height from the 7th vertebra), Ди, Др. For the typical
 * figure the book derives the rest from Ог (valid for Ог 100–116):
 *   Дгс = 1/10·½Ог + 2        back neck width
 *   Вг II = ¼Ог + 5            bust height from the top line
 *   Дтп II = Дсп + 4,5 + (Ог − 100)/10   front length on the dart line
 *   Шс = ⅛Ог + 5,5,  Шпр = ⅛Ог − 0,5,  Шг = ¼Ог − 5   (sum ½Ог)
 * We do the same, so this block depends on fewer measurements than ЕМКО.
 *
 * Grid (fig. 1): 1–2 = Гпр + 1 (chest line), 1–3 = Дсп (waist), 1–4 = Вб,
 * 1–5 = Ди. CB 1→6→7→8 with 3–6 = 4–7 = 2. 9 on the chest line; 9–10 = Шс,
 * 10–11 = ⅔Шпр, 11a–12 = ⅓Шпр, 12–13 = Шг (CF), 13–14 = 1/10·Ог + 0,5
 * (dart line). 1–15 = Дгс, 15–16 = 2. 17–18 = 1–1,5 down on the back width
 * line, shoulder 16→18 + 1 = 19. 10–20 = ¼|10–18|, 20–21 = 1,3 (back
 * notch). 12–22 = |10–20|, 12–23 = |10–18| − 2. 24–25 = Дтп II,
 * 25–26 = Вг II (bust point). 23–27 = 1/10·½Ог along the arc about 12.
 * 27–28 = back shoulder − 0,5…1 on the arc about 26. 29–30 = Дгс,
 * 29–31 = Дгс + 1. 28–32 = |30–25|, 26–33 = |26–32| (bust dart).
 * Waist: 34–35 = ¼От − 1…1,5; 35–36 = ½От + 2…3; the back excess 36–6 goes
 * 3–4 to the sides (raised 1 cm), 2–3,5 to the back dart at ⅓Шс + 2…3 from
 * 6; the front excess 35–37 to the front dart. Hips: 41–40 = ½Об + 2, the
 * lack 7–40 is added half to each side. Back shoulder raised 1 cm, front
 * lowered 1 cm. The shoulder blade dart (1–1,5 at the armhole, on the level
 * of the middle of 10–18) is moved into the back shoulder 4–5 from the neck.
 *
 * Sleeve (fig. 3–4): 1–2 = Вок = ½Впр(ч) − (0,2·Шпр + 0,5…1), 1–3 = Др,
 * 3–4 = 2, 2–5 = ½|2–4| − 1; front notch ¼Шпр above 2; from it
 * ½Дпр(ч) − 0,5…1,5 to the top line = 6; 1–9 = ½|1–6| + 1, 7–13 = |1–9|,
 * 10 = middle of 1–9, 11 = middle of notch–10, 6–12 = ¼Шпр + 0,5.
 * Front roll through the notch, 15, 14 (1 cm in), elbow roll 12–16–17,
 * 14–17 = ½ hem width. S = the front armhole from the notch to 11a laid on
 * the lower cap; the seam runs from S parallel to the front roll.
 *
 * Deviations: Гпр is taken from our measurement Впрз (ГОСТ, to the back
 * armpit corner) + 2,5 см, which is where Müller's tape sits under the arm
 * (on the typical 164-96 figure 17,9 + 2,5 ≈ 1/10·96 + 11). The one-seam
 * sleeve is unfolded about the rolls; the bend of the elbow roll gives an
 * elbow dart in the back seam. Hem width = Озап + ease (the book gives 24 см
 * for size 48 without a formula).
 *
 * Frame: as ЕМКО, x to the right from the centre back, y down from point 1
 * (the 7th vertebra level). The back is on the left, the front on the right
 * (the book draws it mirrored); the sleeve is placed to the right.
 */
export interface MullerDressOptions extends Record<string, number> {
  backEase: number
  armholeEase: number
  chestEase: number
  waistEase: number
  hipEase: number
  /** Прибавка к глубине проймы, mm (в книге 1 см). */
  depthEase: number
  /** Раствор вытачки на выпуклость лопаток у проймы, mm (1–1,5 см). */
  bladeDart: number
  /** Прибавка к обхвату запястья для ширины рукава внизу, mm. */
  sleeveHemEase: number
  /** Сколько вычесть из ½Дпр(ч) при построении оката, mm (в книге 0,5–1,5 см). */
  capReduce: number
}

const EASE: Record<Silhouette, Pick<MullerDressOptions, 'backEase' | 'armholeEase' | 'chestEase' | 'waistEase' | 'hipEase' | 'depthEase'>> = {
  // Book (fitted): Шс +0,5, Шпр +1,5, Шг +1,5 (sum 3,5 of 2–4), waist +2,5, hips +2, depth +1.
  fitted: { backEase: 5, armholeEase: 15, chestEase: 15, waistEase: 25, hipEase: 20, depthEase: 10 },
  semi: { backEase: 10, armholeEase: 20, chestEase: 15, waistEase: 50, hipEase: 25, depthEase: 15 },
  straight: { backEase: 10, armholeEase: 25, chestEase: 20, waistEase: 90, hipEase: 35, depthEase: 20 },
}

export const MULLER_DRESS_REQUIRED = [
  'bust', 'waist', 'hips', 'backLength', 'armholeDepth', 'waistToHips', 'skirtLength', 'armLength', 'wrist',
] as const

export const mullerDress: BlockDef<MullerDressOptions> = {
  id: 'muller-dress',
  title: 'Платье с втачным рукавом',
  method: 'muller',
  required: MULLER_DRESS_REQUIRED,
  options: [
    { id: 'backEase', title: 'Прибавка к ширине спины', min: 0, max: 20, step: 1, hint: 'В книге 0–0,5 см.' },
    { id: 'armholeEase', title: 'Прибавка к ширине проймы', min: 5, max: 40, step: 1, hint: 'В книге 1–2 см.' },
    { id: 'chestEase', title: 'Прибавка к ширине груди', min: 0, max: 30, step: 1, hint: 'В книге 1–1,5 см.' },
    { id: 'waistEase', title: 'Прибавка по талии (к полуобхвату)', min: 10, max: 120, step: 5, hint: 'В книге 2–3 см.' },
    { id: 'hipEase', title: 'Прибавка по бёдрам (к полуобхвату)', min: 10, max: 60, step: 5, hint: 'В книге 2 см.' },
    { id: 'depthEase', title: 'Прибавка к глубине проймы', min: 0, max: 40, step: 5, hint: 'В книге 1 см.' },
    { id: 'bladeDart', title: 'Вытачка на выпуклость лопаток', min: 0, max: 20, step: 1, hint: 'В книге 1–1,5 см у проймы, переводится в плечо.' },
    { id: 'sleeveHemEase', title: 'Ширина рукава внизу: прибавка к запястью', min: 30, max: 200, step: 5 },
    {
      id: 'capReduce', title: 'Уменьшение оката', min: 5, max: 30, step: 1,
      hint: 'От переднего знака до верха оката откладывают ½ длины проймы минус 0,5–1,5 см. Больше вычет — меньше посадка оката.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], bladeDart: 12, sleeveHemEase: 75, capReduce: 10 }),
  draft: draftMullerDress,
}

type M = Record<(typeof MULLER_DRESS_REQUIRED)[number], number>

/** Mirror p about the line through a and b. */
function mirror(p: Vec, a: Vec, b: Vec): Vec {
  const u = norm(sub(b, a))
  const d = sub(p, a)
  const t = d.x * u.x + d.y * u.y
  const f = add(a, mul(u, t))
  return sub(mul(f, 2), p)
}

const poly = (pts: Vec[]) => {
  const l = new Line(pts[0]!)
  for (const p of pts.slice(1)) l.to(p)
  return l
}
const plen = (pts: Vec[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i]!, p), 0)

/** Cut a polyline at arc length s from its start: [head, tail] sharing the cut point. */
function cutAt(pts: Vec[], s: number): [Vec[], Vec[]] {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1]!, pts[i]!)
    if (acc + d >= s) {
      const p = along(pts[i - 1]!, pts[i]!, s - acc)
      return [[...pts.slice(0, i), p], [p, ...pts.slice(i)]]
    }
    acc += d
  }
  return [pts, [pts[pts.length - 1]!]]
}

/** Cut a polyline where it first reaches level y going down/up. */
function cutAtY(pts: Vec[], y: number): [Vec[], Vec[]] {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) {
      const p = add(a, mul(sub(b, a), (y - a.y) / (b.y - a.y)))
      return [[...pts.slice(0, i), p], [p, ...pts.slice(i)]]
    }
  }
  throw new Error(`polyline does not reach y = ${y}`)
}

/** Perpendicular to a direction, turned to the side of `towards`. */
function perp(dir: Vec, towards: Vec): Vec {
  const n = norm(v(-dir.y, dir.x))
  return n.x * towards.x + n.y * towards.y >= 0 ? n : mul(n, -1)
}

/** Offset of the polyline a–b–c by d to the side of `side` (a point), joints at the intersections. */
function offset3(a: Vec, b: Vec, c: Vec, d: number, side: Vec): [Vec, Vec, Vec] {
  const n1 = mul(perp(sub(b, a), sub(side, a)), d)
  const n2 = mul(perp(sub(c, b), sub(side, b)), d)
  const j = lineX(add(a, n1), add(b, n1), add(b, n2), add(c, n2))
  return [add(a, n1), j, add(c, n2)]
}

export function draftMullerDress(m: M, o: MullerDressOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []
  const Og = m.bust

  // Auxiliary features of the typical figure (table p. 49).
  const Gpr = c('Гпр', 'Глубина проймы', 'Впрз + 2,5', m.armholeDepth + 25)
  const Dsp = c('Дсп', 'Длина спины', 'мерка', m.backLength)
  const Vb = c('Вб', 'Высота бёдер от 7-го позвонка', 'Дсп + Дтб', m.backLength + m.waistToHips)
  const Di = c('Ди', 'Длина изделия от 7-го позвонка', 'Дсп + Ди сбоку', m.backLength + m.skirtLength)
  const Dgs = c('Дгс', 'Ширина горловины спинки', '1/10·½Ог + 2', 0.05 * Og + 20)
  const Vg = c('Вг II', 'Высота груди', '¼Ог + 5', 0.25 * Og + 50)
  const Dtp = c('Дтп II', 'Длина переда по линии вытачки', 'Дсп + 4,5 + (Ог − 100)/10', Dsp + 45 + (Og - 1000) / 10)
  const Shs = c('Шс', 'Ширина спины с прибавкой', '⅛Ог + 5,5 + П', Og / 8 + 55 + o.backEase)
  const Shpr = c('Шпр', 'Ширина проймы с прибавкой', '⅛Ог − 0,5 + П', Og / 8 - 5 + o.armholeEase)
  const Shg = c('Шг', 'Ширина груди с прибавкой', '¼Ог − 5 + П', Og / 4 - 50 + o.chestEase)
  const yChest = c('1–2', 'Линия груди', 'Гпр + 1', Gpr + o.depthEase)

  // Grid
  const P1 = v(0, 0)
  const P6 = v(20, Dsp)
  const P7 = v(20, Vb)
  const P8 = v(20, Di)
  const x9 = (20 * yChest) / Dsp
  const x10 = x9 + Shs
  const x11 = x10 + (2 / 3) * Shpr
  const x12 = x11 + Shpr / 3
  const x13 = x12 + Shg
  c('9–13', 'Контроль: ½Ог с прибавкой', 'Шс + Шпр + Шг', x13 - x9)
  const x14 = x13 - c('13–14', 'Линия вытачек от середины переда', '1/10·Ог + 0,5', 0.1 * Og + 5)
  const S = v(x11, yChest)

  // Back neck and shoulder
  const P15 = v(Dgs, 0)
  const P16 = v(Dgs, -20)
  const P17 = v(x10, 0)
  const P18 = v(x10, c('17–18', 'Наклон плеча спинки', '1–1,5 см', 12.5))
  const P19 = along(P16, P18, dist(P16, P18) + 10)
  const shoulderBack = c('16–19', 'Плечо спинки', '|16–18| + 1', dist(P16, P19))
  const d1018 = dist(v(x10, yChest), P18)
  const P20 = v(x10, yChest - d1018 / 4)
  const P21 = v(x10 + 13, P20.y)

  // Front
  const P12 = v(x12, yChest)
  const P22 = v(x12, yChest - d1018 / 4)
  const P23 = v(x12, yChest - (d1018 - 20))
  const r1223 = dist(P12, P23)
  const P24 = v(x14, Dsp)
  const P25 = v(x14, Dsp - Dtp)
  const P26 = v(x14, P25.y + Vg)
  const chord = c('23–27', 'Отвод плеча полочки', '1/10·½Ог', 0.05 * Og)
  // A chord of length `chord` on the circle about 12 from 23 towards the side.
  const ang = 2 * Math.asin(chord / (2 * r1223)) * (180 / Math.PI)
  const P27 = rotate(P23, -ang, P12)
  const front27 = c('27–28', 'Плечо полочки', '|16–19| − 0,5…1', shoulderBack - 7.5)
  const P28 = circlesX(P27, front27, P26, Vg, (a, b) => (a.y < b.y ? a : b))
  const P29 = v(x13, P25.y)
  const P30 = v(x13 - Dgs, P25.y)
  const P31 = v(x13, P25.y + Dgs + 10)
  const N = along(P29, P12, Dgs)
  const P32 = along(P28, P27, dist(P30, P25))
  const P33 = along(P26, P25, dist(P26, P32))
  c('32–33', 'Нагрудная вытачка (раствор)', '|32–33|', dist(P32, P33))

  // Shoulder seam moved: back up 1 cm, front down 1 cm.
  const up = v(0, -10)
  const dn = v(0, 10)
  const P16a = add(P16, up)
  const P19a = add(P19, up)
  const P30a = add(P30, dn)
  const P33a = add(P33, dn)
  const P32a = add(P32, dn)
  const P27a = add(P27, dn)

  // Armholes (polylines for cutting): back 19a → 21 → S, front 27a → 22 → S.
  const shB = sub(P19a, P16a)
  const backArm = through([P19a, P21, S], perp(shB, v(0, 1)), v(1, 0.15)).points(24)
  const shF = sub(P27a, P32a)
  const frontArm = through([P27a, P22, S], perp(shF, v(0, 1)), v(-1, 0.15)).points(24)

  // Shoulder blade dart: K on the back armhole at the middle of 10–18,
  // opening `bladeDart` up the armhole, tip under the shoulder 4,5 from the neck.
  const yK = (yChest + P18.y) / 2
  const [armTop, armLow] = cutAtY(backArm, yK)
  const K = armLow[0]!
  const lTop = plen(armTop)
  const [armTop2] = cutAt(armTop, Math.max(0, lTop - o.bladeDart))
  const Kp = armTop2[armTop2.length - 1]!
  const P = along(P16a, P19a, 45)
  const T = v(P.x, yK)
  const theta = Math.atan2(K.y - T.y, K.x - T.x) - Math.atan2(Kp.y - T.y, Kp.x - T.x)
  const rot = (q: Vec) => rotate(q, (theta * 180) / Math.PI, T)
  // The part above the dart turns about T so that K' lands on K; the shoulder opens at P.
  const P19r = rot(P19a)
  const Pr = rot(P)
  const armUpper = armTop2.map(rot)
  const backArmFinal = [...armUpper.slice(0, -1), ...armLow]
  c('лопатки', 'Вытачка на лопатки в плече (раствор)', 'перевод из проймы', dist(P, Pr))

  // Waist and hips
  const waistHalf = 0.5 * m.waist + o.waistEase
  const x35 = x12 + c('34–35', 'Талия переда у бока', '¼От − 1…1,5', 0.25 * m.waist - 12.5)
  const e = c('36–6', 'Избыток по талии сзади', '|6–35| − (½От + П)', x35 - 20 - waistHalf)
  const side = c('бок', 'В боковые швы (на обе детали)', '3–4 см', Math.max(0, 0.55 * e))
  const backDart = c('в. спинки', 'Вытачка по талии спинки', '2–3,5 см', Math.max(0, e - side))
  const frontDart = c('35–37', 'Вытачка по талии переда', '|35–37|', Math.max(0, x13 - x35))
  const xBD = 20 + c('6–ось', 'Ось вытачки спинки', '⅓Шс + 2…3', Shs / 3 + 25)
  const x40 = x13 - c('41–40', 'Бёдра с прибавкой', '½Об + П', 0.5 * m.hips + o.hipEase)
  const lack = c('7–40', 'Недостаток по бёдрам', '|40–7|', 20 - x40)

  if (e < 0) warnings.push('Талия с прибавкой шире, чем позволяет чертёж: вытачки по талии не нужны.')
  if (backDart > 45) warnings.push(`Вытачка по талии спинки ${fmt(backDart)} шире 3,5 см: проверьте мерки талии и бёдер.`)
  if (frontDart > 40) warnings.push(`Вытачка по талии переда ${fmt(frontDart)} шире 4 см: проверьте мерки.`)
  if (Og < 840 || Og > 1240) warnings.push('Формулы книги даны для типовых фигур с Ог 100–116 см; при другом обхвате проверьте основу на макете.')

  const yW = Dsp
  const backWaistSide = v(x11 - side / 2, yW - 10)
  const frontWaistSide = v(x11 + side / 2, yW - 10)
  const backHipSide = v(x11 + lack / 2, Vb)
  const frontHipSide = v(x11 - lack / 2, Vb)
  const backSide = through([S, backWaistSide, backHipSide], v(0, 1), v(0, 1)).to(v(backHipSide.x, Di))
  const frontSide = through([S, frontWaistSide, frontHipSide], v(0, 1), v(0, 1)).to(v(frontHipSide.x, Di))
  const sideBack = backSide.length()
  const sideFront = frontSide.length()

  // Back neck
  const backNeck = new Line(P1).smooth(v(1, 0), v(0.35, -1), P16a, 0.5)

  const backOutline = new Line(P8)
    .to(P7)
    .to(P6)
    .to(P1)
    .append(backNeck)
    .to(P)
    .to(T)
    .to(Pr)
    .to(P19r)
    .append(poly(backArmFinal))
    .append(through([S, backWaistSide, backHipSide], v(0, 1), v(0, 1)))
    .to(v(backHipSide.x, Di))
    .to(P8)

  const frontNeck = through([P30a, add(N, mul(dn, 0.5)), P31], v(0, 1), v(1, 0))
  const frontOutline = new Line(P31)
    .to(v(x13, Di))
    .to(v(frontHipSide.x, Di))
    .to(frontHipSide)
    .append(through([frontHipSide, frontWaistSide, S], v(0, -1), v(0, -1)))
    .append(poly([...frontArm].reverse()))
    .to(P32a)
    .to(P26)
    .to(P33a)
    .to(P30a)
    .append(frontNeck)

  // Waist darts (marks), diamond shape.
  const diamond = (x: number, w: number, top: Vec, bottom: Vec) =>
    new Line(top).to(v(x - w / 2, yW)).to(bottom).to(v(x + w / 2, yW)).to(top)
  const backDartLine = diamond(xBD, backDart, v(xBD, yW - 150), v(xBD, yW + 150))
  const frontDartLine = diamond(x14, frontDart, P26, v(x14, yW + 150))

  const shoulderBackSeam = dist(P16a, P) + dist(Pr, P19r)
  const shoulderFrontSeam = dist(P30a, P33a) + dist(P32a, P27a)
  const backArmLen = plen(backArmFinal)
  const frontArmLen = plen(frontArm)
  const armhole = backArmLen + frontArmLen

  // Front notch Ae: ¼Шпр above the chest line on the front armhole.
  const [frontArmUpper, frontArmLower] = cutAtY(frontArm, yChest - Shpr / 4)
  const Ae = frontArmLower[0]!
  const frontLowLen = plen(frontArmLower)
  const backNotchLen = plen(cutAtY(backArmFinal, P21.y)[1])
  void frontArmUpper

  // ---- Sleeve (fig. 3), own frame: x right from the front side, y down from the cap top.
  const Vpr = c('Впр(ч)', 'Высота проймы по чертежу', '12–27а + 19а–линия груди', yChest - P27a.y + (yChest - P19r.y))
  const Dpr = c('Дпр(ч)', 'Длина проймы по чертежу', '27а–11а + 11–19а', armhole)
  const Vok = c('Вок', 'Высота оката', '½Впр(ч) − (0,2·Шпр + 0,75)', 0.5 * Vpr - (0.2 * Shpr + 7.5))
  const L = c('1–3', 'Длина рукава', 'Др', m.armLength)
  const yAe = Vok - Shpr / 4
  const y4 = L - 20
  const y5 = Vok + ((y4 - Vok) / 2 - 10)
  const hyp = c('Ae–6', 'От переднего знака до верха', '½Дпр(ч) − 0,5…1,5', 0.5 * Dpr - o.capReduce)
  const x6 = Math.sqrt(Math.max(1, hyp * hyp - yAe * yAe))
  const s1 = v(0, 0)
  const s2 = v(0, Vok)
  const sAe = v(0, yAe)
  const x9s = x6 / 2 + 10
  const s9 = v(x9s, 0)
  const s10 = v(x9s / 2, 0)
  const s11 = mid(sAe, s10)
  const s12 = v(x6, Shpr / 4 + 5)
  const s13 = v(x6 - x9s, Vok)
  const s14 = v(10, y4)
  const s15 = v(10, y5)
  const s16 = v(x6 - 10, y5)
  const hemHalf = c('14–17', 'Половина ширины рукава внизу', '½(Озап + П)', 0.5 * (m.wrist + o.sleeveHemEase))
  const dy = L - y4
  const s17 = v(s14.x + Math.sqrt(Math.max(1, hemHalf * hemHalf - dy * dy)), L)
  void s1
  void s2

  // Top cap Ae → 11 → 9 → 12 (raised 1,2 over 9–12), arriving at 12 down-right.
  const tAe = norm(sub(s11, sAe))
  const bulge = add(mid(s9, s12), mul(perp(sub(s12, s9), v(1, -1)), 12))
  const at12 = norm(v(0.55, 1))
  const top = through([sAe, s11, s9, bulge, s12], tAe, at12)
  // Lower cap Ae → (S) → bottom 0,5 above 2–13 near 13 → 12, mirror-smooth with the top.
  const bottom = v(s13.x, Vok - 5)
  const lower = through([sAe, bottom, s12], v(tAe.x, -tAe.y), v(at12.x, -at12.y)).points(48)
  const [lowerFront, lowerBack] = cutAt(lower, frontLowLen)
  const sS = lowerFront[lowerFront.length - 1]!

  // Seam parallel to the front roll Ae–15–14 through S; H on the hem 14–17.
  const dSeam = Math.abs((sS.x - 0) * 1) // the roll is near-vertical at the top
  const [, Jin] = offset3(sAe, s15, s14, dSeam, v(x6, y5))
  const seamTop = sS
  const H = lineX(Jin, add(Jin, sub(s14, s15)), s14, s17)
  // Unfold the front under-part about the front roll, the back under-part about the elbow roll.
  const mA = (q: Vec) => mirror(q, sAe, s15)
  const mB = (q: Vec) => mirror(q, s15, s14)
  const mC = (q: Vec) => mirror(q, s12, s16)
  const mD = (q: Vec) => mirror(q, s16, s17)
  const fS = mA(seamTop)
  const fJ = offset3(sAe, s15, s14, dSeam, v(-1, y5))[1]
  const fH = mB(H)
  const bS = mC(seamTop)
  const bJ1 = mC(Jin)
  const bJ2 = mD(Jin)
  const bH = mD(H)
  // Elbow dart between bJ1 and bJ2, tip on the bisector towards 16.
  const dm = mid(bJ1, bJ2)
  const tipE = along(dm, s16, 0.6 * dist(dm, s16))
  const seamFront = dist(fS, fJ) + dist(fJ, fH)
  const seamBack = dist(bS, bJ1) + dist(bJ2, bH)
  const capFront = plen(lowerFront.map(mA))
  const capBack = plen(lowerBack.map(mC))
  const cap = capFront + top.length() + capBack
  c('окат', 'Длина оката', 'по чертежу', cap)
  c('пройма', 'Длина проймы', 'по чертежу', armhole)

  // Place the sleeve right of the bodice.
  const dxS = x13 + 120 + (fS.x < 0 ? -fS.x : 0)
  const dyS = yChest - Vok
  const place = (q: Vec) => v(q.x + dxS, q.y + dyS)
  const sleeveOutline = poly(
    [
      fS,
      ...lowerFront.map(mA).reverse().slice(1),
      ...top.points(24).slice(1),
      ...lowerBack.map(mC).reverse().slice(1),
      bJ1,
      tipE,
      bJ2,
      bH,
      s17,
      s14,
      fH,
      fJ,
    ].map(place),
  )
  sleeveOutline.to(place(fS))

  const front = toPiece({
    id: 'muller-dress-front',
    title: 'Полочка',
    outline: frontOutline,
    extra: [
      { role: 'mark', line: frontDartLine },
      { role: 'mark', line: new Line(v(x11, Vb)).to(v(x13, Vb)) },
    ],
    fold: [P31, v(x13, Di)],
    grain: [v(x14 - 30, yW + 60), v(x14 - 30, Di - 80)],
    labels: [
      { at: v(x12 + 10, yW + 200), text: 'Полочка', size: 7 },
      { at: v(x12 + 10, yW + 212), text: 'Крой 1 со сгибом' },
      { at: v(x12 + 10, yW + 222), text: 'Мюллер · без припусков' },
    ],
    seams: { shoulder: shoulderFrontSeam, side: sideFront, armhole: frontArmLen },
  })
  const back = toPiece({
    id: 'muller-dress-back',
    title: 'Спинка',
    outline: backOutline,
    extra: [
      { role: 'mark', line: backDartLine },
      { role: 'mark', line: new Line(v(20, Vb)).to(v(x11, Vb)) },
    ],
    grain: [v(xBD + 40, yW + 60), v(xBD + 40, Di - 80)],
    labels: [
      { at: v(40, yW + 200), text: 'Спинка', size: 7 },
      { at: v(40, yW + 212), text: 'Крой 2 (шов посередине)' },
      { at: v(40, yW + 222), text: 'Мюллер · без припусков' },
    ],
    seams: { shoulder: shoulderBackSeam, side: sideBack, armhole: backArmLen },
  })
  const sleeve = toPiece({
    id: 'muller-dress-sleeve',
    title: 'Рукав',
    outline: sleeveOutline,
    extra: [
      { role: 'mark', line: poly([sAe, s15, s14].map(place)) },
      { role: 'mark', line: poly([s12, s16, s17].map(place)) },
      { role: 'mark', line: new Line(place(v(fS.x, Vok))).to(place(v(bS.x, Vok))) },
    ],
    grain: [place(v(x6 / 2, Vok + 60)), place(v(x6 / 2, L - 100))],
    labels: [
      { at: place(v(x6 * 0.15, Vok + 150)), text: 'Рукав', size: 7 },
      { at: place(v(x6 * 0.15, Vok + 162)), text: 'Крой 2' },
      { at: place(v(x6 * 0.15, Vok + 172)), text: 'Мюллер · без припусков' },
    ],
    seams: { cap, seam: seamFront },
  })

  if (cap - armhole < 0) warnings.push('Окат рукава короче проймы: проверьте мерки руки и проймы.')
  if (cap - armhole > 70) warnings.push(`Посадка оката ${fmt(cap - armhole)}: для платья много, увеличьте «Уменьшение оката».`)

  return {
    pieces: [back, front, sleeve],
    points: {
      P1, P6, P7, P8, P15, P16, P16a, P17, P18, P19, P19a, P20, P21,
      P22, P23, P24, P25, P26, P27, P27a, P28, P29, P30, P30a, P31, P32, P32a, P33, P33a,
      S, Ae, K, Kp, T, P, Pr, P19r,
      neckCB: P1, waistCB: P6, hipCB: P7, hemCB: P8,
      neckSideBack: P16a, shoulderTipBack: P19r, neckSideFront: P30a, shoulderTipFront: P27a,
      neckCF: P31, waistCF: v(x13, yW), hipCF: v(x13, Vb), hemCF: v(x13, Di), bustPoint: P26,
      armholeBottom: S, waistSideBack: backWaistSide, waistSideFront: frontWaistSide,
      hipSideBack: backHipSide, hipSideFront: frontHipSide,
      sleeveTop: place(s9), sleeveFrontNotch: place(sAe), sleeveSeamFront: place(fS), sleeveSeamBack: place(bS),
      sleeveElbowTip: place(tipE), sleeveHemFront: place(fH), sleeveHemBack: place(bH),
    },
    steps: [...steps, { id: 'Ae', title: 'Задний знак: от бока по пройме', formula: '|11–21|', value: backNotchLen }],
    checks: [
      check('shoulder', 'Плечо спинки длиннее плеча полочки на посадку 0,5–1 см', shoulderBackSeam, shoulderFrontSeam, 7.5, 5),
      check('side', 'Боковые срезы: спинка и полочка', sideBack, sideFront, 0, 3),
      check('cap', 'Окат длиннее проймы на посадку (2–8 см)', cap - armhole, 0, 50, 32),
      check('sleeveSeam', 'Шов рукава: два среза (без локтевой вытачки)', seamFront, seamBack, 0, 8),
    ],
    warnings,
  }
}

const fmt = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`
