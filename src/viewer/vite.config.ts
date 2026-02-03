import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/dotto": "http://localhost:5000",
      "/run": "http://localhost:5000",
      "/feedback": "http://localhost:5000",
      "/artifacts": "http://localhost:5000",
      "/examples": "http://localhost:5000",
      "/memory": "http://localhost:5000",
      "/healthz": "http://localhost:5000",
    },
  },
});
