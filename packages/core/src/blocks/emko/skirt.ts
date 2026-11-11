import { Line, along, dist, v, type Vec } from '../../draft/geom'
import { Outline, netPiece, type Panel } from '../../pattern/panel'
import { calc, check, type BlockDef, type BlockResult, type CalcStep, type Silhouette } from '../types'

/**
 * Прямая юбка, ЕМКО СЭВ (основа, без припусков).
 *
 * After «Единая методика конструирования одежды СЭВ», vol. 2 «Базовые
 * конструкции женской одежды», 1988: skirt of straight silhouette, variant I,
 * table on p. 107 and fig. 46. Point numbers are the book's. All values in mm;
 * the book's constants in cm are ×10. T-codes are the size features of
 * ОСТ 17-326-81 / ГОСТ 31396-2009:
 *
 *   Т7  waist height (Влт)           Т12 gluteal fold height (Впс)
 *   Т18 waist girth (От)             Т19 hip girth (Об)
 *   Т25 waist to floor at the side   Т26 waist to floor in front
 *   Т46 bust point span (Цг)
 *
 *   41–51  = 0,65·(Т7 − Т12) + 0,75 + ПТ  hip line
 *   51–57  = 0,5·Т19 + Пб                 half-skirt width at the hips
 *   51–54  = 0,5·|51–57|                  side line (back and front equal)
 *   94–441 − 41–91 = Т25 − Т7 − 1,05      side waist raise
 *   97–47  − 41–91 = Т26 − Т7 − 0,75      front waist raise
 *   41–470 = 0,5·Т18 + Пт                 waist with ease
 *   dт     = |51–57| − |41–470|           all waist suppression of a half
 *   41–420 = 47–460 = 0,1·|41–470|        where the waist curve leaves the centres
 *   side:  441–442 = 441–442' = 0,26·dт, straight to 54
 *   back dart:  41–42 = 0,4·|51–54|, length 0,8·|41–51|, 42–421 = 42–421' = 0,17·dт
 *   front dart: 47–46 = 0,5·Т46 + ПТ, length 0,5·|41–51|, 46–461 = 46–461' = 0,07·dт
 *
 * Deviations from the book:
 *  - the length is chosen by the user (Ди, at the side) instead of the
 *    book's knee length Т7 − Т9 + 0,75;
 *  - the book prints dт = 14,40 cm for its example, though its own formula
 *    gives 54,20 − 39,35 = 14,85; we follow the formula;
 *  - an optional drop of the waist at the centre back (0 in the book).
 *
 * Frame: x to the right from the centre back 41, y down from the back waist
 * line. The back half is on the left, the front half on the right, as in fig. 46.
 */
export interface EmkoSkirtOptions extends Record<string, number> {
  /** Прибавка к полуобхвату талии Пт, mm. */
  waistEase: number
  /** Прибавка к полуобхвату бёдер Пб, mm. */
  hipEase: number
  /** Понижение линии талии на середине спинки, mm (при плоских ягодицах — до 15). */
  backCentreDrop: number
}

/**
 * Ease to the half girths. The book gives only the straight silhouette for the
 * skirt: hips 2,15 (ПС 1,00 + ПП 0,62 + ПТ 0,53), waist 1,34 (ПП 0,94 + ПТ 0,40).
 */
const EASE: Record<Silhouette, { waistEase: number; hipEase: number }> = {
  fitted: { waistEase: 5, hipEase: 10 },
  semi: { waistEase: 10, hipEase: 15 },
  straight: { waistEase: 13, hipEase: 22 },
}

export const EMKO_SKIRT_REQUIRED = [
  'waist', 'hips', 'bustSpan', 'skirtLength', 'waistToFloorBack', 'glutealFoldHeight', 'waistToFloor', 'waistToFloorFront',
] as const

export const emkoSkirt: BlockDef<EmkoSkirtOptions> = {
  id: 'emko-skirt',
  title: 'Прямая юбка',
  method: 'emko',
  garment: 'skirt',
  required: EMKO_SKIRT_REQUIRED,
  options: [
    { id: 'waistEase', short: 'Пт', title: 'Прибавка по талии (к полуобхвату)', min: 0, max: 30, step: 1 },
    { id: 'hipEase', short: 'Пб', title: 'Прибавка по бёдрам (к полуобхвату)', min: 0, max: 60, step: 1 },
    {
      id: 'backCentreDrop', title: 'Понижение талии посередине сзади', min: 0, max: 20, step: 5,
      hint: 'При плоских ягодицах и сутулой осанке талию сзади опускают на 0,5–1,5 см, иначе под поясом лягут складки. В учебнике — 0.',
    },
  ],
  defaults: (s) => ({ ...EASE[s], backCentreDrop: 0 }),
  draft: draftEmkoSkirt,
}

