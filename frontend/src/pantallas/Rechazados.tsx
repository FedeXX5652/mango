import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, CheckCircle2, RotateCw, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Vacio } from "@/componentes/Vacio"
import { Button } from "@/componentes/ui/button"
import { Confirmar } from "@/componentes/ui/confirmar"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { useConexion } from "@/hooks/conexion"
import { useLayout } from "@/hooks/useLayout"
import { formatearFechaCorta } from "@/lib/fecha"
import { type Rechazada, descartar, reintentar } from "@/lib/rechazados"
import {
  type Modificador,
  type Seleccion,
  SELECCION_VACIA,
  alClickear,
  alTocarEnModo,
  limpiar,
  podar,
  todos,
} from "@/lib/seleccion"
import { cn } from "@/lib/utils"

// Bandeja de subidas rechazadas (ver decision 0011). Lo que el servidor devolvio
// con un 4xx y que no se perdio: se puede reintentar o descartar, de a uno o en
// lote, con multiseleccion estilo explorador de archivos.
//
// El gesto cambia con el dispositivo (useLayout):
//   - escritorio: click, Ctrl/Cmd+click (toggle), Shift+click (rango)
//   - movil: toque largo entra en modo seleccion; despues cada toque alterna
// La logica de que queda seleccionado vive en lib/seleccion, probada aparte.

const ETIQUETA_OP: Record<string, string> = {
  PUT: "Alta",
  PATCH: "Cambio",
  DELETE: "Baja",
}

const ETIQUETA_TABLA: Record<string, string> = {
  transactions: "movimiento",
  accounts: "cuenta",
  categories: "categoría",
  payment_methods: "medio de pago",
  budgets: "presupuesto",
  budget_rules: "regla de presupuesto",
  tags: "etiqueta",
  transaction_tags: "etiqueta de movimiento",
  templates: "plantilla",
  recurring_rules: "recurrente",
  exchange_rates: "cotización",
  users: "preferencias",
}

function describir(r: Rechazada): string {
  const op = ETIQUETA_OP[r.op] ?? r.op
  const tabla = ETIQUETA_TABLA[r.tabla] ?? r.tabla
  return `${op} de ${tabla}`
}

