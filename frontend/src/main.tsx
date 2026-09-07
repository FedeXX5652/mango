import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// Fuentes auto-hospedadas (no se piden a un CDN: la app tiene que andar sin
// conexion y el service worker las precachea). Solo el eje de peso, sin
// italicas; el navegador baja unicamente el subset que necesita (latin).
// Plus Jakarta Sans para todo; Geist Mono solo para lo tecnico (DESIGN.md 3).
import "@fontsource-variable/geist-mono/wght.css"
import "@fontsource-variable/plus-jakarta-sans/wght.css"

import { App } from "@/App"
import "@/styles/index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
