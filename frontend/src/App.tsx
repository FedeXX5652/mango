import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { api } from "@/lib/api"
import { ProveedorBloqueo } from "@/hooks/bloqueo"
import { ProveedorMonedaBase } from "@/hooks/monedaBase"
import { ProveedorTema } from "@/hooks/tema"
import { useLayout } from "@/hooks/useLayout"
import { ProveedorPowerSync } from "@/lib/powersync/proveedor"
import { LayoutEscritorio } from "@/layouts/escritorio/LayoutEscritorio"
import { LayoutMovil } from "@/layouts/movil/LayoutMovil"
import { Ajustes } from "@/pantallas/Ajustes"
import { Alta } from "@/pantallas/Alta"
import { Categorias } from "@/pantallas/Categorias"
import { Cotizaciones } from "@/pantallas/Cotizaciones"
import { Cuentas } from "@/pantallas/Cuentas"
import { DetalleMovimiento } from "@/pantallas/DetalleMovimiento"
import { Estadisticas } from "@/pantallas/Estadisticas"
import { Etiquetas } from "@/pantallas/Etiquetas"
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
        <Route path="etiquetas" element={<Etiquetas />} />
        <Route path="cotizaciones" element={<Cotizaciones />} />
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
// Trabajo del servidor que se dispara al abrir la app. No hay timers ni cron:
// el servidor no siempre esta prendido, y ambas cosas son idempotentes (las
// recurrentes por fecha de proxima corrida, las cotizaciones por fecha del
// dato), asi que llamarlas de mas no hace nada. Si no hay conexion, fallan en
// silencio y la app sigue con lo que tiene.
function DisparadorServidor() {
  useEffect(() => {
    api.runRecurring().catch(() => {})
    api.refrescarCotizaciones().catch(() => {})
  }, [])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ProveedorTema>
        <ProveedorMonedaBase>
          <ProveedorBloqueo>
            <ProveedorPowerSync>
              <DisparadorServidor />
              <Rutas />
            </ProveedorPowerSync>
          </ProveedorBloqueo>
        </ProveedorMonedaBase>
      </ProveedorTema>
    </BrowserRouter>
  )
}
