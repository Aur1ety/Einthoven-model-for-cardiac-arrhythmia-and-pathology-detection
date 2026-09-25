import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYOUT, X_PER_SAMPLE, Y_PER_UV, einthovenResidual, identityResiduals, paperLayout, tracePath } from './ecg'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data')
const site = JSON.parse(readFileSync(path.join(DATA, 'site.json'), 'utf8'))
const ecg = (id) => JSON.parse(readFileSync(path.join(DATA, 'ecg', `${id}.json`), 'utf8'))

describe('ECG paper geometry', () => {
  it('is drawn at clinical scale: 25 mm/s and 10 mm/mV (1 unit = 0.25 mm)', () => {
    expect(X_PER_SAMPLE * 100).toBe(25 * 4) // one second of samples spans 25 mm
    expect(1000 * Y_PER_UV).toBe(10 * 4) // one millivolt spans 10 mm
  })

  it('traces go up for positive voltage', () => {
    expect(tracePath([0, 1000], 0, 100)).toBe('M0.0 100.0L1.0 60.0')
  })

  it('lays out 12 leads in the standard 3 x 4 grid, 2.5 s each, plus a 10 s lead II strip', () => {
    const r = ecg(site.sample.cases[0].id)
    const p = paperLayout(r.leads, r.signal)
    expect(p.segments).toHaveLength(13)
    for (const s of p.segments.filter((x) => !x.rhythm)) expect(s.values).toHaveLength(250)
    expect(p.segments.at(-1)).toMatchObject({ lead: 'II', rhythm: true })
    expect(p.segments.at(-1).values).toHaveLength(1000)
    // each 2.5 s segment is the matching time window of its lead (column c starts at c x 2.5 s)
    LAYOUT.forEach((row) =>
      row.forEach((lead, c) => {
        const seg = p.segments.find((s) => s.lead === lead && !s.rhythm)
        expect(seg.values).toEqual(r.signal[r.leads.indexOf(lead)].slice(c * 250, c * 250 + 250))
      }),
    )
  })
})

describe('nothing is cut off', () => {
  it('every exported ECG trace stays inside the paper, however tall its waves', () => {
    for (const c of [...site.sample.cases, ...site.flagged]) {
      const r = ecg(c.id)
      const p = paperLayout(r.leads, r.signal)
      let lo = Infinity
      let hi = -Infinity
      for (const s of p.segments)
        for (const v of s.values) {
          const y = s.y0 - v * Y_PER_UV
          if (y < lo) lo = y
          if (y > hi) hi = y
        }
      expect(lo, `ECG ${c.id} top`).toBeGreaterThanOrEqual(-p.top)
      expect(hi, `ECG ${c.id} bottom`).toBeLessThanOrEqual(p.height + p.bottom)
    }
  })
})

describe('exported data', () => {
  it('every case and flagged record has a 12 x 1000 microvolt ECG file', () => {
    const ids = [...site.sample.cases, ...site.flagged].map((c) => c.id)
    // (the 3D view's *.vcg.json files sit alongside; they are checked in vcg.test.js)
    expect(readdirSync(path.join(DATA, 'ecg')).filter((f) => !f.endsWith('.vcg.json'))).toHaveLength(new Set(ids).size)
    for (const id of ids.slice(0, 20)) {
      const r = ecg(id)
      expect(r.signal).toHaveLength(12)
      for (const lead of r.signal) expect(lead).toHaveLength(1000)
    }
  })

  it('all four identity residuals computed here agree with the audit file, for every flagged record and 20 clean ones', () => {
    const peak = (xs) => Math.max(...xs.map(Math.abs))
    for (const c of [...site.flagged, ...site.sample.cases.slice(0, 20)]) {
      const r = ecg(c.id)
      const res = identityResiduals(r.leads, r.signal)
      expect(peak(einthovenResidual(r.leads, r.signal))).toBeCloseTo(c.audit.einthoven_max_uv, 6)
      expect(peak(res.avr)).toBeCloseTo(c.audit.avr_max_uv, 6)
      expect(peak(res.avl)).toBeCloseTo(c.audit.avl_max_uv, 6)
      expect(peak(res.avf)).toBeCloseTo(c.audit.avf_max_uv, 6)
    }
  })

  it('the explorer sample is 20 per class, test fold only, with a score for every class', () => {
    expect(site.sample.cases).toHaveLength(100)
    for (const c of site.sample.cases) {
      expect(c.fold).toBe(10)
      expect(Object.keys(c.scores)).toEqual(site.classes)
    }
    expect(site.flagged).toHaveLength(site.audit.flagged)
  })
})
