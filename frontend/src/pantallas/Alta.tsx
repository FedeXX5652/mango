import { usePowerSync, useQuery } from "@powersync/react"
import { X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { Calculadora } from "@/componentes/Calculadora"
import { CompartirCon } from "@/componentes/CompartirCon"
import { EditorSplit, type ValorSplit } from "@/componentes/EditorSplit"
import { SelectorEtiquetas } from "@/componentes/SelectorEtiquetas"
import { SelectorMoneda } from "@/componentes/SelectorMoneda"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Segmentado } from "@/componentes/ui/segmentado"
import { useMonedaBase } from "@/hooks/monedaBase"
import { SelectorCategoria } from "@/componentes/SelectorCategoria"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { ordenarJerarquico } from "@/lib/categorias"
import { cotizacionDe, cotizacionLegible } from "@/lib/conversion"
import { aCentavos } from "@/lib/dinero"
import { ordenarMonedas } from "@/lib/monedas"
import { uuidv4 } from "@/lib/uuid"

type TipoMovimiento = "expense" | "income" | "transfer"

interface CuentaLocal {
  id: string
  name: string
  currency: string
  group_id: string | null
}
interface CategoriaLocal {
  id: string
  name: string
  kind: string
  parent_id: string | null
  icon: string | null
  // Ambito (0014): con group_id es del grupo; sin el, personal.
  group_id: string | null
}
interface MedioLocal {
  id: string
  name: string
}
interface PlantillaLocal {
  id: string
  name: string
  kind: string
  account_id: string | null
  category_id: string | null
  payment_method_id: string | null
  amount: number | null
  payee: string | null
  notes: string | null
}

const TIPOS: { valor: TipoMovimiento; etiqueta: string }[] = [
  { valor: "expense", etiqueta: "Gasto" },
  { valor: "income", etiqueta: "Ingreso" },
  { valor: "transfer", etiqueta: "Transferencia" },
]

function ahoraLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Cuerpo del alta, reutilizable: en movil va en la pantalla focal /nuevo; en
// escritorio, dentro de un modal (Hoja) sobre el dashboard. `onGuardado` decide
// que pasa al guardar (navegar vs cerrar el modal).
export function FormularioMovimiento({
  plantillaId,
  onGuardado,
}: {
  plantillaId?: string
  onGuardado: () => void
}) {
  const db = usePowerSync()

  const { data: cuentas, isLoading } = useQuery<CuentaLocal>(
    "SELECT id, name, currency, group_id FROM accounts WHERE deleted_at IS NULL AND archived = 0 ORDER BY sort_order, created_at",
  )
  const { data: categorias } = useQuery<CategoriaLocal>(
    "SELECT id, name, kind, parent_id, icon, group_id FROM categories WHERE deleted_at IS NULL AND archived = 0",
  )
  const { data: medios } = useQuery<MedioLocal>(
    "SELECT id, name FROM payment_methods WHERE deleted_at IS NULL AND archived = 0",
  )
  const { data: comerciosRows } = useQuery<{ payee: string }>(
    "SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL AND deleted_at IS NULL ORDER BY payee",
  )
  const comercios = comerciosRows.map((r) => r.payee)
  const { data: plantillas } = useQuery<PlantillaLocal>(
    "SELECT id, name, kind, account_id, category_id, payment_method_id, amount, payee, notes FROM templates WHERE deleted_at IS NULL ORDER BY sort_order, name",
  )

  const [tipo, setTipo] = useState<TipoMovimiento>("expense")
  const [centavos, setCentavos] = useState(0)
  const [cuentaId, setCuentaId] = useState("")
  const [cuentaDestinoId, setCuentaDestinoId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [medioId, setMedioId] = useState("")
  const [comercio, setComercio] = useState("")
  const [notas, setNotas] = useState("")
  const [cuando, setCuando] = useState(ahoraLocal)
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  // Grupo con el que se comparte, "" = privado (fase 3b.2).
  const [grupoId, setGrupoId] = useState("")
  // Reparto del gasto compartido (fase 3b.3). null = igual entre todos.
  const [split, setSplit] = useState<ValorSplit>({ splits: null, valido: true })
  // Miembros del grupo elegido, para repartir el gasto (fase 3b.3).
  const { data: miembrosRows } = useQuery<{ user_id: string; display_name: string | null }>(
    `SELECT gm.user_id, u.display_name FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ? AND gm.deleted_at IS NULL`,
    [grupoId || ""],
  )
  const miembros = useMemo(
    () =>
      miembrosRows.map((m) => ({
        user_id: m.user_id,
        nombre: m.display_name || m.user_id.slice(0, 8),
      })),
    [miembrosRows],
  )
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  // Monto sembrado al aplicar una plantilla. `calcKey` remonta la calculadora
  // (que maneja su estado interno) para que tome el nuevo valor inicial.
  const [montoInicial, setMontoInicial] = useState(0)
  const [calcKey, setCalcKey] = useState(0)

  const base = useMonedaBase()
  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const monedaCuenta = cuentaSel?.currency ?? base
  // La moneda del movimiento arranca en la de la cuenta, que es el 90% de los
  // casos, y se cambia en la misma linea del monto (ver 0005).
  const [monedaElegida, setMonedaElegida] = useState<string | null>(null)
  const moneda = monedaElegida ?? monedaCuenta
  // Se ofrecen las monedas de las cuentas que tenga: no hay lista mundial.
  const monedas = useMemo(
    () =>
      ordenarMonedas(
        cuentas.map((c) => c.currency),
        base,
      ),
    [cuentas, base],
  )
  // Conversion: solo cuando difieren. Se pide el **monto debitado**, que es la
  // fuente de verdad, y la cotizacion se deduce.
  // Se exige cuenta elegida: la etiqueta del campo afirma la moneda de la
  // cuenta, y sin cuenta seria una suposicion.
  const difieren = Boolean(cuentaId) && moneda !== monedaCuenta
  const [debitado, setDebitado] = useState("")
  const centavosDebitado = debitado.trim() ? (aCentavos(debitado, monedaCuenta) ?? 0) : 0
  const cotizacion =
    difieren && centavos > 0 && centavosDebitado > 0
      ? cotizacionDe(centavos, moneda, centavosDebitado, monedaCuenta)
      : null

  // Ambito de la categoria segun con quien se comparte (0014): si se comparte con
  // un grupo, se eligen las categorias DEL grupo; si es privado, las personales.
  // Asi Ana y Beto categorizan lo compartido con la misma taxonomia del grupo.
  const categoriasDelTipo = useMemo(
    () =>
      ordenarJerarquico(categorias).filter(
        (c) =>
          c.kind === (tipo === "income" ? "income" : "expense") &&
          (grupoId ? c.group_id === grupoId : !c.group_id),
      ),
    [categorias, tipo, grupoId],
  )

  // Si la categoria elegida deja de ser valida al cambiar tipo o grupo (p. ej.
  // era personal y ahora se comparte), se limpia en vez de mandar una invalida.
  useEffect(() => {
    if (categoriaId && !categoriasDelTipo.some((c) => c.id === categoriaId)) {
      setCategoriaId("")
    }
  }, [categoriasDelTipo, categoriaId])

  const aplicarPlantilla = useCallback((t: PlantillaLocal) => {
    setTipo(t.kind as TipoMovimiento)
    if (t.account_id) setCuentaId(t.account_id)
    setCuentaDestinoId("")
    setCategoriaId(t.category_id ?? "")
    setMedioId(t.payment_method_id ?? "")
    setComercio(t.payee ?? "")
    setNotas(t.notes ?? "")
    if (t.amount && t.amount > 0) {
      setMontoInicial(t.amount)
      setCalcKey((k) => k + 1)
    }
  }, [])

  // Prefill al llegar con una plantilla ("Usar"): una sola vez, ya cargadas.
  const aplicada = useRef(false)
  useEffect(() => {
    if (aplicada.current || !plantillaId) return
    const t = plantillas.find((p) => p.id === plantillaId)
    if (t) {
      aplicada.current = true
      aplicarPlantilla(t)
    }
  }, [plantillaId, plantillas, aplicarPlantilla])

  async function guardar() {
    setError("")
    if (centavos <= 0) return setError("Ingresá un monto")
    if (!cuentaId) return setError("Elegí una cuenta")
    if (tipo !== "transfer" && !categoriaId) return setError("Elegí una categoría")
    if (tipo === "transfer" && !cuentaDestinoId) return setError("Elegí la cuenta de destino")
    if (tipo === "transfer" && cuentaDestinoId === cuentaId)
      return setError("Las cuentas deben ser distintas")
    if (tipo === "expense" && grupoId && !split.valido)
      return setError("La división no cierra con el total")

    setGuardando(true)
    try {
      // El id se genera aca porque las etiquetas lo necesitan para asociarse.
      const idTx = uuidv4()
      // Escritura LOCAL: PowerSync la encola y la sube por la API en segundo plano.
      await db.execute(
        `INSERT INTO transactions
           (id, kind, occurred_at, amount, currency, account_id, transfer_account_id,
            category_id, payment_method_id, payee, notes, amount_account, exchange_rate,
            visibility, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idTx,
          tipo,
          new Date(cuando).toISOString(),
          centavos,
          moneda,
          cuentaId,
          tipo === "transfer" ? cuentaDestinoId : null,
          tipo === "transfer" ? null : categoriaId,
          medioId || null,
          comercio || null,
          notas || null,
          // Sin conversion, los dos van en NULL. El movimiento es valido
          // igual: lo que falta es un dato del banco (ver 0005).
          difieren && centavosDebitado > 0 ? centavosDebitado : null,
          difieren && cotizacion ? cotizacion : null,
          grupoId ? "shared" : "private",
          grupoId || null,
        ],
      )
      // Una fila por etiqueta elegida (ver 3.5.1).
      for (const tagId of etiquetas) {
        await db.execute(
          "INSERT INTO transaction_tags (id, transaction_id, tag_id) VALUES (?, ?, ?)",
          [uuidv4(), idTx, tagId],
        )
      }
      // Reparto desigual (fase 3b.3): una fila por parte. `null` = igual entre
      // todos, que no guarda nada (lo resuelve el balance por defecto).
      if (grupoId && split.splits) {
        for (const parte of split.splits) {
          await db.execute(
            "INSERT INTO transaction_splits (id, transaction_id, user_id, amount) VALUES (?, ?, ?, ?)",
            [uuidv4(), idTx, parte.user_id, parte.amount],
          )
        }
      }
      onGuardado()
    } catch {
      setError("No se pudo guardar")
      setGuardando(false)
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  }

  return (
    <div className="space-y-5">
      <Segmentado opciones={TIPOS} valor={tipo} onCambio={setTipo} />

      {plantillas.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {plantillas.map((t) => (
            <button
              key={t.id}
              onClick={() => aplicarPlantilla(t)}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-sm transition-colors hover:bg-muted"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* La moneda va pegada al monto, no en un bloque aparte: con la de la
          cuenta por defecto, el 90% de las veces no hay nada que elegir. */}
      {monedas.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Moneda</span>
          <SelectorMoneda
            monedas={monedas}
            valor={moneda}
            onCambio={(m) => {
              setMonedaElegida(m)
              if (m === monedaCuenta) setDebitado("")
            }}
          />
        </div>
      )}

      <Calculadora key={calcKey} moneda={moneda} onCambio={setCentavos} inicial={montoInicial} />

      {difieren && (
        <Campo etiqueta={`Monto debitado de la cuenta (${monedaCuenta})`}>
          <Input
            value={debitado}
            onChange={(e) => setDebitado(e.target.value)}
            placeholder="Lo que figura en el resumen"
            inputMode="decimal"
            className="tabular"
          />
          {/* La cotizacion se muestra, no se pide: el dato del resumen es el
              monto, y de ahi sale la cotizacion (ver 0005). */}
          <p className="mt-1 text-xs text-muted-foreground">
            {cotizacion
              ? `1 ${moneda} = ${cotizacionLegible(cotizacion)} ${monedaCuenta}`
              : "Si todavía no lo sabés, dejalo vacío: se puede completar después."}
          </p>
        </Campo>
      )}

      {cuentas.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No tenés cuentas todavía (o están sincronizando). Creá una en Ajustes → Cuentas.
        </p>
      ) : (
        <div className="space-y-4">
          <Campo etiqueta={tipo === "transfer" ? "Desde" : "Cuenta"}>
            <SelectorEntidad
              titulo={tipo === "transfer" ? "Cuenta de origen" : "Cuenta"}
              placeholder="Elegí una cuenta"
              opciones={cuentas.map((c) => ({ id: c.id, nombre: c.name, detalle: c.group_id ? `${c.currency} · conjunta` : c.currency }))}
              valor={cuentaId}
              onCambio={setCuentaId}
            />
          </Campo>

          {tipo === "transfer" && (
            <Campo etiqueta="Hacia">
              <SelectorEntidad
                titulo="Cuenta de destino"
                placeholder="Elegí la cuenta de destino"
                opciones={cuentas
                  .filter((c) => c.id !== cuentaId)
                  .map((c) => ({ id: c.id, nombre: c.name, detalle: c.group_id ? `${c.currency} · conjunta` : c.currency }))}
                valor={cuentaDestinoId}
                onCambio={setCuentaDestinoId}
              />
            </Campo>
          )}

          {/* Compartir va ANTES de la categoria: define de que ambito son las
              categorias que se ofrecen (personales o del grupo, ver 0014). Las
              transferencias no se comparten: son movimientos entre tus cuentas. */}
          {tipo !== "transfer" && <CompartirCon valor={grupoId} onCambio={setGrupoId} />}

          {tipo !== "transfer" && (
            <Campo etiqueta="Categoría">
              <SelectorCategoria
                categorias={categoriasDelTipo}
                valor={categoriaId}
                onCambio={setCategoriaId}
              />
            </Campo>
          )}

          {/* Reparto del gasto (fase 3b.3): solo al compartir con un grupo y con
              un monto ya cargado. Por defecto, igual entre todos. */}
          {tipo === "expense" && grupoId && centavos > 0 && (
            <EditorSplit
              total={centavos}
              currency={moneda}
              miembros={miembros}
              onCambio={setSplit}
            />
          )}

          <Campo etiqueta="Medio de pago (opcional)">
            <SelectorEntidad
              titulo="Medio de pago"
              placeholder="Sin medio"
              vacio="Sin medio"
              opciones={medios.map((m) => ({ id: m.id, nombre: m.name }))}
              valor={medioId}
              onCambio={setMedioId}
            />
          </Campo>

          <Campo etiqueta="Comercio / contraparte (opcional)">
            <Input
              list="comercios"
              value={comercio}
              onChange={(e) => setComercio(e.target.value)}
              placeholder="Dónde se hizo el gasto"
            />
            <datalist id="comercios">
              {comercios.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>

          <Campo etiqueta="Fecha y hora">
            <Input
              type="datetime-local"
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Notas (opcional)">
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>

          <Campo etiqueta="Etiquetas (opcional)">
            <SelectorEtiquetas seleccionadas={etiquetas} onCambio={setEtiquetas} />
          </Campo>

          {/* CTA fija: en un form largo el boton queda a mano sin scrollear. */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border bg-background px-4 py-3">
            {error && <p className="mb-2 text-center text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Ruta /nuevo: en movil es la pantalla focal (sin barra ni FAB, sube al entrar).
// En escritorio el alta se abre como modal desde el boton "Nuevo movimiento"
// (ver LayoutEscritorio); esta ruta queda de fallback (p. ej. "Usar plantilla").
export function Alta() {
  const navigate = useNavigate()
  const location = useLocation()
  const plantillaId = (location.state as { plantillaId?: string } | null)?.plantillaId

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-4 motion-safe:animate-subir">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nuevo movimiento</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Cerrar">
          <X className="h-5 w-5" />
        </Button>
      </header>
      <FormularioMovimiento plantillaId={plantillaId} onGuardado={() => navigate("/movimientos")} />
    </div>
  )
}
