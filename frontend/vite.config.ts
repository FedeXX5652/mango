import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// PWA instalable con el color de marca mango (#FDBE02). El SW se registra solo.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Sirve manifest + SW tambien en `npm run dev`, para verificar
      // instalabilidad en DevTools sin tener que hacer build/preview.
      devOptions: { enabled: true, type: "module" },
      // Los WASM de wa-sqlite (SQLite en el navegador) superan los 2 MB.
      workbox: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      includeAssets: [
        "icons/favicon.ico",
        "icons/svg/mango.svg",
        "icons/png/mango-apple-180.png",
        "icons/png/og-1200x630.png",
      ],
      manifest: {
        name: "Mango",
        short_name: "Mango",
        description: "Finanzas personales y compartidas",
        lang: "es-AR",
        theme_color: "#FDBE02",
        background_color: "#FFFCF5",
        display: "standalone",
        start_url: "/",
        // Estandar y enmascarable son archivos distintos a proposito: el
        // enmascarable tiene margen para el recorte (no compartir con purpose
        // "any maskable"). El de 512 es obligatorio para que Chrome ofrezca instalar.
        icons: [
          { src: "icons/png/mango-any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/png/mango-any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/png/mango-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/png/mango-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  // PowerSync usa web workers ESM y WASM (wa-sqlite); no se pre-bundlean.
  worker: { format: "es" },
  optimizeDeps: {
    exclude: ["@powersync/web", "@journeyapps/wa-sqlite"],
  },
})
