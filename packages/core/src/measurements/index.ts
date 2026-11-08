export * from './schema'
export * from './typical'
export * from './validate'
import type { Measurements } from './schema'
import { typicalFigure } from './typical'

/** Типовая фигура 164-88-96 из модели предзаполнения, для тестов и демо. */
export const SAMPLE_MEASUREMENTS: Measurements = typicalFigure({ height: 1640, bust: 880, hips: 960 })
