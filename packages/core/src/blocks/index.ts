export * from './types'
export * from './emko/skirt'
export * from './emko/dress'
export * from './emko/trousers'
export * from './muller/skirt'
import { emkoSkirt } from './emko/skirt'
import { emkoDress } from './emko/dress'
import { emkoTrousers } from './emko/trousers'
import { mullerSkirt } from './muller/skirt'
import type { BlockDef } from './types'

/** All base blocks, in the order the app offers them. */
export const BLOCKS: BlockDef[] = [emkoSkirt, emkoDress, emkoTrousers, mullerSkirt] as unknown as BlockDef[]
