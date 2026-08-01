import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

export const vitePort = Number.parseInt(process.env.VITE_PORT ?? "3000", 10);
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.PORT ?? "3001";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Custom plugin to handle source map requests
    {
      name: "handle-source-map-requests",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Check if the request is for a source map file
          if (req.url && req.url.endsWith(".map")) {
            // Rewrite the URL to remove the query string that's causing the issue
            const cleanUrl = req.url.split("?")[0];
            req.url = cleanUrl;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "./client/src"),
    },
  },
  root: path.join(process.cwd(), "client"),
  build: {
    outDir: path.join(process.cwd(), "dist/public"),
    emptyOutDir: true,
  },
  clearScreen: false,
  server: {
    hmr: {
      overlay: false,
    },
    host: "127.0.0.1",
    port: vitePort,
    strictPort: true,
    proxy: {
      "/api/": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  // Enable source maps for development
  css: {
    devSourcemap: true,
  },
});
