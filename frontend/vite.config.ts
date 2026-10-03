import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

import { ATAJOS } from "./src/lib/atajos"

// Version de la app (0025): SemVer de package.json + el commit corto + la fecha
// de compilacion. El commit sale de APP_COMMIT (la imagen Docker no tiene .git:
// lo pasan el compose y release.sh) o de git en desarrollo.
const VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version
function commitActual(): string {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return ""
  }
}

// PWA instalable con el color de marca mango (#FDBE02). El SW se registra solo.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_COMMIT__: JSON.stringify(commitActual()),
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // El registro lo hace la app (lib/actualizacion.ts), no un script generico:
      // decide CUANDO recargar con la version nueva (0028).
      injectRegister: false,
      // SW APAGADO en dev: cacheaba y hacia ver cambios viejos (HMR limpio sin
      // el). Para probar la PWA instalable de verdad: `npm run build && preview`.
      devOptions: { enabled: false },
      // Los WASM de wa-sqlite (SQLite en el navegador) superan los 2 MB.
      workbox: {
        // Explicitos: con `injectRegister: false` el plugin deja de ponerlos y el
        // worker nuevo queda ESPERANDO un mensaje que el codigo viejo nunca
        // manda (los telefonos con la version anterior se trababan). Asi se
        // activa solo y toma el control; cuando recargar lo decide la app (0028).
        skipWaiting: true,
        clientsClaim: true,
        // Los avisos push (1.4.0): `push` y `notificationclick` (public/sw-push.js).
        importScripts: ["sw-push.js"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // El patron por defecto deja afuera las fuentes: sin esto la tipografia
        // no esta disponible sin conexion y la app cae a la del sistema.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
        // En produccion la API y PowerSync van por el MISMO origen (nginx hace
        // de proxy, ver 0020). Una navegacion a esas rutas nunca es la SPA: sin
        // esto el SW contestaria index.html en lugar de dejarla ir a la red.
        navigateFallbackDenylist: [/^\/api\//, /^\/powersync\//],
      },
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
          {
            src: "icons/png/mango-any-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/png/mango-any-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
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
        // Atajos del icono (0023): mantener apretado en Android, lista de saltos
        // en Windows. iOS no los muestra. La lista, su orden y por que viven en
        // src/lib/atajos.ts (la usa tambien el alta y tiene sus tests).
        shortcuts: ATAJOS,
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
