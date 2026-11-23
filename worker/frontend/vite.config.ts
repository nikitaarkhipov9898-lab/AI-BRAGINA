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
        id: "/",
        name: "СОЮЗ",
        short_name: "СОЮЗ",
        description: "СОЮЗ — единая цифровая система технологического будущего.",
        lang: "ru",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        theme_color: "#1b2b2c",
        background_color: "#e9e3d4",
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
            options: { cacheName: "soyuz-images", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } },
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
