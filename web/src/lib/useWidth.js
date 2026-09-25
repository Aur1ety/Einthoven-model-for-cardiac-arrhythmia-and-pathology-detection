import { useLayoutEffect, useState } from 'react'

/**
 * The rendered width of an element in CSS px, kept current with a ResizeObserver. Pass the element itself
 * (from a callback ref: `const [el, setEl] = useState(null)` ... `ref={setEl}`), so the hook re-measures when it mounts.
 * The first reading is taken before paint, so size-dependent labels never flash at the wrong size.
 * Returns `fallback` until measured, while the element is hidden (width 0), and in jsdom (no layout, no ResizeObserver).
 * Changes under half a pixel are ignored, so sub-pixel jitter does not redraw the chart.
 */
export function useRenderedWidth(el, fallback) {
  const [px, setPx] = useState(fallback)
  useLayoutEffect(() => {
    if (!el) return undefined
    const read = (w) => {
      if (w > 0) setPx((prev) => (Math.abs(prev - w) < 0.5 ? prev : w)) // 0 while hidden: keep the last width
    }
    read(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => read(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return px
}
