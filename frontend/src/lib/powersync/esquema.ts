import { Schema, Table, column } from "@powersync/web"

// Esquema local SQLite del cliente. Refleja las columnas que la app usa de cada
// tabla sincronizada (PowerSync agrega `id` solo; las columnas del servidor que
// no esten aca simplemente no se materializan). Booleans y montos son integer.

const accounts = new Table(
  {
    owner_id: column.text,
    // Cuenta conjunta del grupo (fase 3b, ver 0016): con group_id es del grupo
    // (owner_id NULL). Baja por el stream `grupo`; las personales por `mio`.
    group_id: column.text,
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
  },
  { indexes: { por_grupo: ["group_id"] } },
)

const categories = new Table(
  {
    owner_id: column.text,
    // Ambito de grupo (fase 3b, ver 0014): si tiene group_id es del grupo (la ven
    // y editan todos los miembros); si no, es personal (owner_id). Los dos no
    // conviven en la misma fila. Llega por el stream `mio` (personal) o `grupo`.
    group_id: column.text,
    parent_id: column.text,
    name: column.text,
    kind: column.text,
    // Clave del catalogo de lib/iconos, no un nombre de lucide: si se saca uno
    // del catalogo, la categoria cae al icono por defecto en vez de romper.
    icon: column.text,
    archived: column.integer,
    sort_order: column.integer,
    // Ajuste de sobre (ver 3.6 / 0004). rollover = sobre de ahorro (acumula).
    rollover: column.integer,
    // Categoria del sistema (0026, etapa 3): "reintegros_grupo". La crea el
    // servidor; no se borra ni se archiva. NULL = comun.
    system_key: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_padre: ["parent_id"], por_grupo: ["group_id"] } },
)

const payment_methods = new Table({
  owner_id: column.text,
  name: column.text,
  kind: column.text,
  last4: column.text,
  brand: column.text,
  // Tarjetas de credito: dia de cierre y de vencimiento (fase 5).
  closing_day: column.integer,
  due_day: column.integer,
  default_account_id: column.text,
  sort_order: column.integer,
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
    // Conversion cuando la moneda del movimiento no es la de la cuenta
    // debitada (ver 0005). `exchange_rate` va como TEXTO: es un
    // NUMERIC(20,10) y el float de SQLite le comeria digitos.
    amount_account: column.integer,
    exchange_rate: column.text,
    payee: column.text,
    notes: column.text,
    source: column.text,
    visibility: column.text,
    // Grupo con el que se comparte (fase 3b). NULL = privado. Aca estan SOLO mis
    // movimientos, completos: los de los otros miembros no entran (van al lente,
    // `group_transactions`, ver 0021).
    group_id: column.text,
    // Pagado desde una cuenta conjunta (0016): no genera deuda entre personas.
    paid_from_group: column.integer,
    // Cobro de un pago de deuda (0018): este ingreso pendiente vino de un pago
    // que me hizo otro miembro; al confirmarlo elijo la cuenta.
    settlement_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_fecha: ["occurred_at"], por_cuenta: ["account_id"], por_grupo: ["group_id"] } },
)

// Asignacion de un mes a un sobre (categoria). Ver 3.6 / 0004.
const budgets = new Table(
  {
    owner_id: column.text,
    // Ambito de grupo (fase 3b.3, ver 0015): con group_id es del grupo.
    group_id: column.text,
    category_id: column.text,
    period_start: column.text,
    amount: column.integer,
    currency: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_grupo: ["group_id"] } },
)

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

// Etiqueta: dimension aparte de la categoria (proyecto/viaje). Ver 3.5.1.
const tags = new Table({
  owner_id: column.text,
  // Ambito de grupo, igual que categories (ver 0014).
  group_id: column.text,
  name: column.text,
  color: column.text,
  archived: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Asociacion N a N: un movimiento puede tener varias etiquetas o ninguna.
const transaction_tags = new Table(
  {
    transaction_id: column.text,
    tag_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_movimiento: ["transaction_id"], por_etiqueta: ["tag_id"] } },
)

// Partes de un gasto compartido: cuanto le toca a cada miembro (reparto tipo
// Splitwise, fase 3b.3, ver 0015). Bajan por el stream `grupo` (las de los gastos
// compartidos). El cliente las escribe al dividir un gasto.
const transaction_splits = new Table(
  {
    transaction_id: column.text,
    user_id: column.text,
    amount: column.integer,
    category_id: column.text,
    notes: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_movimiento: ["transaction_id"] } },
)

