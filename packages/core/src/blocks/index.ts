export * from './types'
export * from './emko/skirt'
export * from './emko/dress'
export * from './emko/trousers'
import { emkoSkirt } from './emko/skirt'
import { emkoDress } from './emko/dress'
import { emkoTrousers } from './emko/trousers'
import type { BlockDef } from './types'

/** All base blocks, in the order the app offers them. */
export const BLOCKS: BlockDef[] = [emkoSkirt, emkoDress, emkoTrousers] as unknown as BlockDef[]
