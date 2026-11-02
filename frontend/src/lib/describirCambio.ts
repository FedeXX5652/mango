import { formatearMonto } from "@/lib/dinero"
import { formatearFechaCorta } from "@/lib/fecha"

// Un cambio local (lo que sube la cola de PowerSync) dicho para la persona
// (1.12.0): "Gasto nuevo de $ 1.500,00 en Café (12/10/2026)", "Cuenta nueva
// «Visa»". Lo usan el aviso de un cambio que el servidor rechazo y la pantalla
// "Cambios que no se guardaron" (0011). Antes decia "Alta de movimiento".

// [nombre, femenino]
const COSAS: Record<string, [string, boolean]> = {
  accounts: ["cuenta", true],
  categories: ["categoría", true],
  tags: ["etiqueta", true],
  transaction_tags: ["etiqueta de un movimiento", true],
  transaction_splits: ["reparto de un gasto", false],
  transaction_payers: ["parte de un gasto compartido", true],
  settlements: ["pago entre miembros", false],
  templates: ["plantilla", true],
  recurring_rules: ["regla recurrente", true],
  budgets: ["sobre del mes", false],
  budget_rules: ["sobre automático", false],
  goals: ["meta", true],
  debts: ["deuda", true],
  reminders: ["recordatorio", false],
  reminder_cycles: ["vencimiento", false],
  exchange_rates: ["cotización", true],
  notifications: ["aviso", false],
  groups: ["grupo", false],
  group_members: ["miembro de un grupo", false],
  attachments: ["adjunto", false],
  payment_methods: ["medio de pago", false],
  payment_method_accounts: ["cuenta de un medio de pago", true],
}

const TIPO_MOV: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function movimiento(op: string, d: Record<string, unknown>): string {
  const tipo = TIPO_MOV[String(d.kind)] ?? "Movimiento"
  const monto =
    typeof d.amount === "number"
      ? ` de ${formatearMonto(d.amount, { moneda: texto(d.currency) ?? undefined })}`
      : ""
  const donde = texto(d.payee) ? ` en ${texto(d.payee)}` : ""
  const cuando = texto(d.occurred_at) ? ` (${formatearFechaCorta(String(d.occurred_at))})` : ""
  if (op === "PUT")
    return `${tipo} ${tipo === "Transferencia" ? "nueva" : "nuevo"}${monto}${donde}${cuando}`
  if (op === "DELETE") return "Movimiento borrado"
  return `Cambio en un movimiento${monto}${donde}${cuando}`
}

export function describirCambio(tabla: string, op: string, datos: Record<string, unknown>): string {
  if (tabla === "transactions") return movimiento(op, datos)
  if (tabla === "users") return "Cambio en tus preferencias"
  const [cosa, fem] = COSAS[tabla] ?? ["dato", false]
  const nombre = texto(datos.name) ?? texto(datos.title) ?? texto(datos.counterparty)
  const cual = nombre ? ` «${nombre}»` : ""
  if (op === "PUT") return `${mayuscula(cosa)} ${fem ? "nueva" : "nuevo"}${cual}`
  if (op === "DELETE") return `${mayuscula(cosa)} ${fem ? "borrada" : "borrado"}${cual}`
  return `Cambio en ${fem ? "la" : "el"} ${cosa}${cual}`
}
