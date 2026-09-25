import { useState } from 'react'
import { CLASS_NAMES, fmt } from '../lib/data'
import { useRenderedWidth } from '../lib/useWidth'

// Table and figure numbers for this view, kept in one place so they stay in order if sections move.
const FIG = { auc: 'Table 3.1', delta: 'Figure 3.1', roc: 'Figure 3.2' }
const KEYS = 'abcdefghij'

const f3 = (x) => x.toFixed(3)
const f4 = (x) => x.toFixed(4)
const ci = ([lo, hi], f = f4) => `[${f(lo)}, ${f(hi)}]`
const sign = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(5)}`

// SVG label size in CSS px. The charts below use their rendered width as the viewBox width, so one unit is one
// CSS pixel and every label renders at this size (at least 11 px) on a 320 px phone and a 1440 px screen alike.
const LABEL = 12

/** One ROC tile: plate field, open L axes in ink-3 with ticks at 0 and 1, dotted chance diagonal, curve in the class ink. */
function Roc({ cls, letter, points, auc }) {
  const [el, setEl] = useState(null)
  const w = useRenderedWidth(el, 194)
  // margins in px: room for the rotated y title and the tick labels on the left, both x rows below
  const L = 30
  const R = 6
  const T = 6
  const B = 34
  const S = Math.max(40, w - L - R)
  const H = T + S + B
  const X = (x) => L + x * S
  const Y = (y) => T + S - y * S
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('')
  const yTitle = 13
  return (
    <figure className="space-y-1.5">
      {/* bg-ground: a dark forced-colours theme keeps SVG colours but drops the page colour; the tile keeps its paper */}
      <svg ref={setEl} role="img" aria-label={`ROC curve for ${CLASS_NAMES[cls]}, AUC ${f3(auc)}`} viewBox={`0 0 ${w} ${H}`} className="block w-full bg-ground">
        <rect x={L} y={T} width={S} height={S} fill="var(--plate)" />
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke="var(--rule-strong)" strokeWidth="1" strokeDasharray="2 3" />
        <path d={`M${L} ${T}V${T + S}H${L + S}`} fill="none" stroke="var(--ink-3)" strokeWidth="1" />
        {[0, 1].map((v) => (
          <g key={v} stroke="var(--ink-3)" strokeWidth="1">
            <line x1={X(v)} x2={X(v)} y1={T + S} y2={T + S + 3} />
            <line x1={L - 3} x2={L} y1={Y(v)} y2={Y(v)} />
          </g>
        ))}
        <path d={d} fill="none" stroke={`var(--cls-${cls})`} strokeWidth="2" strokeLinejoin="round" />
        <g fontSize={LABEL} fill="var(--ink-2)">
          <text x={X(0)} y={T + S + 15} textAnchor="middle">0</text>
          <text x={X(1)} y={T + S + 15} textAnchor="middle">1</text>
          <text x={L - 5} y={Y(0) + 4} textAnchor="end">0</text>
          <text x={L - 5} y={Y(1) + 4} textAnchor="end">1</text>
          <text x={L + S / 2} y={T + S + 30} textAnchor="middle">
            false positive rate
          </text>
          <text x={yTitle} y={T + S / 2} textAnchor="middle" transform={`rotate(-90 ${yTitle} ${T + S / 2})`}>
            true positive rate
          </text>
        </g>
      </svg>
      <figcaption className="t-micro">
        <span className="key-letter">{letter}</span> <span className={`font-bold cls-${cls}`}>{cls}</span> {CLASS_NAMES[cls]}:{' '}
        <span className="whitespace-nowrap">
          AUC <span className="num">{f3(auc)}</span>
        </span>
      </figcaption>
    </figure>
  )
}

const SPAN = 0.004

/** Paired bootstrap difference with its 95% interval, drawn against zero: a forest plot in ink only. */
function DeltaChart({ d }) {
  const [el, setEl] = useState(null)
  const w = useRenderedWidth(el, 520)
  const P = 24 // side padding, so the end labels centre on their ticks
  const T = 4
  const cy = 20 // the interval
  const axisY = 36
  const base = axisY + 17 // tick-label baseline
  const H = base + 4
  const x = (v) => P + ((v + SPAN) / (2 * SPAN)) * (w - 2 * P)
  return (
    <svg
      ref={setEl}
      role="img"
      aria-label={`Paired AUC difference ${d.mean.toFixed(5)}, 95% interval ${ci(d.ci95, (v) => v.toFixed(5))}: the interval includes zero`}
      viewBox={`0 0 ${w} ${H}`}
      // bg-ground: a dark forced-colours theme keeps SVG colours but drops the page colour; the chart keeps its paper
      className="block w-full bg-ground">
      <g stroke="var(--ink-3)" strokeWidth="1">
        <line x1={x(-SPAN)} x2={x(SPAN)} y1={axisY} y2={axisY} />
        {[-SPAN, -SPAN / 2, SPAN / 2, SPAN].map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={axisY} y2={axisY + (Math.abs(v) === SPAN ? 4 : 3)} />
        ))}
        <line x1={x(0)} x2={x(0)} y1={T} y2={axisY + 4} />
      </g>
      <g stroke="var(--ink)" strokeWidth="2">
        <line x1={x(d.ci95[0])} x2={x(d.ci95[1])} y1={cy} y2={cy} />
        {d.ci95.map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={cy - 6} y2={cy + 6} />
        ))}
      </g>
      <rect x={x(d.mean) - 4} y={cy - 4} width={8} height={8} fill="var(--ink)" />
      <g fontSize={LABEL} fill="var(--ink-2)" textAnchor="middle">
        <text x={x(-SPAN)} y={base}>−{SPAN}</text>
        <text x={x(0)} y={base}>0 (no difference)</text>
        <text x={x(SPAN)} y={base}>+{SPAN}</text>
      </g>
    </svg>
  )
}

export default function ResultsView({ site }) {
  const r = site.results
  const rows = [
    ['Phase B control: 12 leads', r.control.macro_auc, ci(r.control.ci90), 'this site’s model'],
    ['Phase B VCG-augmented: 12 leads + 3 VCG channels', r.vcg_augmented.macro_auc, ci(r.vcg_augmented.ci90), ''],
    ['Baseline resnet1d_wang (single run)', r.baselines.fastai_resnet1d_wang, 'no CI', ''],
    ['Baseline inception1d (single run)', r.baselines.fastai_inception1d, 'no CI', ''],
  ]

  return (
    <div>
      <header className="page-head">
        <p className="t-kicker" aria-hidden="true">
          §3
        </p>
        <h1 className="t-display">Results</h1>
        {/* the file path breaks after its slashes (<wbr>), or anywhere if it still does not fit a 320 px screen */}
        <p className="t-standfirst [overflow-wrap:anywhere]">
          PTB-XL diagnostic superclasses (5 classes, one-vs-rest), trained on folds 1–8, tuned on fold 9, tested once on fold 10
          ({fmt(site.test.n)} ECGs). Folds are split by patient, so no patient appears in both training and test data. The
          numbers below were recomputed from the repository’s saved predictions when the site’s data was exported
          (web/<wbr />scripts/<wbr />export_site_data.py), and checked against the stored results; the 90% intervals and the
          baselines are read from the stored result files.
        </p>
      </header>

      <div className="space-y-12">
        <section aria-labelledby="r-main">
          {/* numbered like Tables 1.1 and 2.1: the number above the h2, which names the table with it */}
          <div className="fig-head mb-1">
            <span id="r-main-no" className="fig-no">
              {FIG.auc}
            </span>
          </div>
          <h2 id="r-main" className="t-title">
            Test macro AUC
          </h2>
          <div className="annotated measure-wide mt-3">
            <div className="bt-wrap">
              <table className="bt" aria-labelledby="r-main-no r-main">
                <caption>
                  Fold 10 ({fmt(site.test.n)} ECGs) · 5 classes, one-vs-rest
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col" className="n">
                      Macro AUC
                    </th>
                    <th scope="col" className="n">
                      90% interval (bootstrap)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, auc, interval, note]) => (
                    <tr key={name}>
                      {/* the note sits under the run name (not in a fourth, header-less column), so the table fits 320 px */}
                      <th scope="row">
                        {name}
                        {note && <span className="block text-ink-2">{note}</span>}
                      </th>
                      <td className="n font-semibold">{f4(auc)}</td>
                      <td className="n">{interval}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              Intervals are the 5th–95th percentiles of 100 bootstrap resamples of the test set (the benchmark code’s convention).
            </p>
          </div>
        </section>

        <section aria-labelledby="r-delta" className="space-y-6">
          <h2 id="r-delta" className="t-title">
            Does adding vectorcardiogram channels help? No measurable gain.
          </h2>
          <p className="t-body measure">
            The idea: to a good approximation, the 12 leads are flat views of one 3D arrow, the heart’s electrical vector (you can turn it for any ECG in
            the <a href="#explorer">explorer</a>). Its three coordinates, reconstructed with the Kors (1990) transform, were added
            to the same model as three extra channels, with everything else identical. On the full test set the macro AUC difference (VCG minus control) is{' '}
            <span className="num font-semibold">{sign(r.paired_delta.full_test)}</span>; over {r.paired_delta.resamples} paired
            bootstrap resamples of the test set its mean is <span className="num">{sign(r.paired_delta.mean)}</span>, 95% interval{' '}
            <span className="num">{ci(r.paired_delta.ci95, sign)}</span>. The interval includes zero: no measurable gain for this
            model. Each arm was trained once, so the interval reflects test-set sampling only, not training variation. A null
            result, reported as one.
          </p>
          <figure className="fig measure">
            <figcaption className="fig-head">
              <span className="fig-no">{FIG.delta}</span>
              <span className="fig-title">Paired difference, VCG minus control</span>
              <span className="fig-meta">macro AUC · ±{SPAN} · 95% interval</span>
            </figcaption>
            <DeltaChart d={r.paired_delta} />
          </figure>
        </section>

        <section aria-labelledby="r-class" className="space-y-6">
          <h2 id="r-class" className="t-title">
            Per class (control model)
          </h2>
          <figure className="fig">
            <div className="fig-head">
              <span className="fig-no">{FIG.roc}</span>
              <span className="fig-title">ROC curves</span>
              <span className="fig-meta">
                a–{KEYS[site.classes.length - 1]} · one-vs-rest · both axes 0–1
              </span>
            </div>
            <div className="grid gap-x-4 gap-y-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {site.classes.map((c, i) => (
                <Roc key={c} cls={c} letter={KEYS[i]} points={r.control.roc[c]} auc={r.control.per_class[c]} />
              ))}
            </div>
            <figcaption className="fig-caption">
              <span className="cap-lead">Test positives:</span>{' '}
              {site.classes.map((c) => `${c} ${fmt(site.test.positives[c])}`).join(', ')} (an ECG can carry several classes).
            </figcaption>
          </figure>
        </section>
      </div>
    </div>
  )
}
