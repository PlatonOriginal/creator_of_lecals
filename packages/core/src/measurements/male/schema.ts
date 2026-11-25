/**
 * Мужская схема мерок (этап MM1).
 *
 * Признаки и правила снятия — ГОСТ 17521-72, табл. 1–2: мужская нумерация
 * Т1–Т63. Она не совместима с женской нумерацией ГОСТ 31396-2009, поэтому
 * мужские мерки живут в отдельном модуле со своими типами (MaleMeasurementId,
 * MaleMeasurements), а не в общей schema.ts. Идентификаторы, геометрически
 * совпадающие с женскими (height, waist, neck…), переиспользованы после
 * сверки правил снятия (спецификация § 3.2).
 *
 * Значения — миллиметры; обхваты, ширины и дуги хранятся полными: деление
 * пополам — задача методики построения. Признаки Т7–Т12 — высоты над полом,
 * а не длины вниз от талии. Т17 у мужчин не определяется, Т59 (масса тела)
 * измеряется в килограммах и в схему не входит; альтернативные признаки
 * Т34х–Т40х и расчётные Т60–Т63 в список прямых не входят (Т60–Т63 —
 * male/derive.ts).
 */

export type MaleMeasurementKind = 'girth' | 'width' | 'length' | 'height'

export interface MaleMeasurementSpec {
  /** Stable id used in stored data and formulas. */
  id: string
  /** Number of the size feature, e.g. «Т13»; unique within the male schema. */
  short: string
  /** Full Russian title, e.g. «Обхват шеи». */
  title: string
  group: MaleMeasurementGroupId
  kind: MaleMeasurementKind
  /** Hard limits for an adult man, mm. Outside them the value is rejected. */
  min: number
  max: number
  /** How to take the measurement, shown in the wizard. */
  hint: string
  /** Number of the size feature in ГОСТ 17521-72. */
  gost?: string
  /** Leading measurements: entered first, drive the prefill (Р, Т16, Т18). */
  leading?: boolean
}

export type MaleMeasurementGroupId = 'main' | 'torso' | 'arm' | 'legs'

export const MALE_MEASUREMENT_GROUPS: { id: MaleMeasurementGroupId; title: string }[] = [
  { id: 'main', title: 'Основные' },
  { id: 'torso', title: 'Корпус' },
  { id: 'arm', title: 'Рука и плечо' },
  { id: 'legs', title: 'Талия и ноги' },
]

const TAPE = 'Сантиметр лежит плотно, но не стягивает; стоять прямо, дышать спокойно.'

function spec<const Id extends string>(s: MaleMeasurementSpec & { id: Id }) {
  return s
}

