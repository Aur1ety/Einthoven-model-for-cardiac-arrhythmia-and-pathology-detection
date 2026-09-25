import { useMemo, useState } from 'react'
import EcgPaper from './EcgPaper'
import { CLASS_NAMES, fmt } from '../lib/data'

const who = (c) => `${c.age == null ? 'age unknown' : `${c.age} y`}, ${c.sex}`

function LabelChips({ labels }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="chip" style={{ color: `var(--cls-${l})` }} title={CLASS_NAMES[l]}>
          {l}
        </span>
      ))}
    </span>
  )
}

function ScorePanel({ c, classes, testN }) {
  return (
    <section aria-labelledby="scores-title" className="card p-4 space-y-3">
      <h2 id="scores-title" className="t-title">
        Model scores vs the cardiologists’ labels
      </h2>
      <table className="w-full text-left text-[15px] border-collapse">
        <thead>
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-semibold">Class</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Label</th>
            <th scope="col" className="py-2 pr-3 font-semibold w-[40%]">Model score</th>
            <th scope="col" className="py-2 font-semibold">Among test ECGs</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((k) => {
            const has = c.labels.includes(k)
            const s = c.scores[k]
            return (
              <tr key={k} className="border-b last:border-b-0">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="font-semibold" style={{ color: `var(--cls-${k})` }}>
                    {k}
                  </span>{' '}
                  <span className="text-muted-foreground">{CLASS_NAMES[k]}</span>
                </th>
                <td className="py-2 pr-3">{has ? <span className="chip" style={{ color: `var(--cls-${k})` }}>Yes</span> : <span className="text-faint">No</span>}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded bg-[var(--surface)] border" aria-hidden="true">
                      <div className="h-full rounded" style={{ width: `${s * 100}%`, background: `var(--cls-${k})` }} />
                    </div>
                    <span className="num w-12 text-right">{s.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 num text-muted-foreground">higher than {fmt(c.percentile[k], 1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="t-micro">
        Scores are the model’s raw outputs, saved from the test-set run; they are not calibrated probabilities, so compare a
        score with other ECGs in the same class (last column: its rank among all {fmt(testN)} test ECGs), not across classes.
        Labels are PTB-XL’s cardiologist annotations: a class counts as present if any of its diagnostic statements appears in
        the report, whatever likelihood the cardiologist gave it (the benchmark’s convention). An ECG can carry several classes.
      </p>
    </section>
  )
}

export default function Explorer({ site }) {
  const { cases, rule } = site.sample
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState(cases[0].id)
  const shown = useMemo(() => (filter === 'ALL' ? cases : cases.filter((c) => c.labels.includes(filter))), [cases, filter])
  const c = cases.find((x) => x.id === selectedId) ?? cases[0]
  const macro = site.results.control.macro_auc

  // on narrow screens the ECG sits below the list: bring it into view, or the tap looks like it did nothing
  function select(id) {
    setSelectedId(id)
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('ecg-title')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }))
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 max-w-3xl">
        <h1 className="t-display">ECG explorer</h1>
        <p className="t-body text-muted-foreground">
          Real 12-lead ECGs from the PTB-XL test fold (patients the model never trained on), with the model’s saved predictions.
          The model scores five diagnostic classes with a test macro AUC of {macro.toFixed(3)} over all {fmt(site.test.n)} test
          ECGs. {rule}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <label className="block">
            <span className="t-label">Show ECGs labelled</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 block w-full rounded border border-[var(--border-strong)] bg-white px-3 py-2 text-[15px]">
              <option value="ALL">Any class ({cases.length})</option>
              {site.classes.map((k) => (
                <option key={k} value={k}>
                  {k}: {CLASS_NAMES[k]} ({cases.filter((x) => x.labels.includes(k)).length})
                </option>
              ))}
            </select>
          </label>
          <ul aria-label="Test ECGs" className="card max-h-[40vh] lg:max-h-[70vh] overflow-y-auto relative">
            {shown.map((x) => (
              <li key={x.id}>
                <button type="button" className="row-btn" aria-current={x.id === c.id} onClick={() => select(x.id)}>
                  <span className="block font-semibold">ECG {x.id}</span>
                  <span className="block text-[14px] text-muted-foreground">{who(x)}</span>
                  <span className="mt-1 block">
                    <LabelChips labels={x.labels} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section aria-labelledby="ecg-title" className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="ecg-title" className="t-title">
              ECG {c.id}
            </h2>
            <span className="text-muted-foreground">{who(c)}</span>
            <span>
              Cardiologist labels: <LabelChips labels={c.labels} />
            </span>
          </div>
          <EcgPaper id={c.id} />
          <ScorePanel c={c} classes={site.classes} testN={site.test.n} />
        </section>
      </div>
    </div>
  )
}
