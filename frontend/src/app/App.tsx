import { lazy, Suspense } from 'react'
import { LoadingState } from '../components/common/States'
import { AboutPage } from '../pages/AboutPage'
import { MonitoringGapsPage } from '../pages/MonitoringGapsPage'
import { OverviewPage } from '../pages/OverviewPage'
import { AmbientAir } from './AmbientAir'
import { AppLayout } from './AppLayout'
import { AppStateProvider } from './AppStateProvider'
import type { RouteId } from './navigation'
import { useHashRoute } from './useHashRoute'

// Chart-heavy pages are split out so the map dashboard loads without the chart library.
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const ModelPerformancePage = lazy(() => import('../pages/ModelPerformancePage').then((m) => ({ default: m.ModelPerformancePage })))

function Page({ route }: { route: RouteId }) {
  switch (route) {
    case 'analytics':
      return <AnalyticsPage />
    case 'model':
      return <ModelPerformancePage />
    case 'gaps':
      return <MonitoringGapsPage />
    case 'about':
      return <AboutPage />
    default:
      return <OverviewPage />
  }
}

export default function App() {
  const route = useHashRoute()
  return (
    <AppStateProvider>
      <AmbientAir />
      <AppLayout route={route}>
        <Suspense fallback={<LoadingState title="Loading page…" />}>
          <Page route={route} />
        </Suspense>
      </AppLayout>
    </AppStateProvider>
  )
}
