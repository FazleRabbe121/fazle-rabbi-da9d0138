/**
 * Standalone build of the ZENVIK-AGENT (CCD) app — used by its Express server (zenvik-server.ts)
 * and the Android APK scripts. The portfolio itself builds with vite.config.ts.
 *
 *   bun run build:zenvik   -> dist-zenvik/
 *   bun run zenvik:server  -> Express API + this app on http://localhost:3000
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const root = path.resolve(import.meta.dirname, "src/zenvik-agent");

export default defineConfig({
  root,
  // Relative asset paths so the bundle also works from file:///android_asset/dist/.
  base: "./",
  publicDir: path.resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-zenvik"),
    emptyOutDir: true,
  },
  server: {
    hmr: process.env["DISABLE_HMR"] !== "true",
    watch: process.env["DISABLE_HMR"] === "true" ? null : {},
  },
});
