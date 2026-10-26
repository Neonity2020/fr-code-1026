import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "~": "/src",
      lucide: "lucide/dist/esm/lucide/src/lucide.js",
    },
  },
  server: {
    port: 6116,
    proxy: {
      "/api": "http://localhost:6115",
      "/ws": { target: "ws://localhost:6115", ws: true },
    },
  },
});
