import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const assetsOutput = fileURLToPath(new URL("./assets/", import.meta.url));

export default defineConfig({
  root: frontendRoot,
  base: "/",
  plugins: [react(), tailwindcss()],
  publicDir: false,
  build: {
    outDir: assetsOutput,
    emptyOutDir: false,
    assetsDir: "build",
    sourcemap: false,
  },
});
