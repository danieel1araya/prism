import { defineConfig } from 'vite'
import { searchItunes } from './api/_itunes.js'

// Vercel serves api/search.js as a serverless function in production.
// `vite dev` has no idea that folder exists, so locally the /api/search
// fetch in src/ui/UI.js used to 404 and the search box silently failed.
// This plugin mounts the same handler as dev-server middleware so
// `npm run dev` behaves like the deployed site.
function itunesProxyPlugin() {
  return {
    name: 'itunes-search-proxy',
    configureServer(server) {
      server.middlewares.use('/api/search', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const term = url.searchParams.get('term') ?? ''
        const limit = url.searchParams.get('limit') ?? '50'
        const country = url.searchParams.get('country') ?? 'US'

        try {
          const { status, body } = await searchItunes({ term, limit, country })
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: true, message: err.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [itunesProxyPlugin()],
})
