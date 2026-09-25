// Everything the site shows is static JSON exported by scripts/export_site_data.py.
import { useEffect, useState } from 'react'

export const CLASS_NAMES = {
  CD: 'Conduction disturbance',
  HYP: 'Hypertrophy',
  MI: 'Myocardial infarction',
  NORM: 'Normal ECG',
  STTC: 'ST/T change',
}

export const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const cache = new Map()
function load(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
        return r.json()
      }),
    )
  }
  return cache.get(url)
}

function useJson(url) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    if (!url) return
    let live = true
    setState({ data: null, error: null })
    load(url)
      .then((data) => live && setState({ data, error: null }))
      .catch((error) => {
        cache.delete(url)
        if (live) setState({ data: null, error })
      })
    return () => {
      live = false
    }
  }, [url])
  return state
}

export const useSite = () => useJson('/data/site.json')
export const useEcg = (id) => useJson(id == null ? null : `/data/ecg/${id}.json`)
export const useVcg = (id) => useJson(id == null ? null : `/data/ecg/${id}.vcg.json`)
