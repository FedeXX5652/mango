import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { api } from "@/lib/api"
import { ProveedorBloqueo } from "@/hooks/bloqueo"
import { ProveedorTema } from "@/hooks/tema"
import { useLayout } from "@/hooks/useLayout"
import { ProveedorPowerSync } from "@/lib/powersync/proveedor"
import { LayoutEscritorio } from "@/layouts/escritorio/LayoutEscritorio"
import { LayoutMovil } from "@/layouts/movil/LayoutMovil"
import { Ajustes } from "@/pantallas/Ajustes"
import { Alta } from "@/pantallas/Alta"
import { Categorias } from "@/pantallas/Categorias"
import { Cuentas } from "@/pantallas/Cuentas"
import { DetalleMovimiento } from "@/pantallas/DetalleMovimiento"
import { Estadisticas } from "@/pantallas/Estadisticas"
import { Inicio } from "@/pantallas/Inicio"
import { MediosPago } from "@/pantallas/MediosPago"
import { Movimientos } from "@/pantallas/Movimientos"
import { Plantillas } from "@/pantallas/Plantillas"
import { Presupuestos } from "@/pantallas/Presupuestos"
import { Recurrentes } from "@/pantallas/Recurrentes"

function Rutas() {
  const layout = useLayout()
  const Layout = layout === "movil" ? LayoutMovil : LayoutEscritorio
  return (
    <Routes>
      {/* Alta: pantalla focal (sin barra ni FAB), se llega por el + o el boton. */}
      <Route path="nuevo" element={<Alta />} />
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="movimientos" element={<Movimientos />} />
        <Route path="movimientos/:id" element={<DetalleMovimiento />} />
        <Route path="estadisticas" element={<Estadisticas />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="cuentas" element={<Cuentas />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="medios" element={<MediosPago />} />
        <Route path="plantillas" element={<Plantillas />} />
        <Route path="recurrentes" element={<Recurrentes />} />
        <Route path="presupuestos" element={<Presupuestos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// Al abrir la app, dispara las reglas recurrentes vencidas (best-effort: si no
// hay conexion se ignora). Es idempotente por fecha, asi que correr de mas no
// duplica. Las transacciones generadas bajan por sync.
function DisparadorRecurrentes() {
  useEffect(() => {
    api.runRecurring().catch(() => {})
  }, [])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ProveedorTema>
        <ProveedorBloqueo>
          <ProveedorPowerSync>
            <DisparadorRecurrentes />
            <Rutas />
          </ProveedorPowerSync>
        </ProveedorBloqueo>
      </ProveedorTema>
    </BrowserRouter>
  )
}
