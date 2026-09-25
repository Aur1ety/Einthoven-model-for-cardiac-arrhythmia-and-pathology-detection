import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIEWS, beatWindow, project, usableBeats, viewMatrix } from './vcg'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data')
const site = JSON.parse(readFileSync(path.join(DATA, 'site.json'), 'utf8'))
const load = (f) => JSON.parse(readFileSync(path.join(DATA, 'ecg', f), 'utf8'))
const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

describe('3D view geometry', () => {
  it('every view is a pure rotation (lengths and right angles are kept)', () => {
    for (const [yaw, pitch] of [[0, 0], [37, -20], [-90, 0], [0, -90], [123, 45]]) {
      const m = viewMatrix(yaw, pitch)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) expect(m[i].reduce((s, _, k) => s + m[i][k] * m[j][k], 0)).toBeCloseTo(i === j ? 1 : 0, 9)
    }
  })

  it('front view: +X (patient left) points right, +Y (feet) points down, +Z (back) goes into the screen', () => {
    const m = viewMatrix(VIEWS.front.yaw, VIEWS.front.pitch)
    close(project(m, [1, 0, 0]), [1, 0, 0])
    close(project(m, [0, 1, 0]), [0, 1, 0])
    close(project(m, [0, 0, 1]), [0, 0, 1])
  })

  it('each named view really looks from where its label says (no mirrored planes)', () => {
    const into = (k) => viewMatrix(VIEWS[k].yaw, VIEWS[k].pitch)[2]
    close(into('front'), [0, 0, 1]) // in front of the chest, looking towards the back
    close(into('top'), [0, 1, 0]) // above the head, looking towards the feet
    close(into('side'), [-1, 0, 0]) // at the patient's left, looking towards their right
    // and the pictures are not mirror images: screen right x screen down = into the screen
    for (const k of Object.keys(VIEWS)) {
      const [r, d, f] = viewMatrix(VIEWS[k].yaw, VIEWS[k].pitch)
      close([r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]], f)
    }
  })

  it('from above: X stays horizontal and Z becomes the vertical screen axis', () => {
    const m = viewMatrix(VIEWS.top.yaw, VIEWS.top.pitch)
    close(project(m, [1, 0, 0]).slice(0, 2), [1, 0])
    expect(Math.abs(project(m, [0, 0, 1])[1])).toBeCloseTo(1, 9)
    expect(Math.abs(project(m, [0, 1, 0])[1])).toBeCloseTo(0, 9) // Y is now depth
  })

  it('from the side: Z becomes the horizontal screen axis and Y stays vertical', () => {
    const m = viewMatrix(VIEWS.side.yaw, VIEWS.side.pitch)
    expect(Math.abs(project(m, [0, 0, 1])[0])).toBeCloseTo(1, 9)
    close(project(m, [0, 1, 0]).slice(0, 2), [0, 1])
    expect(Math.abs(project(m, [1, 0, 0])[0])).toBeCloseTo(0, 9) // X is now depth
  })
})

