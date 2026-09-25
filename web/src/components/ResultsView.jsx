import { CLASS_NAMES, fmt } from '../lib/data'

const f3 = (x) => x.toFixed(3)
const f4 = (x) => x.toFixed(4)
const ci = ([lo, hi], f = f4) => `[${f(lo)}, ${f(hi)}]`
const sign = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(5)}`

function Roc({ cls, points, auc }) {
  const S = 160
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * S).toFixed(1)} ${(S - y * S).toFixed(1)}`).join('')
  return (
    <figure className="card p-3 space-y-1">
      <svg role="img" aria-label={`ROC curve for ${CLASS_NAMES[cls]}, AUC ${f3(auc)}`} viewBox={`-26 -6 ${S + 34} ${S + 34}`} className="block w-full">
        <rect x={0} y={0} width={S} height={S} fill="#fff" stroke="var(--border)" />
        <line x1={0} y1={S} x2={S} y2={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={`var(--cls-${cls})`} strokeWidth="2" />
        <text x={S / 2} y={S + 20} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">false positive rate</text>
        <text x={-16} y={S / 2} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)" transform={`rotate(-90 -16 ${S / 2})`}>
          true positive rate
        </text>
      </svg>
      <figcaption className="text-[14px]">
        <span className="font-semibold" style={{ color: `var(--cls-${cls})` }}>{cls}</span> {CLASS_NAMES[cls]}: AUC{' '}
        <span className="num">{f3(auc)}</span>
      </figcaption>
    </figure>
  )
}

/** Paired bootstrap difference with its 95% interval, drawn against zero. */
function DeltaChart({ d }) {
  const span = 0.004
  const W = 520
  const x = (v) => ((v + span) / (2 * span)) * W
  return (
    <svg role="img" aria-label={`Paired AUC difference ${d.mean.toFixed(5)}, 95% interval ${ci(d.ci95, (v) => v.toFixed(5))}: the interval includes zero`} viewBox={`0 0 ${W} 70`} className="block w-full max-w-xl">
      <line x1={x(0)} x2={x(0)} y1={6} y2={50} stroke="var(--border-strong)" strokeDasharray="4 3" />
      <text x={x(0)} y={64} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">0 (no difference)</text>
      <line x1={x(d.ci95[0])} x2={x(d.ci95[1])} y1={28} y2={28} stroke="var(--accent)" strokeWidth="3" />
      {d.ci95.map((v) => (
        <line key={v} x1={x(v)} x2={x(v)} y1={20} y2={36} stroke="var(--accent)" strokeWidth="3" />
      ))}
      <circle cx={x(d.mean)} cy={28} r={6} fill="var(--accent)" />
      <text x={x(-span) + 2} y={64} fontSize="11" fill="var(--muted-foreground)">−{span}</text>
      <text x={x(span) - 2} y={64} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">+{span}</text>
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
    <div className="space-y-10 max-w-5xl">
      <header className="space-y-2 max-w-3xl">
        <h1 className="t-display">Results</h1>
        <p className="t-body text-muted-foreground">
          PTB-XL diagnostic superclasses (5 classes, one-vs-rest), trained on folds 1–8, tuned on fold 9, tested once on fold 10
          ({fmt(site.test.n)} ECGs). Folds are split by patient, so no patient appears in both training and test data. The
          numbers below were recomputed from the repository’s saved predictions when the site’s data was exported
          (web/scripts/export_site_data.py), and checked against the stored results; the 90% intervals and the baselines are read
          from the stored result files.
        </p>
      </header>

      <section aria-labelledby="r-main" className="space-y-3">
        <h2 id="r-main" className="t-title">
          Test macro AUC
        </h2>
        <table className="w-full text-left text-[15px] border-collapse">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3 font-semibold">Run</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Macro AUC</th>
              <th scope="col" className="py-2 pr-3 font-semibold">90% interval (bootstrap)</th>
              <th scope="col" className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, auc, interval, note]) => (
              <tr key={name} className="border-b">
                <th scope="row" className="py-2 pr-3 font-normal">{name}</th>
                <td className="py-2 pr-3 num font-semibold">{f4(auc)}</td>
                <td className="py-2 pr-3 num">{interval}</td>
                <td className="py-2 text-muted-foreground">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-micro">
          Intervals are the 5th–95th percentiles of 100 bootstrap resamples of the test set (the benchmark code’s convention).
        </p>
      </section>

      <section aria-labelledby="r-delta" className="space-y-3">
        <h2 id="r-delta" className="t-title">
          Does adding vectorcardiogram channels help? No measurable gain.
        </h2>
        <p className="t-body max-w-3xl">
          Three extra channels reconstructed with the Kors (1990) transform were added to the same model, with everything else
          identical. On the full test set the macro AUC difference (VCG minus control) is{' '}
          <span className="num font-semibold">{sign(r.paired_delta.full_test)}</span>; over {r.paired_delta.resamples} paired
          bootstrap resamples of the test set its mean is <span className="num">{sign(r.paired_delta.mean)}</span>, 95% interval{' '}
          <span className="num">{ci(r.paired_delta.ci95, sign)}</span>. The interval includes zero: no measurable gain for this
          model. Each arm was trained once, so the interval reflects test-set sampling only, not training variation. A null
          result, reported as one.
        </p>
        <DeltaChart d={r.paired_delta} />
      </section>

      <section aria-labelledby="r-class" className="space-y-3">
        <h2 id="r-class" className="t-title">
          Per class (control model)
        </h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {site.classes.map((c) => (
            <Roc key={c} cls={c} points={r.control.roc[c]} auc={r.control.per_class[c]} />
          ))}
        </div>
        <p className="t-micro">
          Test positives: {site.classes.map((c) => `${c} ${fmt(site.test.positives[c])}`).join(', ')} (an ECG can carry several
          classes).
        </p>
      </section>

    </div>
  )
}
