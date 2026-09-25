import { useState } from 'react'
import EcgPaper from './EcgPaper'
import { fmt, useEcg } from '../lib/data'
import { identityResiduals } from '../lib/ecg'

function Stat({ value, label }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-2xl font-bold num">{value}</div>
      <div className="t-micro mt-1">{label}</div>
    </div>
  )
}

/** The recording's worst identity, sample by sample over the 10 s window, with the ±tolerance band. */
function ResidualTrace({ f, tolerance }) {
  const { id } = f
  const { data } = useEcg(id)
  if (!data) return null
  const [key, label] = IDENTITIES.reduce((best, cur) => (f.audit[cur[0]] > f.audit[best[0]] ? cur : best))
  const r = identityResiduals(data.leads, data.signal)[key.replace('_max_uv', '')]
  const max = Math.max(tolerance * 4, ...r.map(Math.abs))
  const W = 1000
  const H = 160
  const y = (v) => H / 2 - (v / max) * (H / 2 - 8)
  const d = r.map((v, i) => `${i ? 'L' : 'M'}${i} ${y(v).toFixed(1)}`).join('')
  const peak = Math.max(...r.map(Math.abs))
  // at a large scale the ±tolerance band is thinner than a pixel: draw it at least 3 units tall and say so
  const bandH = y(-tolerance) - y(tolerance)
  const thin = bandH < 3
  const band = Math.max(bandH, 3)
  return (
    <figure className="space-y-1.5">
      <svg role="img" aria-label={`${label} for record ${id}, over 10 seconds: largest deviation ${fmt(peak)} microvolts`} viewBox={`0 0 ${W} ${H}`} className="block w-full rounded border bg-white">
        <rect x={0} y={H / 2 - band / 2} width={W} height={band} fill="#c9d6ea" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--border-strong)" strokeDasharray="4 4" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.3" />
        <text x={6} y={14} fontSize="12" fill="var(--muted-foreground)">
          ±{fmt(max)} µV
        </text>
      </svg>
      <figcaption className="t-micro">
        {label} (this recording’s worst identity), sample by sample over 10 s. It should be 0; the blue band is the ±{tolerance} µV
        tolerance{thin ? ' (drawn wider than scale so it stays visible)' : ''}. Largest deviation here: {fmt(peak, peak % 1 ? 1 : 0)} µV
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

/** A recording can be flagged by any of the four identities, not only Einthoven's. */
function IdentityTable({ f, tolerance }) {
  if (!f) return null
  return (
    <table className="text-left text-[15px] border-collapse num">
      <caption className="text-left t-label pb-1">Largest deviation of each identity in ECG {f.id} (µV)</caption>
      <tbody>
        {IDENTITIES.map(([k, label]) => (
          <tr key={k} className="border-b">
            <th scope="row" className="py-1.5 pr-6 font-normal">{label}</th>
            <td className="py-1.5 pr-3">{fmt(f.audit[k], f.audit[k] % 1 ? 1 : 0)}</td>
            <td className="py-1.5">{f.audit[k] > tolerance ? <span className="chip" style={{ color: 'var(--accent)' }}>over {tolerance} µV</span> : <span className="text-faint">within</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AuditView({ site }) {
  const a = site.audit
  const [selected, setSelected] = useState(site.flagged[0]?.id)
  const within = a.records - a.flagged
  const maxCount = Math.max(...a.histogram.map((b) => b.count))
  const noisy = a.signal_quality.annotated_noisy
  const clean = a.signal_quality.not_annotated
  const pct = (x, n) => `${((x / n) * 100).toFixed(2)}%`
  const edge = a.where_flags_break

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2 max-w-3xl">
        <h1 className="t-display">Data audit: Einthoven’s law</h1>
        <p className="t-body text-muted-foreground">
          Leads I, II and III are measured between the same three limb electrodes, so on every sample lead II must equal lead I
          plus lead III (Einthoven’s law), and aVR, aVL and aVF are fixed combinations of them. PTB-XL stores all 12 leads, so
          every recording can be checked against these identities. This audit checked every sample of all{' '}
          {fmt(a.records)} recordings.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat value={fmt(a.records)} label={`recordings from ${fmt(a.patients)} patients`} />
        <Stat value={pct(within, a.records)} label={`consistent within ±${a.tolerance_uv} µV (${fmt(within)} recordings)`} />
        <Stat value={fmt(a.flagged)} label={`flagged (${pct(a.flagged, a.records)}): at least one identity off by more than ${a.tolerance_uv} µV`} />
      </div>

      <section aria-labelledby="a-stats" className="space-y-3">
        <h2 id="a-stats" className="t-title">
          How far the identities are off, per recording (µV)
        </h2>
        <table className="w-full max-w-2xl text-left text-[15px] border-collapse num">
          <thead>
            <tr className="border-b">
              {['Identity (should be 0)', 'Mean', 'Median', '99th pct', 'Max'].map((h) => (
                <th key={h} scope="col" className="py-2 pr-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.residual_stats.map((s) => (
              <tr key={s.identity} className="border-b">
                <th scope="row" className="py-2 pr-4 font-normal">{s.identity}</th>
                <td className="py-2 pr-4">{s.mean}</td>
                <td className="py-2 pr-4">{s.median}</td>
                <td className="py-2 pr-4">{s.p99}</td>
                <td className="py-2 pr-4">{fmt(s.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-micro">
          The median of 1 µV is one storage unit (the data are stored in whole microvolts), so almost every recording obeys the
          law to within rounding.
        </p>

        <figure className="space-y-2 max-w-2xl">
          <svg role="img" aria-label="Histogram of the largest Einthoven deviation per recording" viewBox="0 0 640 220" className="block w-full">
            {a.histogram.map((b, i) => {
              const h = b.count ? Math.max(2, (Math.log10(b.count + 1) / Math.log10(maxCount + 1)) * 160) : 0
              const x = 10 + i * 78
              return (
                <g key={b.label}>
                  <rect x={x} y={180 - h} width={64} height={h} fill={b.over_tolerance ? 'var(--accent)' : 'var(--cls-CD)'} />
                  <text x={x + 32} y={174 - h} textAnchor="middle" fontSize="12" className="num">
                    {fmt(b.count)}
                  </text>
                  <text x={x + 32} y={198} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
                    {b.label}
                  </text>
                </g>
              )
            })}
            <text x={320} y={216} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              largest |II − (I + III)| in the recording, whole µV (bar heights on a log scale)
            </text>
          </svg>
          <figcaption className="t-micro">
            Blue: within the ±{a.tolerance_uv} µV tolerance. Red: over it. Recordings flagged only by the aVR, aVL or aVF identities
            sit in the blue bars here.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="a-noise" className="space-y-2 max-w-3xl">
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

      <section aria-labelledby="a-flagged" className="space-y-3">
        <h2 id="a-flagged" className="t-title">
          The {a.flagged} flagged recordings
        </h2>
        <p className="t-body text-muted-foreground max-w-3xl">
          Pick one to see where the law breaks. The audit did not test why it breaks. In {edge.last_0_1_s} of the {a.flagged}{' '}
          recordings the break is confined to the last 0.1 s of the 10 s window ({edge.last_1_s} within the last second), which
          points to something at the edge of the stored window rather than during the recording; {edge.half_second_or_more} break
          for half a second or more.
        </p>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <ul aria-label="Flagged recordings" className="card max-h-[60vh] overflow-y-auto relative">
            {site.flagged.map((f) => (
              <li key={f.id}>
                <button type="button" className="row-btn" aria-current={f.id === selected} onClick={() => setSelected(f.id)}>
                  <span className="block font-semibold">ECG {f.id}</span>
                  <span className="block text-[14px] text-muted-foreground num">
                    largest deviation {fmt(worst(f))} µV, at {f.breaks.first_s.toFixed(2)}–{f.breaks.last_s.toFixed(2)} s
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected != null && (
            <div className="space-y-4 min-w-0">
              <IdentityTable f={site.flagged.find((f) => f.id === selected)} tolerance={a.tolerance_uv} />
              <ResidualTrace f={site.flagged.find((f) => f.id === selected)} tolerance={a.tolerance_uv} />
              <EcgPaper id={selected} caption={`Record ${selected}.`} />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
