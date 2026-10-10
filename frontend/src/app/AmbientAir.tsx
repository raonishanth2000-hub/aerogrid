import { useEffect } from 'react'
import { cityAirSummary } from '../utils/airSummary'
import { useApp } from './appContext'

/**
 * Tints the UI to match the city's air: sets `data-air` on <html> from the median
 * of the latest measured readings. Styling lives in styles/tokens.css.
 */
export function AmbientAir() {
  const { stationList } = useApp()
  const band = cityAirSummary(stationList)?.band.key ?? 'none'

  useEffect(() => {
    document.documentElement.dataset.air = band
  }, [band])

  return null
}
