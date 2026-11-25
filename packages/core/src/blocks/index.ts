export * from './types'
export * from './emko/skirt'
export * from './emko/dress'
export * from './emko/trousers'
export * from './emko/maleTrousers'
export * from './emko/maleShirt'
export * from './muller/skirt'
export * from './muller/dress'
export * from './muller/trousers'
export * from './muller/maleTrousers'
import { emkoSkirt } from './emko/skirt'
import { emkoDress } from './emko/dress'
import { emkoTrousers } from './emko/trousers'
import { emkoMaleTrousers } from './emko/maleTrousers'
import { emkoMaleShirt } from './emko/maleShirt'
import { mullerSkirt } from './muller/skirt'
import { mullerDress } from './muller/dress'
import { mullerTrousers } from './muller/trousers'
import { mullerMaleTrousers } from './muller/maleTrousers'
import type { BlockDef } from './types'

/** Женские базовые конструкции (обратная совместимость для текущего UI). */
export const BLOCKS: BlockDef[] = [
  emkoSkirt,
  emkoDress,
  emkoTrousers,
  mullerSkirt,
  mullerDress,
  mullerTrousers,
] as unknown as BlockDef[]

/** Мужские базовые конструкции. */
export const MALE_BLOCKS: BlockDef[] = [emkoMaleTrousers, emkoMaleShirt, mullerMaleTrousers] as unknown as BlockDef[]

/** Все базовые конструкции проекта. */
export const ALL_BLOCKS: BlockDef[] = [...BLOCKS, ...MALE_BLOCKS]
