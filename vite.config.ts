import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { posix, relative, resolve, sep } from 'node:path'

// Folders whose files only reach the browser through the API (server/routes/packs.py).
const SERVER_ONLY = ['packs', 'schemas']

// The dev server serves any file in the project, not just public/, so refuse these folders
// the same as a production build, which doesn't contain them. Paths are decoded and
// normalised first, and /@fs/ (Vite's direct file access) is checked too, so "%70acks",
// "./packs" and "/@fs/..." don't slip past.
function hideServerOnlyFolders(): Plugin {
  let root = ''
  const hidden = () => SERVER_ONLY.map(folder => resolve(root, folder))
  const inside = (file: string, folder: string) => {
    const rel = relative(folder, file)
    return rel === '' || (!rel.startsWith('..') && !rel.includes(':') && !rel.startsWith(sep))
  }
  const refused = (url: string) => {
    let path: string
    try {
      path = decodeURIComponent(url.split(/[?#]/)[0])
    } catch {
      return true
    }
    path = posix.normalize(path.replace(/\\/g, '/'))
    const candidates = [resolve(root, '.' + path)]
    if (path.startsWith('/@fs/')) {
      const target = path.slice('/@fs/'.length)
      candidates.push(resolve(target), resolve(root, target))
    }
    return candidates.some(file => hidden().some(folder => inside(file, folder)))
  }
  return {
    name: 'quill-hide-server-only-folders',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url && refused(request.url)) {
          response.statusCode = 404
          response.end()
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), hideServerOnlyFolders()],
  server: {
    // Same-origin requests to the Flask API, so it needs no CORS.
    proxy: { '/api': 'http://localhost:5174' },
    // Vite's own file-access block list, as a second layer.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', ...SERVER_ONLY.map(folder => `**/${folder}/**`)] },
  },
})
