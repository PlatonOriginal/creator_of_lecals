import { Line, along, atX, dist, sub, toPiece, v, type Vec } from '../../draft/geom'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Прямая юбка, ЕМКО СЭВ (основа, без припусков).
 *
 * Construction as taught after ЕМКО СЭВ (e.g. vflint.ru/node/68, which follows
 * the textbook with Дсб, Дсп and Влт for the waist slope):
 *
 *   ББ1 = Сб + Пб                    width of the half skirt
 *   ББ2 = 0,5·(Сб + Пб) − 1          back half, side line position
 *   ББ3 = 0,4·ББ2                    back dart axis
 *   Б1Б4 = 0,4·Б1Б2                  front dart axis
 *   ΣВ = (Сб + Пб) − (Ст + Пт)        all waist darts of the half skirt
 *   back 0,35·ΣВ, side 0,5·ΣВ, front 0,15·ΣВ
 *   Т2Т20 = Дсб − Влт                side waist raise
 *   Т1Т10 = Дсп − Влт                front waist raise
 *   back dart 15–17 cm, front 10–12 cm long
 *
 * One deviation: the hip line ТБ is taken from the measurement Дтб instead of
 * the textbook estimate 0,5·Дтс, because we have the real measurement.
 *
 * Frame: x to the right from the centre back, y down from the back waist
 * line Т. The back half is on the left, the front half on the right, as on
 * the textbook drawing.
 */
export interface EmkoSkirtOptions extends Record<string, number> {
  /** Прибавка к полуобхвату талии Ст, mm. */
  waistEase: number
  /** Прибавка к полуобхвату бёдер Сб, mm. */
  hipEase: number
  /** Длина задней вытачки, mm. */
  backDartLength: number
  /** Длина передней вытачки, mm. */
  frontDartLength: number
  /** Понижение линии талии на середине спинки, mm (при выступающих ягодицах — 0, при плоских — до 15). */
  backCentreDrop: number
}

const EASE: Record<Silhouette, { waistEase: number; hipEase: number }> = {
  fitted: { waistEase: 5, hipEase: 10 },
  semi: { waistEase: 10, hipEase: 20 },
  straight: { waistEase: 15, hipEase: 30 },
}

export const EMKO_SKIRT_REQUIRED = ['waist', 'hips', 'waistToHips', 'skirtLength', 'waistToFloor', 'waistToFloorBack', 'waistToFloorFront'] as const

