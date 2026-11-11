import type { Allowances, ModelSpec, Silhouette } from '@lecals/core'
import type { Figure } from './figureStore'

/**
 * Personal library on the device (IndexedDB): figures, own blocks and models.
 * Nothing leaves the phone; the cloud library comes after the prototype.
 */
export interface FigureDoc {
  id: string
  name: string
  figure: Figure
  updated: number
}

/** A model: block + method + modelling layers + parameters, never a drawing. */
export interface ModelDoc {
  id: string
  name: string
  /** 'base': an own block (no modelling), 'model': a modelled garment. */
  kind: 'base' | 'model'
  block: string
  silhouette: Silhouette
  options: Record<string, number>
  /** Modelling layers; all but the last come from the model taken as base. */
  layers: ModelSpec[]
  /** Name of the model this one was built on. */
  baseName?: string
  allowances: Allowances & { on: boolean }
  figureId?: string
  updated: number
}

const DB = 'lecals'
const VERSION = 1
type Store = 'figures' | 'models'

let dbp: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('figures')) db.createObjectStore('figures', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB недоступна'))
  })
  return dbp
}

function run<T>(store: Store, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = f(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result as T)
        tx.onerror = () => reject(tx.error ?? new Error('Ошибка хранилища'))
      }),
  )
}

export const listFigures = () =>
  run<FigureDoc[]>('figures', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updated - a.updated))
export const putFigure = (d: FigureDoc) => run<IDBValidKey>('figures', 'readwrite', (s) => s.put(d))
export const deleteFigure = (id: string) => run<undefined>('figures', 'readwrite', (s) => s.delete(id))

export const listModels = () =>
  run<ModelDoc[]>('models', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updated - a.updated))
export const putModel = (d: ModelDoc) => run<IDBValidKey>('models', 'readwrite', (s) => s.put(d))
export const deleteModel = (id: string) => run<undefined>('models', 'readwrite', (s) => s.delete(id))

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