// Pagos entre miembros para saldar deudas del grupo (0015). Bajan por `grupo`
// (por group_id), una copia por pago, la misma para todos: cualquier miembro
// los deshace. Ajustan el balance del grupo; si es un pago REAL, ademas sale
// plata de la cuenta del que paga (0017).
const settlements = new Table(
  {
    group_id: column.text,
    from_user_id: column.text,
    to_user_id: column.text,
    amount: column.integer,
    currency: column.text,
    occurred_at: column.text,
    note: column.text,
    created_by: column.text,
    // Pago REAL (0017): cuenta/medio del que paga. La sync NUNCA los baja aca
    // (privacidad): solo estan mientras un pago mio no subio. Lo sincronizado
    // de mis pagos llega a `settlement_accounts` (ver 0021).
    account_id: column.text,
    payment_method_id: column.text,
    // 1 si fue un pago con plata (tenia cuenta), sin decir de cual. Lo calcula
    // la sync: sirve para rotular "pago" vs "saldado" en los pagos de otros.
    pago_real: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_grupo: ["group_id"], por_cuenta: ["account_id"] } },
)

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
  active: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Calendario de pagos (1.5.0, ver 0030). Las fechas de los vencimientos no se
// guardan: se calculan con la regla (lib/repeticion.ts). `alerts` es el JSON de
// la lista de avisos.
const reminders = new Table({
  owner_id: column.text,
  title: column.text,
  notes: column.text,
  template_id: column.text,
  freq: column.text,
  interval_count: column.integer,
  weekdays: column.integer,
  month_mode: column.text,
  month_day: column.integer,
  month_week: column.integer,
  month_weekday: column.integer,
  start_date: column.text,
  until_date: column.text,
  count: column.integer,
  weekend_shift: column.text,
  track_from: column.text,
  alerts: column.text,
  followup_days: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Un ciclo tiene fila solo cuando se responde (pagado u omitido). El id es
// determinista: lib/repeticion.ts idCiclo(reminder_id, nominal_date).
const reminder_cycles = new Table(
  {
    owner_id: column.text,
    reminder_id: column.text,
    nominal_date: column.text,
    status: column.text,
    answered_at: column.text,
    answered_by: column.text,
    transaction_id: column.text,
    // "Más tarde" (etapa 2): hasta cuando calla el aviso de este vencimiento.
    snoozed_until: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_recordatorio: ["reminder_id"] } },
)

// Cotizaciones. `rate` se guarda como TEXTO, no como real: es un NUMERIC(20,10)
// y pasarlo por el float de SQLite le comeria digitos. Se convierte a numero
// recien al multiplicar, y el resultado se redondea a centavos enteros.
const exchange_rates = new Table(
  {
    base_currency: column.text,
    quote_currency: column.text,
    rate: column.text,
    rate_date: column.text,
    source: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_par: ["base_currency", "quote_currency", "rate_date"] } },
)

// Preferencias del usuario. Solo las columnas que la regla de sync manda: el
// hash de la contraseña no esta ahi y no puede llegar aca (ver sync-config).
//
// `fx_manual` es un JSONB en Postgres, asi que baja como TEXTO con el JSON
// adentro. Se parsea al leerlo.
const users = new Table({
  display_name: column.text,
  base_currency: column.text,
  theme_id: column.text,
  color_scheme: column.text,
  fx_manual: column.text,
  // Accesos del panel de Inicio, en orden (0024). JSONB en Postgres: baja como
  // texto con el JSON adentro, igual que fx_manual. NULL = los de fabrica.
  home_shortcuts: column.text,
  // "Más tarde" desde el botón del aviso (0030): 1h, 3h o manana. NULL = 3 horas.
  snooze_default: column.text,
})

// --- Proyecciones del grupo (0021) -------------------------------------------
//
// Lo que baja por el stream `grupo` con OTRA forma que la de mis filas va a
// tablas propias. Si cayera en la misma tabla, el cliente guarda una sola copia
// por id y la recortada pisaba la completa. Las tres son de SOLO LECTURA: no van
// en el conector (RUTA) y nada las escribe.

