import { memo, useCallback, useMemo, useState } from 'react'
import EcgPaper from './EcgPaper'
import Vcg3D from './Vcg3D'
import { CLASS_NAMES, fmt } from '../lib/data'

// figure and table numbers for this section, kept in one place so they stay in order
const FIG = { ecg: 'Figure 1.1', vcg: 'Figure 1.2', scores: 'Table 1.1' }

const who = (c) => `${c.age == null ? 'age unknown' : `${c.age} y`}, ${c.sex}`

function LabelTags({ labels }) {
  return (
    <span className="tags">
      {labels.map((l) => (
        <span key={l} className={`tag cls-${l}`} title={CLASS_NAMES[l]}>
          {l}
        </span>
      ))}
    </span>
  )
}

// memo: the 3D view's cursor re-renders the explorer many times a second while it plays
const ScorePanel = memo(function ScorePanel({ c, classes, testN }) {
  return (
    <section aria-labelledby="scores-title">
      <div className="fig-head mb-1">
        <span id="scores-no" className="fig-no">
          {FIG.scores}
        </span>
      </div>
      <h2 id="scores-title" className="t-title">
        Model scores vs the cardiologists’ labels
      </h2>
      <div className="annotated mt-3">
        <div className="bt-wrap">
          <table className="bt" aria-labelledby="scores-no scores-title">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Label</th>
                <th scope="col" className="w-[30%] sm:w-[40%]">Model score</th>
                <th scope="col" className="n">Among test ECGs</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((k) => {
                const has = c.labels.includes(k)
                const s = c.scores[k]
                return (
                  <tr key={k}>
                    <th scope="row">
                      <span className={`code cls-${k}`}>{k}</span> <span className="text-ink-2">{CLASS_NAMES[k]}</span>
                    </th>
                    <td>{has ? <span className={`tag cls-${k}`}>Yes</span> : <span className="no">No</span>}</td>
                    <td>
                      <div className="flex items-baseline gap-2">
                        <span className={`bar cls-${k} self-center`} aria-hidden="true">
                          <span className="bar-fill" style={{ width: `${s * 100}%` }} />
                        </span>
                        <span className="score">{s.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="n text-ink-2">
                      {/* 'higher than' stays on one line once there is room (a phone wider than 360px), so the rank takes two lines, not three */}
                      <span className="min-[22.5rem]:whitespace-nowrap">higher than</span> {fmt(c.percentile[k], 1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Scores are the model’s raw outputs, saved from the test-set run; they are not calibrated probabilities, so compare a
          score with other ECGs in the same class (last column: its rank among all {fmt(testN)} test ECGs), not across classes.
          Labels are PTB-XL’s cardiologist annotations: a class counts as present if any of its diagnostic statements appears in
          the report, whatever likelihood the cardiologist gave it (the benchmark’s convention). An ECG can carry several classes.
        </p>
      </div>
    </section>
  )
})

const CaseList = memo(function CaseList({ shown, currentId, onSelect }) {
  return (
    <ul aria-label="Test ECGs" className="register">
      {shown.map((x) => (
        <li key={x.id}>
          <button type="button" className="row-btn" aria-current={x.id === currentId} onClick={() => onSelect(x.id)}>
            <span className="row-id">ECG {x.id}</span>
            <span className="row-meta">{who(x)}</span>
            <span className="row-tags">
              <LabelTags labels={x.labels} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
})

export default function Explorer({ site }) {
  const { cases, rule } = site.sample
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState(cases[0].id)
  const [cursor, setCursor] = useState(null) // seconds: the instant the 3D view is showing
  const shown = useMemo(() => (filter === 'ALL' ? cases : cases.filter((c) => c.labels.includes(filter))), [cases, filter])
  const c = cases.find((x) => x.id === selectedId) ?? cases[0]
  const macro = site.results.control.macro_auc

  // on narrow screens the ECG sits below the list: bring it into view, or the tap looks like it did nothing
  const select = useCallback((id) => {
    setSelectedId(id)
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => document.getElementById('ecg-title')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }))
    }
  }, [])

  return (
    <div>
      <header className="page-head">
        <p className="t-kicker" aria-hidden="true">
          §1
        </p>
        <h1 className="t-display">ECG explorer</h1>
        <p className="t-standfirst">
          Real 12-lead ECGs from the PTB-XL test fold (patients the model never trained on), each also shown as the heart’s 3D
          electrical vector, with the model’s saved predictions.
          The model scores five diagnostic classes with a test macro AUC of {macro.toFixed(3)} over all {fmt(site.test.n)} test
          ECGs. {rule}
        </p>
      </header>

      <div className="rail-layout">
        <aside className="space-y-3">
          <label className="block">
            <span className="t-label">Show ECGs labelled</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select mt-1">
              <option value="ALL">Any class ({cases.length})</option>
              {site.classes.map((k) => (
                <option key={k} value={k}>
                  {k}: {CLASS_NAMES[k]} ({cases.filter((x) => x.labels.includes(k)).length})
                </option>
              ))}
            </select>
          </label>
          <CaseList shown={shown} currentId={c.id} onSelect={select} />
        </aside>

        <section aria-labelledby="ecg-title" className="min-w-0 space-y-12">
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 id="ecg-title" className="t-record">
                ECG {c.id}
              </h2>
              <span className="text-ink-2">{who(c)}</span>
              <span className="font-sans text-[0.9375rem] text-ink-2">
                Cardiologist labels: <LabelTags labels={c.labels} />
              </span>
            </div>
            <EcgPaper id={c.id} cursor={cursor} label={FIG.ecg} />
          </div>
          <Vcg3D key={c.id} id={c.id} noise={c.noise} onCursor={setCursor} label={FIG.vcg} />
          <ScorePanel c={c} classes={site.classes} testN={site.test.n} />
        </section>
      </div>
    </div>
  )
}
