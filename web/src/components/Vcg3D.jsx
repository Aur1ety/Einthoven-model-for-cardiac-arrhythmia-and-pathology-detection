// The same heartbeat as a 3D loop: to a good approximation the 12 flat leads are views
// of one moving arrow, the heart's electrical vector, estimated with the Kors (1990)
// transform from the 500 Hz record. Drag (or use the buttons) to turn it; play to watch
// the arrow trace the loop while a cursor moves along the 12-lead paper above.
import { Component, memo, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useVcg, fmt } from '../lib/data'
import { VIEWS, beatWindow, maxLength, project, usableBeats, viewMatrix } from '../lib/vcg'

const SLOW = 5 // playback runs 5x slower than real time
const HOME = { yaw: -35, pitch: -20 }
const AXES = [
  { v: [1, 0, 0], label: '+X left' },
  { v: [0, 1, 0], label: '+Y feet' },
  { v: [0, 0, 1], label: '+Z back' },
]
const f1 = (n) => n.toFixed(1)

function LoopSvg({ w, yaw, pitch, tIndex, size, label, compact = false, onDrag }) {
  const c = size / 2
  // everything but the moving arrow depends only on the beat and the angle, so it is not rebuilt every frame
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
    // axes stop short of the edge so their labels fit inside the box
    const reach = c - (compact ? 20 : 54)
    const axes = AXES.map(({ v, label: l }) => {
      const [x, y] = project(m, v).map((k) => c + k * reach)
      return { l, x, y, x0: 2 * c - x, y0: 2 * c - y }
    })
    return { pts, runs, axes }
  }, [w, yaw, pitch, c, compact])

  const drag = useRef(null)
  const end = (e) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }
  const tip = tIndex != null ? drawing.pts[Math.min(tIndex, drawing.pts.length - 1)] : null
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className={`block w-full rounded border bg-white ${onDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
      {drawing.axes.map(({ l, x, y, x0, y0 }) => (
        <g key={l}>
          <line x1={x0} y1={y0} x2={x} y2={y} stroke="var(--border-strong)" strokeDasharray="3 3" strokeWidth={0.8} />
          {/* an axis seen end-on (pointing into or out of the screen) gets no label */}
          {Math.hypot(x - c, y - c) > 6 && (
            <text
              x={x}
              y={y}
              fontSize={compact ? 9 : 11}
              fill="var(--muted-foreground)"
              textAnchor={x < c - 2 ? 'end' : x > c + 2 ? 'start' : 'middle'}
              dx={x < c - 2 ? -2 : x > c + 2 ? 2 : 0}
              dy={y < c - 2 ? -3 : y > c + 2 ? 9 : 3}
            >
              {compact ? l.split(' ')[0] : l}
            </text>
          )}
        </g>
      ))}
      {drawing.runs.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={r.q ? 'var(--accent)' : 'var(--link)'} strokeWidth={r.q ? (compact ? 1.6 : 2.4) : compact ? 0.9 : 1.3} strokeLinejoin="round" />
      ))}
      <circle cx={c} cy={c} r={compact ? 1.5 : 2.5} fill="var(--foreground)" />
      {tip && (
        <g>
          <line x1={c} y1={c} x2={tip[0]} y2={tip[1]} stroke="var(--foreground)" strokeWidth={compact ? 1 : 1.8} />
          <circle cx={tip[0]} cy={tip[1]} r={compact ? 2.5 : 4.5} fill="var(--foreground)" />
        </g>
      )}
    </svg>
  )
}

function Vcg3DView({ id, noise = {}, onCursor }) {
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
  if (!data) return <div className="h-64 rounded border bg-[var(--surface)] animate-pulse" aria-label="Loading the 3D view" />
  if (!w) return <p className="t-body">No whole heartbeat was found in this recording, so there is no 3D loop to show.</p>

  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180 // keep the turn angle in -180..180
  const turn = (dYaw, dPitch) => setView((v) => ({ yaw: wrap(v.yaw + dYaw), pitch: Math.max(-90, Math.min(90, v.pitch + dPitch)) }))
  const ms = offset != null ? Math.round((t - w.qrsTime) * 1000) : null
  const btn =
    'rounded border border-[var(--border-strong)] bg-white px-2.5 py-1 text-[14px] font-semibold enabled:hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed'
  const n = beats.length
  const at = Math.min(pos, n - 1)
  const qrsPeak = maxLength(w.points.filter((_, i) => Math.abs(w.times[i] - w.qrsTime) <= 0.06))
  const notes = Object.entries(noise)

  return (
    <section aria-labelledby="vcg-title" className="card p-4 space-y-3">
      <h2 id="vcg-title" className="t-title">
        The same heart in 3D
      </h2>
      <p className="t-body text-muted-foreground max-w-3xl">
        To a good approximation, the 12 traces above are 12 views of one thing: an electrical arrow inside the chest that swings
        around with every beat. The Kors (1990) transform estimates that arrow’s three coordinates from the leads. Here is one
        beat of it. Drag sideways to turn it; the arrow buttons tip it. When you play it or move the slider, a dark red line on the
        ECG above marks the same instant in every lead.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setPos(Math.max(0, at - 1))} disabled={at === 0}>
          ← Beat
        </button>
        <span className="num text-[14px]">
          Beat {at + 1} of {n}
        </span>
        <button type="button" className={btn} onClick={() => setPos(Math.min(n - 1, at + 1))} disabled={at === n - 1}>
          Beat →
        </button>
        <span className="mx-1 h-5 border-l" aria-hidden="true" />
        <button type="button" className={`${btn} inline-flex items-center gap-1.5`} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause aria-hidden="true" className="w-4 h-4" /> : <Play aria-hidden="true" className="w-4 h-4" />}
          {playing ? 'Pause' : `Play (${SLOW}× slower)`}
        </button>
        <label className="inline-flex items-center gap-2 text-[14px]">
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
          <span className="num w-32 text-muted-foreground">{ms != null ? `${ms > 0 ? '+' : ''}${ms} ms from QRS` : ''}</span>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <div className="space-y-2">
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
              <button key={k} type="button" className={btn} onClick={() => setView({ yaw: v.yaw, pitch: v.pitch })}>
                {v.label.split(' (')[0]}
              </button>
            ))}
            <button type="button" className={btn} onClick={() => turn(-15, 0)} aria-label="Turn left">
              ⟲
            </button>
            <button type="button" className={btn} onClick={() => turn(15, 0)} aria-label="Turn right">
              ⟳
            </button>
            <button type="button" className={btn} onClick={() => turn(0, 15)} aria-label="Tip up">
              ↑
            </button>
            <button type="button" className={btn} onClick={() => turn(0, -15)} aria-label="Tip down">
              ↓
            </button>
            <button type="button" className={`${btn} inline-flex items-center gap-1`} onClick={() => setView(HOME)}>
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <figure key={k} className="space-y-0.5">
              <LoopSvg w={w} yaw={v.yaw} pitch={v.pitch} tIndex={tIndex} size={140} compact label={`${v.label}, beat ${at + 1}`} />
              <figcaption className="text-[12px] text-muted-foreground leading-tight">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {notes.length > 0 && (
        <p className="t-body max-w-3xl">
          PTB-XL’s annotators noted in this recording: {notes.map(([kind, where]) => `${kind} (${where})`).join('; ')}. Noise moves the
          arrow too, so a sharp spike or a jittery stretch of the loop may be noise rather than the heart.
        </p>
      )}

      <p className="t-micro max-w-3xl">
        Dark red: 60 ms either side of the middle of the QRS (the fast, large QRS loop); blue: the rest of the beat, where the
        smaller P and T loops are. Each beat is cut short where needed so it does not run into the beats either side. +X points to
        the patient’s left, +Y to the feet, +Z to the back. Drawn from the 500 Hz version of this record ({data.fs} samples a
        second; the model itself used the 100 Hz version). The loop is shifted so the quietest 20 ms before the QRS (where the
        arrow moves least, standing in for the zero line) sits at the origin. Beats are found by a simple detector for display
        (a beat must show in both the limb and the chest leads), not by clinical analysis; beats in the first and last 0.15 s
        are left out. Largest QRS vector in this beat: {fmt(Math.round(qrsPeak))} µV.
      </p>
    </section>
  )
}

/** A failure inside the 3D view stays inside its card instead of blanking the page. */
class Contained extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="t-body card p-4">The 3D view hit an error for this ECG. The rest of the page still works.</p> : this.props.children
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
