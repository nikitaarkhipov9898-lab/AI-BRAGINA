import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        id: "/app-next",
        name: "СВОЁ",
        short_name: "СВОЁ",
        description: "Своя платформа для общения, дел и полезных помощников.",
        lang: "ru",
        start_url: "/app-next",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        theme_color: "#0077ff",
        background_color: "#f0f2f5",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/next/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: { cacheName: "svoe-images", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  base: "/next/",
  build: {
    outDir: "../assets/next",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
