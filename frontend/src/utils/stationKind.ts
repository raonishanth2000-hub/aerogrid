import type { Station } from '../types/api'

/** Whether station values are physical sensor measurements or modelled values (e.g. CAMS). */
export type StationKind = Station['source_type']

/** The kind reported by the data; modelled if any station says so (never overstated as measured). */
export function stationKindOf(stations: Station[]): StationKind {
  return stations.some((s) => s.source_type === 'modelled') ? 'modelled' : 'measured'
}

export const KIND_LABEL: Record<StationKind, string> = { measured: 'Measured', modelled: 'Modelled' }
export const KIND_ADJECTIVE: Record<StationKind, string> = { measured: 'measured', modelled: 'modelled' }
