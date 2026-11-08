export * from './types'
export * from './emko/skirt'
export * from './emko/dress'
import { emkoSkirt } from './emko/skirt'
import { emkoDress } from './emko/dress'
import type { BlockDef } from './types'

/** All base blocks, in the order the app offers them. */
export const BLOCKS: BlockDef[] = [emkoSkirt, emkoDress] as unknown as BlockDef[]
