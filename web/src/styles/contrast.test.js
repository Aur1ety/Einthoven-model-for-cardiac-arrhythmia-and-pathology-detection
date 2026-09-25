// Pins the "Five Inks" palette in index.css with the WCAG 2 contrast formula: every text token
// must reach 4.5:1 on every surface it can sit on, every mark, rule, frame and focus ring 3:1
// (WCAG 1.4.11), and the accent must hold 3:1 on the ECG paper and on its 5 mm grid lines,
// where it draws the time cursor. It also pins the colour rules the design depends on: NORM is
// not green, the classes are distinct from each other and from the accent (also under simulated
// colour blindness), the accent is used only for "now", selected and focus (in the stylesheet
// and in the components that paint SVG with it), and nothing is borrowed from the NeuroPharma site.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, 'index.css'), 'utf8')
const pkg = JSON.parse(readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8'))
const SRC = path.join(here, '..')
// every component and module under src (not the tests), keyed by its path relative to src with forward slashes
const sources = readdirSync(SRC, { recursive: true })
  .map((f) => String(f).split(path.sep).join('/'))
  .filter((f) => /\.jsx?$/.test(f) && !/\.test\.jsx?$/.test(f))
  .map((f) => [f, readFileSync(path.join(SRC, f), 'utf8')])

// the first :root block holds the design tokens; later :root blocks (prefers-contrast) override some
const root = css.match(/:root\s*\{([^}]*)\}/)[1]
const token = (name) => {
  const m = root.match(new RegExp(`(?:^|[\\s;{])--${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`token --${name} missing from :root`)
  const v = m[1].trim()
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  if (ref) return token(ref[1])
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`token --${name} is not a 6-digit hex: ${v}`)
  return v.toLowerCase()
}

// ---------- WCAG 2 relative luminance and contrast ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hsl = (hex) => {
  const [r, g, b] = rgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

// ---------- CIELAB (D65) and CIEDE2000, with Machado et al. (2009) colour-blindness simulation at full severity ----------
const CVD = {
  normal: null,
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lab = (hex, sim = 'normal') => {
  let lin = rgb(hex).map(toLinear)
  const m = CVD[sim]
  if (m) lin = m.map((row) => clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))
  const [r, g, b] = lin
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const de00 = ([L1, a1, b1], [L2, a2, b2]) => {
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cb7 = ((C1 + C2) / 2) ** 7
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = (deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2p = (deg(Math.atan2(b2, a2p)) + 360) % 360
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dh = h2p - h1p
  if (C1p * C2p === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2))
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  }
  const T =
    1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63))
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = -Math.sin(rad(2 * dTheta)) * RC
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH))
}
const dE = (a, b, sim = 'normal') => de00(lab(a, sim), lab(b, sim))

// ---------- what sits on what ----------
const SURFACES = ['ground', 'plate', 'wash'] // page, figure plates and plot fields, hovered rows and the score-bar track
const CLASSES = ['cls-CD', 'cls-HYP', 'cls-MI', 'cls-NORM', 'cls-STTC']
// text colours: body, secondary, faint, the accent (focus ring and any "now" label), class tags and codes
const TEXT = ['ink', 'ink-2', 'ink-3', 'madder', ...CLASSES]
// marks: control borders, plot frames and axes, open histogram bars, the ECG sheet frame, the accent, class lines and bars
const MARKS = ['rule-strong', 'ink-3', 'graphite', 'paper-edge', 'madder', ...CLASSES]
// [foreground, background, what it is]: text pairs need 4.5:1
const TEXT_PAIRS = [
  ['ground', 'ink', 'current tab, skip link and the selected record ID reversed out of ink'],
  ['ink', 'paper', 'ECG lead labels on the paper'],
  ['ink-2', 'paper', 'the loading sentence on the blank ECG sheet'],
  ['ink-2', 'grid-major', 'loading sentence crossing a 5 mm line'],
  ['ink-2', 'band', 'residual scale label over the tolerance band'],
]
// graphics and UI pairs need 3:1
const MARK_PAIRS = [
  ['madder', 'paper', 'ECG time cursor on the paper'],
  ['madder', 'grid-major', 'ECG time cursor on a 5 mm grid line'],
  ['madder', 'grid-minor', 'ECG time cursor on a 1 mm grid line'],
  ['madder', 'plate', 'slider thumb, 3D arrow and tip, row pointer'],
  ['paper-edge', 'paper', 'ECG sheet frame against the sheet'],
  ['paper-edge', 'ground', 'ECG sheet frame against the page'],
  ['trace', 'paper', 'ECG trace and calibration pulse'],
  ['trace', 'grid-major', 'ECG trace crossing a 5 mm line'],
  ['ink-3', 'band', 'tolerance-band edges against the band'],
  ['ink-3', 'plate', 'tolerance-band edges, axes and zero lines on the plot field'],
  ['ink', 'band', 'residual trace inside the band'],
  ['ink', 'plate', 'solid (over-tolerance) histogram bars, VCG QRS run'],
  ['ink-2', 'plate', 'VCG P/T run'],
  ['graphite', 'plate', 'outline of open (within-tolerance) histogram bars'],
  ['rule-strong', 'plate', 'button and select borders, plot frames, slider track, the 3D view’s axis triad'],
  ['rule-strong', 'wash', 'button border while hovered'],
]

// every hex in the NeuroPharma frontend stylesheet and components (read once, 2026-09-25): none may be reused
const NEUROPHARMA = `#0b0c0c #0f2c52 #163d70 #1b1f24 #1d4f91 #4a5361 #5d6776 #6b21a8 #6b5300 #6b7480 #7a8391 #8a4600
#8f6c00 #9a3412 #9aa3ad #b42318 #b8c0ca #b9cbe6 #c9d6ea #d46e00 #d7c2ef #d8dde3 #e2b13c #e3e7eb #e4e8ec #e8eef7 #eef0f2
#efc3a8 #f0a93b #f0f4fa #f1f3f5 #f3ecfa #f6e3a8 #f7f8f9 #fbeee6 #ffdd00 #ffffff`.split(/\s+/)

describe('colour contrast (WCAG 2)', () => {
  it('the contrast maths reproduces known values', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(ratio('#1e1b16', '#f6f2e9')).toBeCloseTo(15.36, 1) // ink on ground, as the design states
  })

  for (const t of TEXT) {
    it(`--${t} is at least 4.5:1 as text on ${SURFACES.join(', ')}`, () => {
      for (const s of SURFACES) expect(ratio(token(t), token(s)), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const m of MARKS) {
    it(`--${m} is at least 3:1 as a mark on ${SURFACES.join(', ')}`, () => {
      for (const s of SURFACES) expect(ratio(token(m), token(s)), `${m} on ${s}`).toBeGreaterThanOrEqual(3)
    })
  }

  for (const [fg, bg, use] of TEXT_PAIRS) {
    it(`--${fg} on --${bg} is at least 4.5:1 (${use})`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const [fg, bg, use] of MARK_PAIRS) {
    it(`--${fg} on --${bg} is at least 3:1 (${use})`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(3)
    })
  }

  it('the closest calls stay pinned: HYP and STTC on the hover wash, rule-strong on the wash', () => {
    expect(ratio(token('cls-HYP'), token('wash'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('cls-STTC'), token('wash'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('rule-strong'), token('wash'))).toBeGreaterThanOrEqual(3)
  })

  it('the focus ring is the accent, 3px wide with a 2px gap, so it meets 3:1 against the surface round any element', () => {
    expect(token('focus')).toBe(token('madder'))
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline:\s*3px solid var\(--focus\)[^}]*outline-offset:\s*2px/)
    for (const s of [...SURFACES, 'paper']) expect(ratio(token('focus'), token(s)), `focus on ${s}`).toBeGreaterThanOrEqual(3)
  })
})

describe('colour rules', () => {
  it('NORM is not green, not grey, and not one of the text inks', () => {
    const { h, s } = hsl(token('cls-NORM'))
    expect(h < 90 || h > 170, `NORM hue ${Math.round(h)}`).toBe(true)
    expect(s).toBeGreaterThan(0.3)
    expect(token('cls-NORM')).not.toBe(token('ink-2'))
    expect(token('cls-NORM')).not.toBe(token('ink-3'))
    expect(dE(token('cls-NORM'), token('ink')), 'NORM vs ink').toBeGreaterThanOrEqual(20)
  })

  it('no class colour is the accent or the ink, and the five classes are all different', () => {
    const cls = CLASSES.map(token)
    expect(new Set(cls).size).toBe(5)
    for (const c of cls) {
      expect(c).not.toBe(token('madder'))
      expect(c).not.toBe(token('ink'))
    }
  })

  it('the classes stay at least 10 ΔE00 apart, in normal vision and under simulated protan, deutan and tritan vision', () => {
    for (const sim of Object.keys(CVD))
      for (let i = 0; i < CLASSES.length; i++)
        for (let j = i + 1; j < CLASSES.length; j++)
          expect(dE(token(CLASSES[i]), token(CLASSES[j]), sim), `${CLASSES[i]} vs ${CLASSES[j]} (${sim})`).toBeGreaterThanOrEqual(10)
  })

  it('the accent stays at least 10 ΔE00 from every class, in normal vision and under simulated colour blindness', () => {
    for (const sim of Object.keys(CVD))
      for (const c of CLASSES) expect(dE(token('madder'), token(c), sim), `madder vs ${c} (${sim})`).toBeGreaterThanOrEqual(10)
  })

  it('no hue from yellow-green to teal appears anywhere in the stylesheet (nothing reads as "safe")', () => {
    for (const hex of css.match(/#[0-9a-fA-F]{6}\b/g)) {
      const { h, s } = hsl(hex)
      if (s > 0.2) expect(h < 75 || h > 175, `${hex} (hue ${Math.round(h)}) is green`).toBe(true)
    }
  })

  // A selector may paint with the accent only if it is a token definition, a focus rule, a selected rule or the range
  // input (the slider marks the current instant). Checked per selector in a list, and anchored, so '.unfocused' or
  // '.orange-x' does not pass by containing 'focus' or 'range'.
  const accentAllowed = (list) =>
    list
      .split(',')
      .map((p) => p.trim())
      .every((p) => /^:root$|^@theme\b|:focus-visible\b|\[aria-current='(?:page|true)'\]|^input\[type='range'\]/.test(p))

  it('the accent rule checker rejects look-alike selectors', () => {
    for (const ok of [':root', '@theme inline', ":where(:focus-visible:not([tabindex='-1']))", "input[type='range']::-moz-range-thumb", ".row-btn[aria-current='true']::before"])
      expect(accentAllowed(ok), ok).toBe(true)
    for (const bad of ['.unfocused', '.orange-x', '.focus-note', '.cap-lead', "a:focus-visible, .cap-lead", '.x input[type="range"]'])
      expect(accentAllowed(bad), bad).toBe(false)
  })

  it('in the stylesheet, the accent is used only for focus, the selected item and the current instant (slider)', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    let uses = 0
    for (const [, prelude, body] of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/var\(--(madder|focus)\)/.test(body)) continue
      uses++
      const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim() // drop any @import statements before the first rule
      expect(accentAllowed(selector), `accent used in "${selector}"`).toBe(true)
    }
    expect(uses).toBeGreaterThan(0) // the scan itself works
  })

  it('in the components, the accent is painted only by the ECG time cursor and the 3D view’s arrow', () => {
    // var(--madder) or var(--focus) in an SVG attribute or a style, or a Tailwind utility made from --color-madder
    const accent = /var\(--(?:madder|focus)\)|\b[\w-]+-madder\b/g
    const found = {}
    for (const [file, text] of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      for (const m of code.matchAll(accent)) {
        found[file] = (found[file] ?? 0) + 1
        const before = code.slice(Math.max(0, m.index - 400), m.index)
        if (file === 'components/EcgPaper.jsx') expect(before, 'EcgPaper: only the cursor line').toMatch(/x1=\{cursorX\}/)
        else if (file === 'components/Vcg3D.jsx') expect(before, 'Vcg3D: only the moving arrow').toMatch(/\{tip && \(/)
      }
    }
    // a new use must be added here on purpose: EcgPaper's cursor line, and Vcg3D's arrow group (fill) and shaft (stroke)
    expect(found).toEqual({ 'components/EcgPaper.jsx': 1, 'components/Vcg3D.jsx': 2 })
  })

  it('links are underlined, so they do not rely on colour alone (WCAG 1.4.1)', () => {
    expect(css).toMatch(/\n\s*a\s*\{[^}]*text-decoration-line:\s*underline/)
  })

  it('asking for more contrast turns the faint ink, the strong rule and the other light marks into ink', () => {
    const block = css.match(/@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{([^}]*)\}/)
    expect(block, 'a prefers-contrast: more block').not.toBeNull()
    for (const t of ['ink-3', 'rule-strong', 'graphite', 'paper-edge']) expect(block[1]).toMatch(new RegExp(`--${t}:\\s*var\\(--ink\\)`))
  })

  it('forced-colours mode has its own rules for the current tab and the selected row', () => {
    const block = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(block).toMatch(/\.tab\[aria-current='page'\]/)
    expect(block).toMatch(/\.row-btn\[aria-current='true'\] \.row-id/)
  })

  it('in forced-colours mode, every focusable element that opts out of forced colours gets a system-coloured focus ring', () => {
    // forced-color-adjust: none keeps the crimson ring too, which a dark theme's black Canvas hides
    const block = css.slice(css.indexOf('@media (forced-colors: active)'))
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '')
    const ringed = [...code.matchAll(/([^{}]+):focus-visible\s*\{[^}]*outline-color:\s*(?:Highlight|CanvasText)/g)].flatMap(([, s]) =>
      s.split(',').map((p) => p.trim().replace(/:focus-visible$/, '')),
    )
    // the opted-out selectors that can take focus themselves (not a part inside them, such as .tab-num or ::-webkit-slider-thumb)
    const optedOut = [...code.matchAll(/([^{}]+)\{[^}]*forced-color-adjust:\s*none/g)]
      .flatMap(([, s]) => s.split(',').map((p) => p.trim()))
      .filter((p) => /^(?:\.tab|input|button|a|select|\.btn|\.row-btn)(?:\[[^\]]*\])*$/.test(p))
    expect(optedOut.length).toBeGreaterThan(0)
    for (const p of optedOut) expect(ringed, `focus ring for ${p}`).toContain(p)
  })
})

describe('distinct from the NeuroPharma site', () => {
  it('the page ground is warm paper, not white', () => {
    expect(token('ground')).not.toBe('#ffffff')
    const { h, s } = hsl(token('ground'))
    expect(h).toBeGreaterThan(20)
    expect(h).toBeLessThan(60)
    expect(s).toBeGreaterThan(0.2)
  })

  it('no colour in the stylesheet is a NeuroPharma colour', () => {
    for (const hex of css.match(/#[0-9a-fA-F]{6}\b/g)) expect(NEUROPHARMA, hex).not.toContain(hex.toLowerCase())
  })

  it('the accent is at least 10 ΔE00 from every NeuroPharma colour (in particular its #9a3412)', () => {
    for (const np of NEUROPHARMA) expect(dE(token('madder'), np), `madder vs ${np}`).toBeGreaterThanOrEqual(10)
  })

  it('there is no yellow focus ring, no Inter and no card', () => {
    expect(css).not.toMatch(/ffdd00|--focus-ink|box-shadow:\s*0 0 0 5px/i)
    expect(css).not.toMatch(/Inter Variable|fontsource-variable\/inter/i)
    expect(css).not.toMatch(/\.card\b/)
    expect(Object.keys(pkg.dependencies)).not.toContain('@fontsource-variable/inter')
    for (const p of ['literata', 'source-sans-3', 'source-code-pro']) expect(Object.keys(pkg.dependencies)).toContain(`@fontsource-variable/${p}`)
  })
})
