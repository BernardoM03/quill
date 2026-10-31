import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Serves /packs/index.json: the ids of every folder under public/packs that holds a
// pack.json. Read fresh on each request in dev and written into the build, so
// installing a pack means dropping its folder in, not editing code.
function packIndex(): Plugin {
  let packsDir = ''
  const listPacks = () =>
    readdirSync(packsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(packsDir, entry.name, 'pack.json')))
      .map(entry => entry.name)
      .sort()

  return {
    name: 'quill-pack-index',
    configResolved(config) {
      packsDir = join(config.publicDir, 'packs')
    },
    configureServer(server) {
      server.middlewares.use('/packs/index.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(listPacks()))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'packs/index.json', source: JSON.stringify(listPacks()) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), packIndex()],
  server: {
    // Same-origin requests to the Flask API, so it needs no CORS.
    proxy: { '/api': 'http://localhost:5174' },
  },
})
