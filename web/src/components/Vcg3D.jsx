// The same heartbeat as a 3D loop: to a good approximation the 12 flat leads are views
// of one moving arrow, the heart's electrical vector, estimated with the Kors (1990)
// transform from the 500 Hz record. Drag (or use the buttons) to turn it; play to watch
// the arrow trace the loop while a cursor moves along the 12-lead paper above.
// Drawing rule: weight carries the meaning (heavy ink QRS run, thin graphite remainder, and
// the axis triad lighter and thinner still, so the scaffolding never outweighs the data), and
// the crimson accent means "now" (the moving arrow, the ECG cursor and the slider thumb).
import { Component, memo, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useVcg, fmt } from '../lib/data'
import { useRenderedWidth } from '../lib/useWidth'
import { VIEWS, beatWindow, maxLength, project, usableBeats, viewMatrix } from '../lib/vcg'

const SLOW = 5 // playback runs 5x slower than real time
const HOME = { yaw: -35, pitch: -20 }
const AXES = [
  { v: [1, 0, 0], label: '+X left' },
  { v: [0, 1, 0], label: '+Y feet' },
  { v: [0, 0, 1], label: '+Z back' },
]
const KEYS = ['a', 'b', 'c'] // keyed letters for the three plane views
const f1 = (n) => n.toFixed(1)
const pt = ([x, y]) => `${f1(x)},${f1(y)}`

/**
 * viewBox units per CSS pixel of a rendered SVG, so labels and hairlines can be sized in real
 * pixels whatever width the drawing ends up at. Until measured (and in jsdom, which has no
 * layout) the drawing keeps its base sizes (k = 1).
 */
function useUnits(el, vbW) {
  const px = useRenderedWidth(el, vbW)
  // rounded up, so a label sized from k never renders below its floor (11 CSS px)
  return Math.ceil((vbW / px) * 100) / 100
}

/** A filled arrowhead with its point at `tip`, pointing away from `from`; null if the line is too short to show a direction. */
function head(from, tip, len, halfWidth) {
  const d = Math.hypot(tip[0] - from[0], tip[1] - from[1])
  if (d < 1e-6) return null
  const u = [(tip[0] - from[0]) / d, (tip[1] - from[1]) / d]
  const base = [tip[0] - u[0] * len, tip[1] - u[1] * len]
  return {
    d,
    base,
    points: `${pt(tip)} ${pt([base[0] - u[1] * halfWidth, base[1] + u[0] * halfWidth])} ${pt([base[0] + u[1] * halfWidth, base[1] - u[0] * halfWidth])}`,
  }
}

