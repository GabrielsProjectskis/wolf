/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `npm run preview` serves the production build with the same
 * Content-Security-Policy the desktop app enforces, so a CSP problem
 * shows up in the browser and in the end-to-end tests, not only after
 * a full native build. (The Tauri-only ipc: sources are left out.)
 */
const tauriCsp = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")).app
  .security.csp as Record<string, string>;
const previewCsp = Object.entries(tauriCsp)
  .map(([directive, value]) =>
    `${directive} ${value
      .split(" ")
      .filter((v) => !v.includes("ipc"))
      .join(" ")}`.trim(),
  )
  .join("; ");

// Tauri expects a fixed port and no obfuscated errors during dev.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: { "Content-Security-Policy": previewCsp },
  },
  build: {
    // Tauri uses WebView2 (Chromium) on Windows and WebKit on macOS/Linux.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // The PDF engine is loaded on demand and is large by nature.
    chunkSizeWarningLimit: 1800,
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/ui/**/*.test.tsx", "tests/pdf/**/*.test.tsx"],
    // Amsterdam is UTC+1/+2: the time zone where the original due-date
    // bug showed up. Tests that care about other zones set them inline.
    env: { TZ: "Europe/Amsterdam" },
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
  },
});