describe('exported heart-vector data', () => {
  const cases = site.sample.cases

  it('every explorer ECG has a 10 s, 500 Hz X/Y/Z file and at least 3 beats to show', () => {
    for (const c of cases) {
      const v = load(`${c.id}.vcg.json`)
      expect(v.fs).toBe(500)
      for (const k of ['x', 'y', 'z']) expect(v[k]).toHaveLength(5000)
      expect(v.qrs_s.length).toBe(c.beats)
      expect(v.qrs_s.every((t, i) => t >= 0 && t <= 10 && (i === 0 || t - v.qrs_s[i - 1] >= 0.3))).toBe(true)
      expect(usableBeats(v).length, `${c.id}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('X, Y and Z are the Kors combination of the 12-lead signal, same shape and scale (all 100 ECGs, checked on the 100 Hz file)', () => {
    // the exported 100 Hz leads, combined with the released Kors coefficients, must give the same
    // vector as the 500 Hz file: same axes and signs (correlation) and the same size (ratio of
    // spreads). Not identical: PTB-XL filtered its 100 Hz files.
    const idx = site.kors.leads.map((l) => ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'].indexOf(l))
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
    for (const c of cases) {
      const lo = load(`${c.id}.json`)
      const hi = load(`${c.id}.vcg.json`)
      for (const axis of ['X', 'Y', 'Z']) {
        const fromLeads = lo.signal[0].map((_, t) => idx.reduce((s, li, k) => s + site.kors[axis][k] * lo.signal[li][t], 0))
        const fromFile = hi[axis.toLowerCase()].filter((_, i) => i % 5 === 0)
        const [ma, mb] = [mean(fromLeads), mean(fromFile)]
        const cov = fromLeads.reduce((s, a, i) => s + (a - ma) * (fromFile[i] - mb), 0)
        const [va, vb] = [fromLeads.reduce((s, a) => s + (a - ma) ** 2, 0), fromFile.reduce((s, b) => s + (b - mb) ** 2, 0)]
        expect(cov / Math.sqrt(va * vb), `${c.id} ${axis} correlation`).toBeGreaterThan(0.85)
        const ratio = Math.sqrt(vb / va)
        expect(ratio, `${c.id} ${axis} scale`).toBeGreaterThan(0.8)
        expect(ratio, `${c.id} ${axis} scale`).toBeLessThan(1.25)
      }
    }
  })

  it('noise an earlier beat finder took for beats is not counted (every ECG was also checked by eye)', () => {
    const beats = (id) => load(`${id}.vcg.json`).qrs_s
    const near = (id, t, tol) => beats(id).some((q) => Math.abs(q - t) <= tol)
    // 14729: a burst in V5/V6 at 1.77 s once replaced the real beat at 1.55 s
    expect(near(14729, 1.55, 0.02)).toBe(true)
    expect(near(14729, 1.77, 0.1)).toBe(false)
    // 12991: a spike at 4.75 s; 9211: noise at 2.55 s and 3.5 s, next to a real small beat at 3.3 s
    expect(near(12991, 4.75, 0.1)).toBe(false)
    expect(near(9211, 2.55, 0.1) || near(9211, 3.5, 0.1)).toBe(false)
    expect(near(9211, 3.3, 0.02)).toBe(true)
    // 7354: noisy throughout; ten beats, not the fourteen once found
    expect(beats(7354)).toHaveLength(10)
    // and the page passes on PTB-XL's own noise notes, so the burst left in 14729's beat 3 is explained
    expect(cases.every((c) => typeof c.noise === 'object')).toBe(true)
    expect(cases.find((c) => c.id === 14729).noise.bursts).toBe('V5, V6')
  })

  it('each beat stays clear of its neighbours, and its quietest 20 ms before the QRS sits at the origin', () => {
    for (const c of cases) {
      const v = load(`${c.id}.vcg.json`)
      for (const k of usableBeats(v)) {
        const w = beatWindow(v, k)
        const [q, prev, next] = [v.qrs_s[k], v.qrs_s[k - 1], v.qrs_s[k + 1]]
        const [first, last] = [w.times[0], w.times.at(-1)]
        const tag = `${c.id} beat ${k}`
        // the whole QRS is in the window, with room before it for the zero point
        expect(first, tag).toBeLessThanOrEqual(q - 0.12 + 1e-9)
        expect(last, tag).toBeGreaterThanOrEqual(q + 0.14)
        // and none of the previous beat's QRS or the next one's
        if (prev != null) expect(first, tag).toBeGreaterThanOrEqual(prev + 0.6 * (q - prev) - 1 / v.fs)
        if (next != null) expect(last, tag).toBeLessThanOrEqual(next - 0.08 + 1 / v.fs)
        // the quiet stretch lies inside the window and ends at least 40 ms before the QRS middle
        const i0 = Math.round((w.quietTime - first) * v.fs)
        expect(i0, tag).toBeGreaterThanOrEqual(0)
        expect(w.quietTime + 0.02, tag).toBeLessThanOrEqual(q - 0.04 + 1e-9)
        const quiet = w.points.slice(i0, i0 + 10)
        for (let a = 0; a < 3; a++) expect(quiet.reduce((s, p) => s + p[a], 0) / 10, tag).toBeCloseTo(0, 6)
      }
    }
  })

  it('beats in the first and last 0.15 s, or closer than 0.3 s to a neighbour, are not offered', () => {
    const v = { fs: 500, x: new Array(5000).fill(0), qrs_s: [0.1, 0.9, 5, 9.86] }
    expect(usableBeats(v)).toEqual([1, 2])
    expect(usableBeats({ ...v, qrs_s: [0.15, 0.25, 0.8, 1.4] })).toEqual([2, 3])
  })
})
