import { useQuery } from "@powersync/react"
import { Check, CreditCard, Download, Files, Landmark, Repeat, Tag, Tags } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { Select } from "@/componentes/ui/select"
import { TEMAS } from "@/config/temas"
import { api } from "@/lib/api"
import { ordenarJerarquico } from "@/lib/categorias"
import { descargarTexto } from "@/lib/descargar"
import {
  type RangoExport,
  nombreExport,
  parametrosExport,
  tieneFilas,
} from "@/lib/exportar"
import { type ColorScheme, useTema } from "@/hooks/tema"
import { useBloqueo } from "@/hooks/bloqueo"
import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desactivarBiometria,
} from "@/lib/biometria"
import { cn } from "@/lib/utils"

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
  const [bioDisponible, setBioDisponible] = useState(false)
  const [bioActiva, setBioActiva] = useState(biometriaActivada())
  const [mostrarExport, setMostrarExport] = useState(false)

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

      <Seccion titulo="Gestión">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { to: "/cuentas", etiqueta: "Cuentas", icono: Landmark },
            { to: "/categorias", etiqueta: "Categorías", icono: Tags },
            { to: "/medios", etiqueta: "Medios de pago", icono: CreditCard },
            { to: "/etiquetas", etiqueta: "Etiquetas", icono: Tag },
            { to: "/plantillas", etiqueta: "Plantillas", icono: Files },
            { to: "/recurrentes", etiqueta: "Recurrentes", icono: Repeat },
          ].map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
                <i.icono className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium">{i.etiqueta}</span>
            </Link>
          ))}
        </div>
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
        <Hoja
          abierta={mostrarExport}
          onOpenChange={setMostrarExport}
          titulo="Exportar movimientos"
        >
          <FormExportar onCerrar={() => setMostrarExport(false)} />
        </Hoja>
      </Seccion>

      <Seccion titulo="Tema">
        <div className="grid grid-cols-3 gap-3">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTema(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                temaId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted",
              )}
            >
              <span
                className="h-5 w-5 rounded-full border border-border"
                style={{ backgroundColor: t.muestra }}
              />
              {t.nombre}
              {temaId === t.id && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Apariencia">
        <Segmentado opciones={MODOS} valor={colorScheme} onCambio={setColorScheme} />
      </Seccion>

      <Seccion titulo="Seguridad">
        {bioDisponible ? (
          <Button variant="outline" className="w-full justify-between" onClick={toggleBiometria}>
            Desbloqueo biométrico
            <span className={cn("text-sm", bioActiva ? "text-income" : "text-muted-foreground")}>
              {bioActiva ? "Activado" : "Desactivado"}
            </span>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este dispositivo no ofrece desbloqueo biométrico.
          </p>
        )}
        <Button variant="secondary" className="w-full" onClick={bloquear}>
          Bloquear ahora
        </Button>
      </Seccion>
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
