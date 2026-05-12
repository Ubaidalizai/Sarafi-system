/**
 * JSON API origin. Set `VITE_API_BASE_URL` in `.env` / `.env.production` (no trailing slash), e.g.
 * `https://api.example.com` or `http://127.0.0.1:4000`. Defaults to local dev backend.
 */
export function getApiBaseUrl(): string {
  const v = import.meta.env.VITE_API_BASE_URL;
  if (typeof v === "string" && v.trim()) return v.trim().replace(/\/+$/, "");
  return "http://localhost:4000";
}

export const API_BASE_URL = getApiBaseUrl();

/** `path` should start with `/` (e.g. `/customers` or `/slips?status=paid`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}
