import axios from "axios";

// Vite proxies /api to the Flask server in dev.
export const apiClient = axios.create({ baseURL: "/api" });

// Pages that work without signing in; a 401 there is handled by the page itself.
const PUBLIC_PAGES = ['/login', '/setup', '/join/'];

// A 401 means the session is missing or expired: go to the login page, then come back.
apiClient.interceptors.response.use(undefined, error => {
    const path = window.location.pathname;
    if (error.response?.status === 401 && !PUBLIC_PAGES.some(page => path.startsWith(page))) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.assign(`/login?next=${next}`);
    }
    return Promise.reject(error);
});
