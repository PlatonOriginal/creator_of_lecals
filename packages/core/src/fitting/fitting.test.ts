import { describe, expect, it } from 'vitest'
import {
  fittingReport,
  mapMatch,
  mergeFittings,
  parseFittingFile,
  repeatedFixes,
  signedAmount,
  toFittingFile,
  zonesOf,
  type FittingEntry,
} from '.'

function entry(id: string, over: Partial<FittingEntry> = {}): FittingEntry {
  return {
    id,
    title: `Макет ${id}`,
    created: 1_700_000_000_000,
    updated: 1_700_000_000_000,
    stage: 'mockup',
    measurements: { height: 1640, bust: 880, waist: 700, hips: 960 },
    confirmed: ['height', 'bust'],
    model: { name: 'Платье', block: 'emko-dress', silhouette: 'semi', options: {}, layers: [{}] },
    fitMap: [],
    fixes: [],
    ...over,
  }
}

describe('fitting log', () => {
  it('every garment has zones and an «other» zone', () => {
    for (const g of ['dress', 'skirt', 'trousers'] as const) {
      const z = zonesOf(g)
      expect(z.at(-1)!.id).toBe('other')
      expect(new Set(z.map((x) => x.id)).size).toBe(z.length)
    }
  })

  it('finds a fix repeated on different figures', () => {
    const take = (amount: number) => ({ id: 'f', zone: 'bust', action: 'take' as const, amount })
    const log = [
      entry('1', { figureName: 'Анна', fixes: [take(20), { id: 'g', zone: 'hem', action: 'other' }] }),
      entry('2', { figureName: 'Ольга', fixes: [take(30)] }),
      entry('3', { figureName: 'анна ', fixes: [take(10)] }),
      entry('4', { figureName: 'Ольга', model: { ...entry('x').model, block: 'muller-dress' }, fixes: [take(40)] }),
    ]
    const r = repeatedFixes(log)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ block: 'emko-dress', zone: 'bust', action: 'take', entries: 3, figures: 2, mean: 20 })
  })

  it('gives the direction of a fix', () => {
    expect(signedAmount({ id: 'a', zone: 'waist', action: 'take', amount: 15 })).toBe(-15)
    expect(signedAmount({ id: 'a', zone: 'waist', action: 'add', amount: 15 })).toBe(15)
    expect(signedAmount({ id: 'a', zone: 'waist', action: 'move', amount: 15 })).toBeUndefined()
  })

  it('compares the ease map with the felt fit', () => {
    const c = { id: 'bust' as const, title: 'Грудь', ease: 40, shown: 'fitted' as const }
    expect(mapMatch(c)).toBeUndefined()
    expect(mapMatch({ ...c, felt: 'fitted' })).toBe('match')
    expect(mapMatch({ ...c, felt: 'loose' })).toBe('near')
    expect(mapMatch({ ...c, felt: 'tight' })).toBe('off')
  })

  it('round-trips through a file and merges by id, newer wins', () => {
    const a = entry('1')
    const text = JSON.stringify(toFittingFile([a, entry('2')]))
    const read = parseFittingFile(text)
    expect(read).toHaveLength(2)
    const newer = { ...a, title: 'новое', updated: a.updated + 1 }
    const m = mergeFittings([a], [newer, entry('2'), { ...entry('3'), updated: 0 }])
    expect(m.added).toBe(2)
    expect(m.updated).toBe(1)
    expect(m.entries.find((e) => e.id === '1')!.title).toBe('новое')
    // An older copy does not overwrite.
    expect(mergeFittings([newer], [a]).updated).toBe(0)
  })

  it('rejects files that are not a log', () => {
    expect(() => parseFittingFile('не json')).toThrow(/JSON/)
    expect(() => parseFittingFile('{"format":"other"}')).toThrow(/журнала/)
    expect(() => parseFittingFile('{"format":"lecals-fittings","version":2,"entries":[]}')).toThrow(/версии 2/)
    expect(parseFittingFile('{"format":"lecals-fittings","version":1,"entries":[{"id":1}]}')).toEqual([])
  })

  it('writes a readable report', () => {
    const md = fittingReport(
      [
        entry('1', {
          figureName: 'Анна',
          verdict: 'minor',
          fixes: [{ id: 'f', zone: 'bust', action: 'take', amount: 25, note: 'по боковому шву' }],
          fitMap: [{ id: 'bust', title: 'Грудь', ease: 150, shown: 'veryLoose', felt: 'loose' }],
          interfaceNotes: 'Не нашла, где менять длину',
        }),
      ],
      Date.UTC(2026, 10, 11),
    )
    expect(md).toContain('# Журнал примерок')
    expect(md).toContain('Грудь — убрать (ушить) 2,5 см: по боковому шву')
    expect(md).toContain('| Грудь | +15 | очень свободно | свободно | почти |')
    expect(md).toContain('Не нашла, где менять длину')
    expect(md).toContain('Мелкие правки')
    expect(md).toContain('Р 164, Ог3 88, Об 96*, От 70*')
  })
})
