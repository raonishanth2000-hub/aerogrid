import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // node_modules is a symlink to node_modules.nosync (kept out of iCloud). Keep the symlinked
    // path so Vite still recognises dependencies and pre-bundles CommonJS/UMD packages like Leaflet.
    preserveSymlinks: true,
  },
})
