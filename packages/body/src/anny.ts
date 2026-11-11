/**
 * Parametric body from the Anny model (NAVER, Apache 2.0; MakeHuman assets CC0),
 * exported by tools/anny-export/export_anny.py.
 *
 * The phenotype weight formula is a direct port of
 * anny.models.phenotype.phenotype_blendshape_weights, so the browser builds
 * the same body as the Python model, up to the compression error.
 */

export type PhenotypeLabel =
  | 'gender'
  | 'age'
  | 'muscle'
  | 'weight'
  | 'height'
  | 'proportions'
  | 'cupsize'
  | 'firmness'
  | 'african'
  | 'asian'
  | 'caucasian'

export type Phenotypes = Partial<Record<PhenotypeLabel, number>>
export type LocalChanges = Record<string, number>

interface BlockInfo {
  dtype: string
  shape: number[]
  byteOffset: number
  byteLength: number
}

export interface AnnyMeta {
  format: 'lecals-anny-body'
  version: number
  vertexCount: number
  faceCount: number
  rank: number
  phenotypeLabels: PhenotypeLabel[]
  phenotypeVariations: Record<string, string[]>
  anchors: Record<string, number[]>
  mask: number[][]
  localChanges: { label: string; direction: 'incr' | 'decr'; count: number; offset: number; scale: number }[]
  localChangeLabels: string[]
  compression: Record<string, { meanErrMm: number; p99ErrMm: number; maxErrMm: number }>
  blocks: Record<string, BlockInfo>
  references: {
    phenotypes: Record<string, number>
    localChanges: Record<string, number>
    nonZeroWeights: number
    weightSum: number
    probe: Record<string, [number, number, number]>
  }[]
}

const INTERPOLATED = ['age', 'gender', 'muscle', 'weight', 'height', 'proportions', 'cupsize', 'firmness'] as const
const RACE = ['african', 'asian', 'caucasian'] as const

/** Port of anny.utils.interpolation.linear_interpolation_coefficients (no extrapolation). */
export function interpolationCoefficients(value: number, anchors: number[]): number[] {
  const n = anchors.length
  const v = Math.min(Math.max(value, anchors[0]!), anchors[n - 1]!)
  // searchsorted(side="left"), clamped to [1, n-1]
  let idx = 0
  while (idx < n && anchors[idx]! < v) idx++
  idx = Math.min(Math.max(idx, 1), n - 1)
  const lo = anchors[idx - 1]!
  const hi = anchors[idx]!
  const alpha = (v - lo) / (hi - lo)
  const w = new Array<number>(n).fill(0)
  w[idx - 1] = 1 - alpha
  w[idx] = alpha
  return w
}

export class AnnyBody {
  readonly meta: AnnyMeta
  readonly vertexCount: number
  readonly template: Float32Array
  readonly faces: Uint16Array | Uint32Array
  private readonly basis: Int16Array
  private readonly basisScale: Float32Array
  private readonly phenotypeToBasis: Float32Array
  private readonly localIndices: Uint32Array
  private readonly localDeltas: Int16Array
  private readonly variationOrder: string[]

  constructor(meta: AnnyMeta, bin: ArrayBuffer) {
    if (meta.format !== 'lecals-anny-body' || meta.version !== 1) throw new Error('Unknown body format')
    this.meta = meta
    this.vertexCount = meta.vertexCount
    const view = <T>(name: string, Ctor: { new (b: ArrayBuffer, o: number, l: number): T; BYTES_PER_ELEMENT: number }) => {
      const b = meta.blocks[name]
      if (!b) throw new Error(`Missing block ${name}`)
      return new Ctor(bin, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT)
    }
    this.template = view('template', Float32Array)
    this.faces = meta.blocks.faces!.dtype === 'uint16' ? view('faces', Uint16Array) : view('faces', Uint32Array)
    this.basis = view('basis', Int16Array)
    this.basisScale = view('basisScale', Float32Array)
    this.phenotypeToBasis = view('phenotypeToBasis', Float32Array)
    this.localIndices = view('localIndices', Uint32Array)
    this.localDeltas = view('localDeltas', Int16Array)
    this.variationOrder = Object.values(meta.phenotypeVariations).flat()
  }

