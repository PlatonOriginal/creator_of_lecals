import {
  BLOCKS,
  MALE_BLOCKS,
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  gradeMaleFeature,
  maleTypicalFigure,
  type BlockDef,
  type MaleMeasurements,
  type MeasurementSet,
} from '@lecals/core'

export type GenderMode = 'female' | 'male'

export const ALL_BLOCKS: BlockDef[] = [...BLOCKS, ...MALE_BLOCKS]

export interface MaleMeasurementMeta {
  id: keyof MaleMeasurements
  title: string
  short: string
  group: 'leading' | 'upper' | 'lower'
  gost?: string
  hint: string
}

export const MALE_MEASUREMENT_META: Partial<Record<keyof MaleMeasurements, MaleMeasurementMeta>> = {
  height: {
    id: 'height',
    title: 'Рост',
    short: 'Р',
    group: 'leading',
    gost: 'Т1',
    hint: 'Вертикальное расстояние от пола до верхушечной точки головы.',
  },
  chest3: {
    id: 'chest3',
    title: 'Обхват груди третий',
    short: 'Ог3',
    group: 'leading',
    gost: 'Т16',
    hint: 'Горизонтально через выступающие точки грудных желез и лопаток.',
  },
  waist: {
    id: 'waist',
    title: 'Обхват талии',
    short: 'От',
    group: 'leading',
    gost: 'Т18',
    hint: 'Горизонтально по наиболее узкому месту туловища (по тесьме на талии).',
  },
  hips: {
    id: 'hips',
    title: 'Обхват бёдер с выступом живота',
    short: 'Об',
    group: 'lower',
    gost: 'Т19',
    hint: 'Горизонтально на уровне наибольшего выступа ягодиц с учётом выступа живота.',
  },
  chest1: {
    id: 'chest1',
    title: 'Обхват груди первый',
    short: 'Ог1',
    group: 'upper',
    gost: 'Т14',
    hint: 'Над основанием грудных желез спереди и по нижнему краю лопаток сзади.',
  },
  chest2: {
    id: 'chest2',
    title: 'Обхват груди второй',
    short: 'Ог2',
    group: 'upper',
    gost: 'Т15',
    hint: 'Горизонтально через подмышечные впадины и выступающие точки груди.',
  },
  neck: {
    id: 'neck',
    title: 'Обхват шеи',
    short: 'Ош',
    group: 'upper',
    gost: 'Т13',
    hint: 'Лента проходит над яремной вырезкой спереди и над седьмым шейным позвонком сзади.',
  },
  waistHeight: {
    id: 'waistHeight',
    title: 'Высота линии талии над полом',
    short: 'Влт',
    group: 'lower',
    gost: 'Т7',
    hint: 'Вертикально от пола до линии талии сбоку.',
  },
  glutealFoldHeight: {
    id: 'glutealFoldHeight',
    title: 'Высота подъягодичной складки',
    short: 'Впяс',
    group: 'lower',
    gost: 'Т12',
    hint: 'Вертикально от пола до нижней точки подъягодичной складки.',
  },
  waistToFloorSide: {
    id: 'waistToFloorSide',
    title: 'Длина сбоку от талии до пола',
    short: 'Дсб',
    group: 'lower',
    gost: 'Т25',
    hint: 'По боковой поверхности от линии талии до пола.',
  },
  waistToSeat: {
    id: 'waistToSeat',
    title: 'Высота сидения',
    short: 'Вс',
    group: 'lower',
    gost: 'Т49',
    hint: 'Вертикальное расстояние от линии талии до плоскости сидения.',
  },
  instep: {
    id: 'instep',
    title: 'Обхват подъёма стопы',
    short: 'Опс',
    group: 'lower',
    gost: 'Т51',
    hint: 'Через тыльную поверхность стопы в наиболее высокой точке подъёма.',
  },
  armholeArc: {
    id: 'armholeArc',
    title: 'Дуга проймы через высшую точку плеча',
    short: 'Дп',
    group: 'upper',
    gost: 'Т38',
    hint: 'От точки основания шеи сбоку через высшую точку плечевого ската и подмышку.',
  },
  armholeDepthBack: {
    id: 'armholeDepthBack',
    title: 'Глубина проймы сзади',
    short: 'Гпрз',
    group: 'upper',
    gost: 'Т39',
    hint: 'Расстояние от линии 7-го шейного позвонка до горизонтали задних углов подмышечных впадин.',
  },
  backLength: {
    id: 'backLength',
    title: 'Длина спины до талии',
    short: 'Дст',
    group: 'upper',
    gost: 'Т40',
    hint: 'По позвоночнику от 7-го шейного позвонка до линии талии.',
  },
  upperTorsoArc: {
    id: 'upperTorsoArc',
    title: 'Верхняя дуга туловища',
    short: 'Вдт',
    group: 'upper',
    gost: 'Т44',
    hint: 'От точки основания шеи сбоку через высшую точку плеча и точку основания шеи спереди.',
  },
  chestWidth: {
    id: 'chestWidth',
    title: 'Ширина груди',
    short: 'Шг',
    group: 'upper',
    gost: 'Т45',
    hint: 'Горизонтально между вертикалями передних углов подмышечных впадин.',
  },
  chestPointDistance: {
    id: 'chestPointDistance',
    title: 'Центр груди',
    short: 'Цг',
    group: 'upper',
    gost: 'Т46',
    hint: 'Расстояние между выступающими точками грудных желез.',
  },
  backWidth: {
    id: 'backWidth',
    title: 'Ширина спины',
    short: 'Шс',
    group: 'upper',
    gost: 'Т47',
    hint: 'Горизонтально между вертикалями задних углов подмышечных впадин.',
  },
  armDepth: {
    id: 'armDepth',
    title: 'Глубина руки',
    short: 'Гр',
    group: 'upper',
    gost: 'Т57',
    hint: 'Поперечный размер руки в плоскости подмышечных впадин.',
  },
  shoulderSlope: {
    id: 'shoulderSlope',
    title: 'Положение плечевого ската',
    short: 'Пп',
    group: 'upper',
    gost: 'Т31',
    hint: 'Расстояние от линии талии сзади до высшей точки плечевого ската.',
  },
  neckToRadial: {
    id: 'neckToRadial',
    title: 'Длина руки до точки лучевой',
    short: 'Дрл',
    group: 'upper',
    gost: 'Т32',
    hint: 'От точки основания шеи сбоку через плечевую точку до точки лучевой при слегка согнутой руке.',
  },
  neckToWrist: {
    id: 'neckToWrist',
    title: 'Длина руки до запястья',
    short: 'Дрз',
    group: 'upper',
    gost: 'Т33',
    hint: 'От точки основания шеи сбоку через плечевую и локтевую точки до запястья.',
  },
  upperArm: {
    id: 'upperArm',
    title: 'Обхват плеча',
    short: 'Оп',
    group: 'upper',
    gost: 'Т27',
    hint: 'Горизонтально на уровне подмышечной впадины при опущенной руке.',
  },
  wrist: {
    id: 'wrist',
    title: 'Обхват запястья',
    short: 'Озап',
    group: 'upper',
    gost: 'Т29',
    hint: 'Поперёк запястья через головку локтевой кости.',
  },
  frontLength: {
    id: 'frontLength',
    title: 'Длина переда до талии',
    short: 'Дпт',
    group: 'upper',
    gost: 'Т36',
    hint: 'От точки основания шеи спереди через центр груди до линии талии.',
  },
  bustHeight: {
    id: 'bustHeight',
    title: 'Высота груди',
    short: 'Вг',
    group: 'upper',
    gost: 'Т35',
    hint: 'От точки основания шеи спереди до выступающей точки груди.',
  },
  napeToChest1Front: {
    id: 'napeToChest1Front',
    title: 'Расстояние от 7-го шейного до уровня Ог1 спереди',
    short: '7ш–Ог1',
    group: 'upper',
    gost: 'Т34',
    hint: 'Вертикальный размер от 7-го шейного позвонка до линии первого обхвата груди.',
  },
}

