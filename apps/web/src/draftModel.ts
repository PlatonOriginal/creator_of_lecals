import {
  BLOCKS,
  SAMPLE_MEASUREMENTS,
  applyLayers,
  garmentProfile,
  prefill,
  validateMeasurements,
  type BlockDef,
  type GarmentProfile,
  type Measurements,
  type MeasurementSet,
} from '@lecals/core'
import type { ModelDoc } from './library'

/** The user's measurements with gaps filled from the typical figure (or the sample one), as the «Выкройка» tab drafts with. */
export function filledMeasurements(values: MeasurementSet): Measurements {
  const filled = prefill(values)
  const out = {} as Measurements
  for (const id of Object.keys(SAMPLE_MEASUREMENTS) as (keyof Measurements)[]) out[id] = values[id] ?? filled[id] ?? SAMPLE_MEASUREMENTS[id]
  return out
}

export interface DraftedModel {
  block: BlockDef
  profile: GarmentProfile
  m: Measurements
}

/** Drafts the current model on the figure and turns it into rings round the body; undefined if the measurements do not allow it. */
export function draftProfile(model: ModelDoc, values: MeasurementSet): DraftedModel | undefined {
  const block = BLOCKS.find((b) => b.id === model.block) ?? BLOCKS[0]!
  const m = filledMeasurements(values)
  const req = Object.fromEntries(block.required.map((id) => [id, m[id]])) as Measurements
  const issues = validateMeasurements(req, { required: block.required, plausibility: false })
  if (issues.some((i) => i.level === 'error')) return undefined
  const options = { ...block.defaults(model.silhouette), ...model.options }
  const base = block.draft(req, options)
  const modelled = applyLayers(block, base, model.layers, req)
  return { block, profile: garmentProfile(modelled.panels, block.garment, base.panels), m }
}