export const emkoSkirt: BlockDef<EmkoSkirtOptions> = {
  id: 'emko-skirt',
  title: 'Прямая юбка',
  method: 'emko',
  required: EMKO_SKIRT_REQUIRED,
  options: [
    { id: 'waistEase', short: 'Пт', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 30, step: 5 },
    { id: 'hipEase', short: 'Пб', title: 'Прибавка по бёдрам (к полуобхвату)', min: 0, max: 60, step: 5 },
    { id: 'backDartLength', title: 'Длина задней вытачки', min: 100, max: 200, step: 5 },
    { id: 'frontDartLength', title: 'Длина передней вытачки', min: 60, max: 140, step: 5 },
    {
      id: 'backCentreDrop', title: 'Понижение талии посередине сзади', min: 0, max: 20, step: 5,
      hint: 'При плоских ягодицах и сутулой осанке талию сзади опускают на 0,5–1,5 см, иначе под поясом лягут складки.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], backDartLength: 160, frontDartLength: 110, backCentreDrop: 0 }),
  draft: draftEmkoSkirt,
}

type M = Record<(typeof EMKO_SKIRT_REQUIRED)[number], number>

/** Dart with legs equalised to the longer one, as the textbook asks. */
function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

export function draftEmkoSkirt(m: M, o: EmkoSkirtOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []

  const St = m.waist / 2
  const Sb = m.hips / 2
  const TB = c('ТБ', 'Линия бёдер от талии', 'Дтб', m.waistToHips)
  const TN = c('ТН', 'Длина юбки', 'Ди', m.skirtLength)
  const W = c('ББ1', 'Ширина юбки по бёдрам', 'Сб + Пб', Sb + o.hipEase)
  const Wb = c('ББ2', 'Ширина задней половины', '0,5·(Сб + Пб) − 1', 0.5 * W - 10)
  const Wf = W - Wb
  const xb = c('ББ3', 'Ось задней вытачки от середины', '0,4·ББ2', 0.4 * Wb)
  const ff = c('Б1Б4', 'Ось передней вытачки от середины', '0,4·Б1Б2', 0.4 * Wf)
  const xf = W - ff
  const sum = c('ΣВ', 'Сумма вытачек', '(Сб + Пб) − (Ст + Пт)', W - (St + o.waistEase))
  const dB = c('Вз', 'Задняя вытачка', '0,35·ΣВ', 0.35 * Math.max(0, sum))
  const dS = c('Вб', 'Боковая вытачка', '0,5·ΣВ', 0.5 * Math.max(0, sum))
  const dF = c('Вп', 'Передняя вытачка', '0,15·ΣВ', 0.15 * Math.max(0, sum))
  const rs = c('Т2Т20', 'Подъём талии сбоку', 'Дсб − Влт', m.waistToFloor - m.waistToFloorBack)
  const rf = c('Т1Т10', 'Подъём талии спереди', 'Дсп − Влт', m.waistToFloorFront - m.waistToFloorBack)

  if (sum <= 0) warnings.push('Талия с прибавкой не меньше бёдер: вытачки не нужны, юбка будет прямой без вытачек.')
  if (dB > 50) warnings.push(`Задняя вытачка ${fmt(dB)} шире 5 см: лучше разложить её на две.`)
  if (dF > 30) warnings.push(`Передняя вытачка ${fmt(dF)} шире 3 см: лучше разложить её на две.`)
  if (dS > 80) warnings.push(`Боковой срез забирает ${fmt(dS)} на талии: бок получится очень крутым, проверьте мерки.`)
  if (rs < 0) warnings.push('По меркам талия сбоку ниже, чем сзади: проверьте Дсб и Влт.')

  // Grid
  const T = v(0, o.backCentreDrop)
  const B = v(0, TB)
  const N = v(0, TN)
  const T1 = v(W, -rf)
  const B1 = v(W, TB)
  const N1 = v(W, TN)
  const B2 = v(Wb, TB)
  const N2 = v(Wb, TN)
  // Side waist points: the side "dart" is split equally either side of the side line,
  // both points at the raised level Т20.
  const sideBack = v(Wb - dS / 2, -rs)
  const sideFront = v(Wb + dS / 2, -rs)

  // Back dart on the back waist line Т–side
  const bc = atX(T, sideBack, xb)
  const bTip = v(xb, bc.y + o.backDartLength)
  const back = dart(atX(T, sideBack, xb - dB / 2), atX(T, sideBack, xb + dB / 2), bTip)
  // Front dart on the front waist line side–Т1
  const fc = atX(sideFront, T1, xf)
  const fTip = v(xf, fc.y + o.frontDartLength)
  const front = dart(atX(sideFront, T1, xf - dF / 2), atX(sideFront, T1, xf + dF / 2), fTip)

  // Side seams: convex curve from the waist point, arriving vertical at the hip line.
  const sideCurveBack = new Line(sideBack).smooth(sub(B2, sideBack), v(0, 1), B2, 0.45)
  const sideCurveFront = new Line(sideFront).smooth(sub(B2, sideFront), v(0, 1), B2, 0.45)

  // Waist: square to the centre back / front, straight between darts.
  const backWaistA = new Line(T).smooth(v(1, 0), sub(back.left, T), back.left)
  const frontWaistB = new Line(front.right).smooth(sub(T1, front.right), v(1, 0), T1)

  const backOutline = new Line(N)
    .to(T)
    .append(backWaistA)
    .to(back.tip)
    .to(back.right)
    .to(sideBack)
    .append(sideCurveBack)
    .to(N2)
  const frontOutline = new Line(N2)
    .to(B2)
    .append(sideCurveFront.reversed())
    .to(front.left)
    .to(front.tip)
    .append(frontWaistB)
    .to(N1)

  const sideBackLen = sideCurveBack.length() + (TN - TB)
  const sideFrontLen = sideCurveFront.length() + (TN - TB)
  const waistBack = backWaistA.length() + dist(back.right, sideBack)
  const waistFront = dist(sideFront, front.left) + frontWaistB.length()

  const backPiece = toPiece({
    id: 'emko-skirt-back',
    title: 'Задняя половина юбки',
    outline: backOutline,
    extra: [{ role: 'mark', line: new Line(B).to(B2) }],
    grain: [v(Wb * 0.55, TB + 40), v(Wb * 0.55, TN - 60)],
    labels: [
      { at: v(12, TB + 70), text: 'Задняя половина юбки', size: 7 },
      { at: v(12, TB + 82), text: 'Крой 2 (шов посередине)' },
      { at: v(12, TB + 92), text: 'ЕМКО СЭВ · без припусков' },
      { at: v(12, TB - 6), text: 'линия бёдер', size: 4 },
    ],
    seams: { side: sideBackLen, waist: waistBack, hem: Wb, dart: dB },
  })
  const frontPiece = toPiece({
    id: 'emko-skirt-front',
    title: 'Переднее полотнище юбки',
    outline: frontOutline,
    extra: [{ role: 'mark', line: new Line(B2).to(B1) }],
    fold: [T1, N1],
    grain: [v(Wb + Wf * 0.45, TB + 40), v(Wb + Wf * 0.45, TN - 60)],
    labels: [
      { at: v(Wb + 12, TB + 70), text: 'Переднее полотнище', size: 7 },
      { at: v(Wb + 12, TB + 82), text: 'Крой 1 со сгибом' },
      { at: v(Wb + 12, TB + 92), text: 'ЕМКО СЭВ · без припусков' },
      { at: v(Wb + 12, TB - 6), text: 'линия бёдер', size: 4 },
    ],
    seams: { side: sideFrontLen, waist: waistFront, hem: Wf, dart: dF },
  })

  const waistTotal = 2 * (waistBack + waistFront)
  return {
    pieces: [backPiece, frontPiece],
    points: {
      waistCB: T, hipCB: B, hemCB: N,
      waistCF: T1, hipCF: B1, hemCF: N1,
      hipSide: B2, hemSide: N2,
      waistSideBack: sideBack, waistSideFront: sideFront,
      dartBackLeft: back.left, dartBackRight: back.right, dartBackTip: back.tip,
      dartFrontLeft: front.left, dartFrontRight: front.right, dartFrontTip: front.tip,
      dartBackCentre: bc, dartFrontCentre: fc,
    },
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний', sideBackLen, sideFrontLen, 0, 2),
      check('waist', 'Талия юбки и обхват талии с прибавкой (От + 2·Пт)', waistTotal, m.waist + 2 * o.waistEase, 0, 10),
    ],
    warnings,
  }
}

const fmt = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`
