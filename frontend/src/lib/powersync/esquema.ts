import { Schema, Table, column } from "@powersync/web"

// Esquema local SQLite del cliente. Refleja las columnas que la app usa de cada
// tabla sincronizada (PowerSync agrega `id` solo; las columnas del servidor que
// no esten aca simplemente no se materializan). Booleans y montos son integer.

const accounts = new Table({
  owner_id: column.text,
  name: column.text,
  type: column.text,
  currency: column.text,
  opening_balance: column.integer,
  off_budget: column.integer,
  visibility: column.text,
  archived: column.integer,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const categories = new Table(
  {
    owner_id: column.text,
    parent_id: column.text,
    name: column.text,
    kind: column.text,
    archived: column.integer,
    sort_order: column.integer,
    // Ajuste de sobre (ver 3.6 / 0004). rollover = sobre de ahorro (acumula).
    rollover: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_padre: ["parent_id"] } },
)

const payment_methods = new Table({
  owner_id: column.text,
  name: column.text,
  kind: column.text,
  last4: column.text,
  brand: column.text,
  default_account_id: column.text,
  archived: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const payment_method_accounts = new Table({
  payment_method_id: column.text,
  account_id: column.text,
  currency: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const transactions = new Table(
  {
    owner_id: column.text,
    kind: column.text,
    status: column.text,
    occurred_at: column.text,
    account_id: column.text,
    transfer_account_id: column.text,
    payment_method_id: column.text,
    category_id: column.text,
    amount: column.integer,
    currency: column.text,
    payee: column.text,
    notes: column.text,
    source: column.text,
    visibility: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_fecha: ["occurred_at"], por_cuenta: ["account_id"] } },
)

// Asignacion de un mes a un sobre (categoria). Ver 3.6 / 0004.
const budgets = new Table({
  owner_id: column.text,
  category_id: column.text,
  period_start: column.text,
  amount: column.integer,
  currency: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Asignacion recurrente a un sobre (categoria): $X todos los meses. Ver 3.6 / 0004.
const budget_rules = new Table({
  owner_id: column.text,
  category_id: column.text,
  amount: column.integer,
  currency: column.text,
  active: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const templates = new Table({
  owner_id: column.text,
  name: column.text,
  kind: column.text,
  account_id: column.text,
  category_id: column.text,
  payment_method_id: column.text,
  amount: column.integer,
  currency: column.text,
  payee: column.text,
  notes: column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const recurring_rules = new Table({
  owner_id: column.text,
  name: column.text,
  kind: column.text,
  account_id: column.text,
  transfer_account_id: column.text,
  category_id: column.text,
  payment_method_id: column.text,
  amount: column.integer,
  currency: column.text,
  payee: column.text,
  notes: column.text,
  frequency: column.text,
  interval_count: column.integer,
  start_date: column.text,
  end_date: column.text,
  next_run_date: column.text,
  auto_create: column.integer,
  active: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

export const AppSchema = new Schema({
  accounts,
  categories,
  payment_methods,
  payment_method_accounts,
  transactions,
  budgets,
  budget_rules,
  templates,
  recurring_rules,
})

export type BaseDatos = (typeof AppSchema)["types"]
