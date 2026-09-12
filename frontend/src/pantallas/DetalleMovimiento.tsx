import { usePowerSync, useQuery } from "@powersync/react"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { SelectorEtiquetas } from "@/componentes/SelectorEtiquetas"
import { Button } from "@/componentes/ui/button"
import { Campo } from "@/componentes/ui/campo"
import { Input } from "@/componentes/ui/input"
import { Select } from "@/componentes/ui/select"
import { ordenarJerarquico } from "@/lib/categorias"
import { cotizacionDe, cotizacionLegible } from "@/lib/conversion"
import { aCentavos, formatearMonto } from "@/lib/dinero"
import { uuidv4 } from "@/lib/uuid"

interface Tx {
  id: string
  kind: "expense" | "income" | "transfer"
  amount: number
  currency: string
  amount_account: number | null
  exchange_rate: string | null
  occurred_at: string
  account_id: string | null
  transfer_account_id: string | null
  category_id: string | null
  payee: string | null
  notes: string | null
}
interface Opcion {
  id: string
  name: string
  currency?: string
  kind?: string
  parent_id?: string | null
}

const KIND_LABEL = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" }

function isoALocal(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function DetalleMovimiento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const db = usePowerSync()

  const { data: filas } = useQuery<Tx>("SELECT * FROM transactions WHERE id = ?", [id ?? ""])
  const tx = filas[0]

  const { data: cuentas } = useQuery<Opcion>(
    "SELECT id, name, currency FROM accounts WHERE deleted_at IS NULL ORDER BY name",
  )
  const { data: categorias } = useQuery<Opcion>(
    "SELECT id, name, kind, parent_id FROM categories WHERE deleted_at IS NULL AND archived = 0 ORDER BY name",
  )
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.name])), [categorias])

  // Etiquetas ya asociadas a este movimiento (ver 3.5.1).
  const { data: etiquetasActuales } = useQuery<{ tag_id: string }>(
    "SELECT tag_id FROM transaction_tags WHERE transaction_id = ? AND deleted_at IS NULL",
    [id ?? ""],
  )
  const idsActuales = useMemo(() => etiquetasActuales.map((r) => r.tag_id), [etiquetasActuales])

  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [monto, setMonto] = useState("")
  // Monto debitado de la cuenta, cuando la moneda del movimiento no es la de
  // la cuenta. Es la fuente de verdad; la cotizacion se deduce (ver 0005).
  const [debitado, setDebitado] = useState("")
  const [cuentaId, setCuentaId] = useState("")
  const [destinoId, setDestinoId] = useState("")
  const [categoriaId, setCategoriaId] = useState("")
  const [payee, setPayee] = useState("")
  const [notas, setNotas] = useState("")
  const [cuando, setCuando] = useState("")
  const [error, setError] = useState("")

  // Prefill cuando llega la transaccion (una vez por id).
  useEffect(() => {
    if (!tx) return
    setMonto((tx.amount / 100).toString().replace(".", ","))
    setDebitado(tx.amount_account ? (tx.amount_account / 100).toString().replace(".", ",") : "")
    setCuentaId(tx.account_id ?? "")
    setDestinoId(tx.transfer_account_id ?? "")
    setCategoriaId(tx.category_id ?? "")
    setPayee(tx.payee ?? "")
    setNotas(tx.notes ?? "")
    setCuando(isoALocal(tx.occurred_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx?.id])

  // Las asociaciones llegan por su propia consulta: se siembran aparte.
  const etiquetasSembradas = useRef(false)
  useEffect(() => {
    if (etiquetasSembradas.current || idsActuales.length === 0) return
    etiquetasSembradas.current = true
    setEtiquetas(idsActuales)
  }, [idsActuales])

  if (!tx) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  }

  const categoriasDelTipo = ordenarJerarquico(categorias).filter(
    (c) => c.kind === (tx.kind === "income" ? "income" : "expense"),
  )

  // Moneda de la cuenta elegida (puede cambiar en el formulario) y cotizacion
  // que implica lo tipeado.
  const monedaCuentaSel = cuentas.find((c) => c.id === cuentaId)?.currency ?? tx?.currency ?? ""
  const cotizacionVista =
    tx && monedaCuentaSel !== tx.currency && debitado.trim()
      ? cotizacionDe(
          aCentavos(monto) ?? 0,
          tx.currency,
          aCentavos(debitado, monedaCuentaSel) ?? 0,
          monedaCuentaSel,
        )
      : null

  async function guardar() {
    setError("")
    const centavos = aCentavos(monto)
    if (!centavos || centavos <= 0) return setError("Monto inválido")
    if (!cuentaId) return setError("Elegí una cuenta")
    if (tx!.kind !== "transfer" && !categoriaId) return setError("Elegí una categoría")
    if (tx!.kind === "transfer" && !destinoId) return setError("Elegí la cuenta de destino")
    if (tx!.kind === "transfer" && destinoId === cuentaId)
      return setError("Las cuentas deben ser distintas")

    // La conversion se recalcula desde el monto debitado, que es lo que figura
    // en el resumen del banco. Si las monedas coinciden, los dos quedan NULL.
    const monedaCuenta = cuentas.find((c) => c.id === cuentaId)?.currency ?? tx!.currency
    const difieren = tx!.currency !== monedaCuenta
    const centavosDebitado = debitado.trim() ? (aCentavos(debitado, monedaCuenta) ?? 0) : 0
    const cotizacion =
      difieren && centavosDebitado > 0
        ? cotizacionDe(centavos, tx!.currency, centavosDebitado, monedaCuenta)
        : null

    await db.execute(
      `UPDATE transactions SET amount = ?, account_id = ?, transfer_account_id = ?,
         category_id = ?, payee = ?, notes = ?, occurred_at = ?,
         amount_account = ?, exchange_rate = ? WHERE id = ?`,
      [
        centavos,
        cuentaId,
        tx!.kind === "transfer" ? destinoId : null,
        tx!.kind === "transfer" ? null : categoriaId,
        payee || null,
        notas || null,
        new Date(cuando).toISOString(),
        difieren && centavosDebitado > 0 ? centavosDebitado : null,
        difieren && cotizacion ? cotizacion : null,
        tx!.id,
      ],
    )

    // Diff de etiquetas: solo lo que cambio (el unico parcial no admite
    // duplicados, asi que no se re-inserta lo que ya estaba).
    for (const tagId of etiquetas.filter((t) => !idsActuales.includes(t))) {
      await db.execute(
        "INSERT INTO transaction_tags (id, transaction_id, tag_id) VALUES (?, ?, ?)",
        [uuidv4(), tx!.id, tagId],
      )
    }
    for (const tagId of idsActuales.filter((t) => !etiquetas.includes(t))) {
      await db.execute("DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?", [
        tx!.id,
        tagId,
      ])
    }
    navigate(-1)
  }

  async function borrar() {
    await db.execute("DELETE FROM transactions WHERE id = ?", [tx!.id])
    navigate("/movimientos")
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">{KIND_LABEL[tx.kind]}</h1>
      </header>

      <Campo etiqueta={`Monto (${tx.currency})`}>
        <Input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          inputMode="decimal"
          className="tabular text-lg"
        />
        <span className="text-xs text-muted-foreground">
          = {formatearMonto(aCentavos(monto) ?? 0, { moneda: tx?.currency })}
        </span>
      </Campo>

      {/* Solo si la moneda del movimiento no es la de la cuenta. La cotizacion
          es informativa: se deduce del monto debitado (ver 0005). */}
      {monedaCuentaSel !== tx.currency && (
        <Campo etiqueta={`Monto debitado de la cuenta (${monedaCuentaSel})`}>
          <Input
            value={debitado}
            onChange={(e) => setDebitado(e.target.value)}
            placeholder="Lo que figura en el resumen"
            inputMode="decimal"
            className="tabular"
          />
          <span className="text-xs text-muted-foreground">
            {cotizacionVista
              ? `1 ${tx.currency} = ${cotizacionLegible(cotizacionVista)} ${monedaCuentaSel}`
              : "Falta este dato: el movimiento vale igual, la cotización se completa cuando llegue el resumen."}
          </span>
        </Campo>
      )}

      <Campo etiqueta={tx.kind === "transfer" ? "Desde" : "Cuenta"}>
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Elegí una cuenta</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Campo>

      {tx.kind === "transfer" && (
        <Campo etiqueta="Hacia">
          <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Elegí la cuenta de destino</option>
            {cuentas
              .filter((c) => c.id !== cuentaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Campo>
      )}

      {tx.kind !== "transfer" && (
        <Campo etiqueta="Categoría">
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Elegí una categoría</option>
            {categoriasDelTipo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `${nombreCat.get(c.parent_id) ?? "—"} › ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <Campo etiqueta="Comercio / contraparte">
        <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </Campo>

      <Campo etiqueta="Fecha y hora">
        <Input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
      </Campo>

      <Campo etiqueta="Notas">
        <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>

      <Campo etiqueta="Etiquetas">
        <SelectorEtiquetas seleccionadas={etiquetas} onCambio={setEtiquetas} />
      </Campo>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={guardar}>
          Guardar
        </Button>
        <Button variant="destructive" size="icon" onClick={borrar} aria-label="Borrar">
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
