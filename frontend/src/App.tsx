import { usePowerSync } from "@powersync/react"
import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { api } from "@/lib/api"
import { generarVencidas } from "@/lib/generar"
import { ProveedorBloqueo } from "@/hooks/bloqueo"
import { ProveedorSesion } from "@/hooks/sesion"
import { ProveedorMonedaBase } from "@/hooks/monedaBase"
import { ProveedorTema } from "@/hooks/tema"
import { useLayout } from "@/hooks/useLayout"
import { ProveedorPowerSync } from "@/lib/powersync/proveedor"
import { Sesion } from "@/componentes/Sesion"
import { LayoutEscritorio } from "@/layouts/escritorio/LayoutEscritorio"
import { LayoutMovil } from "@/layouts/movil/LayoutMovil"
import { Grupos } from "@/pantallas/Grupos"
import { GrupoDetalle } from "@/pantallas/GrupoDetalle"
import { Rechazados } from "@/pantallas/Rechazados"
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
        <Route path="rechazados" element={<Rechazados />} />
        <Route path="grupos" element={<Grupos />} />
        <Route path="grupos/:id" element={<GrupoDetalle />} />
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
// Lo que se dispara al abrir la app. No hay timers ni cron.
//
// Las recurrentes se generan **en el dispositivo**, contra la base local: no
// necesitan conexion y por eso van primero. El refresco de cotizaciones si sale
// a la red, y si no hay, falla en silencio y la app sigue con lo que tiene.
//
// Las dos son idempotentes —las recurrentes por su proxima fecha, las
// cotizaciones por la fecha del dato—, asi que llamarlas de mas no hace nada.
function DisparadorInicio() {
  const db = usePowerSync()
  useEffect(() => {
    // Mano para verificar la sincronizacion desde la consola del navegador:
    // `__db.getAll("SELECT count(*) FROM accounts")`. Una tabla que dejo de
    // sincronizar se ve igual que una tabla vacia, y esta es la unica forma de
    // distinguirlas sin adivinar. Solo en desarrollo.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __db?: unknown }).__db = db
    }
    generarVencidas(db).catch((e) => {
      // No se traga el error: si la generacion falla, las recurrentes dejan de
      // aparecer y desde afuera parece que no habia nada vencido.
      console.error("No se pudieron generar las recurrentes vencidas", e)
    })
    api.refrescarCotizaciones().catch(() => {})
  }, [db])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <ProveedorTema>
        <ProveedorSesion>
          {/* Sesión primero: sin login no se monta PowerSync ni se ve un dato.
              Después el PIN (lock de dispositivo), después la sync. */}
          <Sesion>
            <ProveedorMonedaBase>
              <ProveedorBloqueo>
                <ProveedorPowerSync>
                  <DisparadorInicio />
                  <Rutas />
                </ProveedorPowerSync>
              </ProveedorBloqueo>
            </ProveedorMonedaBase>
          </Sesion>
        </ProveedorSesion>
      </ProveedorTema>
    </BrowserRouter>
  )
}
