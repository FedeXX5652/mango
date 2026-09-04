import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// Inter auto-hospedada (no se pide a un CDN: la app tiene que andar sin
// conexion y el service worker la precachea). Solo el eje de peso, sin
// italicas; el navegador baja unicamente el subset que necesita (latin).
import "@fontsource-variable/inter/wght.css"

import { App } from "@/App"
import "@/styles/index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
