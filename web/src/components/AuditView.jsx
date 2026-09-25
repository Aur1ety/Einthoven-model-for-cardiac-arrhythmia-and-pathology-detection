import { useState } from 'react'
import EcgPaper from './EcgPaper'
import { fmt, useEcg } from '../lib/data'
import { identityResiduals } from '../lib/ecg'
import { useRenderedWidth } from '../lib/useWidth'

// every figure and table number on this page, in one place (§2)
const FIG = { stats: 'Table 2.1', hist: 'Figure 2.1', identities: 'Table 2.2', residual: 'Figure 2.2', ecg: 'Figure 2.3' }

// SVG text on this page is sized in CSS px: each chart's viewBox is its measured width, so labels never scale below this
const LABEL_PX = 12

// rough width of a Source Sans 3 label (digits are 0.5 em; a little spare for dashes and commas)
const textPx = (s, size = LABEL_PX) => String(s).length * 0.55 * size
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

function KeyNumber({ value, label }) {
  return (
    <div className="keynum">
      <div className="keynum-value">{value}</div>
      <div className="keynum-label">{label}</div>
    </div>
  )
}

/** The legend key for the histogram, drawn exactly like its bars: open (graphite outline) or solid ink. */
function BarKey({ open }) {
  return (
    // bg-ground: forced-colours themes keep SVG colours but drop the page colour, so the key carries its own paper
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="mr-1.5 inline-block align-[-1px] bg-ground">
      <rect
        x="0.75"
        y="0.75"
        width="10.5"
        height="10.5"
        fill={open ? 'var(--plate)' : 'var(--ink)'}
        stroke={open ? 'var(--graphite)' : 'var(--ink)'}
        strokeWidth="1.5"
      />
    </svg>
  )
}

/**
 * Largest Einthoven deviation per recording, bar heights on a log scale. Within tolerance: open bars (graphite outline);
 * over it: solid ink. The difference is a shape, not a hue, so it survives greyscale, print and colour blindness.
 */
function Histogram({ bins, tolerance }) {
  const [el, setEl] = useState(null)
  const W = useRenderedWidth(el, 640)
  const maxCount = Math.max(...bins.map((b) => b.count))
  const pad = 2
  const slot = (W - 2 * pad) / bins.length
  const gap = clamp(slot * 0.18, 4, 14)
  const barW = slot - gap
  const plotH = 160
  const base = 22 + plotH // room above for the tallest bar's count
  // on a narrow screen the bin labels would collide: put every other one on a second row, with a leader to its bar
  const stagger = Math.max(...bins.map((b) => textPx(b.label))) + 6 > slot
  const row1 = base + 18
  const row2 = row1 + 15
  // the axis title breaks before its parenthesis when the chart is narrow
  const split = W < 520
  const title = (stagger ? row2 : row1) + 22
  const H = title + (split ? 15 : 0) + 6

  return (
    <figure className="fig measure-wide">
      <div className="fig-head">
        <span className="fig-no">{FIG.hist}</span>
        <span className="fig-title">Largest Einthoven deviation per recording</span>
        <span className="fig-meta">log scale · whole µV</span>
      </div>
      <div ref={setEl}>
        {/* bg-ground: a dark forced-colours theme keeps SVG colours but drops the page colour; the chart keeps its paper */}
        <svg role="img" aria-label="Histogram of the largest Einthoven deviation per recording" viewBox={`0 0 ${W} ${H}`} className="block w-full bg-ground">
          {bins.map((b, i) => {
            const h = b.count ? Math.max(2, (Math.log10(b.count + 1) / Math.log10(maxCount + 1)) * plotH) : 0
            const x = pad + i * slot + gap / 2
            const cx = x + barW / 2
            const count = fmt(b.count)
            const countX = clamp(cx, textPx(count) / 2 + 1, W - textPx(count) / 2 - 1)
            const low = stagger && i % 2 === 1
            const labelX = clamp(cx, textPx(b.label) / 2 + 1, W - textPx(b.label) / 2 - 1)
            return (
              <g key={b.label}>
                {h > 0 &&
                  (b.over_tolerance ? (
                    <rect x={x} y={base - h} width={barW} height={h} fill="var(--ink)" />
                  ) : (
                    // the outline is drawn inside the bar's footprint, so open and solid bars are the same size
                    <rect
                      x={x + 0.75}
                      y={base - h + 0.75}
                      width={Math.max(0, barW - 1.5)}
                      height={Math.max(0, h - 0.75)}
                      fill="var(--plate)"
                      stroke="var(--graphite)"
                      strokeWidth="1.5"
                    />
                  ))}
                <text x={countX} y={base - h - 6} textAnchor="middle" fontSize={LABEL_PX} fontWeight="600" fill="var(--ink)">
                  {count}
                </text>
                {low && <line x1={cx} x2={cx} y1={base + 2} y2={row2 - 12} stroke="var(--ink-3)" strokeWidth="1" />}
                <text x={labelX} y={low ? row2 : row1} textAnchor="middle" fontSize={LABEL_PX} fill="var(--ink-2)">
                  {b.label}
                </text>
              </g>
            )
          })}
          <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--ink)" strokeWidth="1" />
          <text x={W / 2} y={title} textAnchor="middle" fontSize={LABEL_PX} fill="var(--ink-2)">
            {split ? (
              <>
                <tspan x={W / 2}>largest |II − (I + III)| in the recording, whole µV</tspan>
                <tspan x={W / 2} dy="15">
                  (bar heights on a log scale)
                </tspan>
              </>
            ) : (
              'largest |II − (I + III)| in the recording, whole µV (bar heights on a log scale)'
            )}
          </text>
        </svg>
      </div>
      <figcaption className="fig-caption">
        {/* each key stays on the same line as its words */}
        <span className="whitespace-nowrap">
          <BarKey open />
          <span className="cap-lead">Open bars:</span>
        </span>{' '}
        within the ±{tolerance} µV tolerance.{' '}
        <span className="whitespace-nowrap">
          <BarKey />
          <span className="cap-lead">Solid bars:</span>
        </span>{' '}
        over it. Recordings flagged only by the aVR, aVL or aVF identities sit in the open bars here.
      </figcaption>
    </figure>
  )
}

