import type { GarmentKind, ModelSpec, NeckShape } from '@lecals/core'
import { CmInput } from './CmInput'

/**
 * Modelling steps for one garment type. Every control maps to one field of
 * the model's spec; leaving a field empty keeps the block as it is.
 */
export function ModelForm({ garment, spec, onChange }: { garment: GarmentKind; spec: ModelSpec; onChange: (s: ModelSpec) => void }) {
  const set = (patch: Partial<ModelSpec>) => onChange({ ...spec, ...patch })
  const flare = spec.flare ?? { darts: 0, side: 0, princess: 0, slashes: 0 }
  const setFlare = (p: Partial<NonNullable<ModelSpec['flare']>>) => set({ flare: { ...flare, ...p } })

  const length = (
    <label className="field">
      <span>Изменить длину (+ длиннее, − короче)</span>
      <CmInput label="Изменить длину" value={spec.length} onChange={(v) => set({ length: v && Number.isFinite(v) ? v : 0 })} />
    </label>
  )

  if (garment === 'trousers') return <>{length}</>

  if (garment === 'skirt')
    return (
      <>
        {length}
        <h4>Трапеция и клёш</h4>
        <Percent label="Вытачки по талии закрыть в низ" value={flare.darts} onChange={(darts) => setFlare({ darts })} />
        <label className="field">
          <span>Расширение по бокам (на каждом шве)</span>
          <CmInput label="Расширение по бокам" value={flare.side} onChange={(v) => setFlare({ side: v ?? 0 })} />
        </label>
        <label className="field">
          <span>Добавить клёш по низу (на деталь)</span>
          <CmInput label="Клёш по низу" value={flare.slashes} onChange={(v) => setFlare({ slashes: v ?? 0 })} />
        </label>
        <p className="hint">100 % вытачек в низ даёт трапецию без вытачек; добавка по низу разводит деталь от талии ещё шире (клёш).</p>
      </>
    )

  const pr = spec.princess ?? { front: false, back: false, from: 'armhole' as const }
  const neck = spec.neckline ?? { shape: 'round' as NeckShape, widen: 0, front: 0, back: 0 }
  const setNeck = (p: Partial<NonNullable<ModelSpec['neckline']>>) => set({ neckline: { ...neck, ...p } })
  const sl = spec.sleeve ?? { length: 0, puffCap: 0, puffHem: 0, capRaise: 0, cuff: 0 }
  const setSl = (p: Partial<NonNullable<ModelSpec['sleeve']>>) => set({ sleeve: { ...sl, ...p } })
  const prMode = pr.front || pr.back ? pr.from : 'none'

  return (
    <>
      <h4>Вытачки и рельефы</h4>
      <label className="field">
        <span>Рельефы</span>
        <select
          value={prMode}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'none') set({ princess: { ...pr, front: false, back: false } })
            else set({ princess: { front: pr.front || !pr.back, back: pr.back || !pr.front, from: v as 'armhole' | 'shoulder' } })
          }}
        >
          <option value="none">нет, вытачки</option>
          <option value="armhole">из проймы</option>
          <option value="shoulder">из плеча</option>
        </select>
      </label>
      {prMode !== 'none' && (
        <div className="checks">
          <label>
            <input type="checkbox" checked={pr.front} onChange={(e) => set({ princess: { ...pr, front: e.target.checked } })} /> на полочке
          </label>
          <label>
            <input type="checkbox" checked={pr.back} onChange={(e) => set({ princess: { ...pr, back: e.target.checked } })} /> на спинке
          </label>
        </div>
      )}
      {!pr.front && (
        <>
          <label className="field">
            <span>Нагрудная вытачка</span>
            <select
              value={spec.frontDart?.to ?? 'base'}
              onChange={(e) =>
                set({ frontDart: e.target.value === 'base' ? undefined : { to: e.target.value as 'shoulder', share: spec.frontDart?.share ?? 1 } })
              }
            >
              <option value="base">как в основе</option>
              <option value="shoulder">в середину плеча</option>
              <option value="armhole">в пройму</option>
              <option value="side">в бок</option>
              <option value="neck">в горловину</option>
            </select>
          </label>
          {spec.frontDart && (
            <Percent
              label="Сколько перевести"
              value={spec.frontDart.share}
              onChange={(share) => set({ frontDart: { ...spec.frontDart!, share: Math.max(0.1, share) } })}
            />
          )}
        </>
      )}
      {!pr.back && (
        <label className="field">
          <span>Вытачка спинки</span>
          <select
            value={spec.backDart?.to ?? 'base'}
            onChange={(e) => set({ backDart: e.target.value === 'base' ? undefined : { to: e.target.value as 'armhole', share: 1 } })}
          >
            <option value="base">в плече, как в основе</option>
            <option value="armhole">в пройму</option>
            <option value="neck">в горловину</option>
          </select>
        </label>
      )}

      <h4>Горловина</h4>
      <label className="field">
        <span>Форма</span>
        <select value={spec.neckline ? neck.shape : 'base'} onChange={(e) => (e.target.value === 'base' ? set({ neckline: undefined }) : setNeck({ shape: e.target.value as NeckShape }))}>
          <option value="base">как в основе</option>
          <option value="round">круглая</option>
          <option value="v">V-образная</option>
          <option value="square">каре</option>
        </select>
      </label>
      {spec.neckline && (
        <>
          <label className="field">
            <span>Расширить по плечу</span>
            <CmInput label="Расширить горловину" value={neck.widen} onChange={(v) => setNeck({ widen: v ?? 0 })} />
          </label>
          <label className="field">
            <span>Углубить спереди</span>
            <CmInput label="Углубить спереди" value={neck.front} onChange={(v) => setNeck({ front: v ?? 0 })} />
          </label>
          <label className="field">
            <span>Углубить сзади</span>
            <CmInput label="Углубить сзади" value={neck.back} onChange={(v) => setNeck({ back: v ?? 0 })} />
          </label>
        </>
      )}

      <h4>Длина и расширение книзу</h4>
      {length}
      <label className="field">
        <span>Расширение по бокам (на каждом шве)</span>
        <CmInput label="Расширение по бокам" value={flare.side} onChange={(v) => setFlare({ side: v ?? 0 })} />
      </label>
      {(pr.front || pr.back) && (
        <label className="field">
          <span>Расширение по рельефам</span>
          <CmInput label="Расширение по рельефам" value={flare.princess} onChange={(v) => setFlare({ princess: v ?? 0 })} />
        </label>
      )}

      <h4>Рукав</h4>
      <label className="field">
        <span>Длина от верха оката (пусто — как в основе)</span>
        <CmInput label="Длина рукава" value={sl.length || undefined} onChange={(v) => setSl({ length: v ?? 0 })} />
      </label>
      <label className="field">
        <span>Фонарик: добавить по окату</span>
        <CmInput
          label="Фонарик по окату"
          value={sl.puffCap}
          onChange={(v) => setSl({ puffCap: v ?? 0, capRaise: sl.capRaise || Math.round((v ?? 0) * 0.4) })}
        />
      </label>
      <label className="field">
        <span>Подъём оката</span>
        <CmInput label="Подъём оката" value={sl.capRaise} onChange={(v) => setSl({ capRaise: v ?? 0 })} />
      </label>
      <label className="field">
        <span>Фонарик: добавить по низу</span>
        <CmInput label="Фонарик по низу" value={sl.puffHem} onChange={(v) => setSl({ puffHem: v ?? 0 })} />
      </label>
      <label className="field">
        <span>Манжета, высота (пусто — без манжеты)</span>
        <CmInput label="Высота манжеты" value={sl.cuff || undefined} onChange={(v) => setSl({ cuff: v ?? 0 })} />
      </label>
    </>
  )
}

function Percent({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <span className="num">{Math.round(value * 100)} %</span>
    </label>
  )
}
