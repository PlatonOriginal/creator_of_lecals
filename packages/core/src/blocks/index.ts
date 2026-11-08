export * from './types'
export * from './emko/skirt'
export * from './emko/bodice'
import { emkoSkirt } from './emko/skirt'
import { emkoBodice } from './emko/bodice'
import type { BlockDef } from './types'

/** All base blocks, in the order the app offers them. */
export const BLOCKS: BlockDef[] = [emkoSkirt, emkoBodice] as unknown as BlockDef[]