/** Order here is the order of the male wizard; the leading ones come first. */
export const MALE_MEASUREMENT_LIST = [
  // Основные: ведущие по ГОСТ 17521-72 (Р, Т16, Т18) и обхват бёдер.
  spec({
    id: 'height', gost: '1', short: 'Т1', title: 'Рост', group: 'main', kind: 'height', min: 1450, max: 2100, leading: true,
    hint: 'Без обуви, пятки вместе, носки разведены на 15–20 см. Отметьте на стене верх головы угольником или книгой и измерьте до пола.',
  }),
  spec({
    id: 'chest3', gost: '16', short: 'Т16', title: 'Обхват груди третий', group: 'main', kind: 'girth', min: 700, max: 1500, leading: true,
    hint: `Горизонтально вокруг туловища через сосковые точки, сзади по лопаткам. Главный размер мужской фигуры. ${TAPE}`,
  }),
  spec({
    id: 'waist', gost: '18', short: 'Т18', title: 'Обхват талии', group: 'main', kind: 'girth', min: 550, max: 1600, leading: true,
    hint: `Горизонтально вокруг туловища по линии талии. Завяжите на талии эластичную тесьму горизонтально — от неё отсчитываются длины. ${TAPE}`,
  }),
  spec({
    id: 'hips', gost: '19', short: 'Т19', title: 'Обхват бёдер с учётом выступа живота', group: 'main', kind: 'girth', min: 700, max: 1700,
    hint: 'По самым выступающим точкам ягодиц, спереди — по вертикальной пластине (например, книге), приложенной к животу.',
  }),

  // Корпус: обхваты, высоты точек, ширины и дуги.
  spec({
    id: 'neck', gost: '13', short: 'Т13', title: 'Обхват шеи', group: 'torso', kind: 'girth', min: 280, max: 500,
    hint: 'Нижний край ленты — непосредственно над шейной точкой (косточка у основания шеи сзади); сбоку и спереди по основанию шеи, касаясь ключичных точек, замыкается над яремной выемкой.',
  }),
  spec({
    id: 'chest1', gost: '14', short: 'Т14', title: 'Обхват груди первый', group: 'torso', kind: 'girth', min: 700, max: 1500,
    hint: 'Сзади по лопаткам, верхним краем ленты через задние углы подмышечных впадин; спереди на уровне среднегрудинной точки.',
  }),
  spec({
    id: 'chest2', gost: '15', short: 'Т15', title: 'Обхват груди второй', group: 'torso', kind: 'girth', min: 700, max: 1550,
    hint: 'Как обхват груди первый, но спереди лента идёт в косом сечении через сосковые точки. Обычно чуть больше первого.',
  }),
  spec({
    id: 'hipsWithoutAbdomen', gost: '20', short: 'Т20', title: 'Обхват бёдер без учёта выступа живота', group: 'torso', kind: 'girth', min: 700, max: 1700,
    hint: 'По ягодичным точкам, горизонтально, без вертикальной пластины на животе.',
  }),
  spec({
    id: 'upperChestHeight', gost: '2', short: 'Т2', title: 'Высота верхнегрудинной точки', group: 'torso', kind: 'height', min: 1200, max: 1950,
    hint: 'От пола до верхнегрудинной точки (яремной выемки). Высоты измеряют вертикально, стоя прямо; удобно антропометром или рейкой у стены.',
  }),
  spec({
    id: 'clavicleHeight', gost: '3', short: 'Т3', title: 'Высота ключичной точки', group: 'torso', kind: 'height', min: 1150, max: 1900,
    hint: 'От пола до середины ключицы.',
  }),
  spec({
    id: 'neckBaseHeight', gost: '4', short: 'Т4', title: 'Высота основания шеи сбоку', group: 'torso', kind: 'height', min: 1150, max: 1850,
    hint: 'От пола до точки, где основание шеи переходит в плечо. Высота, а не длина вниз от талии.',
  }),
  spec({
    id: 'shoulderPointHeight', gost: '5', short: 'Т5', title: 'Высота плечевой точки', group: 'torso', kind: 'height', min: 1100, max: 1800,
    hint: 'От пола до плечевой точки — края плеча, где начинается рука.',
  }),
  spec({
    id: 'nippleHeight', gost: '6', short: 'Т6', title: 'Высота сосковой точки', group: 'torso', kind: 'height', min: 1000, max: 1650,
    hint: 'От пола до центра соска. Высота над полом, измеряется вертикально.',
  }),
  spec({
    id: 'napeHeight', gost: '10', short: 'Т10', title: 'Высота шейной точки', group: 'torso', kind: 'height', min: 1200, max: 1900,
    hint: 'От пола до остистого отростка седьмого шейного позвонка — косточки у основания шеи сзади.',
  }),
  spec({
    id: 'rearArmholeHeight', gost: '11', short: 'Т11', title: 'Высота заднего угла подмышечной впадины', group: 'torso', kind: 'height', min: 1000, max: 1650,
    hint: 'От пола до заднего угла подмышечной впадины (складки под мышкой сзади). Рука опущена.',
  }),
  spec({
    id: 'napeToChest1Front', gost: '34', short: 'Т34', title: 'Расстояние от шейной точки до линии обхвата груди первого спереди', group: 'torso', kind: 'length', min: 150, max: 350,
    hint: 'От шейной точки через основание шеи к отметке на линии обхвата груди первого спереди.',
  }),
  spec({
    id: 'bustHeight', gost: '35', short: 'Т35', title: 'Высота груди', group: 'torso', kind: 'length', min: 180, max: 400,
    hint: 'От шейной точки через основание шеи до сосковой точки.',
  }),
  spec({
    id: 'frontLength', gost: '36', short: 'Т36', title: 'Длина талии спереди', group: 'torso', kind: 'length', min: 350, max: 600,
    hint: 'От шейной точки через основание шеи и сосковую точку до линии талии (тесьмы).',
  }),
  spec({
    id: 'frontArmholeDepth', gost: '37', short: 'Т37', title: 'Расстояние от шейной точки до уровня заднего угла подмышечной впадины спереди', group: 'torso', kind: 'length', min: 150, max: 330,
    hint: 'От шейной точки через основание шеи по направлению к переднему углу подмышечной впадины; конечная точка — под передним углом на уровне заднего, уровень фиксируют пластиной шириной до 2 см.',
  }),
  spec({
    id: 'armholeArc', gost: '38', short: 'Т38', title: 'Дуга через высшую точку плечевого сустава', group: 'torso', kind: 'length', min: 240, max: 560,
    hint: 'От заднего угла подмышечной впадины через верх плечевого сустава до уровня заднего угла спереди. Рука опущена.',
  }),
  spec({
    id: 'armholeDepthBack', gost: '39', short: 'Т39', title: 'Расстояние от шейной точки до линии обхватов груди с учётом выступа лопаток', group: 'torso', kind: 'length', min: 170, max: 300,
    hint: 'От шейной точки вниз до верхнего края пластины шириной до 2 см, опирающейся на отметки линий обхвата груди первого и второго на лопатках.',
  }),
  spec({
    id: 'backLength', gost: '40', short: 'Т40', title: 'Длина спины до талии с учётом выступа лопаток', group: 'torso', kind: 'length', min: 370, max: 560,
    hint: 'От линии талии по позвоночнику, через пластину шириной до 2 см на выступах лопаток, до шейной точки. Попросите помощника.',
  }),
  spec({
    id: 'slantedShoulderHeight', gost: '41', short: 'Т41', title: 'Высота плеча косая', group: 'torso', kind: 'length', min: 330, max: 560,
    hint: 'По кратчайшему расстоянию от пересечения линии талии с позвоночником до плечевой точки.',
  }),
  spec({
    id: 'upperTorsoArcThroughShoulder', gost: '42', short: 'Т42', title: 'Дуга верхней части туловища через плечевую точку', group: 'torso', kind: 'length', min: 700, max: 1250,
    hint: 'От линии талии сзади через плечевую точку до линии талии спереди, по кратчайшему пути через верх плеча.',
  }),
  spec({
    id: 'backWaistToNeckBase', gost: '43', short: 'Т43', title: 'Расстояние от линии талии сзади до основания шеи сбоку', group: 'torso', kind: 'length', min: 340, max: 560,
    hint: 'От линии талии сзади параллельно позвоночнику вверх до основания шеи сбоку.',
  }),
  spec({
    id: 'upperTorsoArc', gost: '44', short: 'Т44', title: 'Дуга верхней части туловища через основание шеи сбоку', group: 'torso', kind: 'length', min: 750, max: 1400,
    hint: 'От линии талии сзади параллельно позвоночнику через основание шеи сбоку, далее через сосковую точку до линии талии спереди.',
  }),
  spec({
    id: 'chestWidth', gost: '45', short: 'Т45', title: 'Ширина груди', group: 'torso', kind: 'width', min: 280, max: 560,
    hint: 'Между передними углами подмышечных впадин, горизонтально, непосредственно над линией обхвата груди первого. Полная ширина, а не половина.',
  }),
  spec({
    id: 'chestPointDistance', gost: '46', short: 'Т46', title: 'Расстояние между сосковыми точками', group: 'torso', kind: 'width', min: 120, max: 280,
    hint: 'Горизонтально между сосковыми точками. Полное расстояние, а не половина.',
  }),
  spec({
    id: 'backWidth', gost: '47', short: 'Т47', title: 'Ширина спины', group: 'torso', kind: 'width', min: 320, max: 580,
    hint: 'Между задними углами подмышечных впадин, горизонтально, непосредственно над линиями обхватов груди первого и второго. Полная ширина, а не половина.',
  }),
  spec({
    id: 'head', gost: '48', short: 'Т48', title: 'Обхват головы', group: 'torso', kind: 'girth', min: 520, max: 660,
    hint: 'Через затылочный бугор и центры лобных бугров. Специальный признак: нужен для головных уборов и капюшонов.',
  }),
  spec({
    id: 'acromialDiameter', gost: '52', short: 'Т52', title: 'Акромиальный диаметр', group: 'torso', kind: 'width', min: 330, max: 480,
    hint: 'Между акромиальными точками — концами плечевых костей. Измеряют большим циркулем или двумя рейками.',
  }),
  spec({
    id: 'shoulderDiameter', gost: '53', short: 'Т53', title: 'Плечевой диаметр', group: 'torso', kind: 'width', min: 350, max: 520,
    hint: 'Между плечевыми точками — краями плеча, где начинается рука. Измеряют большим циркулем.',
  }),
  spec({
    id: 'neckTransverseDiameter', gost: '54', short: 'Т54', title: 'Поперечный диаметр шеи', group: 'torso', kind: 'width', min: 90, max: 160,
    hint: 'Между точками основания шеи, поперёк. Измеряют штангенциркулем или циркулем.',
  }),
  spec({
    id: 'waistTransverseDiameter', gost: '55', short: 'Т55', title: 'Поперечный диаметр талии', group: 'torso', kind: 'width', min: 200, max: 450,
    hint: 'Горизонтально на уровне линии талии, поперёк туловища.',
  }),
  spec({
    id: 'hipsTransverseDiameter', gost: '56', short: 'Т56', title: 'Поперечный диаметр бёдер', group: 'torso', kind: 'width', min: 300, max: 520,
    hint: 'Горизонтально на уровне обхвата бёдер, поперёк туловища.',
  }),
  spec({
    id: 'chest2Depth', gost: '58', short: 'Т58', title: 'Переднезадний диаметр обхвата груди второго', group: 'torso', kind: 'width', min: 160, max: 300,
    hint: 'Горизонтально между линией сосковых точек спереди и отметкой линий обхвата груди первого и второго на лопатках.',
  }),

  // Рука и плечо
  spec({
    id: 'upperArm', gost: '28', short: 'Т28', title: 'Обхват плеча', group: 'arm', kind: 'girth', min: 200, max: 520,
    hint: 'Перпендикулярно оси плеча; верхний край ленты касается заднего угла подмышечной впадины. Рука опущена и расслаблена.',
  }),
  spec({
    id: 'wrist', gost: '29', short: 'Т29', title: 'Обхват запястья', group: 'arm', kind: 'girth', min: 120, max: 220,
    hint: 'Перпендикулярно оси предплечья, через лучезапястный сустав и головку локтевой кости.',
  }),
  spec({
    id: 'hand', gost: '30', short: 'Т30', title: 'Обхват кисти', group: 'arm', kind: 'girth', min: 150, max: 290,
    hint: 'Через пястно-фаланговый сустав первого пальца; первый палец приведён ко второму и отведён от него на 30–35°.',
  }),
  spec({
    id: 'shoulderSlope', gost: '31', short: 'Т31', title: 'Ширина плечевого ската', group: 'arm', kind: 'width', min: 110, max: 200,
    hint: 'От середины основания шеи до плечевой точки по верху плеча. Ширина ската, а не всей спины.',
  }),
  spec({
    id: 'neckToRadial', gost: '32', short: 'Т32', title: 'Расстояние от основания шеи сбоку до лучевой точки', group: 'arm', kind: 'length', min: 270, max: 480,
    hint: 'Через середину плечевого ската и плечевую точку до лучевой точки — косточки у основания большого пальца. Рука слегка согнута.',
  }),
  spec({
    id: 'neckToWrist', gost: '33', short: 'Т33', title: 'Расстояние от основания шеи сбоку до линии обхвата запястья', group: 'arm', kind: 'length', min: 480, max: 760,
    hint: 'Через плечевую точку и лучевую точку до линии обхвата запястья. Рука слегка согнута.',
  }),
  spec({
    id: 'armDepth', gost: '57', short: 'Т57', title: 'Переднезадний диаметр руки', group: 'arm', kind: 'width', min: 60, max: 170,
    hint: 'Горизонтально на уровне заднего угла подмышечной впадины: толщина руки спереди назад. Двумя рейками или штангенциркулем.',
  }),

  // Талия и ноги
  spec({
    id: 'waistHeight', gost: '7', short: 'Т7', title: 'Высота линии талии', group: 'legs', kind: 'height', min: 950, max: 1200,
    hint: 'От пола до точки уровня талии. Тесьма на талии должна лежать горизонтально. Высота над полом, а не длина вниз.',
  }),
  spec({
    id: 'frontAsisHeight', gost: '8', short: 'Т8', title: 'Высота передней точки гребня подвздошной кости', group: 'legs', kind: 'height', min: 850, max: 1150,
    hint: 'От пола до передней точки гребня подвздошной кости — косточки, выступающей спереди сбоку на талии.',
  }),
  spec({
    id: 'kneeHeight', gost: '9', short: 'Т9', title: 'Высота коленной точки', group: 'legs', kind: 'height', min: 380, max: 620,
    hint: 'От пола до середины коленной чашечки. Высота над полом.',
  }),
  spec({
    id: 'glutealFoldHeight', gost: '12', short: 'Т12', title: 'Высота подъягодичной складки', group: 'legs', kind: 'height', min: 650, max: 950,
    hint: 'От пола до середины складки под ягодицей. По ней строят линию бёдер брюк. Высота над полом.',
  }),
  spec({
    id: 'thigh', gost: '21', short: 'Т21', title: 'Обхват бедра', group: 'legs', kind: 'girth', min: 400, max: 900,
    hint: 'Горизонтально вокруг бедра; верхний край ленты касается подъягодичной складки. Ноги на ширине плеч, вес на обе ноги.',
  }),
  spec({
    id: 'knee', gost: '22', short: 'Т22', title: 'Обхват колена', group: 'legs', kind: 'girth', min: 260, max: 560,
    hint: 'Горизонтально вокруг ноги на уровне коленной точки.',
  }),
  spec({
    id: 'calf', gost: '23', short: 'Т23', title: 'Обхват икры', group: 'legs', kind: 'girth', min: 250, max: 520,
    hint: 'Горизонтально вокруг самой полной части икры.',
  }),
  spec({
    id: 'ankle', gost: '24', short: 'Т24', title: 'Обхват щиколотки', group: 'legs', kind: 'girth', min: 160, max: 330,
    hint: 'Горизонтально непосредственно над внутренней лодыжкой.',
  }),
  spec({
    id: 'waistToFloorSide', gost: '25', short: 'Т25', title: 'Расстояние от линии талии до пола сбоку', group: 'legs', kind: 'length', min: 950, max: 1250,
    hint: 'От точки линии талии по боковой поверхности бедра через его выступ и далее вертикально до пола, без обуви.',
  }),
  spec({
    id: 'waistToFloorFront', gost: '26', short: 'Т26', title: 'Расстояние от линии талии до пола спереди', group: 'legs', kind: 'length', min: 950, max: 1250,
    hint: 'От точки линии талии спереди через выступ живота и далее вертикально до пола, без обуви.',
  }),
  spec({
    id: 'inseam', gost: '27', short: 'Т27', title: 'Длина ноги по внутренней поверхности', group: 'legs', kind: 'length', min: 650, max: 950,
    hint: 'От промежности до пола при слегка расставленных ногах, без обуви. Удобно прижать к промежности линейку.',
  }),
  spec({
    id: 'waistToSeat', gost: '49', short: 'Т49', title: 'Расстояние от линии талии до плоскости сидения', group: 'legs', kind: 'length', min: 200, max: 390,
    hint: 'Сидя на жёстком ровном стуле, по боку от линии талии до плоскости сидения, по прямой. Это высота сидения.',
  }),
  spec({
    id: 'bentKnee', gost: '50', short: 'Т50', title: 'Обхват колена в согнутом положении', group: 'legs', kind: 'girth', min: 260, max: 560,
    hint: 'По подколенной ямке через коленную точку; нога согнута под прямым углом. Специальный признак для узких брюк.',
  }),
  spec({
    id: 'instep', gost: '51', short: 'Т51', title: 'Обхват подъёма стопы', group: 'legs', kind: 'girth', min: 250, max: 420,
    hint: 'Через наиболее низкую заднюю точку пятки и высшую точку подъёма. От этого обхвата зависит, пройдёт ли стопа в низ брюк.',
  }),
] as const

export type MaleMeasurementId = (typeof MALE_MEASUREMENT_LIST)[number]['id']

/** A full set of male measurements, mm. */
export type MaleMeasurements = Record<MaleMeasurementId, number>
/** A male set being filled in: any value may be missing. */
export type MaleMeasurementSet = Partial<MaleMeasurements>

export const MALE_MEASUREMENTS = Object.fromEntries(MALE_MEASUREMENT_LIST.map((s) => [s.id, s])) as {
  [K in MaleMeasurementId]: MaleMeasurementSpec & { id: K }
}

export const MALE_MEASUREMENT_IDS: MaleMeasurementId[] = MALE_MEASUREMENT_LIST.map((s) => s.id)

export const MALE_LEADING_IDS: MaleMeasurementId[] = MALE_MEASUREMENT_LIST.filter(
  (s) => 'leading' in s && s.leading,
).map((s) => s.id)

export function isMaleMeasurementId(id: string): id is MaleMeasurementId {
  return id in MALE_MEASUREMENTS
}
