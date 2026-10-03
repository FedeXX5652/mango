import { useQuery } from "@powersync/react"
import { useMemo } from "react"

import {
  type AporteHistoria,
  type GastoHistoria,
  type MiembroGrupo,
  type PagoHistoria,
  type ResumenMoneda,
  type SplitRow,
  type TxGrupo,
  historiaGrupo,
  resumenGrupo,
} from "@/lib/grupo"
import { TX_GRUPO } from "@/lib/lente"
import { usuarioActualId } from "@/lib/sesion"

// Los datos de un grupo que comparten sus pantallas (0026): miembros con nombre,
// los gastos compartidos (sobre el lente, 0021), sus repartos, los pagos entre
// miembros y el balance acumulado.

export interface GastoGrupo extends TxGrupo {
  occurred_at: string
  payee: string | null
}

export interface PagoGrupo {
  id: string
  from_user_id: string
  to_user_id: string
  amount: number
  currency: string
  occurred_at: string
  account_id: string | null
  pago_real: number | null
}

// Plata que un miembro puso en (o saco de) una cuenta conjunta del grupo: una
// transferencia comun (0017), que la sync le muestra al grupo sin decir de que
// cuenta personal salio (sync-config, lente b/c).
export interface AporteGrupo {
  id: string
  owner_id: string
  amount: number
  currency: string
  occurred_at: string
  sentido: "entra" | "sale"
  cuenta: string
}

export interface CategoriaGrupo {
  id: string
  name: string
  icon: string | null
  parent_id: string | null
}

export function useGrupo(groupId: string) {
  const miId = usuarioActualId() ?? ""

  const { data: gastos, isLoading: cargandoGastos } = useQuery<GastoGrupo>(
    `SELECT t.id, t.owner_id, t.amount, t.currency, t.category_id, t.kind, t.paid_from_group,
            t.occurred_at, t.payee
     FROM ${TX_GRUPO} t
     WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL AND t.kind = 'expense'
     ORDER BY t.occurred_at DESC`,
    [groupId],
  )
  const { data: splits } = useQuery<SplitRow>(
    `SELECT s.transaction_id, s.user_id, s.amount
     FROM transaction_splits s JOIN ${TX_GRUPO} t ON t.id = s.transaction_id
     WHERE t.group_id = ? AND t.visibility = 'shared' AND t.deleted_at IS NULL AND s.deleted_at IS NULL`,
    [groupId],
  )
  // `pago_real` dice si fue un pago con plata (0017) sin decir de que cuenta.
  const { data: pagos } = useQuery<PagoGrupo>(
    `SELECT id, from_user_id, to_user_id, amount, currency, occurred_at, account_id, pago_real
     FROM settlements WHERE group_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC`,
    [groupId],
  )
  const { data: aportes } = useQuery<AporteGrupo>(
    `SELECT t.id, t.owner_id, t.amount, t.currency, t.occurred_at,
            CASE WHEN ca.id IS NOT NULL THEN 'entra' ELSE 'sale' END AS sentido,
            COALESCE(ca.name, co.name) AS cuenta
     FROM ${TX_GRUPO} t
     LEFT JOIN accounts ca ON ca.id = t.transfer_account_id AND ca.group_id = ?
     LEFT JOIN accounts co ON co.id = t.account_id AND co.group_id = ?
     WHERE t.kind = 'transfer' AND t.deleted_at IS NULL AND (ca.id IS NOT NULL OR co.id IS NOT NULL)
     ORDER BY t.occurred_at DESC`,
    [groupId, groupId],
  )
  const { data: miembrosRows } = useQuery<{ user_id: string; display_name: string | null }>(
    `SELECT gm.user_id, u.display_name FROM group_members gm LEFT JOIN member_profiles u ON u.id = gm.user_id
     WHERE gm.group_id = ? AND gm.deleted_at IS NULL`,
    [groupId],
  )
  const { data: categorias } = useQuery<CategoriaGrupo>(
    "SELECT id, name, icon, parent_id FROM categories WHERE group_id = ? AND deleted_at IS NULL",
    [groupId],
  )

  const miembros: MiembroGrupo[] = useMemo(
    () =>
      miembrosRows.map((m) => ({
        user_id: m.user_id,
        nombre: m.display_name || m.user_id.slice(0, 8),
      })),
    [miembrosRows],
  )
  const categoria = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const splitsDe = useMemo(() => {
    const m = new Map<string, SplitRow[]>()
    for (const s of splits) m.set(s.transaction_id, [...(m.get(s.transaction_id) ?? []), s])
    return m
  }, [splits])

  const balance: ResumenMoneda[] = useMemo(
    () => resumenGrupo(gastos, miembros, { splits, settlements: pagos }),
    [gastos, miembros, splits, pagos],
  )

  // "Vos" para mi; el nombre para los demas; un respaldo si alguien dejo el grupo.
  const nombre = (userId: string) =>
    userId === miId ? "Vos" : (miembros.find((m) => m.user_id === userId)?.nombre ?? "Otro")

  return {
    miId,
    gastos,
    splitsDe,
    pagos,
    aportes,
    miembros,
    categoria,
    categorias,
    balance,
    nombre,
    cargando: cargandoGastos,
  }
}

// La historia de un grupo (0026): gastos, pagos entre miembros y aportes a la
// conjunta, intercalados por fecha como en Splitwise. La usan el Inicio del
// grupo (lo ultimo) y Movimientos.
export type ItemHistoria =
  | (GastoHistoria & { gasto: GastoGrupo })
  | (PagoHistoria & { pago: PagoGrupo })
  | (AporteHistoria & { aporte: AporteGrupo })

export function armarHistoria(
  gastos: GastoGrupo[],
  pagos: PagoGrupo[],
  aportes: AporteGrupo[] = [],
): ItemHistoria[] {
  return historiaGrupo<ItemHistoria>(
    gastos.map((g) => ({
      tipo: "gasto" as const,
      id: g.id,
      fecha: g.occurred_at,
      owner_id: g.owner_id,
      amount: g.amount,
      currency: g.currency,
      gasto: g,
    })),
    pagos.map((p) => ({
      tipo: "pago" as const,
      id: p.id,
      fecha: p.occurred_at,
      from_user_id: p.from_user_id,
      to_user_id: p.to_user_id,
      amount: p.amount,
      currency: p.currency,
      pago: p,
    })),
    aportes.map((a) => ({
      tipo: "aporte" as const,
      id: a.id,
      fecha: a.occurred_at,
      owner_id: a.owner_id,
      amount: a.amount,
      currency: a.currency,
      sentido: a.sentido,
      aporte: a,
    })),
  )
}