// El lente del grupo: los movimientos compartidos de TODOS los miembros (los
// mios incluidos) sin lo privado, y los movimientos de las cuentas conjuntas.
// La cuenta solo viene si es la conjunta. Se lee con `TX_GRUPO` (lib/lente),
// que usa mi copia completa para lo mio.
const group_transactions = new Table(
  {
    owner_id: column.text,
    group_id: column.text,
    visibility: column.text,
    kind: column.text,
    status: column.text,
    occurred_at: column.text,
    category_id: column.text,
    amount: column.integer,
    currency: column.text,
    payee: column.text,
    source: column.text,
    paid_from_group: column.integer,
    account_id: column.text,
    amount_account: column.integer,
    transfer_account_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  {
    indexes: {
      por_grupo: ["group_id"],
      por_cuenta: ["account_id"],
      por_destino: ["transfer_account_id"],
    },
  },
)

// Lo privado de MIS pagos (cuenta y medio), por id de pago. El pago en si esta
// en `settlements`. Se junta en `SALDO_CUENTA` (lib/saldos).
const settlement_accounts = new Table({
  account_id: column.text,
  payment_method_id: column.text,
  deleted_at: column.text,
})

// Perfil publico de los miembros de mis grupos (yo incluido): el nombre para
// "cargado por X". Mis preferencias siguen en `users`.
const member_profiles = new Table({
  username: column.text,
  display_name: column.text,
})

// Grupos y membresía (fase 3b). Solo LECTURA en el cliente: se crean y se
// administran por API (crear necesita servidor, agregar miembro es por username)
// y bajan por la sync. No van en el conector (RUTA): el cliente no los escribe.
const groups = new Table({
  name: column.text,
  base_currency: column.text,
  // Color del grupo, para el chip de origen en toda la app (ver 3b.2c).
  color: column.text,
  // Reparto por defecto de un gasto nuevo (0026): JSON {user_id: partes}, o
  // NULL = partes iguales. Se lee con `leerReparto` (lib/reparto).
  default_split: column.text,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

const group_members = new Table(
  {
    group_id: column.text,
    user_id: column.text,
    role: column.text,
    joined_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_grupo: ["group_id"] } },
)

// Metas de ahorro (fase 5). El progreso es el saldo de la cuenta asociada.
const goals = new Table({
  owner_id: column.text,
  group_id: column.text,
  name: column.text,
  target_amount: column.integer,
  currency: column.text,
  target_date: column.text,
  account_id: column.text,
  archived: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Deudas y prestamos fuera de un grupo (fase 5).
const debts = new Table({
  owner_id: column.text,
  group_id: column.text,
  direction: column.text,
  counterparty: column.text,
  counterparty_user_id: column.text,
  description: column.text,
  amount: column.integer,
  currency: column.text,
  amount_settled: column.integer,
  due_date: column.text,
  settled_at: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
})

// Adjuntos: SOLO metadata (fase 5). El binario se sube/baja por la API, no por
// la sync; el cliente no escribe esta tabla (no va en el conector).
const attachments = new Table(
  {
    transaction_id: column.text,
    owner_id: column.text,
    filename: column.text,
    mime_type: column.text,
    size_bytes: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_movimiento: ["transaction_id"] } },
)

// Avisos in-app (fase 3b, ver 0019). Solo LECTURA + marcar leido: los crea el
// servidor y bajan por `mio`. El cliente solo escribe read_at (PATCH).
const notifications = new Table(
  {
    user_id: column.text,
    type: column.text,
    title: column.text,
    body: column.text,
    link: column.text,
    read_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
  },
  { indexes: { por_fecha: ["created_at"] } },
)

// Subidas que el servidor rechazo con un 4xx. `localOnly`: vive solo en este
// dispositivo, no sincroniza ni genera entradas en la cola. Es la red de
// seguridad de la escritura local — sin esto, un rechazo se descarta y el dato
// desaparece sin dejar rastro (ver 0011).
//
// `datos` es el payload original en JSON (texto): guarda lo que se quiso subir
// para poder reintentarlo o transformarlo mas adelante.
const subidas_rechazadas = new Table(
  {
    tabla: column.text,
    op: column.text,
    fila_id: column.text,
    datos: column.text,
    motivo: column.text,
    rechazada_en: column.text,
  },
  { localOnly: true, indexes: { por_fecha: ["rechazada_en"] } },
)

export const AppSchema = new Schema({
  accounts,
  categories,
  payment_methods,
  payment_method_accounts,
  transactions,
  budgets,
  budget_rules,
  tags,
  transaction_tags,
  transaction_splits,
  settlements,
  templates,
  recurring_rules,
  exchange_rates,
  users,
  group_transactions,
  settlement_accounts,
  member_profiles,
  groups,
  group_members,
  notifications,
  goals,
  debts,
  reminders,
  reminder_cycles,
  attachments,
  subidas_rechazadas,
})

export type BaseDatos = (typeof AppSchema)["types"]