const MALE_UPPER_BASE_176_100_88 = {
  chest1: 975,
  chest2: 1005,
  neck: 400,
  upperArm: 315,
  wrist: 175,
  shoulderSlope: 148,
  neckToRadial: 355,
  neckToWrist: 610,
  napeToChest1Front: 210,
  bustHeight: 272,
  frontLength: 464,
  armholeArc: 365,
  armholeDepthBack: 216,
  backLength: 460,
  upperTorsoArc: 935,
  chestWidth: 374,
  chestPointDistance: 215,
  backWidth: 408,
  armDepth: 124,
} as const

export const MALE_MEASUREMENT_IDS = Object.keys(MALE_MEASUREMENT_META) as (keyof MaleMeasurements)[]

export function nearestMaleTable8(lead: { height: number; chest3: number; waist: number }) {
  let best = MALE_EMKO_TABLE_8[0]!
  let bestScore = Infinity
  for (const row of MALE_EMKO_TABLE_8) {
    const score =
      Math.abs(row.height - lead.height) * 0.4 +
      Math.abs(row.chest3 - lead.chest3) * 1.2 +
      Math.abs(row.waist - lead.waist) * 0.8
    if (score < bestScore) {
      bestScore = score
      best = row
    }
  }
  const exact =
    best.height === lead.height && best.chest3 === lead.chest3 && best.waist === lead.waist
  return { row: best, exact }
}

export function buildMaleMeasurements(values: MeasurementSet & Partial<Record<keyof MaleMeasurements, number>>): MaleMeasurements {
  const height = values.height ?? 1760
  const chest3 = (values as Partial<Record<keyof MaleMeasurements, number>>).chest3 ?? values.bust ?? 1000
  const waist = values.waist ?? 880
  const typ = maleTypicalFigure({ height, chest3, waist })

  const gradedUpper = {} as Record<keyof typeof MALE_UPPER_BASE_176_100_88, number>
  for (const key of Object.keys(MALE_UPPER_BASE_176_100_88) as (keyof typeof MALE_UPPER_BASE_176_100_88)[]) {
    gradedUpper[key] = Math.round(
      gradeMaleFeature(MALE_UPPER_BASE_176_100_88[key], MALE_EMKO_GRADATION[key]!, { height, chest3, waist }),
    )
  }

  const base: MaleMeasurements = {
    ...(typ as MaleMeasurements),
    ...gradedUpper,
    height,
    chest3,
    waist,
  }

  for (const id of MALE_MEASUREMENT_IDS) {
    const raw = (values as Record<string, number | undefined>)[id]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      base[id] = raw
    }
  }
  return base
}

export function isMaleBlockId(blockId: string): boolean {
  return MALE_BLOCKS.some((b) => b.id === blockId)
}

export function blocksForGender(gender: GenderMode): BlockDef[] {
  return gender === 'male' ? MALE_BLOCKS : BLOCKS
}
