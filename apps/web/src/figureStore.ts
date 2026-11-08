import { MEASUREMENT_IDS, isMeasurementId, type MeasurementId, type MeasurementSet } from '@lecals/core'

/**
 * The user's figure, kept in the browser (localStorage) between visits.
 * `confirmed` lists measurements the user actually took or checked in the
 * wizard; the rest of `values` may be prefilled from the typical figure.
 */
export interface Figure {
  values: MeasurementSet
  confirmed: MeasurementId[]
}

const KEY = 'lecals.figure.v1'

export const EMPTY_FIGURE: Figure = { values: {}, confirmed: [] }

export function loadFigure(): Figure {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_FIGURE
    const data = JSON.parse(raw) as Partial<Figure>
    const values: MeasurementSet = {}
    for (const [id, v] of Object.entries(data.values ?? {}))
      if (isMeasurementId(id) && typeof v === 'number' && Number.isFinite(v)) values[id] = v
    const confirmed = (data.confirmed ?? []).filter((id): id is MeasurementId => isMeasurementId(id))
    return { values, confirmed }
  } catch {
    return EMPTY_FIGURE
  }
}

export function saveFigure(f: Figure) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // Private mode or storage blocked: the figure lives until the tab closes.
  }
}

export function confirmedCount(f: Figure) {
  return MEASUREMENT_IDS.filter((id) => f.confirmed.includes(id) && f.values[id] !== undefined).length
}
