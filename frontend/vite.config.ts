import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "/",
  plugins: [react(), tailwindcss()],
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("../worker/assets/", import.meta.url)),
    emptyOutDir: false,
    assetsDir: "build",
    sourcemap: false,
  },
});
