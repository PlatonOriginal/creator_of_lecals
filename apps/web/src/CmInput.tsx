import { useEffect, useState } from 'react'

/** A centimetre input that stores millimetres and accepts «88,5» as well as «88.5». */
export function CmInput({
  value,
  onChange,
  big,
  autoFocus,
  label,
}: {
  value: number | undefined
  onChange: (mm: number | undefined) => void
  big?: boolean
  autoFocus?: boolean
  label: string
}) {
  const shown = value === undefined ? '' : String(Math.round(value) / 10).replace('.', ',')
  const [text, setText] = useState(shown)
  // Follow outside changes (prefill, ± buttons) unless they equal what is typed.
  useEffect(() => {
    if (parse(text) !== value) setText(shown)
  }, [value])

  function step(d: number) {
    onChange(Math.max(0, Math.round(((value ?? 0) + d) / 5) * 5))
  }

  return (
    <span className={big ? 'cm-input big' : 'cm-input'}>
      {big && (
        <button type="button" className="step" aria-label="Минус 0,5 см" onClick={() => step(-5)}>
          −
        </button>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parse(e.target.value))
        }}
        onFocus={(e) => e.target.select()}
      />
      <span className="unit">см</span>
      {big && (
        <button type="button" className="step" aria-label="Плюс 0,5 см" onClick={() => step(5)}>
          +
        </button>
      )}
    </span>
  )
}

function parse(s: string): number | undefined {
  const t = s.trim().replace(',', '.')
  if (t === '') return undefined
  const v = Number(t)
  return Number.isFinite(v) ? Math.round(v * 10) : Number.NaN
}
