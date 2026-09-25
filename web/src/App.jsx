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

// Einthoven's triangle: RA top left, LA top right, LL at the apex, an electrode at each corner.
// Ink only: the crimson accent is kept for "now", the selected item and focus. Drawn in currentColor (the link's ink),
// so a forced-colours theme recolours it with the wordmark instead of leaving ink on a dark page.
function Logo() {
  return (
    <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32" className="shrink-0">
      <path d="M4 7h24L16 27z" fill="none" stroke="currentColor" strokeWidth="1.87" strokeLinejoin="round" />
      <circle cx="4" cy="7" r="3" fill="currentColor" />
      <circle cx="28" cy="7" r="3" fill="currentColor" />
      <circle cx="16" cy="27" r="3" fill="currentColor" />
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
        className="skip-link">
        Skip to content
      </a>
      {/* the banner holds the title and the tabs; the "About this site" aside stays a top-level landmark after it.
          The stylesheet draws the aside between the title and the rule (.masthead). */}
      <div className="page masthead">
        <header className="masthead-banner">
          <div className="masthead-title">
            <a href="#explorer" className="wordmark-link">
              <Logo />
              <span className="wordmark">Einthoven</span>
              <span className="descriptor">ECG diagnosis on PTB-XL</span>
            </a>
          </div>
          <div className="rule-double" aria-hidden="true" />
          {/* on a narrow screen the tabs scroll sideways: bring a tab that takes focus fully into view, ring included */}
          <nav aria-label="Sections" className="nav" onFocus={(e) => e.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}>
            {TABS.map(([k, label], i) => (
              <a key={k} href={`#${k}`} className="tab" aria-current={route === k ? 'page' : undefined}>
                <span aria-hidden="true" className="tab-num">
                  {i + 1}
                </span>
                {label}
              </a>
            ))}
          </nav>
        </header>
        <aside aria-label="About this site" className="masthead-status">
          <p className="status-line">
            <strong className="status-lead">Research demo.</strong> Not a medical device. Nothing on this site is a diagnosis or
            medical advice.
          </p>
        </aside>
      </div>

      <main id="main" tabIndex={-1} className="page flex-1 py-10 outline-none">
        {error && <p className="t-body">The site data could not load. Reloading the page usually fixes it.</p>}
        {!site && !error && <p className="t-body text-ink-2">Loading…</p>}
        {site && route === 'explorer' && <Explorer site={site} />}
        {site && route === 'audit' && <AuditView site={site} />}
        {site && route === 'results' && <ResultsView site={site} />}
        {site && route === 'method' && <MethodView site={site} />}
      </main>

      <footer className="page mt-8">
        <div className="rule-double-inv" aria-hidden="true" />
        <p className="colophon">
          ECGs: <a href="https://physionet.org/content/ptb-xl/1.0.3/">PTB-XL</a> (Wagner et al., 2020), a subset converted to
          JSON, licensed <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. A student research project.
        </p>
      </footer>
    </div>
  )
}