export function Rechazados() {
  const db = usePowerSync()
  const navigate = useNavigate()
  const layout = useLayout()
  const hayConexion = useConexion()

  const { data: filas } = useQuery<Rechazada>(
    "SELECT * FROM subidas_rechazadas ORDER BY rechazada_en DESC, id",
  )
  const orden = useMemo(() => filas.map((f) => f.id), [filas])

  const [sel, setSel] = useState<Seleccion>(SELECCION_VACIA)
  // En movil no hay teclas: se entra en "modo seleccion" con un toque largo y
  // recien ahi cada toque alterna. En escritorio el modo es implicito.
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aDescartar, setADescartar] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState("")

  // La seleccion se poda contra lo que sigue existiendo: al reintentar o
  // descartar, las filas que se van no pueden quedar contadas.
  const seleccion = useMemo(() => podar(sel, orden), [sel, orden])
  const nSel = seleccion.ids.size

  function clickEscritorio(id: string, e: React.MouseEvent) {
    const mod: Modificador = e.shiftKey ? "rango" : e.ctrlKey || e.metaKey ? "toggle" : "ninguno"
    setSel((s) => alClickear(s, id, mod, orden))
  }

  function tocarMovil(id: string) {
    if (modoSeleccion) {
      setSel((s) => alTocarEnModo(s, id))
    } else {
      // Fuera del modo, un toque abre el detalle del error (no hay: por ahora,
      // nada — el motivo ya se ve en la fila).
    }
  }

  function alcance(): string[] {
    // Si hay seleccion, sobre eso; si no, sobre todo (los botones globales).
    return nSel > 0 ? [...seleccion.ids] : orden
  }

  async function hacerReintento(ids: string[]) {
    if (ids.length === 0 || trabajando) return
    setTrabajando(true)
    setAviso("")
    try {
      const r = await reintentar(db, ids)
      const partes = []
      if (r.reintentadas > 0) partes.push(`${r.reintentadas} reintentada(s)`)
      if (r.fallidas > 0) partes.push(`${r.fallidas} sigue(n) fallando`)
      setAviso(partes.join(" · ") || "Nada para reintentar.")
    } catch {
      setAviso("No se pudo: revisá la conexión.")
    } finally {
      setTrabajando(false)
      setSel(limpiar)
      setModoSeleccion(false)
    }
  }

  async function hacerDescarte(ids: string[]) {
    await descartar(db, ids)
    setSel(limpiar)
    setModoSeleccion(false)
    setADescartar(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Cambios sin guardar</h1>
      </header>

      {filas.length === 0 ? (
        <Vacio
          icono={CheckCircle2}
          titulo="Nada pendiente"
          detalle="Todos los cambios se guardaron en el servidor."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            El servidor rechazó estos cambios. Se guardaron acá para que no se pierdan: podés
            reintentarlos —por si ya se resolvió— o descartarlos.
          </p>

          {/* Barra de acciones. Si hay seleccion, opera sobre ella; si no, sobre
              todo. El texto lo dice para que no haya sorpresa. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => hacerReintento(alcance())}
              disabled={trabajando || !hayConexion}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              {nSel > 0 ? `Reintentar ${nSel}` : "Reintentar todos"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setADescartar(alcance())}
              disabled={trabajando}
              className="gap-2 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {nSel > 0 ? `Descartar ${nSel}` : "Descartar todos"}
            </Button>
            {nSel > 0 && (
              <Button variant="ghost" onClick={() => setSel(limpiar)} disabled={trabajando}>
                Deseleccionar
              </Button>
            )}
            {/* Atajo de escritorio para no tener que Ctrl+A sobre las filas. */}
            {layout === "escritorio" && nSel < filas.length && (
              <Button variant="ghost" onClick={() => setSel(todos(orden))}>
                Seleccionar todo
              </Button>
            )}
          </div>

          {!hayConexion && (
            <p className="text-xs text-muted-foreground">
              Sin conexión no se puede reintentar; descartar sí.
            </p>
          )}
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

          <ListaInset>
            {filas.map((f) => {
              const elegida = seleccion.ids.has(f.id)
              return (
                <FilaRechazada
                  key={f.id}
                  f={f}
                  elegida={elegida}
                  modoSeleccion={modoSeleccion}
                  layout={layout}
                  onClickEscritorio={(e) => clickEscritorio(f.id, e)}
                  onTocarMovil={() => tocarMovil(f.id)}
                  onLargo={() => {
                    setModoSeleccion(true)
                    setSel((s) => alTocarEnModo(s, f.id))
                  }}
                />
              )
            })}
          </ListaInset>
        </>
      )}

      <Confirmar
        abierta={aDescartar !== null}
        onOpenChange={(v) => !v && setADescartar(null)}
        titulo={
          aDescartar && aDescartar.length === 1
            ? "Descartar este cambio"
            : `Descartar ${aDescartar?.length ?? 0} cambios`
        }
        detalle="No se van a volver a intentar y se borran de acá. Los datos ya cargados en el dispositivo no se tocan."
        etiqueta="Descartar"
        destructivo
        onConfirmar={() => aDescartar && hacerDescarte(aDescartar)}
      />
    </div>
  )
}

function FilaRechazada({
  f,
  elegida,
  modoSeleccion,
  layout,
  onClickEscritorio,
  onTocarMovil,
  onLargo,
}: {
  f: Rechazada
  elegida: boolean
  modoSeleccion: boolean
  layout: "movil" | "escritorio"
  onClickEscritorio: (e: React.MouseEvent) => void
  onTocarMovil: () => void
  onLargo: () => void
}) {
  // Toque largo en movil: 500 ms sin soltar entra en modo seleccion. Se cancela
  // si el dedo se mueve (scroll) o se suelta antes.
  const [timer, setTimer] = useState<number | null>(null)
  function iniciarLargo() {
    const t = window.setTimeout(onLargo, 500)
    setTimer(t)
  }
  function cancelarLargo() {
    if (timer !== null) {
      clearTimeout(timer)
      setTimer(null)
    }
  }

  return (
    <FilaInset
      className={cn("items-start", elegida && "bg-accent")}
      onClick={
        layout === "escritorio"
          ? undefined // en escritorio el onClick va abajo, para leer las teclas
          : onTocarMovil
      }
    >
      <div
        className="flex w-full items-start gap-3"
        // Escritorio: el div captura el click con las teclas modificadoras.
        onClick={layout === "escritorio" ? onClickEscritorio : undefined}
        onPointerDown={layout === "movil" ? iniciarLargo : undefined}
        onPointerUp={cancelarLargo}
        onPointerMove={cancelarLargo}
        onPointerCancel={cancelarLargo}
      >
        {(layout === "escritorio" || modoSeleccion) && (
          <input
            type="checkbox"
            checked={elegida}
            // El estado lo maneja el gesto de la fila; el checkbox es un espejo.
            readOnly
            tabIndex={-1}
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{describir(f)}</p>
          <p className="truncate text-xs text-destructive">{f.motivo}</p>
          <p className="text-xs text-muted-foreground">{formatearFechaCorta(f.rechazada_en)}</p>
        </div>
      </div>
    </FilaInset>
  )
}
