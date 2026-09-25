import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Vcg3D from './Vcg3D'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

beforeEach(() => {
  // serve the exported files the way the site would fetch them
  vi.stubGlobal('fetch', async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(PUBLIC, url), 'utf8')) }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('3D view controls', () => {
  it('stepping through every beat with the arrow at the end of a long beat never breaks the view', async () => {
    const seen = []
    // ECG 336 is a fast rhythm: its beats are cut short, so their lengths differ
    render(<Vcg3D id={336} onCursor={(t) => seen.push(t)} />)
    const next = await screen.findByRole('button', { name: 'Beat →' })
    const slider = screen.getByRole('slider')
    const alive = () => screen.queryByRole('heading', { name: 'The same heart in 3D' }) != null
    // bounded loops: if the view broke, its buttons would be gone and an unbounded loop would never end
    fireEvent.change(slider, { target: { value: slider.max } })
    for (let i = 0; i < 40 && alive() && !next.disabled; i++) fireEvent.click(next)
    expect(alive()).toBe(true)
    expect(next.disabled).toBe(true)
    const back = screen.getByRole('button', { name: '← Beat' })
    fireEvent.change(slider, { target: { value: slider.max } })
    for (let i = 0; i < 40 && alive() && !back.disabled; i++) fireEvent.click(back)
    expect(alive()).toBe(true)
    expect(back.disabled).toBe(true)
    const times = seen.filter((t) => t != null)
    expect(times.length).toBeGreaterThan(0)
    expect(times.every((t) => t >= 0 && t < 10)).toBe(true)
    expect(Number(slider.value)).toBeLessThanOrEqual(Number(slider.max))
  })

  it('names the slider position relative to the QRS, not as a time in the recording', async () => {
    render(<Vcg3D id={377} />)
    const slider = await screen.findByRole('slider')
    fireEvent.change(slider, { target: { value: 5 } }) // 10 ms into the beat, before the QRS
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^-\d+ milliseconds from the middle of the QRS/)
    expect(screen.getByRole('button', { name: /Play/ }).getAttribute('aria-pressed')).toBeNull()
  })
})
