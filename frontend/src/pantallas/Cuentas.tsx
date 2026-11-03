import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowUpDown, BellRing, ChevronDown, ChevronUp, Scale, Wallet } from "lucide-react"
import { useMemo, useState } from "react"

import { CampoMonto } from "@/componentes/CampoMonto"
import { AccionesEdicion, AccionesFila } from "@/componentes/AccionesEdicion"
import { AjustarSaldo } from "@/componentes/AjustarSaldo"
import { BotonNuevo, EncabezadoPantalla } from "@/componentes/EncabezadoPantalla"
import { EstadoSaldo, HojaTarjeta } from "@/componentes/HojaTarjeta"
import { HojaReasignar } from "@/componentes/HojaReasignar"
import { Monto } from "@/componentes/Monto"
import { Vacio } from "@/componentes/Vacio"
import { PagarTarjeta } from "@/componentes/PagarTarjeta"
import { HojaAvisarme } from "@/componentes/recordatorios/HojaAvisarme"
import { Button } from "@/componentes/ui/button"
import { SelectorEntidad } from "@/componentes/SelectorEntidad"
import { Campo } from "@/componentes/ui/campo"
import { Confirmar } from "@/componentes/ui/confirmar"
import { Hoja } from "@/componentes/ui/hoja"
import { Input } from "@/componentes/ui/input"
import { FilaInset, ListaInset } from "@/componentes/ui/listaInset"
import { Interruptor } from "@/componentes/ui/interruptor"
import { useTarjetas } from "@/hooks/useTarjetas"
import { useVinculados } from "@/hooks/useVinculados"
import { useVolver } from "@/hooks/useVolver"
import { iconoCuenta } from "@/lib/cuentas"
import { fechaISO } from "@/lib/fecha"
import { moverEnOrden } from "@/lib/orden"
import { aCentavos, aTextoEditable } from "@/lib/dinero"
import { planCuenta } from "@/lib/reasignar"
import { semillaDeTarjeta } from "@/lib/recordatorios"
import { saldoCuenta } from "@/lib/saldos"
import { descripcionTarjeta } from "@/lib/tarjeta"
import { usuarioActualId } from "@/lib/sesion"
import { uuidv4 } from "@/lib/uuid"
import { cn } from "@/lib/utils"
import { anunciar } from "@/lib/anuncios"

interface Cuenta {
  id: string
  name: string
  type: string
  currency: string
  opening_balance: number
  off_budget: number
  archived: number
  // El saldo de hoy, con la formula de siempre (lib/saldos).
  balance: number
  // Tarjeta de credito (0034).
  brand: string | null
  last4: string | null
  closing_day: number | null
  due_day: number | null
  credit_limit: number | null
  parent_account_id: string | null
}

const TIPOS: Record<string, string> = {
  cash: "Efectivo",
  bank: "Banco",
  savings: "Caja de ahorro",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  loan: "Préstamo",
  other: "Otra",
}

// La otra moneda de una tarjeta: dolares si es en pesos (0034).
const otraMoneda = (moneda: string) => (moneda === "USD" ? "ARS" : "USD")

