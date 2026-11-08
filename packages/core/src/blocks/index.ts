export * from './types'
export * from './emko/skirt'
import { emkoSkirt } from './emko/skirt'
import type { BlockDef } from './types'

/** All base blocks, in the order the app offers them. */
export const BLOCKS: BlockDef[] = [emkoSkirt as unknown as BlockDef]