  /** Port of anny.models.phenotype.phenotype_blendshape_weights for one body. */
  phenotypeWeights(phenotypes: Phenotypes): Float64Array {
    const value = (label: PhenotypeLabel) => phenotypes[label] ?? 0.5
    const byVariation: Record<string, number> = {}
    for (const feature of INTERPOLATED) {
      const coeffs = interpolationCoefficients(value(feature), this.meta.anchors[feature]!)
      this.meta.phenotypeVariations[feature]!.forEach((key, i) => (byVariation[key] = coeffs[i]!))
    }
    const race = RACE.map(value)
    const sum = race[0]! + race[1]! + race[2]!
    RACE.forEach((key, i) => (byVariation[key] = sum > 0 ? race[i]! / sum : 1 / 3))
    const phens = this.variationOrder.map((k) => byVariation[k]!)
    const out = new Float64Array(this.meta.mask.length)
    this.meta.mask.forEach((cols, k) => {
      let p = 1
      for (const j of cols) p *= phens[j]!
      out[k] = p
    })
    return out
  }

  /**
   * Vertices a local change moves the most (at least `share` of its largest
   * shift): a fixed set of vertices that marks that place on any body
   * (the neck ring, the upper-arm ring…).
   */
  localRegion(label: string, share = 0.3): number[] {
    const entry = this.meta.localChanges.find((e) => e.label === label && e.direction === 'incr')
    if (!entry) return []
    const mags: number[] = []
    for (let j = 0; j < entry.count; j++) {
      const d = (entry.offset + j) * 3
      mags.push(Math.hypot(this.localDeltas[d]!, this.localDeltas[d + 1]!, this.localDeltas[d + 2]!))
    }
    const top = Math.max(...mags)
    const out: number[] = []
    for (let j = 0; j < entry.count; j++) if (mags[j]! >= share * top) out.push(this.localIndices[entry.offset + j]!)
    return out
  }

  /** Rest-pose vertex positions (metres, y up) for the given body parameters. */
  restVertices(phenotypes: Phenotypes, localChanges: LocalChanges = {}, out?: Float32Array): Float32Array {
    const result = this.phenotypeVertices(phenotypes, out)
    this.addLocalChanges(result, localChanges)
    return result
  }

  /** The body for the phenotypes alone, before the local changes. */
  phenotypeVertices(phenotypes: Phenotypes, out?: Float32Array): Float32Array {
    const n3 = this.vertexCount * 3
    const result = out ?? new Float32Array(n3)
    result.set(this.template)

    const R = this.meta.rank
    const c = this.phenotypeWeights(phenotypes)
    const z = new Float64Array(R)
    for (let k = 0; k < c.length; k++) {
      const ck = c[k]!
      if (ck === 0) continue
      const row = k * R
      for (let r = 0; r < R; r++) z[r]! += ck * this.phenotypeToBasis[row + r]!
    }
    for (let r = 0; r < R; r++) {
      const s = z[r]! * this.basisScale[r]!
      if (s === 0) continue
      const off = r * n3
      for (let i = 0; i < n3; i++) result[i]! += s * this.basis[off + i]!
    }
    return result
  }

  /**
   * Adds the local changes to the vertices in place. They are linear, so a
   * fit can build the phenotype body once and only redo this cheap part.
   */
  addLocalChanges(result: Float32Array, localChanges: LocalChanges): void {
    for (const entry of this.meta.localChanges) {
      const v = localChanges[entry.label] ?? 0
      const w = entry.direction === 'incr' ? Math.max(v, 0) : Math.max(-v, 0)
      if (w === 0) continue
      const s = w * entry.scale
      for (let j = 0; j < entry.count; j++) {
        const vi = this.localIndices[entry.offset + j]! * 3
        const d = (entry.offset + j) * 3
        result[vi]! += s * this.localDeltas[d]!
        result[vi + 1]! += s * this.localDeltas[d + 1]!
        result[vi + 2]! += s * this.localDeltas[d + 2]!
      }
    }
  }
}

export async function loadAnnyBody(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<AnnyBody> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const [metaRes, binRes] = await Promise.all([fetchImpl(`${base}anny.json`), fetchImpl(`${base}anny.bin`)])
  if (!metaRes.ok || !binRes.ok) throw new Error('Не удалось загрузить модель тела')
  return new AnnyBody((await metaRes.json()) as AnnyMeta, await binRes.arrayBuffer())
}
