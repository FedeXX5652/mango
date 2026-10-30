import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import { useCotizaciones } from "@/hooks/useCotizaciones"
import { AJUSTE } from "@/lib/categorias"
import { cotizarConDolar } from "@/lib/cotizaciones"
import { claveDia, fechaISO } from "@/lib/fecha"
import { convertir } from "@/lib/patrimonio"
import { saldoCuenta } from "@/lib/saldos"
import { type EstadoTarjeta, type MovTarjeta, disponible, estadoTarjeta } from "@/lib/tarjeta"

// Las tarjetas de credito (0034): cada una con sus saldos (la principal y, si
// tiene, el de otra moneda), lo que se debe, lo que vence y el disponible.

export interface SaldoTarjeta {
  id: string
  name: string
  currency: string
  balance: number
  estado: EstadoTarjeta
}

export interface Tarjeta {
  id: string
  name: string
  currency: string
  brand: string | null
  last4: string | null
  closing_day: number | null
  due_day: number | null
  credit_limit: number | null
  archived: boolean
  // La principal primero.
  saldos: SaldoTarjeta[]
  // Limite - lo que se debe en todos los saldos, en la moneda del limite. null:
  // sin limite, o falta la cotizacion de algun saldo.
  disponible: number | null
}

interface FilaCuenta {
  id: string
  name: string
  currency: string
  brand: string | null
  last4: string | null
  closing_day: number | null
  due_day: number | null
  credit_limit: number | null
  parent_account_id: string | null
  archived: number
  balance: number
}

// Las personales: una tarjeta conjunta de un grupo no existe (las conjuntas
// son cuentas de plata del grupo).
const SQL_CUENTAS = `
  SELECT a.id, a.name, a.currency, a.brand, a.last4, a.closing_day, a.due_day,
         a.credit_limit, a.parent_account_id, a.archived, ${saldoCuenta()} AS balance
  FROM accounts a
  WHERE a.deleted_at IS NULL AND a.owner_id IS NOT NULL AND a.type = 'credit_card'
  ORDER BY a.sort_order, a.created_at`

// Lo que le pasa a cada saldo de tarjeta, con el mismo signo que su saldo
// (lib/saldos). Una compra es un gasto que no es ajuste del banco (0033): solo
// las compras se facturan por cuotas.
const SQL_MOVS = `
  SELECT t.account_id AS cuenta, t.occurred_at, t.installments AS cuotas,
         CASE t.kind WHEN 'income' THEN COALESCE(t.amount_account, t.amount)
                     WHEN 'expense' THEN -COALESCE(t.amount_account, t.amount_owner, t.amount)
                     ELSE -COALESCE(t.amount_account, t.amount) END AS efecto,
         CASE WHEN t.kind = 'expense'
                AND (c.system_key IS NULL OR c.system_key NOT IN ('${AJUSTE.income}', '${AJUSTE.expense}'))
              THEN 1 ELSE 0 END AS compra
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id AND a.type = 'credit_card'
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.deleted_at IS NULL AND t.status = 'confirmed'
  UNION ALL
  SELECT t.transfer_account_id, t.occurred_at, NULL, t.amount, 0
  FROM transactions t
  JOIN accounts a ON a.id = t.transfer_account_id AND a.type = 'credit_card'
  WHERE t.deleted_at IS NULL AND t.status = 'confirmed' AND t.kind = 'transfer'`

interface FilaMov {
  cuenta: string
  occurred_at: string
  cuotas: number | null
  efecto: number
  compra: number
}

export function useTarjetas(): { tarjetas: Tarjeta[]; cargando: boolean } {
  const { data: cuentas, isLoading: cargaCuentas } = useQuery<FilaCuenta>(SQL_CUENTAS)
  const { data: movs, isLoading: cargaMovs } = useQuery<FilaMov>(SQL_MOVS)
  const { indice, conv, cargando: cargaFx } = useCotizaciones()

  const tarjetas = useMemo(() => {
    const hoy = fechaISO(new Date())
    const porCuenta = new Map<string, MovTarjeta[]>()
    for (const m of movs) {
      const lista = porCuenta.get(m.cuenta) ?? []
      lista.push({
        fecha: claveDia(m.occurred_at),
        efecto: m.efecto,
        compra: m.compra === 1,
        cuotas: m.cuotas,
      })
      porCuenta.set(m.cuenta, lista)
    }
    const ids = new Set(cuentas.map((c) => c.id))
    // Un saldo cuya tarjeta ya no esta (se borro en otro dispositivo y todavia
    // no bajo) se muestra como tarjeta propia en vez de desaparecer.
    const principales = cuentas.filter((c) => !c.parent_account_id || !ids.has(c.parent_account_id))
    return principales.map((p): Tarjeta => {
      const dias = { cierre: p.closing_day, vence: p.due_day }
      const saldos = [p, ...cuentas.filter((c) => c.parent_account_id === p.id)].map(
        (c): SaldoTarjeta => ({
          id: c.id,
          name: c.name,
          currency: c.currency,
          balance: c.balance,
          estado: estadoTarjeta(c.balance, porCuenta.get(c.id) ?? [], dias, hoy),
        }),
      )
      let libre: number | null = null
      if (p.credit_limit != null) {
        // Los otros saldos, al dolar tarjeta (0031); si no hay, al de siempre.
        const otras = saldos.slice(1).map((s) => {
          if (s.estado.deuda === 0) return 0
          const c =
            cotizarConDolar(s.currency, p.currency, indice, "tarjeta") ??
            conv(s.currency, p.currency)
          return c ? convertir(s.estado.deuda, s.currency, p.currency, c.rate) : null
        })
        libre = otras.some((o) => o === null)
          ? null
          : disponible(p.credit_limit, saldos[0].estado.deuda, otras as number[])
      }
      return {
        id: p.id,
        name: p.name,
        currency: p.currency,
        brand: p.brand,
        last4: p.last4,
        closing_day: p.closing_day,
        due_day: p.due_day,
        credit_limit: p.credit_limit,
        archived: p.archived === 1,
        saldos,
        disponible: libre,
      }
    })
  }, [cuentas, movs, indice, conv])

  return { tarjetas, cargando: cargaCuentas || cargaMovs || cargaFx }
}
