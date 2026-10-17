import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_API_BASE points the frontend at the Cloud Run backend in production.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
