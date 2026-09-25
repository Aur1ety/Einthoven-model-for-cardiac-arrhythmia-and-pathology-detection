// A 12-lead ECG drawn as it is printed clinically: 25 mm/s, 10 mm/mV, pink
// grid, 1 mV calibration pulse on every row, 3 x 4 leads plus a lead II strip.
import { useEffect, useId, useMemo, useRef } from 'react'
import { FS, U_PER_MM, X_PER_SAMPLE, calibrationPath, paperLayout, tracePath } from '../lib/ecg'
import { useEcg } from '../lib/data'

export default function EcgPaper({ id, caption, cursor = null }) {
  const { data, error } = useEcg(id)
  const gridId = useId().replace(/:/g, '')
  const layout = useMemo(() => (data ? paperLayout(data.leads, data.signal) : null), [data])
  // built once per ECG: the 3D view's cursor redraws this component many times a second
  const traces = useMemo(() => layout?.segments.map((s) => ({ key: `${s.lead}-${s.rhythm ? 'r' : s.from}`, d: tracePath(s.values, s.x0, s.y0) })), [layout])
  const cursorX = layout && cursor != null ? layout.calWidth + cursor * FS * X_PER_SAMPLE : null

  // on a narrow screen the paper scrolls sideways; keep the cursor in sight
  const scroller = useRef(null)
  useEffect(() => {
    const el = scroller.current
    if (cursorX == null || !el || el.scrollWidth <= el.clientWidth) return
    const x = (cursorX / layout.width) * el.scrollWidth
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = x - el.clientWidth / 2
  }, [cursorX, layout])

  if (error) return <p className="t-body">This ECG could not load. Reloading the page usually fixes it.</p>
  if (!layout) return <div className="aspect-[1040/480] w-full rounded bg-[var(--paper)] animate-pulse" aria-label="Loading the ECG" />

  const small = U_PER_MM
  const big = 5 * U_PER_MM
  return (
    <figure className="space-y-1.5">
      <div ref={scroller} className="overflow-x-auto">
        <svg
          role="img"
          aria-label={`12-lead ECG, record ${id}: 10 seconds at 100 samples per second, drawn at 25 mm/s and 10 mm/mV.`}
          viewBox={`0 ${-layout.top} ${layout.width} ${layout.height + layout.top + layout.bottom}`}
          className="block w-full min-w-[640px] rounded border"
          style={{ background: 'var(--paper)' }}
        >
          <defs>
            <pattern id={`${gridId}-s`} width={small} height={small} patternUnits="userSpaceOnUse">
              <path d={`M${small} 0V${small}H0`} fill="none" stroke="var(--grid-minor)" strokeWidth="0.5" />
            </pattern>
            <pattern id={`${gridId}-b`} width={big} height={big} patternUnits="userSpaceOnUse">
              <rect width={big} height={big} fill={`url(#${gridId}-s)`} />
              <path d={`M${big} 0V${big}H0`} fill="none" stroke="var(--grid-major)" strokeWidth="0.9" />
            </pattern>
          </defs>
          <rect y={-layout.top} width={layout.width} height={layout.height + layout.top + layout.bottom} fill={`url(#${gridId}-b)`} />
          <g fill="none" stroke="var(--trace)" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
            {layout.rowBaselines.map((y) => (
              <path key={y} d={calibrationPath(y)} />
            ))}
            {traces.map((s) => (
              <path key={s.key} d={s.d} />
            ))}
          </g>
          {cursorX != null && (
            // every column shows the time window matching its position, so one vertical line marks the same instant in all rows
            <line
              x1={cursorX}
              x2={cursorX}
              y1={-layout.top}
              y2={layout.height + layout.bottom}
              stroke="var(--accent)"
              strokeWidth="1.6"
            />
          )}
          <g fontSize="11" fontWeight="700" fill="var(--trace)">
            {layout.segments.map((s) => (
              <text key={`t-${s.lead}-${s.rhythm ? 'r' : s.from}`} x={s.x0 + 4} y={s.y0 - 38}>
                {s.lead}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <figcaption className="t-micro">
        {caption ? `${caption} ` : ''}25 mm/s, 10 mm/mV; small squares 1 mm (0.04 s, 0.1 mV), large squares 5 mm. Bottom row: lead II
        for the full 10 seconds.
      </figcaption>
    </figure>
  )
}
