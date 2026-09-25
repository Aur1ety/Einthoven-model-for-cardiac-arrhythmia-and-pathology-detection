// A 12-lead ECG drawn as it is printed clinically: 25 mm/s, 10 mm/mV, pink
// grid, 1 mV calibration pulse on every row, 3 x 4 leads plus a lead II strip.
import { useEffect, useId, useMemo, useState } from 'react'
import { FS, U_PER_MM, X_PER_SAMPLE, calibrationPath, paperLayout, tracePath } from '../lib/ecg'
import { useEcg } from '../lib/data'
import { useRenderedWidth } from '../lib/useWidth'

const MIN_SHEET_PX = 640 // the sheet never renders narrower than this (min-w-[640px]); wider screens scroll less
const LABEL_PX = 12 // lead labels render at this CSS size whatever the sheet's width (never under 11 px)
const HALO_PX = 2.5 // paper-coloured halo around the lead labels, so a crossing trace cannot hide them

// `label` is the figure number the page gives this sheet ('Figure 1.1' in the explorer, 'Figure 2.3' in the audit)
export default function EcgPaper({ id, caption, label, cursor = null }) {
  const { data, error } = useEcg(id)
  const gridId = useId().replace(/:/g, '')
  const layout = useMemo(() => (data ? paperLayout(data.leads, data.signal) : null), [data])
  // built once per ECG: the 3D view's cursor redraws this component many times a second
  const traces = useMemo(() => layout?.segments.map((s) => ({ key: `${s.lead}-${s.rhythm ? 'r' : s.from}`, d: tracePath(s.values, s.x0, s.y0) })), [layout])
  const cursorX = layout && cursor != null ? layout.calWidth + cursor * FS * X_PER_SAMPLE : null

  // on a narrow screen the paper scrolls sideways; keep the cursor in sight
  const [scroller, setScroller] = useState(null)
  useEffect(() => {
    const el = scroller
    if (cursorX == null || !el || el.scrollWidth <= el.clientWidth) return
    const x = (cursorX / layout.width) * el.scrollWidth
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = x - el.clientWidth / 2
  }, [cursorX, layout, scroller])

  // the viewBox scales text with the sheet, so size the lead labels from the sheet's rendered width
  const [sheet, setSheet] = useState(null)
  const sheetPx = useRenderedWidth(sheet, MIN_SHEET_PX)
  // while the sheet is wider than its scroller, the scroller is a named, focusable region, so a keyboard can scroll it
  const scrollerPx = useRenderedWidth(scroller, MIN_SHEET_PX)
  const scrolls = sheetPx > scrollerPx + 0.5

  if (error) return <p className="t-body">This ECG could not load. Reloading the page usually fixes it.</p>

  const head = (
    <div className="fig-head">
      {label && <span className="fig-no">{label}</span>}
      <span className="fig-title">12-lead ECG</span>
      <span className="fig-meta">25 mm/s · 10 mm/mV · 10 s</span>
    </div>
  )
  const figcaption = (
    <figcaption className="fig-caption">
      {caption && <span className="cap-lead">{caption}</span>}
      {caption ? ' ' : ''}25 mm/s, 10 mm/mV; small squares 1 mm (0.04 s, 0.1 mV), large squares 5 mm. Bottom row: lead II
      for the full 10 seconds.
    </figcaption>
  )

  if (!layout)
    return (
      <figure className="fig">
        {head}
        <div className="placeholder placeholder-ecg">
          <span>Loading the ECG…</span>
        </div>
        {figcaption}
      </figure>
    )

  const small = U_PER_MM
  const big = 5 * U_PER_MM
  const unitsPerPx = layout.width / Math.max(sheetPx, 1)
  const labelSize = LABEL_PX * unitsPerPx
  return (
    <figure className="fig">
      {head}
      <div
        ref={setScroller}
        className="fig-scroll"
        {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': `12-lead ECG, record ${id}, scrolls sideways` } : {})}
      >
        <svg
          ref={setSheet}
          role="img"
          aria-label={`12-lead ECG, record ${id}: 10 seconds at 100 samples per second, drawn at 25 mm/s and 10 mm/mV.`}
          viewBox={`0 ${-layout.top} ${layout.width} ${layout.height + layout.top + layout.bottom}`}
          className="ecg-sheet w-full min-w-[640px]"
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
          {/* the paper is drawn, not only a CSS background: forced-colours themes replace backgrounds, and a dark one would hide the trace */}
          <rect y={-layout.top} width={layout.width} height={layout.height + layout.top + layout.bottom} fill="var(--paper)" />
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
              stroke="var(--madder)"
              strokeWidth="1.75"
            />
          )}
          <g
            fontSize={labelSize.toFixed(1)}
            fontWeight="700"
            fill="var(--ink)"
            stroke="var(--paper)"
            strokeWidth={(HALO_PX * unitsPerPx).toFixed(1)}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {layout.segments.map((s) => (
              <text key={`t-${s.lead}-${s.rhythm ? 'r' : s.from}`} x={s.x0 + 4} y={s.y0 - 38}>
                {s.lead}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {figcaption}
    </figure>
  )
}