// below this height (CSS px) the ±tolerance band is drawn at this height instead, and the caption says so
const MIN_BAND_PX = 8

/** The recording's worst identity, sample by sample over the 10 s window, with the ±tolerance band. */
function ResidualTrace({ f, tolerance }) {
  const { id } = f
  const { data } = useEcg(id)
  const [el, setEl] = useState(null)
  const px = useRenderedWidth(el, 1000)
  if (!data) return null
  const [key, label] = IDENTITIES.reduce((best, cur) => (f.audit[cur[0]] > f.audit[best[0]] ? cur : best))
  const r = identityResiduals(data.leads, data.signal)[key.replace('_max_uv', '')]
  const max = Math.max(tolerance * 4, ...r.map(Math.abs))
  const W = Math.max(1, px - 2) // inside the plot field's 1px frame
  const H = Math.round(clamp(W * 0.18, 120, 180))
  const y = (v) => H / 2 - (v / max) * (H / 2 - 8)
  const dx = W / (r.length - 1)
  const d = r.map((v, i) => `${i ? 'L' : 'M'}${(i * dx).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const peak = Math.max(...r.map(Math.abs))
  // at a large scale the ±tolerance band is thinner than a few pixels: draw it at least MIN_BAND_PX tall and say so
  const bandH = y(-tolerance) - y(tolerance)
  const thin = bandH < MIN_BAND_PX
  const band = Math.max(bandH, MIN_BAND_PX)
  const bandTop = Math.round(H / 2 - band / 2)
  const bandBottom = Math.round(H / 2 + band / 2)
  return (
    <figure className="fig">
      <div className="fig-head">
        <span className="fig-no">{FIG.residual}</span>
        <span className="fig-title">Worst identity, sample by sample</span>
        <span className="fig-meta">±{fmt(max)} µV · 10 s</span>
      </div>
      <div ref={setEl}>
        <svg
          role="img"
          aria-label={`${label} for record ${id}, over 10 seconds: largest deviation ${fmt(peak)} microvolts`}
          viewBox={`0 0 ${W} ${H}`}
          className="plot-field w-full"
        >
          <rect x={0} y={bandTop} width={W} height={bandBottom - bandTop} fill="var(--band)" />
          <g stroke="var(--ink-3)" strokeWidth="1">
            <line x1={0} x2={W} y1={bandTop + 0.5} y2={bandTop + 0.5} />
            <line x1={0} x2={W} y1={bandBottom - 0.5} y2={bandBottom - 0.5} />
          </g>
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--ink-3)" strokeWidth="0.75" />
          <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.1" strokeLinejoin="round" />
          <text
            x={6}
            y={16}
            fontSize={LABEL_PX}
            fill="var(--ink-2)"
            paintOrder="stroke"
            stroke="var(--plate)"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            ±{fmt(max)} µV
          </text>
        </svg>
      </div>
      <figcaption className="fig-caption">
        <span className="cap-lead">{label}</span> (this recording’s worst identity), sample by sample over 10 s. It should be 0; the
        shaded band is the ±{tolerance} µV tolerance{thin ? ' (drawn wider than scale so it stays visible)' : ''}. Largest
        deviation here: {fmt(peak, peak % 1 ? 1 : 0)} µV
        {f.breaks ? `, over ${f.breaks.samples} of 1,000 samples (${f.breaks.first_s.toFixed(2)}–${f.breaks.last_s.toFixed(2)} s)` : ''}.
      </figcaption>
    </figure>
  )
}

const IDENTITIES = [
  ['einthoven_max_uv', 'II − (I + III)'],
  ['avr_max_uv', 'aVR + (I + II)/2'],
  ['avl_max_uv', 'aVL − (I − III)/2'],
  ['avf_max_uv', 'aVF − (II + III)/2'],
]
const worst = (f) => Math.max(...IDENTITIES.map(([k]) => f.audit[k]))

/** An identity such as 'aVR + (I + II)/2' in a narrow column breaks only before its bracket, never inside it. */
function Identity({ children: s }) {
  const i = s.indexOf(' (')
  if (i < 0) return s
  return (
    <>
      <span className="whitespace-nowrap">{s.slice(0, i)}</span> <span className="whitespace-nowrap">{s.slice(i + 1)}</span>
    </>
  )
}

/** A recording can be flagged by any of the four identities, not only Einthoven's. */
function IdentityTable({ f, tolerance }) {
  if (!f) return null
  return (
    <div className="bt-wrap">
      <table className="bt w-auto min-w-[min(100%,28rem)]">
        <caption>
          <span className="fig-no">{FIG.identities}</span> Largest deviation of each identity in ECG {f.id} (µV)
        </caption>
        <tbody>
          {IDENTITIES.map(([k, label]) => (
            <tr key={k}>
              <th scope="row">
                <Identity>{label}</Identity>
              </th>
              <td className="n">{fmt(f.audit[k], f.audit[k] % 1 ? 1 : 0)}</td>
              <td>
                {/* the same shapes as the histogram: a solid ink square for over, an open one for within */}
                {f.audit[k] > tolerance ? <span className="tag">over {tolerance} µV</span> : <span className="tag tag-open text-ink-3">within</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STAT_COLS = [
  ['Identity (should be 0)', false],
  ['Mean', true],
  ['Median', true],
  ['99th pct', true],
  ['Max', true],
]

export default function AuditView({ site }) {
  const a = site.audit
  const [selected, setSelected] = useState(site.flagged[0]?.id)
  const within = a.records - a.flagged
  const noisy = a.signal_quality.annotated_noisy
  const clean = a.signal_quality.not_annotated
  const pct = (x, n) => `${((x / n) * 100).toFixed(2)}%`
  const edge = a.where_flags_break
  const current = site.flagged.find((f) => f.id === selected)

  return (
    <div>
      <header className="page-head">
        <p className="t-kicker" aria-hidden="true">
          §2
        </p>
        <h1 className="t-display">Data audit: Einthoven’s law</h1>
        <p className="t-standfirst">
          Leads I, II and III are measured between the same three limb electrodes, so on every sample lead II must equal lead I
          plus lead III (Einthoven’s law), and aVR, aVL and aVF are fixed combinations of them. PTB-XL stores all 12 leads, so
          every recording can be checked against these identities. This audit checked every sample of all{' '}
          {fmt(a.records)} recordings.
        </p>
      </header>

      <div className="space-y-12">
        <div className="keynums measure-wide">
          <KeyNumber value={fmt(a.records)} label={`recordings from ${fmt(a.patients)} patients`} />
          <KeyNumber value={pct(within, a.records)} label={`consistent within ±${a.tolerance_uv} µV (${fmt(within)} recordings)`} />
          <KeyNumber
            value={fmt(a.flagged)}
            label={`flagged (${pct(a.flagged, a.records)}): at least one identity off by more than ${a.tolerance_uv} µV`}
          />
        </div>

        <section aria-labelledby="a-stats" className="space-y-6">
          <div>
            <div className="fig-head mb-1">
              <span id="a-stats-no" className="fig-no">
                {FIG.stats}
              </span>
            </div>
            <h2 id="a-stats" className="t-title">
              How far the identities are off, per recording (µV)
            </h2>
            {/* the note lines up with the table it annotates, as in the explorer's Table 1.1 */}
            <div className="annotated measure-wide mt-3">
              <div className="bt-wrap">
                <table className="bt" aria-labelledby="a-stats-no a-stats">
                  <thead>
                    <tr>
                      {STAT_COLS.map(([h, n]) => (
                        <th key={h} scope="col" className={n ? 'n' : undefined}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.residual_stats.map((s) => (
                      <tr key={s.identity}>
                        <th scope="row">
                          <Identity>{s.identity}</Identity>
                        </th>
                        <td className="n">{s.mean}</td>
                        <td className="n">{s.median}</td>
                        <td className="n">{s.p99}</td>
                        <td className="n">{fmt(s.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">
                The median of 1 µV is one storage unit (the data are stored in whole microvolts), so almost every recording obeys the
                law to within rounding.
              </p>
            </div>
          </div>

          <Histogram bins={a.histogram} tolerance={a.tolerance_uv} />
        </section>

        <section aria-labelledby="a-noise" className="measure space-y-2">
          <h2 id="a-noise" className="t-title">
            PTB-XL’s own noise notes do not predict the flag
          </h2>
          <p className="t-body">
            Recordings PTB-XL annotates as noisy are flagged {pct(noisy.flagged, noisy.records)} of the time ({noisy.flagged} of{' '}
            {fmt(noisy.records)}); recordings without a noise note, {pct(clean.flagged, clean.records)} ({clean.flagged} of{' '}
            {fmt(clean.records)}). The two checks appear to catch different problems, so this audit adds a separate quality signal
            (with only {noisy.flagged + clean.flagged} flagged recordings in all, this is a comparison of small counts).
          </p>
        </section>

        <section aria-labelledby="a-flagged" className="space-y-6">
          <div className="measure space-y-2">
            <h2 id="a-flagged" className="t-title">
              The {a.flagged} flagged recordings
            </h2>
            <p className="t-body text-ink-2">
              Pick one to see where the law breaks. The audit did not test why it breaks. In {edge.last_0_1_s} of the {a.flagged}{' '}
              recordings the break is confined to the last 0.1 s of the 10 s window ({edge.last_1_s} within the last second), which
              points to something at the edge of the stored window rather than during the recording; {edge.half_second_or_more}{' '}
              break for half a second or more.
            </p>
          </div>
          <div className="rail-layout">
            <ul aria-label="Flagged recordings" className="register max-h-[60vh]">
              {site.flagged.map((f) => (
                <li key={f.id}>
                  <button type="button" className="row-btn" aria-current={f.id === selected} onClick={() => setSelected(f.id)}>
                    <span className="row-id">ECG {f.id}</span>
                    <span className="row-meta">
                      largest deviation {fmt(worst(f))} µV, at {f.breaks.first_s.toFixed(2)}–{f.breaks.last_s.toFixed(2)} s
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected != null && (
              <div className="min-w-0 space-y-6">
                <IdentityTable f={current} tolerance={a.tolerance_uv} />
                <ResidualTrace f={current} tolerance={a.tolerance_uv} />
                <EcgPaper id={selected} label={FIG.ecg} caption={`Record ${selected}.`} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
