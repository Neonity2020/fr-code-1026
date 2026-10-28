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
      "/api": process.env.PI_WEB_API_TARGET ?? "http://localhost:6115",
      "/ws": { target: (process.env.PI_WEB_WS_TARGET ?? process.env.PI_WEB_API_TARGET ?? "ws://localhost:6115").replace(/^http/, "ws"), ws: true },
    },
  },
});
