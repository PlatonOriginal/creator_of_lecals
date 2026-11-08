/**
 * Full measurement schema (stage M1).
 *
 * Measurements are stored once, in millimetres, as a superset of what every
 * drafting method needs; each method declares the ids it requires. Girths
 * and widths are stored as FULL values even where a method uses halves
 * (Сг, Сш, Шс/2…): halving is the method's job.
 *
 * Names and abbreviations follow ЕМКО СЭВ / ГОСТ 31396-2009 where they exist.
 */

export type MeasurementKind = 'girth' | 'width' | 'length' | 'height'

export interface MeasurementSpec {
  /** Stable id used in stored data and formulas. */
  id: string
  /** Russian abbreviation, e.g. «Ог3». */
  short: string
  /** Full Russian title, e.g. «Обхват груди третий». */
  title: string
  group: MeasurementGroupId
  kind: MeasurementKind
  /** Hard limits for an adult woman, mm. Outside them the value is rejected. */
  min: number
  max: number
  /** How to take the measurement, shown in the wizard. */
  hint: string
  /** Leading measurements of ГОСТ 31396-2009: entered first, drive the prefill. */
  leading?: boolean
}

export type MeasurementGroupId = 'main' | 'torso' | 'arm' | 'legs' | 'garment'

export const MEASUREMENT_GROUPS: { id: MeasurementGroupId; title: string }[] = [
  { id: 'main', title: 'Основные' },
  { id: 'torso', title: 'Корпус' },
  { id: 'arm', title: 'Рука' },
  { id: 'legs', title: 'Талия и ноги' },
  { id: 'garment', title: 'Изделие' },
]

const TAPE = 'Сантиметр лежит плотно, но не стягивает; стоять прямо, дышать спокойно.'

function spec<const Id extends string>(s: MeasurementSpec & { id: Id }) {
  return s
}