function LoopSvg({ w, yaw, pitch, tIndex, size, label, compact = false, onDrag }) {
  const c = size / 2
  const [el, setEl] = useState(null)
  const k = useUnits(el, size) // viewBox units per CSS pixel
  const px = (n) => n * k
  // axis labels keep a fixed rendered size (12 CSS px, 11 on the small plane views) whatever width the loop is drawn at
  const fs = (compact ? 11 : 12) * k
  // everything but the moving arrow depends only on the beat, the angle and the label size, so it is not rebuilt every frame
  const drawing = useMemo(() => {
    const m = viewMatrix(yaw, pitch)
    const scale = (c - (compact ? 14 : 34)) / maxLength(w.points)
    const xy = (p) => [c + p[0] * scale, c + p[1] * scale]
    const pts = w.points.map((p) => xy(project(m, p)))
    // split the loop into runs so the part around the QRS can be drawn heavier
    const runs = []
    for (let i = 1; i < pts.length; i++) {
      const q = Math.abs(w.times[i] - w.qrsTime) <= 0.06
      const to = `L${f1(pts[i][0])} ${f1(pts[i][1])}`
      if (runs.at(-1)?.q === q) runs.at(-1).d += to
      else runs.push({ q, d: `M${f1(pts[i - 1][0])} ${f1(pts[i - 1][1])}${to}` })
    }
    // axes stop short of the edge so their labels fit inside the box, however large the labels have to be drawn
    const reach = c - Math.max(compact ? 20 : 54, fs * (compact ? 1.45 : 3.7) + 3 * k)
    const axes = AXES.map(({ v, label: l }) => {
      const [x, y] = project(m, v).map((n) => c + n * reach)
      const len = Math.hypot(x - c, y - c)
      const tip = len > 6 ? head([c, c], [x, y], Math.min((compact ? 4.5 : 6) * k, len / 2), (compact ? 2 : 2.7) * k) : null
      return { l, x, y, x0: 2 * c - x, y0: 2 * c - y, tip: tip?.points }
    })
    return { pts, runs, axes }
  }, [w, yaw, pitch, c, compact, fs, k])

  const drag = useRef(null)
  const end = (e) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }
  const tip = tIndex != null ? drawing.pts[Math.min(tIndex, drawing.pts.length - 1)] : null
  // the heart vector: a crimson shaft with a real arrowhead; a dot while it is too short to point anywhere
  const arrowLen = compact ? Math.max(6, px(5)) : Math.max(11, px(8))
  const arrow = tip ? head([c, c], tip, arrowLen, arrowLen * 0.42) : null
  const showHead = arrow && arrow.d >= arrowLen * 1.2
  const shaftW = compact ? Math.max(1, px(1)) : Math.max(1.8, px(1.5))
  // the shaft runs a little way into the head so no gap shows between them
  const shaftEnd = showHead ? [arrow.base[0] + (tip[0] - arrow.base[0]) * 0.2, arrow.base[1] + (tip[1] - arrow.base[1]) * 0.2] : null
  const dotR = compact ? 2.5 : 4.5
  // a plate halo round the arrow: the crimson differs from the ink loop it lies on mostly in hue, so the halo keeps them apart in greyscale too
  const halo = compact ? px(1) : px(1.5)
  return (
    <svg
      ref={setEl}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className={`plot-field w-full ${onDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      // sideways drags turn the loop; vertical swipes and pinches stay with the page on touch screens
      style={onDrag ? { touchAction: 'pan-y pinch-zoom' } : undefined}
      onPointerDown={
        onDrag &&
        ((e) => {
          if (drag.current || !e.isPrimary) return // one finger turns it; a second one is ignored
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        })
      }
      onPointerMove={
        onDrag &&
        ((e) => {
          if (drag.current?.id !== e.pointerId) return
          onDrag(e.clientX - drag.current.x, e.clientY - drag.current.y)
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
        })
      }
      onPointerUp={onDrag && end}
      onPointerCancel={onDrag && end}
      onLostPointerCapture={onDrag && end}
    >
      {/* axis triad, the scaffolding: solid .75 px towards +, dotted towards -, a small arrowhead at each + end, all in the
          plot-frame rule (--rule-strong, 3.7:1), so it stays lighter and thinner than the thin graphite P/T run */}
      {drawing.axes.map(({ l, x, y, x0, y0, tip: t }) => (
        <g key={l} stroke="var(--rule-strong)">
          <line x1={c} y1={c} x2={x0} y2={y0} strokeWidth={px(1.3)} strokeLinecap="round" strokeDasharray={`0 ${f1(px(3.5))}`} />
          <line x1={c} y1={c} x2={x} y2={y} strokeWidth={px(0.75)} />
          {t && <polygon points={t} fill="var(--rule-strong)" stroke="none" />}
        </g>
      ))}
      {drawing.runs.map((r, i) => (
        <path
          key={i}
          d={r.d}
          fill="none"
          stroke={r.q ? 'var(--ink)' : 'var(--graphite)'}
          strokeWidth={r.q ? (compact ? Math.max(1.6, px(1.6)) : Math.max(2.4, px(2))) : compact ? Math.max(0.8, px(0.9)) : Math.max(1.1, px(1))}
          strokeLinejoin="round"
        />
      ))}
      {/* labels after the loop, with a plate halo, so a loop that crosses them does not hide them */}
      {drawing.axes.map(({ l, x, y }) =>
        // an axis seen end-on (pointing into or out of the screen) gets no label
        Math.hypot(x - c, y - c) > 6 ? (
          <text
            key={l}
            x={x}
            y={y}
            fontSize={fs}
            fill="var(--ink-2)"
            stroke="var(--plate)"
            strokeWidth={px(3)}
            strokeLinejoin="round"
            paintOrder="stroke"
            textAnchor={x < c - 2 ? 'end' : x > c + 2 ? 'start' : 'middle'}
            dx={x < c - 2 ? -px(3) : x > c + 2 ? px(3) : 0}
            dy={y < c - 2 ? -px(3) : y > c + 2 ? fs * 0.8 + px(2) : fs * 0.35}
          >
            {compact ? l.split(' ')[0] : l}
          </text>
        ) : null,
      )}
      {tip && (
        <g fill="var(--plate)" stroke="var(--plate)" strokeLinejoin="round">
          {showHead ? (
            <>
              <line x1={c} y1={c} x2={shaftEnd[0]} y2={shaftEnd[1]} strokeWidth={shaftW + 2 * halo} />
              <polygon points={arrow.points} strokeWidth={2 * halo} />
            </>
          ) : (
            <circle cx={tip[0]} cy={tip[1]} r={dotR} strokeWidth={2 * halo} />
          )}
        </g>
      )}
      {/* the origin dot sits on the halo, so the arrow still visibly starts from it */}
      <circle cx={c} cy={c} r={compact ? 1.5 : 2.5} fill="var(--ink)" />
      {tip && (
        <g fill="var(--madder)">
          {showHead ? (
            <>
              <line x1={c} y1={c} x2={shaftEnd[0]} y2={shaftEnd[1]} stroke="var(--madder)" strokeWidth={shaftW} />
              <polygon points={arrow.points} />
            </>
          ) : (
            <circle cx={tip[0]} cy={tip[1]} r={dotR} />
          )}
        </g>
      )}
    </svg>
  )
}

/** A short sample of a loop line, for the caption's key. */
function LineKey({ heavy = false }) {
  return (
    // bg-plate: forced-colours themes keep SVG colours but drop the plate's, so the key carries its own
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 8" className="inline-block w-6 h-2 mr-1.5 align-middle bg-plate">
      <line x1="1" y1="4" x2="23" y2="4" stroke={heavy ? 'var(--ink)' : 'var(--graphite)'} strokeWidth={heavy ? 2.4 : 1.1} />
    </svg>
  )
}

function Vcg3DView({ id, noise = {}, onCursor, label = 'Figure 1.2' }) {
  const { data, error } = useVcg(id)
  const beats = useMemo(() => (data ? usableBeats(data) : []), [data])
  const [pos, setPos] = useState(0) // which of the usable beats
  const [view, setView] = useState(HOME)
  const [offset, setOffset] = useState(null) // the arrow's time, in seconds from the middle of the QRS
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)

  const w = useMemo(() => (beats.length ? beatWindow(data, beats[Math.min(pos, beats.length - 1)]) : null), [data, beats, pos])
  // the arrow keeps its place relative to the QRS when the beat changes, clamped to the new beat's length
  const tIndex = w && offset != null ? Math.max(0, Math.min(w.points.length - 1, Math.round((w.qrsTime + offset - w.times[0]) * data.fs))) : null

  const t = w && tIndex != null ? w.times[tIndex] : null
  useEffect(() => {
    onCursor?.(t)
  }, [t, onCursor])
  useEffect(() => () => onCursor?.(null), [onCursor])

  useEffect(() => {
    if (!playing || !w) return
    let start = null
    const from = tIndex ?? 0
    const step = (now) => {
      if (start == null) start = now
      const i = (from + Math.floor(((now - start) / 1000 / SLOW) * data.fs)) % w.points.length
      setOffset(w.times[i] - w.qrsTime)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, w])

  if (error) return <p className="t-body">The 3D view could not load. Reloading the page usually fixes it.</p>
  if (!data) return <div className="placeholder h-64">Loading the 3D view…</div>
  if (!w) return <p className="t-body">No whole heartbeat was found in this recording, so there is no 3D loop to show.</p>

  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180 // keep the turn angle in -180..180
  const turn = (dYaw, dPitch) => setView((v) => ({ yaw: wrap(v.yaw + dYaw), pitch: Math.max(-90, Math.min(90, v.pitch + dPitch)) }))
  const ms = offset != null ? Math.round((t - w.qrsTime) * 1000) : null
  const n = beats.length
  const at = Math.min(pos, n - 1)
  const qrsPeak = maxLength(w.points.filter((_, i) => Math.abs(w.times[i] - w.qrsTime) <= 0.06))
  const notes = Object.entries(noise)

  return (
    <section aria-labelledby="vcg-title" className="plate space-y-4">
      <div className="fig-head">
        <span className="fig-no">{label}</span>
        <h2 id="vcg-title" className="t-title">
          The same heart in 3D
        </h2>
        <span className="fig-meta">
          Kors (1990) · {data.fs} Hz · scaled to fit, largest QRS vector {fmt(Math.round(qrsPeak))} µV · played {SLOW}× slower
        </span>
      </div>
      <p className="t-body text-ink-2 measure">
        To a good approximation, the 12 traces above are 12 views of one thing: an electrical arrow inside the chest that swings
        around with every beat. The Kors (1990) transform estimates that arrow’s three coordinates from the leads. Here is one
        beat of it. Drag sideways to turn it; the arrow buttons tip it. When you play it or move the slider, a crimson line on the
        ECG above marks the same instant in every lead.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="btn-group">
          <button type="button" className="btn" onClick={() => setPos(Math.max(0, at - 1))} disabled={at === 0}>
            ← Beat
          </button>
          <span className="btn-group-text num">
            Beat {at + 1} of {n}
          </span>
          <button type="button" className="btn" onClick={() => setPos(Math.min(n - 1, at + 1))} disabled={at === n - 1}>
            Beat →
          </button>
        </span>
        <button type="button" className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause aria-hidden="true" className="w-4 h-4" /> : <Play aria-hidden="true" className="w-4 h-4" />}
          {playing ? 'Pause' : `Play (${SLOW}× slower)`}
        </button>
        <label className="inline-flex items-center gap-3">
          <span className="sr-only">Time within the beat</span>
          <input
            type="range"
            min={0}
            max={w.points.length - 1}
            value={tIndex ?? 0}
            onChange={(e) => {
              setPlaying(false)
              setOffset(w.times[Number(e.target.value)] - w.qrsTime)
            }}
            aria-valuetext={
              ms != null ? `${ms} milliseconds from the middle of the QRS, ${t.toFixed(2)} seconds into the recording` : 'start of the beat'
            }
          />
          <span className="t-micro num w-32">{ms != null ? `${ms > 0 ? '+' : ''}${ms} ms from QRS` : ''}</span>
        </label>
      </div>

      {/* the noise note sits under the loop on narrow screens and in the margin column from 80rem. The column is kept on
          records without a note (most of them), so the loop is drawn at the same size from record to record: a deliberate
          trade-off, an empty margin rather than a loop that jumps in size as you step through the list. */}
      <div className="annotated">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,150px)]">
          <div className="space-y-3">
            <LoopSvg
              w={w}
              yaw={view.yaw}
              pitch={view.pitch}
              tIndex={tIndex}
              size={420}
              label={`Heart-vector loop of beat ${at + 1}, ECG ${id}, turned ${Math.round(view.yaw)} degrees and tipped ${Math.round(view.pitch)} degrees.`}
              onDrag={(dx, dy) => turn(dx * 0.5, -dy * 0.5)}
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Turn the 3D view">
              {Object.entries(VIEWS).map(([k, v]) => (
                <button key={k} type="button" className="btn" onClick={() => setView({ yaw: v.yaw, pitch: v.pitch })}>
                  {v.label.split(' (')[0]}
                </button>
              ))}
              <span className="btn-group">
                <button type="button" className="btn btn-sq" onClick={() => turn(-15, 0)} aria-label="Turn left">
                  ⟲
                </button>
                <button type="button" className="btn btn-sq" onClick={() => turn(15, 0)} aria-label="Turn right">
                  ⟳
                </button>
              </span>
              <span className="btn-group">
                <button type="button" className="btn btn-sq" onClick={() => turn(0, 15)} aria-label="Tip up">
                  ↑
                </button>
                <button type="button" className="btn btn-sq" onClick={() => turn(0, -15)} aria-label="Tip down">
                  ↓
                </button>
              </span>
              <button type="button" className="btn" onClick={() => setView(HOME)}>
                <RotateCcw aria-hidden="true" className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
            {Object.entries(VIEWS).map(([k, v], i) => (
              <figure key={k} className="space-y-1">
                <LoopSvg w={w} yaw={v.yaw} pitch={v.pitch} tIndex={tIndex} size={140} compact label={`${v.label}, beat ${at + 1}`} />
                <figcaption className="t-micro text-[0.8125rem] leading-snug">
                  {/* read out, as on the ROC tiles (Figure 3.2): the letter is part of the visible caption */}
                  <span className="key-letter">{KEYS[i]}</span> {v.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        {notes.length > 0 && (
          <p className="note">
            PTB-XL’s annotators noted in this recording: {notes.map(([kind, where]) => `${kind} (${where})`).join('; ')}. Noise moves the
            arrow too, so a sharp spike or a jittery stretch of the loop may be noise rather than the heart.
          </p>
        )}
      </div>

      <p className="t-caption measure">
        <span className="whitespace-nowrap">
          <LineKey heavy />
          <span className="cap-lead">Heavy line:</span>
        </span>{' '}
        60 ms either side of the middle of the QRS (the fast, large QRS loop);{' '}
        <span className="whitespace-nowrap">
          <LineKey />
          <span className="cap-lead">thin line:</span>
        </span>{' '}
        the rest of the beat, where the smaller P and T loops are. Each beat is cut
        short where needed so it does not run into the beats either side. +X points to the patient’s left, +Y to the feet, +Z to
        the back. Drawn from the 500 Hz version of this record ({data.fs} samples a second; the model itself used the 100 Hz
        version). The loop is shifted so the quietest 20 ms before the QRS (where the arrow moves least, standing in for the zero
        line) sits at the origin. Beats are found by a simple detector for display (a beat must show in both the limb and the chest
        leads), not by clinical analysis; beats in the first and last 0.15 s are left out. Largest QRS vector in this beat:{' '}
        {fmt(Math.round(qrsPeak))} µV.
      </p>
    </section>
  )
}

/** A failure inside the 3D view stays inside its plate instead of blanking the page. */
class Contained extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="plate t-body">The 3D view hit an error for this ECG. The rest of the page still works.</p> : this.props.children
  }
}

// memo: its props do not change while it plays, so the explorer's per-frame cursor update does not redraw it again
export default memo(function Vcg3D(props) {
  return (
    <Contained>
      <Vcg3DView {...props} />
    </Contained>
  )
})
