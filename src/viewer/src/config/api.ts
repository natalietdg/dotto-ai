// API configuration for production deployment
// In development, Vite proxy handles routing to localhost:5000
// In production, we need the full Render URL

export const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export function apiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
