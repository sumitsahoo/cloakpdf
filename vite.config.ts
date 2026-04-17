import { readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

declare const process: { env: Record<string, string | undefined> };

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/favicon.svg", "icons/favicon.ico", "icons/apple-touch-icon.png"],
      manifest: {
        name: "CloakPDF",
        short_name: "CloakPDF",
        description:
          "Free, private, browser-based PDF toolkit — merge, split, compress, rotate, reorder, delete pages, add watermarks & signatures.",
        theme_color: "#2563EB",
        background_color: "#F0F4FA",
        display: "standalone",
        orientation: "portrait",
        scope: process.env.VITE_APP_BASE_PATH || "/",
        start_url: process.env.VITE_APP_BASE_PATH || "/",
        icons: [
          {
            src: "icons/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          // Screenshots taken from Chrome Dev Tools. Actual resolution may vary.
          // iPhone 14 Pro Max (Portrait)
          {
            src: "screenshots/iPhone.png",
            sizes: "1290x2796",
            type: "image/png",
            form_factor: "narrow",
            label: "CloakPDF App on iPhone 14 Pro Max",
          },
          // iPad Pro (Landscape)
          {
            src: "screenshots/iPad.png",
            sizes: "2732x2048",
            type: "image/png",
            form_factor: "wide",
            label: "CloakPDF App on iPad Pro Landscape",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        navigationPreload: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "unpkg-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "jsdelivr-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tesseract-lang-cache",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // language data is versioned by URL
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
