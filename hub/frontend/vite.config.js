import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend is FastAPI (hub/app/main.py), served separately in dev.
// `npm run dev` here only runs the frontend with hot-reloading; API calls
// are proxied to a locally-running `uvicorn app.main:app --port 8000` so
// the dev frontend hits the real backend instead of needing mocks. Not used
// in production -- there, main.py serves this project's own `dist/` output
// as static files, no proxy involved.
export default defineConfig({
  // main.py serves the built output from app/static/, mounted at /static --
  // matching that prefix here means built asset URLs (/static/assets/...)
  // resolve against the existing mount with no backend changes needed.
  base: "/static/",
  plugins: [react()],
  server: {
    proxy: {
      "/health": "http://localhost:8000",
      "/login": "http://localhost:8000",
      "/auth/callback": "http://localhost:8000",
      "/api": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
  },
});