type M = Record<(typeof EMKO_SKIRT_REQUIRED)[number], number>

/** Dart with legs equalised to the longer one. */
function dart(left: Vec, right: Vec, tip: Vec) {
  const l = Math.max(dist(tip, left), dist(tip, right))
  return { left: along(tip, left, l), right: along(tip, right, l), tip }
}

/** Smooth step from 0 to 1 with level ends. */
const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2

export function draftEmkoSkirt(m: M, o: EmkoSkirtOptions): BlockResult {
  const steps: CalcStep[] = []
  const c = calc(steps)
  const warnings: string[] = []

  const hip = c('41–51', 'Линия бёдер от талии', '0,65·(Т7 − Т12) + 0,75 + 0,2', 0.65 * (m.waistToFloorBack - m.glutealFoldHeight) + 7.5 + 2)
  const W = c('51–57', 'Ширина юбки по бёдрам', '0,5·Т19 + Пб', 0.5 * m.hips + o.hipEase)
  const half = c('51–54', 'Положение бокового шва', '0,5·|51–57|', 0.5 * W)
  const rs = c('94–441', 'Подъём талии у бока', 'Т25 − Т7 − 1,05', m.waistToFloor - m.waistToFloorBack - 10.5)
  const rf = c('97–47', 'Подъём талии спереди', 'Т26 − Т7 − 0,75', m.waistToFloorFront - m.waistToFloorBack - 7.5)
  const len = c('41–91', 'Длина по середине сзади', 'Ди − подъём у бока', m.skirtLength - rs)
  const wl = c('41–470', 'Талия с прибавкой', '0,5·Т18 + Пт', 0.5 * m.waist + o.waistEase)
  const dt = c('dт', 'Сумма вытачек', '|51–57| − |41–470|', W - wl)
  const lead = c('41–420', 'Горизонтальный участок талии у середины', '0,1·|41–470|', 0.1 * wl)
  const dS = c('441–442', 'Боковая вытачка (половина)', '0,26·dт', 0.26 * Math.max(0, dt))
  const xb = c('41–42', 'Ось задней вытачки', '0,4·|51–54|', 0.4 * half)
  const lb = c('42–521', 'Длина задней вытачки', '0,8·|41–51|', 0.8 * hip)
  const dB = c('42–421', 'Задняя вытачка (половина)', '0,17·dт', 0.17 * Math.max(0, dt))
  const ff = c('47–46', 'Ось передней вытачки от середины', '0,5·Т46 + 0,1', 0.5 * m.bustSpan + 1)
  const lf = c('46–561', 'Длина передней вытачки', '0,5·|41–51|', 0.5 * hip)
  const dF = c('46–461', 'Передняя вытачка (половина)', '0,07·dт', 0.07 * Math.max(0, dt))

  if (dt <= 0) warnings.push('Талия с прибавкой не меньше бёдер: вытачки не нужны, юбка будет прямой без вытачек.')
  if (2 * dB > 60) warnings.push(`Задняя вытачка ${fmt(2 * dB)} шире 6 см: лучше разложить её на две.`)
  if (2 * dS > 90) warnings.push(`Боковой срез забирает ${fmt(2 * dS)} на талии: бок получится очень крутым, проверьте мерки.`)
  if (rs < 0) warnings.push('По меркам талия сбоку ниже, чем сзади: проверьте Дсб (Т25) и высоту талии (Т7).')
  if (ff + dF > half - dS - 20) warnings.push('Передняя вытачка заходит на бок: проверьте расстояние между центрами груди.')

  // Waist guide: level at the centres, rising smoothly to the side top 441.
  const xFrontLead = W - lead
  const waistY = (x: number) => {
    const back = -rs * ease((x - lead) / (half - lead))
    const front = -rs + (rs - rf) * ease((x - half) / (xFrontLead - half))
    const y = x <= half ? back : front
    // The centre-back drop fades out over the first tenth of the waist.
    return y + o.backCentreDrop * (1 - ease(x / lead))
  }
  const slope = (x: number) => (waistY(x + 0.5) - waistY(x - 0.5))
  const onWaist = (x: number) => v(x, waistY(x))
  const dir = (x: number) => v(1, slope(x))

  // Grid (fig. 46)
  const P41 = onWaist(0)
  const P420 = onWaist(lead)
  const P51 = v(0, hip)
  const P54 = v(half, hip)
  const P57 = v(W, hip)
  const P91 = v(0, len)
  const P94 = v(half, len)
  const P97 = v(W, len)
  const P47 = v(W, -rf)
  const P460 = onWaist(xFrontLead)
  const P441 = onWaist(half)
  const P442 = onWaist(half - dS)
  const P442f = onWaist(half + dS)

  const xf = W - ff
  const back = dart(onWaist(xb - dB), onWaist(xb + dB), v(xb, waistY(xb) + lb))
  const front = dart(onWaist(xf - dF), onWaist(xf + dF), v(xf, waistY(xf) + lf))

  const seg = (a: Vec, b: Vec) => new Line(a).smooth(dir(a.x), dir(b.x), b)
  const waistBack1 = new Line(P41).append(seg(P41, P420)).append(seg(P420, back.left))
  const waistBack2 = seg(back.right, P442)
  const waistFront1 = seg(P442f, front.left)
  const waistFront2 = new Line(front.right).append(seg(front.right, P460)).append(seg(P460, P47))

  const backEdges = new Outline(P91, 'cb')
    .to(P51)
    .to(P41)
    .edge('waist')
    .append(waistBack1)
    .dart('waist', back.tip, back.right, 'a')
    .append(waistBack2)
    .edge('side')
    .to(P54)
    .to(P94)
    .edge('hem')
    .close()
  const frontEdges = new Outline(P94, 'side')
    .to(P54)
    .to(P442f)
    .edge('waist')
    .append(waistFront1)
    .dart('waist', front.tip, front.right, 'b')
    .append(waistFront2)
    .edge('cf', 'fold')
    .to(P97)
    .edge('hem')
    .close()

  const sideBackLen = dist(P442, P54) + (len - hip)
  const sideFrontLen = dist(P442f, P54) + (len - hip)
  const waistBack = waistBack1.length() + waistBack2.length()
  const waistFront = waistFront1.length() + waistFront2.length()

  const levels = { hip }
  const backPanel: Panel = {
    id: 'emko-skirt-back',
    title: 'Задняя половина юбки',
    role: 'skirtBack',
    method: 'ЕМКО СЭВ',
    edges: backEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(P51).to(P54) }],
    grain: [v(half * 0.55, hip + 40), v(half * 0.55, len - 60)],
    cut: 'Крой 2 (шов посередине)',
    labelAt: v(12, hip + 70),
    notes: [{ at: v(12, hip - 6), text: 'линия бёдер', size: 4 }],
    levels,
    notches: [],
    seams: { side: sideBackLen, waist: waistBack, hem: half, dart: 2 * dB },
  }
  const frontPanel: Panel = {
    id: 'emko-skirt-front',
    title: 'Переднее полотнище юбки',
    role: 'skirtFront',
    method: 'ЕМКО СЭВ',
    edges: frontEdges,
    fish: [],
    marks: [{ role: 'mark', line: new Line(P54).to(P57) }],
    grain: [v(half + half * 0.45, hip + 40), v(half + half * 0.45, len - 60)],
    cut: 'Крой 1 со сгибом',
    labelAt: v(half + 12, hip + 70),
    notes: [{ at: v(half + 12, hip - 6), text: 'линия бёдер', size: 4 }],
    levels,
    notches: [],
    seams: { side: sideFrontLen, waist: waistFront, hem: W - half, dart: 2 * dF },
  }

  const waistTotal = 2 * (waistBack + waistFront)
  return {
    panels: [backPanel, frontPanel],
    pieces: [backPanel, frontPanel].map(netPiece),
    points: {
      waistCB: P41, hipCB: P51, hemCB: P91,
      waistCF: P47, hipCF: P57, hemCF: P97,
      hipSide: P54, hemSide: P94, waistSideTop: P441,
      waistSideBack: P442, waistSideFront: P442f,
      waistBackLead: P420, waistFrontLead: P460,
      dartBackLeft: back.left, dartBackRight: back.right, dartBackTip: back.tip,
      dartFrontLeft: front.left, dartFrontRight: front.right, dartFrontTip: front.tip,
    },
    steps,
    checks: [
      check('side', 'Боковые срезы: задний и передний', sideBackLen, sideFrontLen, 0, 2),
      check('waist', 'Талия юбки и обхват талии с прибавкой (От + 2·Пт)', waistTotal, m.waist + 2 * o.waistEase, 0, 15),
    ],
    warnings,
  }
}

const fmt = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`
