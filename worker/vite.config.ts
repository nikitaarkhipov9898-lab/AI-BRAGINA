import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const assetsOutput = fileURLToPath(new URL("./assets/", import.meta.url));
const workerModules = fileURLToPath(new URL("./node_modules/", import.meta.url));

export default defineConfig({
  root: frontendRoot,
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: workerModules + "react/index.js" },
      { find: /^react\/jsx-runtime$/, replacement: workerModules + "react/jsx-runtime.js" },
      { find: /^react-dom$/, replacement: workerModules + "react-dom/index.js" },
      { find: /^react-dom\/client$/, replacement: workerModules + "react-dom/client.js" },
      { find: /^framer-motion$/, replacement: workerModules + "framer-motion" },
      { find: /^lucide-react$/, replacement: workerModules + "lucide-react" },
      { find: /^vaul$/, replacement: workerModules + "vaul" },
      { find: /^tailwindcss$/, replacement: workerModules + "tailwindcss" },
    ],
  },
  publicDir: false,
  build: {
    outDir: assetsOutput,
    emptyOutDir: false,
    assetsDir: "build",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    target: "esnext",
    sourcemap: false,
  },
});
