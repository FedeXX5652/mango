import { usePowerSync, useQuery } from "@powersync/react"
import { AlertTriangle, Check, Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Interruptor } from "@/componentes/ui/interruptor"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { Select } from "@/componentes/ui/select"
import { TEMAS } from "@/config/temas"
import { api } from "@/lib/api"
import { ordenarJerarquico } from "@/lib/categorias"
import { descargarTexto } from "@/lib/descargar"
import { type RangoExport, nombreExport, parametrosExport, tieneFilas } from "@/lib/exportar"
import { type ColorScheme, useTema } from "@/hooks/tema"
import { useBloqueo } from "@/hooks/bloqueo"
import { useSesion } from "@/hooks/sesion"
import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desactivarBiometria,
} from "@/lib/biometria"
import { ACCESOS } from "@/componentes/accesos"
import { CambiarMonedaBase } from "@/componentes/CambiarMonedaBase"
import { cn } from "@/lib/utils"
import { textoVersion } from "@/lib/version"

const MODOS: { valor: ColorScheme; etiqueta: string }[] = [
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
  { valor: "system", etiqueta: "Sistema" },
]

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

export function Ajustes() {
  const { temaId, colorScheme, setTema, setColorScheme } = useTema()
  const { bloquear } = useBloqueo()
  const { salir } = useSesion()
  const db = usePowerSync()
  const [confirmarSalir, setConfirmarSalir] = useState(false)
  const [bioDisponible, setBioDisponible] = useState(false)
  const [bioActiva, setBioActiva] = useState(biometriaActivada())
  const [mostrarExport, setMostrarExport] = useState(false)
  const { data: rech } = useQuery<{ n: number }>("SELECT count(*) AS n FROM subidas_rechazadas")
  const nRechazadas = rech[0]?.n ?? 0

  useEffect(() => {
    biometriaDisponible().then(setBioDisponible)
  }, [])

  async function toggleBiometria() {
    if (bioActiva) {
      desactivarBiometria()
      setBioActiva(false)
    } else if (await activarBiometria()) {
      setBioActiva(true)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      {/* Solo lo que se CONFIGURA (0024). Lo que se usa —metas, deudas,
          recurrentes, plantillas— esta en los accesos de Inicio y, en
          escritorio, en la barra lateral. */}
      <Seccion titulo="Configuración">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACCESOS.filter((a) => a.grupo === "configuracion").map((a) => (
            <Link
              key={a.id}
              to={a.to}
              className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <a.icono className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-medium">{a.etiqueta}</span>
            </Link>
          ))}
        </div>
      </Seccion>

      {nRechazadas > 0 && (
        <Seccion titulo="Sincronización">
          <Link
            to="/rechazados"
            className="flex w-full items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {nRechazadas} cambio{nRechazadas === 1 ? "" : "s"} sin guardar
              </span>
              <span className="block text-xs text-muted-foreground">
                El servidor los rechazó. Tocá para reintentar o descartar.
              </span>
            </span>
          </Link>
        </Seccion>
      )}

      <Seccion titulo="Moneda">
        <CambiarMonedaBase />
      </Seccion>

      <Seccion titulo="Datos">
        <button
          type="button"
          onClick={() => setMostrarExport(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <Download className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Exportar movimientos</span>
            <span className="block text-xs text-muted-foreground">
              Descarga un CSV. Lo arma el servidor, así que necesita conexión.
            </span>
          </span>
        </button>
        <Hoja abierta={mostrarExport} onOpenChange={setMostrarExport} titulo="Exportar movimientos">
          <FormExportar onCerrar={() => setMostrarExport(false)} />
        </Hoja>
      </Seccion>

      <Seccion titulo="Tema">
        <div className="grid grid-cols-3 gap-3">
          {TEMAS.map((t) => (
            // En el movil, muestra arriba y nombre abajo: en un tercio de 360 px
            // no entraban en fila y la muestra quedaba aplastada.
            <button
              key={t.id}
              onClick={() => setTema(t.id)}
              aria-pressed={temaId === t.id}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-colors lg:flex-row lg:justify-start",
                temaId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted",
              )}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: t.muestra }}
              />
              <span className="min-w-0 truncate">{t.nombre}</span>
              {temaId === t.id && (
                <Check
                  className="absolute right-2 top-2 h-4 w-4 text-enlace lg:static lg:ml-auto"
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Apariencia">
        <Segmentado
          opciones={MODOS}
          valor={colorScheme}
          onCambio={setColorScheme}
          etiqueta="Modo de color"
        />
      </Seccion>

      <Seccion titulo="Seguridad">
        {bioDisponible ? (
          // Prendido/apagado: Interruptor, no un boton con el estado en texto
          // (DESIGN.md 7).
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-card px-4">
            <span className="text-sm font-medium">Desbloqueo biométrico</span>
            <Interruptor
              encendido={bioActiva}
              etiqueta="Desbloqueo biométrico"
              onCambio={() => void toggleBiometria()}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este dispositivo no ofrece desbloqueo biométrico.
          </p>
        )}
        <Button variant="secondary" className="w-full" onClick={bloquear}>
          Bloquear ahora
        </Button>
        {/* Cerrar sesión: distinto de bloquear. Bloquear pide el PIN; esto
            cierra la sesión de servidor y borra los datos locales, así que para
            volver hace falta la clave. `disconnectAndClear` no deja rastro de
            la sesión anterior en el dispositivo. */}
        <Button
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => setConfirmarSalir(true)}
        >
          Cerrar sesión
        </Button>
      </Seccion>

      <Confirmar
        abierta={confirmarSalir}
        onOpenChange={setConfirmarSalir}
        titulo="Cerrar sesión"
        detalle="Se borran los datos de este dispositivo y vas a tener que volver a entrar con tu usuario y clave. Lo que ya se sincronizó no se pierde."
        etiqueta="Cerrar sesión"
        destructivo
        onConfirmar={async () => {
          await db.disconnectAndClear()
          salir()
        }}
      />

      {/* Version (0025), al fondo de todo. Con la PWA en cache, es la forma de
          saber si este dispositivo ya tomo la ultima: el commit tiene que ser el
          ultimo de GitHub. */}
      <p className="tabular pt-4 text-center text-xs text-muted-foreground">{textoVersion()}</p>
    </div>
  )
}

interface OpcionCat {
  id: string
  name: string
  kind?: string
  parent_id?: string | null
}

const RANGOS: { valor: RangoExport; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "anio", etiqueta: "Este año" },
  { valor: "todo", etiqueta: "Todo" },
  { valor: "personalizado", etiqueta: "Personalizado" },
]

function FormExportar({ onCerrar }: { onCerrar: () => void }) {
  const { data: cuentas } = useQuery<OpcionCat>(
    "SELECT id, name FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
  )
  const { data: categorias } = useQuery<OpcionCat>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL",
  )
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias])
  const cats = useMemo(() => ordenarJerarquico(categorias), [categorias])

  const [rango, setRango] = useState<RangoExport>("mes")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [tipo, setTipo] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState("")

  async function exportar() {
    setError("")
    if (rango === "personalizado" && !desde && !hasta) {
      return setError("Elegí al menos una fecha")
    }
    setExportando(true)
    try {
      const csv = await api.exportarCsv(
        parametrosExport({ rango, desde, hasta, tipo, cuentaId, categoriaId }),
      )
      if (!tieneFilas(csv)) {
        setError("No hay movimientos con esos filtros.")
        return
      }
      descargarTexto(csv, nombreExport())
      onCerrar()
    } catch {
      setError("No se pudo exportar. El archivo lo arma el servidor: revisá la conexión.")
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Período">
        <Select value={rango} onChange={(e) => setRango(e.target.value as RangoExport)}>
          {RANGOS.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </Select>
      </Campo>

      {rango === "personalizado" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
        </div>
      )}

      <Campo etiqueta="Tipo (opcional)">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Transferencia</option>
        </Select>
      </Campo>

      <Campo etiqueta="Cuenta (opcional)">
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Toda cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Campo>

      <Campo etiqueta="Categoría (opcional)">
        <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Toda categoría</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_id ? `${nombreCat.get(c.parent_id) ?? "—"} › ${c.name}` : c.name}
            </option>
          ))}
        </Select>
      </Campo>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={exportar} disabled={exportando}>
          {exportando ? "Exportando…" : "Exportar CSV"}
        </Button>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
