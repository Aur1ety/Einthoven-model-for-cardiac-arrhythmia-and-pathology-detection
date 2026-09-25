import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // fonts are always emitted as files, never inlined into the CSS: each @font-face covers one unicode-range subset that the
  // browser downloads only if the page uses it, so an inlined subset (Vite inlines assets under 4 kB) would ship to every
  // visitor for nothing (Source Code Pro's Greek-extended subset did)
  build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') || file.endsWith('.woff') ? false : undefined) },
  test: { environment: 'jsdom' },
})
