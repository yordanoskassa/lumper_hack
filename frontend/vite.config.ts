import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root feeds both halves; only VITE_-prefixed vars
  // reach the browser, so backend keys stay server-side by construction.
  envDir: path.resolve(__dirname, ".."),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    // Not 5173. That is the Vite default, so every other project on this
    // machine competes for it — and one of them wins on IPv6, which is what
    // `localhost` resolves to first. Typing localhost:5173 on stage loaded a
    // different product entirely.
    port: Number(process.env.PORT) || 5180,
    strictPort: false,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
