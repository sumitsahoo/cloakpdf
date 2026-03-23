import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "BytePDF",
        short_name: "BytePDF",
        description:
          "Free, private, browser-based PDF toolkit — merge, split, compress, rotate, reorder, delete pages, add watermarks & signatures.",
        theme_color: "#2563EB",
        background_color: "#F0F4FA",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "icons/logo.svg",
            sizes: "any",
            type: "image/svg+xml",
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
            label: "BytePDF App on iPhone 14 Pro Max",
          },
          // iPad Pro (Landscape)
          {
            src: "screenshots/iPad.png",
            sizes: "2732x2048",
            type: "image/png",
            form_factor: "wide",
            label: "BytePDF App on iPad Pro Landscape",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "unpkg-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "jsdelivr-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
