// Project facts shown on the About page. Fill these in with the team —
// leave a list empty rather than guessing; the page shows "to be confirmed".

export interface ArchitectureComponent {
  service: string
  role: string
}

export interface DataSourceInfo {
  name: string
  description: string
  url?: string
}

/** AWS services actually used in the deployed pipeline. */
export const AWS_ARCHITECTURE: ArchitectureComponent[] = []

/** Air-quality and feature datasets used for training and prediction. */
export const DATA_SOURCES: DataSourceInfo[] = []

/** Third-party material the frontend itself uses. These are known. */
export const FRONTEND_ATTRIBUTION: DataSourceInfo[] = [
  { name: 'Basemap', description: 'Esri World Dark Gray Canvas; map data © OpenStreetMap contributors and others', url: 'https://www.esri.com/' },
  { name: 'Concentration bands', description: 'PM2.5 breakpoints from India’s National Air Quality Index (CPCB, 2014)', url: 'https://cpcb.nic.in/' },
  { name: 'Map library', description: 'Leaflet (BSD-2-Clause)', url: 'https://leafletjs.com/' },
]
