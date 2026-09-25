// The heart vector (VCG) in 3D: rotation, projection and beat windows.
// Axes follow the Frank convention the Kors (1990) transform reconstructs:
// +X towards the patient's left, +Y towards the feet, +Z towards the back.
// On screen x grows to the right and y grows downwards, so the front view
// (the frontal plane) puts the patient's left on the right and the feet at the
// bottom, like the ECG's own axis diagram.

const rad = (deg) => (deg * Math.PI) / 180

/** Rotation for a view: yaw turns about the vertical (Y) axis, pitch tips about the screen's horizontal axis. */
export function viewMatrix(yawDeg, pitchDeg) {
  const [cy, sy, cp, sp] = [Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg)), Math.cos(rad(pitchDeg)), Math.sin(rad(pitchDeg))]
  // R = Rx(pitch) · Ry(yaw); rows give screen x, screen y and depth
  return [
    [cy, 0, sy],
    [sp * sy, cp, -sp * cy],
    [-cp * sy, sp, cp * cy],
  ]
}

/** Project one [x, y, z] point to [screenX, screenY, depth] (orthographic). */
export const project = (m, [x, y, z]) => [
  m[0][0] * x + m[0][1] * y + m[0][2] * z,
  m[1][0] * x + m[1][1] * y + m[1][2] * z,
  m[2][0] * x + m[2][1] * y + m[2][2] * z,
]

// The three planes cardiologists read a VCG in, as view angles. The third row of
// the matrix is the direction the viewer looks in (into the screen):
//   front: from in front of the chest, looking towards the back (+Z)
//   top:   from above the head, looking towards the feet (+Y); the back is at the top
//   side:  from the patient's left, looking towards their right (-X); the back is on the right
export const VIEWS = {
  front: { yaw: 0, pitch: 0, label: 'Front (frontal plane: X and Y)' },
  top: { yaw: 0, pitch: 90, label: 'From above (horizontal plane: X and Z)' },
  side: { yaw: 90, pitch: 0, label: 'From the left side (sagittal plane: Z and Y)' },
}

// A beat is shown from up to 0.25 s before the middle of its QRS to up to 0.45 s after,
// cut short so it never reaches into the neighbouring beats: it starts no earlier than
// 60% of the way from the previous QRS and ends 0.08 s before the next one.
const BEFORE = 0.25
const AFTER = 0.45
const QUIET = 0.02 // length of the stretch used as the zero point
const EDGE = 0.15 // beats closer than this to either end of the recording are not offered

/**
 * Indices of the beats that can be shown whole enough: not at the very ends of the recording,
 * and at least 0.3 s from their neighbours (the export guarantees this; it is checked again here).
 */
export const usableBeats = (v) =>
  v.qrs_s.flatMap((q, k) => {
    const apart = (k === 0 || q - v.qrs_s[k - 1] >= 0.3) && (k === v.qrs_s.length - 1 || v.qrs_s[k + 1] - q >= 0.3)
    return q >= EDGE && q <= v.x.length / v.fs - EDGE && apart ? [k] : []
  })

/**
 * Beat k of the loop, in microvolts, with the time of each point. It is shifted so the
 * quietest 20 ms before the QRS (where the heart vector moves least, standing in for the
 * isoelectric baseline) sits at the origin. `start` and `end` are sample indices.
 */
export function beatWindow(v, k) {
  const { fs } = v
  const q = v.qrs_s[k]
  const prev = v.qrs_s[k - 1]
  const next = v.qrs_s[k + 1]
  const from = Math.max(q - BEFORE, prev == null ? 0 : prev + 0.6 * (q - prev))
  const to = Math.min(q + AFTER, next == null ? Infinity : next - 0.08)
  const start = Math.max(0, Math.round(from * fs))
  const end = Math.min(v.x.length - 1, Math.round(to * fs))
  // the quiet stretch: the QUIET-long run, between the start and 40 ms before the QRS middle, that moves least
  const len = Math.round(QUIET * fs)
  const last = Math.round((q - 0.04) * fs) - len
  let quiet = start
  let least = Infinity
  for (let i = start; i <= last; i++) {
    let path = 0
    for (let j = i + 1; j < i + len; j++) path += Math.hypot(v.x[j] - v.x[j - 1], v.y[j] - v.y[j - 1], v.z[j] - v.z[j - 1])
    if (path < least) [least, quiet] = [path, i]
  }
  const mean = (a) => a.slice(quiet, quiet + len).reduce((s, x) => s + x, 0) / len
  const base = [mean(v.x), mean(v.y), mean(v.z)]
  const points = []
  const times = []
  for (let i = start; i <= end; i++) {
    points.push([v.x[i] - base[0], v.y[i] - base[1], v.z[i] - base[2]])
    times.push(i / fs)
  }
  return { points, times, qrsTime: q, quietTime: quiet / fs }
}

/** Largest vector length in a set of points, for scaling the drawing. */
export const maxLength = (points) => Math.max(1, ...points.map(([x, y, z]) => Math.hypot(x, y, z)))
