import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const host = process.env.TAURI_DEV_HOST;

// Plugin to remove crossorigin from built HTML
function removeCrossorigin() {
  return {
    name: "remove-crossorigin",
    closeBundle() {
      const htmlPath = path.resolve(__dirname, "../src/web/react_dist/index.html");
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, "utf-8");
        html = html.replace(/ crossorigin/g, "");
        fs.writeFileSync(htmlPath, html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), removeCrossorigin()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../src/web/react_dist",
    emptyOutDir: true,
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  clearScreen: false,
});
