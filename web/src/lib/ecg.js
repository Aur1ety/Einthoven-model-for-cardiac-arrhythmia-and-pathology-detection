// ECG paper geometry, as printed clinically: 25 mm/s, 10 mm/mV, 1 mm small
// squares and 5 mm large squares. One SVG unit is 0.25 mm, so at PTB-XL's
// 100 Hz one sample is exactly one unit across.
export const U_PER_MM = 4
const MM_PER_S = 25
const MM_PER_MV = 10
export const FS = 100
export const X_PER_SAMPLE = (MM_PER_S * U_PER_MM) / FS // 1
export const Y_PER_UV = (MM_PER_MV * U_PER_MM) / 1000 // 0.04

// the standard 3 x 4 printout (2.5 s per lead) plus a 10 s lead II rhythm strip
export const LAYOUT = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
]
export const RHYTHM_LEAD = 'II'
const SAMPLES = 1000
const COL_SAMPLES = SAMPLES / 4
const ROW_H = 30 * U_PER_MM // 30 mm per row
const CAL_W = 10 * U_PER_MM // room for the 1 mV calibration pulse

/** An SVG path for a run of microvolt samples, baseline at y0. */
export function tracePath(values, x0, y0) {
  let d = ''
  for (let i = 0; i < values.length; i++) {
    const x = x0 + i * X_PER_SAMPLE
    const y = y0 - values[i] * Y_PER_UV
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

/** Where every lead segment goes on the page. `signal` is 12 x 1000 microvolts in `leads` order. */
export function paperLayout(leads, signal) {
  const byName = new Map(leads.map((l, i) => [l, signal[i]]))
  const segments = []
  LAYOUT.forEach((row, r) => {
    const y0 = ROW_H * r + ROW_H / 2
    row.forEach((lead, c) => {
      const from = c * COL_SAMPLES
      segments.push({ lead, x0: CAL_W + from * X_PER_SAMPLE, y0, from, values: byName.get(lead).slice(from, from + COL_SAMPLES) })
    })
  })
  const rhythmY = ROW_H * LAYOUT.length + ROW_H / 2
  segments.push({ lead: RHYTHM_LEAD, x0: CAL_W, y0: rhythmY, from: 0, values: byName.get(RHYTHM_LEAD), rhythm: true })
  const height = ROW_H * (LAYOUT.length + 1)
  // Tall waves (hypertrophy especially) can run past the page edge; like a printout, rows may
  // overlap each other, but nothing may be cut off, so the paper grows to fit the trace.
  let lowest = 0
  let highest = height
  for (const s of segments)
    for (const v of s.values) {
      const y = s.y0 - v * Y_PER_UV
      if (y < lowest) lowest = y
      if (y > highest) highest = y
    }
  const BIG = 5 * U_PER_MM
  const top = Math.ceil((0 - lowest + U_PER_MM) / BIG) * BIG * (lowest < 0 ? 1 : 0)
  const bottom = Math.ceil((highest - height + U_PER_MM) / BIG) * BIG * (highest > height ? 1 : 0)
  return {
    width: CAL_W + SAMPLES * X_PER_SAMPLE,
    height,
    top, // extra paper above row 0 (in units), 0 unless a trace needs it
    bottom, // extra paper below the rhythm strip
    rowBaselines: [...LAYOUT.map((_, r) => ROW_H * r + ROW_H / 2), rhythmY],
    calWidth: CAL_W,
    segments,
  }
}

/** The 1 mV x 0.2 s calibration pulse at the start of a row. */
export function calibrationPath(y0) {
  const x = 1 * U_PER_MM
  const w = 5 * U_PER_MM
  const h = 1000 * Y_PER_UV
  return `M${x} ${y0}H${x + 2}V${y0 - h}H${x + 2 + w}V${y0}H${x + w + 6}`
}

/** Einthoven's law, sample by sample: II − (I + III), in microvolts (0 for a consistent recording). */
export function einthovenResidual(leads, signal) {
  return identityResiduals(leads, signal).einthoven
}

/**
 * All four limb-lead identities the audit checks, sample by sample, in microvolts.
 * Keys match the audit file's columns (einthoven, avr, avl, avf).
 */
export function identityResiduals(leads, signal) {
  const [I, II, III, aVR, aVL, aVF] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'].map((l) => signal[leads.indexOf(l)])
  return {
    einthoven: II.map((v, k) => v - (I[k] + III[k])),
    avr: aVR.map((v, k) => v + (I[k] + II[k]) / 2),
    avl: aVL.map((v, k) => v - (I[k] - III[k]) / 2),
    avf: aVF.map((v, k) => v - (II[k] + III[k]) / 2),
  }
}