export function Cuentas() {
  // A donde se vino (Inicio, Accesos, Ajustes o un atajo), no a un lugar fijo.
  const volver = useVolver("/ajustes")
  const db = usePowerSync()
  const { data: todas } = useQuery<Cuenta>(
    // Solo personales: las cuentas conjuntas del grupo se administran en la
    // pantalla del grupo (owner_id NULL, ver 0016).
    `SELECT a.id, a.name, a.type, a.currency, a.opening_balance, a.off_budget, a.archived,
       a.brand, a.last4, a.closing_day, a.due_day, a.credit_limit, a.parent_account_id,
       ${saldoCuenta()} AS balance
     FROM accounts a WHERE a.deleted_at IS NULL AND a.owner_id IS NOT NULL
     ORDER BY a.archived, a.sort_order, a.created_at`,
  )
  // El saldo en otra moneda de una tarjeta no es una fila: va adentro de su
  // tarjeta (0034). Si su tarjeta ya no esta, se ve suelto.
  const cuentas = useMemo(() => {
    const ids = new Set(todas.map((c) => c.id))
    return todas.filter((c) => !c.parent_account_id || !ids.has(c.parent_account_id))
  }, [todas])
  const saldosDe = (c: Cuenta) => todas.filter((x) => x.parent_account_id === c.id)
  const { tarjetas } = useTarjetas()
  const tarjetaDe = (id: string) => tarjetas.find((t) => t.id === id)
  const { porTarjeta } = useVinculados()

  // Cuentas referenciadas por algo: no se pueden eliminar (dejarian huerfano lo
  // que apunta a ellas). Se pueden archivar. El resto si se puede borrar.
  const { data: enUsoRows } = useQuery<{ id: string }>(
    `SELECT account_id AS id FROM transactions WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT transfer_account_id FROM transactions WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL
     UNION SELECT account_id FROM templates WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT account_id FROM recurring_rules WHERE deleted_at IS NULL AND account_id IS NOT NULL
     UNION SELECT transfer_account_id FROM recurring_rules WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL`,
  )
  const enUso = useMemo(() => new Set(enUsoRows.map((r) => r.id)), [enUsoRows])
  // Movimientos por cuenta (origen o destino), para el motivo del aviso.
  const { data: movsRows } = useQuery<{ id: string; n: number }>(
    `SELECT id, SUM(n) AS n FROM (
       SELECT account_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND account_id IS NOT NULL GROUP BY account_id
       UNION ALL
       SELECT transfer_account_id AS id, COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND transfer_account_id IS NOT NULL GROUP BY transfer_account_id
     ) GROUP BY id`,
  )
  const movs = useMemo(() => new Map(movsRows.map((r) => [r.id, r.n])), [movsRows])

  const [editando, setEditando] = useState<Cuenta | "nuevo" | null>(null)
  // Se cierra sola si la cuenta ya no esta (se elimino desde su edicion).
  const editandoVigente =
    editando === "nuevo" || (editando !== null && cuentas.some((c) => c.id === editando.id))
  // La hoja de una tarjeta (0034), por id: al dia con lo que se paga.
  const [viendo, setViendo] = useState<string | null>(null)
  const tarjetaVista = viendo ? tarjetaDe(viendo) : undefined
  const [pagando, setPagando] = useState<string | null>(null)
  const tarjetaPagada = pagando ? tarjetaDe(pagando) : undefined
  const [avisando, setAvisando] = useState<string | null>(null)
  const tarjetaAvisada = avisando ? tarjetaDe(avisando) : undefined
  const [accion, setAccion] = useState<{
    tipo: "archivar" | "eliminar" | "no-se-elimina"
    c: Cuenta
  } | null>(null)
  const [reasignando, setReasignando] = useState<Cuenta | null>(null)
  // Ajustar el saldo (0033), encima de la edicion. El saldo, el de la consulta:
  // al dia aunque la hoja este abierta.
  const [ajustando, setAjustando] = useState<string | null>(null)
  const cuentaAjustada = todas.find((c) => c.id === ajustando)
  // Modo ordenar: las filas dejan de abrir la edicion y muestran flechas.
  const [ordenando, setOrdenando] = useState(false)

  // El saldo en otra moneda va y viene con su tarjeta: se archiva y se borra
  // con ella (el servidor hace lo mismo, 0034).
  // Su "Avisarme" se va con ella (el servidor tambien lo borra): sin esto
  // quedaba en el calendario hasta sincronizar.
  async function archivar(c: Cuenta, valor: number) {
    await db.execute("UPDATE accounts SET archived = ? WHERE id = ? OR parent_account_id = ?", [
      valor,
      c.id,
      c.id,
    ])
    if (valor) await db.execute("DELETE FROM reminders WHERE account_id = ?", [c.id])
    anunciar(
      valor
        ? `«${c.name}» archivada: ya no aparece al cargar, y su historia queda.`
        : `«${c.name}» volvió a las cuentas activas.`,
    )
  }
  async function borrar(c: Cuenta) {
    await db.execute("DELETE FROM reminders WHERE account_id = ?", [c.id])
    await db.execute("DELETE FROM accounts WHERE parent_account_id = ?", [c.id])
    await db.execute("DELETE FROM accounts WHERE id = ?", [c.id])
    anunciar(`Cuenta «${c.name}» eliminada.`)
  }

  function alTacho(c: Cuenta) {
    // Una tarjeta cuyo saldo en otra moneda tiene movimientos no se elimina:
    // mover esos movimientos no tiene adonde (otra tarjeta en esa moneda).
    if (saldosDe(c).some((s) => enUso.has(s.id))) setAccion({ tipo: "no-se-elimina", c })
    // En uso: se ofrece mover sus movimientos a otra cuenta en vez de negar.
    else if (enUso.has(c.id)) setReasignando(c)
    else setAccion({ tipo: "eliminar", c })
  }

  // Solo cuentas de la MISMA moneda: los montos estan en la moneda de la
  // cuenta, asi que mover pesos a una cuenta en dolares los corrompe.
  function destinosDe(c: Cuenta) {
    return cuentas
      .filter((x) => x.id !== c.id && x.currency === c.currency && !x.archived)
      .map((x) => ({ id: x.id, nombre: x.name }))
  }
  function alArchivar(c: Cuenta) {
    if (c.archived)
      archivar(c, 0) // desarchivar es reversible: directo
    else setAccion({ tipo: "archivar", c })
  }

  const activas = cuentas.filter((c) => !c.archived)
  const archivadas = cuentas.filter((c) => c.archived)

  async function mover(c: Cuenta, delta: -1 | 1) {
    await moverEnOrden(
      db,
      "UPDATE accounts SET sort_order = ? WHERE id = ?",
      activas,
      activas.findIndex((x) => x.id === c.id),
      delta,
    )
  }

  function filaCuenta(c: Cuenta, i?: number) {
    const Icono = iconoCuenta(c.type)
    const ordenable = ordenando && i !== undefined
    const tarjeta = c.type === "credit_card" ? tarjetaDe(c.id) : undefined
    // Tocar la fila la edita; una tarjeta abre su hoja (pagar, ajustar, sus
    // datos). Archivar y eliminar estan ahi (y en escritorio, tambien sobre la
    // fila con el mouse).
    return (
      <FilaInset
        key={c.id}
        onClick={ordenable ? undefined : () => (tarjeta ? setViendo(c.id) : setEditando(c))}
        chevron={!ordenable}
        acciones={
          ordenable ? undefined : (
            <AccionesFila
              nombre={c.name}
              archivada={c.archived === 1}
              onArchivar={() => alArchivar(c)}
              onEliminar={() => alTacho(c)}
            />
          )
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={cn("truncate font-medium", c.archived && "text-muted-foreground")}>
              {c.name}
            </p>
            {/* El saldo de hoy va a la derecha; el inicial es un dato de la
                edicion (1.10.0). De una tarjeta, sus datos (0034). */}
            {/* De una tarjeta, sin cortar: el cierre y el vencimiento son lo
                que importa de la linea (puede bajar a dos). */}
            <p
              className={cn(
                "flex items-center gap-1 text-xs text-muted-foreground",
                tarjeta ? "break-words" : "truncate",
              )}
            >
              {tarjeta ? descripcionTarjeta(tarjeta) : `${TIPOS[c.type] ?? c.type} · ${c.currency}`}
              {tarjeta && porTarjeta.get(c.id) && (
                <BellRing
                  className="h-3 w-3 shrink-0"
                  role="img"
                  aria-label="Con aviso del vencimiento"
                />
              )}
            </p>
          </div>
        </div>
        {!ordenable &&
          (tarjeta ? (
            // Lo que se debe, no un saldo negativo: un saldo por moneda, solo los
            // que tienen algo. Sin nada en ninguno, "Al día".
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              {(() => {
                const conAlgo = tarjeta.saldos.filter(
                  (s) => s.estado.deuda > 0 || s.estado.aFavor > 0,
                )
                return conAlgo.length > 0 ? (
                  conAlgo.map((s) => <EstadoSaldo key={s.id} saldo={s} />)
                ) : (
                  <EstadoSaldo saldo={tarjeta.saldos[0]} />
                )
              })()}
            </div>
          ) : (
            <Monto
              centavos={c.balance}
              moneda={c.currency}
              variante="lista"
              className={cn("shrink-0 font-medium", c.balance < 0 && "text-expense")}
            />
          ))}
        {ordenable && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Subir ${c.name}`}
              disabled={i === 0}
              onClick={() => mover(c, -1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Bajar ${c.name}`}
              disabled={i === activas.length - 1}
              onClick={() => mover(c, 1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </FilaInset>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <EncabezadoPantalla
        titulo="Cuentas"
        volver={volver}
        acciones={
          // Ordenando, "Listo" reemplaza a las demas (como "OK" en iOS).
          ordenando ? (
            <Button size="sm" onClick={() => setOrdenando(false)}>
              Listo
            </Button>
          ) : (
            <>
              {activas.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Ordenar"
                  title="Ordenar"
                  onClick={() => setOrdenando(true)}
                >
                  <ArrowUpDown className="h-5 w-5" />
                </Button>
              )}
              <BotonNuevo etiqueta="Nueva cuenta" onClick={() => setEditando("nuevo")} />
            </>
          )
        }
      />

      {tarjetaVista && (
        <HojaTarjeta
          tarjeta={tarjetaVista}
          conAviso={Boolean(porTarjeta.get(tarjetaVista.id))}
          onPagar={() => setPagando(tarjetaVista.id)}
          onAjustar={(s) => setAjustando(s.id)}
          onAvisarme={() => setAvisando(tarjetaVista.id)}
          onEditar={() => {
            const c = cuentas.find((x) => x.id === tarjetaVista.id)
            if (c) setEditando(c)
          }}
          onArchivar={() => {
            const c = cuentas.find((x) => x.id === tarjetaVista.id)
            if (!c) return
            alArchivar(c)
            if (c.archived) setViendo(null)
          }}
          onEliminar={() => {
            const c = cuentas.find((x) => x.id === tarjetaVista.id)
            if (c) alTacho(c)
          }}
          onCerrar={() => setViendo(null)}
        />
      )}
      {tarjetaPagada && (
        // Pagada, la hoja de la tarjeta queda abierta: muestra lo que se debe ahora.
        <PagarTarjeta tarjeta={tarjetaPagada} onCerrar={() => setPagando(null)} />
      )}
      {tarjetaAvisada?.due_day != null && (
        <HojaAvisarme
          existente={porTarjeta.get(tarjetaAvisada.id)}
          semilla={semillaDeTarjeta(
            { id: tarjetaAvisada.id, name: tarjetaAvisada.name, due_day: tarjetaAvisada.due_day },
            fechaISO(new Date()),
          )}
          onCerrar={() => setAvisando(null)}
        />
      )}

      <Hoja
        abierta={editandoVigente}
        onOpenChange={(v) => {
          if (!v) setEditando(null)
        }}
        titulo={
          editando === "nuevo"
            ? "Nueva cuenta"
            : editando?.type === "credit_card"
              ? "Editar tarjeta"
              : "Editar cuenta"
        }
      >
        {editando && (
          <FormularioCuenta
            inicial={editando === "nuevo" ? null : editando}
            saldos={editando === "nuevo" ? [] : saldosDe(editando)}
            enUso={enUso}
            onCerrar={() => setEditando(null)}
          />
        )}
        {/* Las acciones de una tarjeta estan en su hoja (0034). */}
        {editando && editando !== "nuevo" && editando.type !== "credit_card" && (
          <AccionesEdicion
            archivada={editando.archived === 1}
            onArchivar={() => {
              alArchivar(editando)
              // Desarchivar es directo: la edicion ya no tiene nada que hacer.
              if (editando.archived) setEditando(null)
            }}
            onEliminar={() => alTacho(editando)}
          >
            {!editando.archived && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => setAjustando(editando.id)}
              >
                <Scale className="h-4 w-4" aria-hidden />
                Ajustar saldo
              </Button>
            )}
          </AccionesEdicion>
        )}
      </Hoja>
      {cuentaAjustada && (
        <AjustarSaldo
          cuenta={cuentaAjustada}
          saldo={cuentaAjustada.balance}
          onCerrar={(ajustado) => {
            setAjustando(null)
            // Hecho el ajuste de una cuenta, no queda nada que editar. La hoja de
            // una tarjeta queda: muestra lo que se debe ahora.
            if (ajustado) setEditando(null)
          }}
        />
      )}

      {activas.length > 0 && <ListaInset>{activas.map((c, i) => filaCuenta(c, i))}</ListaInset>}
      {/* Sin cuentas la pantalla quedaba vacia bajo el titulo (1.12.0). */}
      {cuentas.length === 0 && (
        <Vacio
          icono={Wallet}
          titulo="Sin cuentas todavía"
          detalle="Una cuenta es donde está tu plata: efectivo, banco o tarjeta. Cada movimiento sale de una."
          accion={{ onClick: () => setEditando("nuevo"), etiqueta: "Nueva cuenta" }}
        />
      )}

      {archivadas.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Archivadas</h2>
          <ListaInset>{archivadas.map(filaCuenta)}</ListaInset>
        </section>
      )}

      <Confirmar
        abierta={accion !== null}
        onOpenChange={(v) => {
          if (!v) setAccion(null)
        }}
        titulo={
          accion?.tipo === "archivar"
            ? "Archivar cuenta"
            : accion?.tipo === "no-se-elimina"
              ? "No se puede eliminar"
              : "Eliminar cuenta"
        }
        detalle={
          accion?.tipo === "eliminar"
            ? saldosDe(accion.c).length > 0
              ? `Se elimina "${accion.c.name}" con su saldo en ${saldosDe(accion.c)[0].currency}. No tienen movimientos.`
              : `Se elimina "${accion.c.name}". No tiene movimientos.`
            : accion?.tipo === "no-se-elimina"
              ? `Su saldo en ${saldosDe(accion.c)[0]?.currency ?? "otra moneda"} tiene movimientos. Archivala: se oculta de los selectores y conserva su historial.`
              : accion
                ? `"${accion.c.name}" se oculta de los selectores, pero conserva su historial. Podés desarchivarla cuando quieras.${porTarjeta.get(accion.c.id) ? " Su recordatorio de vencimiento se borra." : ""}`
                : undefined
        }
        etiqueta={accion?.tipo === "eliminar" ? "Eliminar" : "Archivar"}
        destructivo={accion?.tipo === "eliminar"}
        onConfirmar={() => {
          if (!accion) return
          if (accion.tipo === "eliminar") borrar(accion.c)
          else archivar(accion.c, 1)
          setEditando(null)
          setViendo(null)
        }}
      />
      {reasignando && (
        <HojaReasignar
          abierta
          onOpenChange={(v) => {
            if (!v) setReasignando(null)
          }}
          titulo="Eliminar y mover"
          nombre={reasignando.name}
          detalle={(() => {
            const n = movs.get(reasignando.id) ?? 0
            return n > 0
              ? `sus ${n} movimiento${n === 1 ? "" : "s"} y todo lo que la use`
              : "todo lo que la use"
          })()}
          destinos={destinosDe(reasignando)}
          plan={(destino) => planCuenta(reasignando.id, destino)}
        />
      )}
    </div>
  )
}

