/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEFAULT_CITY?: string
  readonly VITE_API_CITIES?: string
  readonly VITE_STALE_AFTER_MINUTES?: string
  readonly VITE_TILE_URL?: string
  readonly VITE_TILE_ATTRIBUTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
