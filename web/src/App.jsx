import { useEffect, useState } from 'react'
import Explorer from './components/Explorer'
import AuditView from './components/AuditView'
import ResultsView from './components/ResultsView'
import MethodView from './components/MethodView'
import { useSite } from './lib/data'

const TABS = [
  ['explorer', 'ECG explorer'],
  ['audit', 'Data audit'],
  ['results', 'Results'],
  ['method', 'Method & limitations'],
]
const routeOf = () => {
  const h = window.location.hash.replace('#', '')
  return TABS.some(([k]) => k === h) ? h : 'explorer'
}

function useRoute() {
  const [route, setRoute] = useState(routeOf)
  useEffect(() => {
    const on = () => {
      const next = routeOf()
      setRoute(next)
      window.scrollTo(0, 0)
      document.getElementById('main')?.focus()
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    document.title = `${TABS.find(([k]) => k === route)[1]} · Einthoven`
  }, [route])
  return route
}

function Logo() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M4 18h6l2-5 3 10 3-15 2.5 10H28" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function App() {
  const route = useRoute()
  const { data: site, error } = useSite()

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        onClick={(e) => {
          // the site routes on the hash, so following "#main" would switch to the explorer tab: focus instead
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--focus)] focus:text-[var(--focus-ink)] focus:font-semibold">
        Skip to content
      </a>
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#explorer" className="flex items-center gap-2.5 no-underline text-foreground">
            <Logo />
            <span className="text-[18px] font-bold">Einthoven</span>
            <span className="hidden sm:inline text-muted-foreground">ECG diagnosis on PTB-XL</span>
          </a>
          <nav aria-label="Sections" className="w-full flex gap-5 overflow-x-auto">
            {TABS.map(([k, label]) => (
              <a key={k} href={`#${k}`} className="tab whitespace-nowrap" aria-current={route === k ? 'page' : undefined}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <aside aria-label="About this site" className="border-b bg-[var(--surface)]">
        <p className="max-w-6xl mx-auto px-4 md:px-6 py-2 text-[14px]">
          <strong className="chip mr-2" style={{ color: 'var(--link)' }}>Research demo</strong>
          Not a medical device. Nothing on this site is a diagnosis or medical advice.
        </p>
      </aside>

      <main id="main" tabIndex={-1} className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-8 outline-none">
        {error && <p className="t-body">The site data could not load. Reloading the page usually fixes it.</p>}
        {!site && !error && <p className="t-body text-muted-foreground">Loading…</p>}
        {site && route === 'explorer' && <Explorer site={site} />}
        {site && route === 'audit' && <AuditView site={site} />}
        {site && route === 'results' && <ResultsView site={site} />}
        {site && route === 'method' && <MethodView site={site} />}
      </main>

      <footer className="border-t">
        <p className="max-w-6xl mx-auto px-4 md:px-6 py-4 t-micro">
          ECGs: <a href="https://physionet.org/content/ptb-xl/1.0.3/">PTB-XL</a> (Wagner et al., 2020), a subset converted to
          JSON, licensed <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. A student research project.
        </p>
      </footer>
    </div>
  )
}