// Dia del mes 1..31, o null. Vacio o fuera de rango => null.
function dia(v: string): number | null {
  const n = Number(v)
  return v.trim() && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

function FormularioCuenta({
  inicial,
  saldos,
  enUso,
  onCerrar,
}: {
  inicial: Cuenta | null
  // Los saldos en otra moneda de la tarjeta (0034).
  saldos: Cuenta[]
  enUso: Set<string>
  onCerrar: () => void
}) {
  const db = usePowerSync()
  const [name, setName] = useState(inicial?.name ?? "")
  const [type, setType] = useState(inicial?.type ?? "cash")
  const [currency, setCurrency] = useState(inicial?.currency ?? "ARS")
  const [apertura, setApertura] = useState(
    inicial ? aTextoEditable(inicial.opening_balance, inicial.currency) : "",
  )
  const [offBudget, setOffBudget] = useState(inicial?.off_budget === 1)
  // Tarjeta de credito (0034).
  const [marca, setMarca] = useState(inicial?.brand ?? "")
  const [last4, setLast4] = useState(inicial?.last4 ?? "")
  const [cierre, setCierre] = useState(inicial?.closing_day ? String(inicial.closing_day) : "")
  const [vence, setVence] = useState(inicial?.due_day ? String(inicial.due_day) : "")
  const [limite, setLimite] = useState(
    inicial?.credit_limit != null ? aTextoEditable(inicial.credit_limit, inicial.currency) : "",
  )
  const otra = otraMoneda(currency.toUpperCase())
  const saldoOtra = saldos.find((s) => s.currency === otra)
  const [conOtra, setConOtra] = useState(Boolean(saldoOtra))
  const [error, setError] = useState("")
  const tarjeta = type === "credit_card"
  // Una tarjeta que ya tiene saldo en otra moneda no cambia de tipo (el servidor
  // tampoco lo deja): primero se saca ese saldo.
  const tipoFijo = Boolean(inicial) && inicial?.type === "credit_card" && saldos.length > 0

  async function guardar() {
    if (!name.trim()) return setError("Poné un nombre")
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError("Moneda: 3 letras (ej. ARS)")
    const cur = currency.toUpperCase()
    // En la moneda de la cuenta: con la base, una cuenta en JPY guardaba 100
    // veces lo tipeado.
    const opening = apertura.trim() ? (aCentavos(apertura, cur) ?? 0) : 0
    if (saldos.some((s) => s.currency === cur))
      return setError(`La tarjeta ya tiene un saldo aparte en ${cur}`)
    if (tarjeta && last4.trim() && !/^\d{4}$/.test(last4.trim()))
      return setError("Los últimos 4 son cuatro números")
    if (tarjeta && cierre.trim() && dia(cierre) === null)
      return setError("El día de cierre va del 1 al 31")
    if (tarjeta && vence.trim() && dia(vence) === null)
      return setError("El día de vencimiento va del 1 al 31")
    const limiteCentavos = tarjeta && limite.trim() ? aCentavos(limite, cur) : null
    if (tarjeta && limite.trim() && (limiteCentavos === null || limiteCentavos < 0))
      return setError("El límite es un monto")
    if (saldoOtra && !conOtra && enUso.has(saldoOtra.id))
      return setError(`El saldo en ${otra} tiene movimientos: no se puede sacar`)
    // Los datos de tarjeta, solo en una tarjeta (el servidor lo exige).
    const datos = tarjeta
      ? [marca.trim() || null, last4.trim() || null, dia(cierre), dia(vence), limiteCentavos]
      : [null, null, null, null, null]

    try {
      const id = inicial?.id ?? uuidv4()
      if (inicial) {
        // Si cambia el dia de vencimiento, el servidor corre su recordatorio.
        await db.execute(
          `UPDATE accounts SET name = ?, type = ?, currency = ?, opening_balance = ?, off_budget = ?,
             brand = ?, last4 = ?, closing_day = ?, due_day = ?, credit_limit = ?
           WHERE id = ?`,
          [name.trim(), type, cur, opening, offBudget ? 1 : 0, ...datos, inicial.id],
        )
      } else {
        await db.execute(
          // Con su dueño: Cuentas, Inicio y Presupuesto filtran por
          // `owner_id IS NOT NULL`, y sin el una cuenta creada sin conexion no
          // aparecia hasta sincronizar. El servidor lo ignora y pone el suyo.
          `INSERT INTO accounts (id, owner_id, name, type, currency, opening_balance, off_budget,
             visibility, archived, sort_order, brand, last4, closing_day, due_day, credit_limit)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'private', 0, 0, ?, ?, ?, ?, ?)`,
          [id, usuarioActualId(), name.trim(), type, cur, opening, offBudget ? 1 : 0, ...datos],
        )
      }
      // El saldo en otra moneda (0034): se crea, se renombra o se saca.
      if (tarjeta && conOtra && !saldoOtra) {
        await db.execute(
          `INSERT INTO accounts (id, owner_id, name, type, currency, opening_balance, off_budget,
             visibility, archived, sort_order, parent_account_id)
           VALUES (?, ?, ?, 'credit_card', ?, 0, 0, 'private', 0, 0, ?)`,
          [uuidv4(), usuarioActualId(), `${name.trim()} ${otra}`, otra, id],
        )
      } else if (saldoOtra && (!tarjeta || !conOtra)) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [saldoOtra.id])
      } else if (saldoOtra && saldoOtra.name !== `${name.trim()} ${otra}`) {
        await db.execute("UPDATE accounts SET name = ? WHERE id = ?", [
          `${name.trim()} ${otra}`,
          saldoOtra.id,
        ])
      }
      anunciar(
        inicial
          ? `Cambios guardados en «${name.trim()}».`
          : `${tarjeta ? "Tarjeta" : "Cuenta"} «${name.trim()}» creada.`,
      )
      onCerrar()
    } catch {
      setError(
        "No se pudo guardar en este dispositivo. Probá de nuevo; si sigue pasando, cerrá y volvé a abrir Mango.",
      )
    }
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tarjeta ? "Visa" : "Caja de ahorro"}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo">
          {tipoFijo ? (
            <p className="flex min-h-11 items-center text-sm">{TIPOS[type]}</p>
          ) : (
            <SelectorEntidad
              titulo="Tipo de cuenta"
              placeholder="Elegí un tipo"
              opciones={Object.entries(TIPOS).map(([v, l]) => ({ id: v, nombre: l }))}
              valor={type}
              onCambio={setType}
            />
          )}
        </Campo>
        <Campo etiqueta="Moneda">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
        </Campo>
      </div>

      {/* Deja de ser tarjeta: lo que se pierde se dice antes de guardar. */}
      {inicial?.type === "credit_card" && !tarjeta && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          Deja de ser tarjeta: al guardar se borran su cierre, su vencimiento, su marca y su límite,
          y su recordatorio de vencimiento.
        </p>
      )}
      {tarjeta && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Marca (opcional)">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Visa" />
            </Campo>
            <Campo etiqueta="Últimos 4 (opcional)">
              <Input
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Día de cierre">
              <Input
                value={cierre}
                onChange={(e) => setCierre(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={2}
                placeholder="24"
              />
            </Campo>
            <Campo etiqueta="Día de vencimiento">
              <Input
                value={vence}
                onChange={(e) => setVence(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={2}
                placeholder="5"
              />
            </Campo>
          </div>
          {/* Para que se entienda que se calcula con esto. */}
          <p className="text-xs text-muted-foreground">
            Con el cierre y el vencimiento, Mango calcula cuánto vence de cada resumen y te puede
            avisar.
          </p>
          <Campo etiqueta={`Límite (opcional, ${currency.toUpperCase()})`}>
            <CampoMonto
              moneda={currency.toUpperCase()}
              value={limite}
              onChange={setLimite}
              placeholder="Para ver cuánto te queda disponible"
              className="tabular"
            />
          </Campo>
          <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>También compro en {otra === "USD" ? "dólares" : otra} (un saldo aparte)</span>
            <Interruptor encendido={conOtra} onCambio={setConOtra} etiqueta={`Saldo en ${otra}`} />
          </div>
        </>
      )}

      <Campo
        etiqueta={
          tarjeta
            ? "Saldo inicial (opcional; lo que debías, en negativo)"
            : "Saldo inicial (opcional)"
        }
      >
        <CampoMonto
          moneda={currency.toUpperCase()}
          value={apertura}
          onChange={setApertura}
          placeholder="0"
        />
      </Campo>
      {/* Binario: Interruptor, no checkbox nativo (DESIGN.md 7; el nativo media 13 px). */}
      <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>No contar en el patrimonio (plata de terceros)</span>
        <Interruptor
          encendido={offBudget}
          onCambio={setOffBudget}
          etiqueta="No contar en el patrimonio (plata de terceros)"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
