import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { Placeholder } from "@/componentes/Placeholder"
import { ProveedorBloqueo } from "@/hooks/bloqueo"
import { ProveedorTema } from "@/hooks/tema"
import { useLayout } from "@/hooks/useLayout"
import { LayoutEscritorio } from "@/layouts/escritorio/LayoutEscritorio"
import { LayoutMovil } from "@/layouts/movil/LayoutMovil"
import { Ajustes } from "@/pantallas/Ajustes"
import { Estadisticas } from "@/pantallas/Estadisticas"
import { Inicio } from "@/pantallas/Inicio"
import { Movimientos } from "@/pantallas/Movimientos"

function Rutas() {
  const layout = useLayout()
  const Layout = layout === "movil" ? LayoutMovil : LayoutEscritorio
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="movimientos" element={<Movimientos />} />
        <Route path="estadisticas" element={<Estadisticas />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route
          path="nuevo"
          element={<Placeholder titulo="Nuevo movimiento" nota="Pantalla de alta — Inc 12." />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <ProveedorTema>
        <ProveedorBloqueo>
          <Rutas />
        </ProveedorBloqueo>
      </ProveedorTema>
    </BrowserRouter>
  )
}
