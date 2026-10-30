### App


### API Layer
Front End calls API via apiClient:  axios.create({ baseURL: "/api" })
apiClient is capable of GET/POST/PATCH/DELETE/ETC... HTTP functions.
Vite proxies API calls to /api route with proxy: { '/api': '<endpoint>' } in vite.config.ts
API server is hosted currently on quill_data_layer.py


### Schema Layer 