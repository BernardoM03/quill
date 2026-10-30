import axios from "axios";

// Same-origin: Vite proxies /api to the Flask server in dev.
export const apiClient = axios.create({ baseURL: "/api" });