/** Order here is the order of the wizard. */
export const MEASUREMENT_LIST = [
  // Основные (ведущие по ГОСТ 31396-2009)
  spec({
    id: 'height', short: 'Р', title: 'Рост', group: 'main', kind: 'height', min: 1400, max: 2000, leading: true,
    hint: 'Без обуви, пятки вместе, спина у стены. Отметьте на стене верх головы угольником или книгой и измерьте до пола.',
  }),
  spec({
    id: 'bust', short: 'Ог3', title: 'Обхват груди третий', group: 'main', kind: 'girth', min: 700, max: 1500, leading: true,
    hint: `Горизонтально через выступающие точки груди, сзади через лопатки. Мерку снимают в белье, в котором будут носить изделие. ${TAPE}`,
  }),
  spec({
    id: 'hips', short: 'Об', title: 'Обхват бёдер', group: 'main', kind: 'girth', min: 750, max: 1700, leading: true,
    hint: `Горизонтально через самые выступающие точки ягодиц, спереди с учётом выступа живота. ${TAPE}`,
  }),
  spec({
    id: 'waist', short: 'От', title: 'Обхват талии', group: 'main', kind: 'girth', min: 500, max: 1500, leading: true,
    hint: `По самому узкому месту туловища. Удобно сначала завязать на талии тесьму: она сама ляжет на линию талии и пригодится для других мерок. ${TAPE}`,
  }),

  // Корпус
  spec({
    id: 'bustUpper', short: 'Ог1', title: 'Обхват груди первый', group: 'torso', kind: 'girth', min: 650, max: 1400,
    hint: 'Над грудью, сзади через лопатки, спереди над основанием грудных желёз, под мышками. Сзади сантиметр чуть выше, чем спереди.',
  }),
  spec({
    id: 'bustFull', short: 'Ог2', title: 'Обхват груди второй', group: 'torso', kind: 'girth', min: 700, max: 1550,
    hint: 'Сзади через лопатки, как Ог1, спереди через выступающие точки груди. Обычно на 3–8 см больше Ог3.',
  }),
  spec({
    id: 'underbust', short: 'Опг', title: 'Обхват под грудью', group: 'torso', kind: 'girth', min: 600, max: 1400,
    hint: 'Горизонтально сразу под грудными железами.',
  }),
  spec({
    id: 'neck', short: 'Ош', title: 'Обхват шеи', group: 'torso', kind: 'girth', min: 280, max: 500,
    hint: 'По основанию шеи: сзади через седьмой шейный позвонок (выступающая косточка), спереди через ярёмную впадину.',
  }),
  spec({
    id: 'shoulderLength', short: 'Шп', title: 'Ширина плеча', group: 'torso', kind: 'width', min: 90, max: 180,
    hint: 'От основания шеи до плечевой точки (край плеча, где начинается рука) по верху плеча.',
  }),
  spec({
    id: 'backWidth', short: 'Шс', title: 'Ширина спины', group: 'torso', kind: 'width', min: 260, max: 500,
    hint: 'Сзади по лопаткам, горизонтально между складками, где рука соединяется с туловищем. Руки опущены. Вводите полную ширину, а не половину.',
  }),
  spec({
    id: 'chestWidth', short: 'Шг', title: 'Ширина груди', group: 'torso', kind: 'width', min: 250, max: 480,
    hint: 'Спереди над грудью, горизонтально между складками, где рука соединяется с туловищем. Полная ширина, а не половина.',
  }),
  spec({
    id: 'bustSpan', short: 'Цг', title: 'Расстояние между центрами груди', group: 'torso', kind: 'width', min: 120, max: 300,
    hint: 'Горизонтально между выступающими точками груди. Полное расстояние, а не половина.',
  }),
  spec({
    id: 'bustHeight', short: 'Вг', title: 'Высота груди', group: 'torso', kind: 'length', min: 180, max: 400,
    hint: 'От точки основания шеи у плеча до выступающей точки груди.',
  }),
  spec({
    id: 'frontLength', short: 'Дтп', title: 'Длина переда до талии', group: 'torso', kind: 'length', min: 340, max: 580,
    hint: 'От точки основания шеи у плеча через выступающую точку груди до линии талии (тесьмы).',
  }),
  spec({
    id: 'backLength', short: 'Дтс', title: 'Длина спины до талии', group: 'torso', kind: 'length', min: 330, max: 520,
    hint: 'По позвоночнику от седьмого шейного позвонка до линии талии (тесьмы). Попросите помощника.',
  }),
  spec({
    id: 'shoulderSlantBack', short: 'Впк', title: 'Высота плеча косая', group: 'torso', kind: 'length', min: 340, max: 540,
    hint: 'Сзади от пересечения позвоночника и линии талии до плечевой точки, по прямой.',
  }),
  spec({
    id: 'armholeDepth', short: 'Впрз', title: 'Высота проймы сзади', group: 'torso', kind: 'length', min: 140, max: 280,
    hint: 'По позвоночнику от седьмого шейного позвонка до горизонтали на уровне складок подмышек сзади. Удобно зажать под мышками линейку.',
  }),

  // Рука
  spec({
    id: 'upperArm', short: 'Оп', title: 'Обхват плеча', group: 'arm', kind: 'girth', min: 200, max: 500,
    hint: 'Горизонтально вокруг самой полной части руки выше локтя, рука опущена и расслаблена.',
  }),
  spec({
    id: 'wrist', short: 'Озап', title: 'Обхват запястья', group: 'arm', kind: 'girth', min: 120, max: 220,
    hint: 'Вокруг запястья через выступающую косточку.',
  }),
  spec({
    id: 'armLength', short: 'Др', title: 'Длина руки до запястья', group: 'arm', kind: 'length', min: 450, max: 720,
    hint: 'От плечевой точки по слегка согнутой руке через локоть до косточки запястья.',
  }),
  spec({
    id: 'elbowLength', short: 'Дрл', title: 'Длина руки до локтя', group: 'arm', kind: 'length', min: 240, max: 420,
    hint: 'От плечевой точки до локтя по слегка согнутой руке.',
  }),

  // Талия и ноги
  spec({
    id: 'waistToHips', short: 'Дтб', title: 'Высота бёдер', group: 'legs', kind: 'length', min: 130, max: 280,
    hint: 'Сбоку от линии талии (тесьмы) до линии обхвата бёдер.',
  }),
  spec({
    id: 'crotchDepth', short: 'Вс', title: 'Высота сидения', group: 'legs', kind: 'length', min: 200, max: 380,
    hint: 'Сядьте на твёрдый ровный стул. Сбоку от линии талии до сиденья, по прямой.',
  }),
  spec({
    id: 'waistToKnee', short: 'Дтк', title: 'Длина от талии до колена', group: 'legs', kind: 'length', min: 450, max: 720,
    hint: 'Сбоку от линии талии до середины колена.',
  }),
  spec({
    id: 'waistToFloor', short: 'Дсб', title: 'Длина от талии до пола сбоку', group: 'legs', kind: 'length', min: 850, max: 1300,
    hint: 'Сбоку от линии талии до пола, без обуви.',
  }),
  spec({
    id: 'thigh', short: 'Обед', title: 'Обхват бедра', group: 'legs', kind: 'girth', min: 400, max: 900,
    hint: 'Горизонтально вокруг ноги у самого верха, сразу под ягодичной складкой. Ноги на ширине плеч, вес на обе ноги.',
  }),
  spec({
    id: 'knee', short: 'Ок', title: 'Обхват колена', group: 'legs', kind: 'girth', min: 270, max: 560,
    hint: 'Вокруг ноги через середину коленной чашечки.',
  }),
  spec({
    id: 'calf', short: 'Ои', title: 'Обхват икры', group: 'legs', kind: 'girth', min: 250, max: 520,
    hint: 'Горизонтально вокруг самой полной части икры.',
  }),
  spec({
    id: 'ankle', short: 'Ощ', title: 'Обхват щиколотки', group: 'legs', kind: 'girth', min: 170, max: 330,
    hint: 'Вокруг самого узкого места ноги над косточками.',
  }),

  // Изделие (не мерка тела, а желаемый размер вещи)
  spec({
    id: 'skirtLength', short: 'Ди', title: 'Длина юбки', group: 'garment', kind: 'length', min: 300, max: 1200,
    hint: 'Желаемая длина изделия: сбоку от линии талии вниз. Это не мерка тела, её можно поменять в каждой модели.',
  }),
] as const

export type MeasurementId = (typeof MEASUREMENT_LIST)[number]['id']

/** A full set of measurements, mm. */
export type Measurements = Record<MeasurementId, number>
/** A set being filled in: any value may be missing. */
export type MeasurementSet = Partial<Measurements>

export const MEASUREMENTS = Object.fromEntries(MEASUREMENT_LIST.map((s) => [s.id, s])) as {
  [K in MeasurementId]: MeasurementSpec & { id: K }
}

export const MEASUREMENT_IDS: MeasurementId[] = MEASUREMENT_LIST.map((s) => s.id)

export const LEADING_IDS: MeasurementId[] = MEASUREMENT_LIST.filter((s) => 'leading' in s && s.leading).map((s) => s.id)

export function isMeasurementId(id: string): id is MeasurementId {
  return id in MEASUREMENTS
}

/** mm → «88,5 см» */
export function formatCm(mm: number): string {
  return `${(Math.round(mm) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} см`
}
