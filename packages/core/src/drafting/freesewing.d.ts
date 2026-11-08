// Minimal typings for the parts of @freesewing/core we use.
// The package ships plain JavaScript, so we describe only what the adapter touches.
declare module '@freesewing/core' {
  export interface FsPoint {
    x: number
    y: number
    shift(angle: number, distance: number): FsPoint
    shiftTowards(target: FsPoint, distance: number): FsPoint
    shiftFractionTowards(target: FsPoint, fraction: number): FsPoint
    dist(other: FsPoint): number
    angle(other: FsPoint): number
  }
  export interface FsPointConstructor {
    new (x: number, y: number): FsPoint
  }
  export interface FsPath {
    move(p: FsPoint): FsPath
    line(p: FsPoint): FsPath
    curve(cp1: FsPoint, cp2: FsPoint, to: FsPoint): FsPath
    close(): FsPath
    offset(distance: number): FsPath
    join(other: FsPath): FsPath
    length(): number
    asPathstring(): string
    bbox(): { topLeft: FsPoint; bottomRight: FsPoint }
    hide(): FsPath
    start(): FsPoint
    end(): FsPoint
  }
  export interface FsPathConstructor {
    new (): FsPath
  }
  export interface DraftContext<M extends string, O extends string> {
    Point: FsPointConstructor
    Path: FsPathConstructor
    points: Record<string, FsPoint>
    paths: Record<string, FsPath>
    measurements: Record<M, number>
    options: Record<O, number>
    store: { set(key: string, value: unknown): void; get(key: string): unknown }
    part: unknown
  }
  export interface PartDefinition<M extends string = string, O extends string = string> {
    name: string
    measurements?: M[]
    options?: Record<O, { mm?: number; pct?: number; min?: number; max?: number }>
    draft: (ctx: DraftContext<M, O>) => unknown
  }
  export interface FsPart {
    paths: Record<string, FsPath>
    points: Record<string, FsPoint>
  }
  export interface FsPattern {
    draft(): FsPattern
    render(): string
    parts: Array<Record<string, FsPart>>
    store: { logs: { error: string[]; warn: string[] }; get(key: string): unknown }
    setStores: Array<{ get(key: string): unknown; logs: { error: string[]; warn: string[] } }>
  }
  export interface DesignConstructor {
    new (settings: { measurements: Record<string, number>; options?: Record<string, number> }): FsPattern
  }
  export const Design: new (config: { parts: PartDefinition<string, string>[] }) => DesignConstructor
}
