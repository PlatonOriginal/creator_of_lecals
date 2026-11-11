import { BLOCKS, DEFAULT_ALLOWANCES, type ModelSpec } from '@lecals/core'
import { newId, type ModelDoc } from './library'

const KEY = 'lecals.model.v2'
const OLD_KEY = 'lecals.model.v1'

export function emptyModel(block = BLOCKS[0]!.id): ModelDoc {
  return {
    id: newId(),
    name: 'Новая модель',
    kind: 'model',
    block,
    silhouette: 'semi',
    options: {},
    layers: [{}],
    allowances: { ...DEFAULT_ALLOWANCES, byEdge: { ...DEFAULT_ALLOWANCES.byEdge }, on: true },
    updated: Date.now(),
  }
}

/** The model open on the «Выкройка» tab, kept between visits. */
export function loadCurrentModel(): ModelDoc {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const m = JSON.parse(raw) as ModelDoc
      if (BLOCKS.some((b) => b.id === m.block)) return { ...emptyModel(m.block), ...m, layers: m.layers?.length ? m.layers : [{}] }
    }
    const old = localStorage.getItem(OLD_KEY)
    if (old) {
      const m = JSON.parse(old) as { block: string; silhouette: ModelDoc['silhouette']; options: Record<string, number> }
      if (BLOCKS.some((b) => b.id === m.block)) return { ...emptyModel(m.block), silhouette: m.silhouette ?? 'semi', options: m.options ?? {} }
    }
  } catch {
    // Nothing stored or storage blocked.
  }
  return emptyModel()
}

export function saveCurrentModel(m: ModelDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    // Storage blocked: the model lives until the tab closes.
  }
}

/** The editable (last) layer and a setter that returns the updated model. */
export function lastLayer(m: ModelDoc): ModelSpec {
  return m.layers[m.layers.length - 1] ?? {}
}

export function withLastLayer(m: ModelDoc, spec: ModelSpec): ModelDoc {
  return { ...m, layers: [...m.layers.slice(0, -1), spec] }
}
