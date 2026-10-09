-- ============================================================
-- Mango - esquema de datos
-- App de finanzas personales y compartidas
-- PostgreSQL 15+
--
-- Decisiones fundacionales (ver ESPECIFICACION.md):
--   1. IDs UUID generados por el cliente (permite crear sin conexion)
--   2. Montos en enteros (centavos). Nunca float.
--   3. Moneda explicita en cada transaccion
--   4. owner_id + visibility desde el dia uno
--   5. Borrado logico (deleted_at) + updated_at para sincronizar
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Usuarios y grupos
-- ------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    base_currency   CHAR(3) NOT NULL DEFAULT 'ARS',
    locale          TEXT NOT NULL DEFAULT 'es-AR',

    -- Apariencia. Ver docs/DESIGN.md seccion 5.
    --
    -- theme_id: cual de los temas predefinidos usa. 'default' siempre existe y
    -- es al que se cae si el tema guardado ya no esta disponible.
    theme_id        TEXT NOT NULL DEFAULT 'default',

    -- theme_custom: tokens que el usuario sobreescribio, por modo. Solo los
    -- modificados; lo que no este aca se hereda del tema base. Asi un tema
    -- personalizado sigue siendo valido si el tema base agrega tokens nuevos.
    --
    --   {"light": {"primary": "#0f766e"},
    --    "dark":  {"primary": "#2dd4bf", "background": "#0c0f0e"}}
    theme_custom    JSONB,

    -- color_scheme: 'system' sigue la preferencia del sistema operativo.
    color_scheme    TEXT NOT NULL DEFAULT 'system',

    -- Monedas que se cargan a mano (fuera del refresco automatico, ver 0005).
    fx_manual       JSONB,

    -- Accesos del panel de Inicio, en orden: lista de ids del catalogo del
    -- cliente (frontend/src/componentes/accesos.ts). NULL = los de fabrica.
    -- Viaja con la sync, como el tema (ver 0024).
    home_shortcuts  JSONB,
    -- Hasta cuando calla el boton "Mas tarde" del aviso push (0030): 1h, 3h o
    -- manana (a las 9). NULL = 3 horas. En la app se elige cada vez.
    snooze_default  TEXT CHECK (snooze_default IS NULL OR snooze_default IN ('1h','3h','manana')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT users_color_scheme_chk CHECK (color_scheme IN ('light','dark','system'))
);

-- Un grupo es un hogar, una pareja, un viaje compartido.
CREATE TABLE groups (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    base_currency   CHAR(3) NOT NULL DEFAULT 'ARS',
    -- Color del grupo, para el chip de origen en toda la app (3b.2c)
    color           TEXT,
    -- Reparto por defecto de un gasto nuevo (0026): {user_id: partes}, como
    -- Splitwise (60/40 = {ana: 60, beto: 40}). NULL = partes iguales. Solo es
    -- el punto de partida del formulario; cada gasto guarda el suyo resuelto en
    -- transaction_splits.
    default_split   JSONB,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE group_members (
    id              UUID PRIMARY KEY,
    group_id        UUID NOT NULL REFERENCES groups(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            TEXT NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT group_members_role_chk CHECK (role IN ('owner','member')),
    CONSTRAINT group_members_uniq UNIQUE (group_id, user_id)
);

-- Pagos entre miembros para saldar deudas del grupo (fase 3b.3, ver 0015).
-- No mueven plata de ninguna cuenta: registran que la deuda se salda por fuera
-- (efectivo, transferencia). Ajustan el balance del grupo, no los saldos.
CREATE TABLE settlements (
    id              UUID PRIMARY KEY,
    group_id        UUID NOT NULL REFERENCES groups(id),
    from_user_id    UUID NOT NULL REFERENCES users(id),
    to_user_id      UUID NOT NULL REFERENCES users(id),
    amount          BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    note            TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    -- Pago REAL (0017): si vienen, la plata salio de esta cuenta/medio del que
    -- paga y se descuenta de su saldo. NULL = "marcar saldado" (no mueve plata).
    account_id          UUID REFERENCES accounts(id),
    payment_method_id   UUID REFERENCES payment_methods(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT settlements_amount_chk CHECK (amount > 0),
    CONSTRAINT settlements_distintos_chk CHECK (from_user_id <> to_user_id)
);

-- Avisos in-app (fase 3b, ver 0019). Los crea el servidor en eventos (te llego
-- un pago, se deshizo un pago, te sumaron a un grupo). El cliente solo marca
-- leido (read_at). No los crea ni borra el cliente.
CREATE TABLE notifications (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    link            TEXT,
    read_at         TIMESTAMPTZ,
    -- Cuando el planificador lo despacho por push (0029). NULL = pendiente. Lo
    -- que tiene mas de 48 h se marca sin mandar: queda solo en la bandeja.
    pushed_at       TIMESTAMPTZ,
    -- De que vencimiento es un aviso de recordatorio (0030): {reminder_id, nominal}.
    meta            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Dispositivos que reciben avisos push (1.4.0, ver 0029). Estado del servidor:
-- NO se sincroniza. Un endpoint es un navegador en un dispositivo; si ahi entra
-- otra persona, la fila pasa a ser suya (solo con las mismas claves: mismo
-- navegador). Se da de baja (deleted_at) cuando el servicio de push responde
-- 404/410 o 401/403, salvo en sus primeros 5 minutos.
CREATE TABLE push_subscriptions (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    endpoint        TEXT NOT NULL,              -- https, lo da el navegador
    p256dh          TEXT NOT NULL,              -- clave del navegador para cifrar
    auth            TEXT NOT NULL,
    dispositivo     TEXT,                       -- "Chrome en Android"
    tipos           JSONB,                      -- familias que acepta; NULL = todas
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX push_subscriptions_endpoint_uniq ON push_subscriptions (endpoint)
    WHERE deleted_at IS NULL;

-- Calendario de pagos (1.5.0, ver 0030). Un recordatorio y su regla de
-- repeticion, como en Samsung Reminder. Las fechas de los vencimientos NO se
-- guardan: se calculan con la regla (backend/app/services/repeticion.py y
-- frontend/src/lib/repeticion.ts, con casos compartidos).
CREATE TABLE reminders (
    id              UUID PRIMARY KEY,
    owner_id        UUID NOT NULL REFERENCES users(id),
    -- De un grupo (1.6.0): avisa a todos; lo responde y lo edita cualquiera.
    group_id        UUID REFERENCES groups(id),
    title           TEXT NOT NULL,
    notes           TEXT,
    -- Monto, cuenta y categoria del pago. Si se borra la plantilla, NULL.
    template_id     UUID REFERENCES templates(id),
    freq            TEXT NOT NULL,              -- once|daily|weekly|monthly|yearly
    interval_count  SMALLINT NOT NULL DEFAULT 1,
    weekdays        SMALLINT,                   -- semanal: lunes = 1 ... domingo = 64
    month_mode      TEXT,                       -- mensual: day|weekday
    month_day       SMALLINT,                   -- 1..31 (el mes corto: su ultimo dia)
    month_week      SMALLINT,                   -- 1..4, -1 = el ultimo
    month_weekday   SMALLINT,                   -- 0 = lunes .. 6 = domingo
    start_date      DATE NOT NULL,
    until_date      DATE,                       -- o count, no los dos
    count           SMALLINT,
    weekend_shift   TEXT NOT NULL,              -- none|next|previous (se elige al crear)
    -- Desde cuando cuentan los vencimientos sin marcar; al cambiar la regla, hoy.
    track_from      DATE NOT NULL,
    -- [{"days_before": 0, "time": "09:00"}], a cualquier hora (1.5.1).
    alerts          JSONB NOT NULL DEFAULT '[{"days_before": 0, "time": "09:00"}]',
    followup_days   SMALLINT,                   -- NULL = hasta que responda
    -- "Avisarme" (1.6.0): la tarjeta o la deuda que sigue; el servidor lo
    -- mantiene al dia cuando ellas cambian.
    payment_method_id UUID REFERENCES payment_methods(id),
    debt_id         UUID REFERENCES debts(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT reminders_freq_chk CHECK (freq IN ('once','daily','weekly','monthly','yearly')),
    CONSTRAINT reminders_un_vinculo_chk CHECK (payment_method_id IS NULL OR debt_id IS NULL),
    CONSTRAINT reminders_un_solo_fin_chk CHECK (count IS NULL OR until_date IS NULL),
    CONSTRAINT reminders_weekend_shift_chk CHECK (weekend_shift IN ('none','next','previous'))
    -- (mas los rangos de cada columna; la coherencia de la regla la valida el CRUD)
);

-- Lo que paso con un vencimiento: tiene fila solo cuando se responde. El id es
-- determinista, UUID v5 de "reminder_id:nominal_date": dos dispositivos que lo
-- marcan escriben la misma fila (el alta es un upsert).
CREATE TABLE reminder_cycles (
    id              UUID PRIMARY KEY,
    owner_id        UUID NOT NULL REFERENCES users(id),  -- el del recordatorio (sync sin JOIN)
    group_id        UUID REFERENCES groups(id),          -- idem
    reminder_id     UUID NOT NULL REFERENCES reminders(id),
    -- La fecha de la regla, no la corrida por el fin de semana.
    nominal_date    DATE NOT NULL,
    status          TEXT NOT NULL,              -- pending|paid|skipped
    answered_at     TIMESTAMPTZ,                -- los pone el servidor
    answered_by     UUID REFERENCES users(id),
    transaction_id  UUID REFERENCES transactions(id),    -- "Cargar el pago"
    -- Avisos (etapa 2): "Mas tarde" (a cualquier hora; responder lo limpia) y
    -- lo que el servidor ya aviso, para no repetirlo (solo el servidor).
    snoozed_until   TIMESTAMPTZ,
    -- En uno de grupo, el "Mas tarde" de cada uno: {user_id: instante}.
    snoozes         JSONB,
    alerts_sent     JSONB,                      -- ["3@09:00", "0@09:00"]
    followup_sent_on DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT reminder_cycles_status_chk CHECK (status IN ('pending','paid','skipped'))
);
CREATE UNIQUE INDEX reminder_cycles_reminder_nominal_uniq
    ON reminder_cycles (reminder_id, nominal_date) WHERE deleted_at IS NULL;

-- Permisos de un solo uso de los botones del aviso push ("Ya lo pague", "Mas
-- tarde"; 0030): el service worker no tiene la sesion. Se guarda el SHA-256 del
-- permiso, nunca el permiso. Vence en 7 dias. No se sincroniza.
CREATE TABLE reminder_action_tokens (
    id              UUID PRIMARY KEY,
    token_hash      TEXT NOT NULL UNIQUE,
    user_id         UUID NOT NULL REFERENCES users(id),
    reminder_id     UUID NOT NULL REFERENCES reminders(id),
    nominal_date    DATE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Cuentas: donde esta la plata
-- ------------------------------------------------------------

CREATE TABLE accounts (
    id                  UUID PRIMARY KEY,
    -- Personal (owner_id) o conjunta del grupo (group_id, owner_id NULL). Ver 0016.
    owner_id            UUID REFERENCES users(id),
    group_id            UUID REFERENCES groups(id),
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,
    currency            CHAR(3) NOT NULL,
    -- Saldo inicial al crear la cuenta, en centavos
    opening_balance     BIGINT NOT NULL DEFAULT 0,
    -- Se excluye del patrimonio (ej: cuenta de un tercero)
    off_budget          BOOLEAN NOT NULL DEFAULT false,
    visibility          TEXT NOT NULL DEFAULT 'private',
    color               TEXT,
    icon                TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    archived            BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT accounts_type_chk CHECK (type IN ('cash','bank','credit_card','savings','investment','loan','other')),
    CONSTRAINT accounts_visibility_chk CHECK (visibility IN ('private','shared'))
);

-- ------------------------------------------------------------
-- Medios de pago: con que se paga
--
-- Una tarjeta NO es una cuenta. La tarjeta 8027 puede debitar de
-- la caja de ahorro en pesos o de la cuenta en dolares segun la
-- moneda de la compra. Esta separacion es la que permite resolver
-- automaticamente de que cuenta salio una compra importada.
-- ------------------------------------------------------------

CREATE TABLE payment_methods (
    id              UUID PRIMARY KEY,
    owner_id        UUID NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    -- Ultimos 4 digitos: es lo que traen las alertas de Visa
    last4           TEXT,
    brand           TEXT,
    -- Para tarjetas de credito: dia de cierre y de vencimiento
    closing_day     SMALLINT,
    due_day         SMALLINT,
    -- Cuenta que se debita si no hay match por moneda
    default_account_id UUID REFERENCES accounts(id),
    -- Orden elegido por la persona (igual que accounts.sort_order)
    sort_order      INTEGER NOT NULL DEFAULT 0,
    archived        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT payment_methods_kind_chk CHECK (kind IN ('debit_card','credit_card','cash','transfer','wallet','other')),
    CONSTRAINT payment_methods_closing_chk CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
    CONSTRAINT payment_methods_due_chk CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31)
);

-- Que cuenta se debita segun la moneda de la operacion.
-- Sin una fila para la moneda de la compra, la transaccion
-- importada queda pendiente de resolucion manual.
CREATE TABLE payment_method_accounts (
    id                  UUID PRIMARY KEY,
    payment_method_id   UUID NOT NULL REFERENCES payment_methods(id),
    account_id          UUID NOT NULL REFERENCES accounts(id),
    currency            CHAR(3) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

-- Unico parcial: respeta el borrado logico. Una asociacion borrada libera la
-- moneda para volver a asociarla (ver docs/decisiones/0003).
CREATE UNIQUE INDEX pma_uniq
    ON payment_method_accounts (payment_method_id, currency)
    WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Categorias: en que se gasta (jerarquia de dos niveles)
-- ------------------------------------------------------------

CREATE TABLE categories (
    id              UUID PRIMARY KEY,
    owner_id        UUID REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    parent_id       UUID REFERENCES categories(id),
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    color           TEXT,
    icon            TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    archived        BOOLEAN NOT NULL DEFAULT false,
    -- Ajuste de sobre (el sobre ES la categoria; ver 3.6 / 0004).
    -- rollover: el saldo arrastra al mes siguiente (sobre de ahorro). La
    -- asignacion recurrente va por el sistema de recurrentes, no aca.
    rollover        BOOLEAN NOT NULL DEFAULT false,
    -- Categoria del sistema (0026, etapa 3): 'reintegros_grupo'. La crea el
    -- servidor; la app la reconoce por esta clave, no por el nombre. No se
    -- borra ni se archiva. NULL = comun.
    system_key      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT categories_kind_chk CHECK (kind IN ('expense','income'))
);

-- Una categoria del sistema por usuario y clave, entre las vigentes.
CREATE UNIQUE INDEX categories_owner_system_key_uniq ON categories (owner_id, system_key)
    WHERE system_key IS NOT NULL AND deleted_at IS NULL;

-- Tabla de asociacion comercio -> categoria.
--
-- El correo del banco trae el COMERCIO (donde se gasto), nunca la CATEGORIA
-- (a que corresponde el gasto). Esta tabla traduce uno en otro.
--
-- Se puede editar a mano, y crece sola: cada vez que el usuario confirma o
-- corrige una sugerencia, se agrega la entrada correspondiente. Asi cada
-- comercio se clasifica una sola vez.
CREATE TABLE category_rules (
    id              UUID PRIMARY KEY,
    owner_id        UUID NOT NULL REFERENCES users(id),
    match_type      TEXT NOT NULL DEFAULT 'contains',
    pattern         TEXT NOT NULL,
    category_id     UUID NOT NULL REFERENCES categories(id),
    priority        INTEGER NOT NULL DEFAULT 100,
    -- 'user' = la escribio el usuario, 'learned' = derivada de una correccion
    source          TEXT NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT category_rules_match_chk CHECK (match_type IN ('exact','contains','regex')),
    CONSTRAINT category_rules_source_chk CHECK (source IN ('user','learned','ai'))
);

-- ------------------------------------------------------------
-- Transacciones
--
-- Gasto, ingreso y transferencia son el mismo registro. El monto se guarda
-- SIEMPRE como magnitud positiva (>= 0); la direccion la define `kind`:
--   expense   -> sale de account_id
--   income    -> entra a account_id
--   transfer  -> sale de account_id, entra a transfer_account_id
-- El signo para calcular saldos lo aplica la consulta, no el dato guardado.
-- Ver docs/decisiones/0001-monto-magnitud-positiva.md
-- ------------------------------------------------------------

CREATE TABLE transactions (
    id                  UUID PRIMARY KEY,
    owner_id            UUID NOT NULL REFERENCES users(id),
    group_id            UUID REFERENCES groups(id),
    visibility          TEXT NOT NULL DEFAULT 'private',
    -- Pagado desde una cuenta conjunta: suma al grupo pero no genera deuda (0016)
    paid_from_group     BOOLEAN NOT NULL DEFAULT false,

    kind                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'confirmed',

    -- Momento real del gasto, con hora (necesaria para deduplicar)
    occurred_at         TIMESTAMPTZ NOT NULL,

    account_id          UUID REFERENCES accounts(id),
    transfer_account_id UUID REFERENCES accounts(id),
    payment_method_id   UUID REFERENCES payment_methods(id),
    category_id         UUID REFERENCES categories(id),

    -- Monto en centavos, magnitud positiva (ver comentario de arriba y 0001)
    amount              BIGINT NOT NULL,
    currency            CHAR(3) NOT NULL,

    -- Conversion a la moneda de la cuenta debitada, cuando difiere
    amount_account      BIGINT,
    exchange_rate       NUMERIC(20,10),

    -- Comercio o contraparte
    payee               TEXT,
    notes               TEXT,

    -- Origen del registro
    source              TEXT NOT NULL DEFAULT 'manual',
    -- Clave estable para deduplicar importaciones automaticas
    external_id         TEXT,
    -- Datos crudos del correo o API, para depurar
    raw_payload         JSONB,

    -- Que falta completar cuando status = 'pending'
    pending_reason      TEXT,

    -- Categoria SUGERIDA por IA. Nunca se aplica sola: queda a la espera de
    -- confirmacion humana. Al confirmarla se copia a category_id y se crea
    -- una regla en category_rules para no volver a preguntar por ese comercio.
    suggested_category_id UUID REFERENCES categories(id),
    suggestion_source     TEXT,

    -- Cobro generado por un pago de deuda del grupo (0018): ingreso pendiente que
    -- el servidor le crea al acreedor; al confirmarlo, este le asigna la cuenta.
    settlement_id       UUID REFERENCES settlements(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT tx_kind_chk CHECK (kind IN ('expense','income','transfer')),
    CONSTRAINT tx_status_chk CHECK (status IN ('confirmed','pending','rejected')),
    CONSTRAINT tx_visibility_chk CHECK (visibility IN ('private','shared')),
    CONSTRAINT tx_source_chk CHECK (source IN ('manual','email_import','api','recurring','template')),
    CONSTRAINT tx_suggestion_chk CHECK (suggestion_source IS NULL OR suggestion_source IN ('ai','rule')),
    -- Una sugerencia solo tiene sentido en una transaccion pendiente
    CONSTRAINT tx_suggested_chk CHECK (
        suggested_category_id IS NULL OR status = 'pending'
    ),
    -- 'pending' es un estado que solo produce la ingesta automatica:
    -- una carga manual siempre llega completa y validada
    CONSTRAINT tx_pending_source_chk CHECK (
        status <> 'pending' OR source <> 'manual'
    ),
    -- Una transferencia necesita las dos puntas
    CONSTRAINT tx_transfer_chk CHECK (
        kind <> 'transfer' OR (account_id IS NOT NULL AND transfer_account_id IS NOT NULL)
    ),
    -- Una transaccion confirmada necesita cuenta
    CONSTRAINT tx_confirmed_chk CHECK (
        status <> 'confirmed' OR account_id IS NOT NULL
    ),
    -- El monto es magnitud positiva; la direccion la da `kind` (ver 0001)
    CONSTRAINT tx_amount_chk CHECK (amount >= 0),
    -- Una transferencia mueve plata entre cuentas propias: no se categoriza
    CONSTRAINT tx_transfer_sin_categoria_chk CHECK (
        kind <> 'transfer' OR category_id IS NULL
    ),
    -- Gasto e ingreso necesitan categoria, con dos excepciones:
    --   'pending'  una importacion puede quedar sin categoria justamente
    --              porque falta resolverla (ver ESPECIFICACION 4.4 y 4.7)
    --   'rejected' una compra que el banco rechazo no es un gasto real:
    --              se guarda como registro pero no se categoriza
    CONSTRAINT tx_categoria_obligatoria_chk CHECK (
        kind = 'transfer'
        OR status IN ('pending', 'rejected')
        OR category_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX tx_external_uniq
    ON transactions (owner_id, external_id)
    WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX tx_owner_date_idx   ON transactions (owner_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tx_group_date_idx   ON transactions (group_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tx_account_idx      ON transactions (account_id) WHERE deleted_at IS NULL;
CREATE INDEX tx_category_idx     ON transactions (category_id) WHERE deleted_at IS NULL;
CREATE INDEX tx_status_idx       ON transactions (owner_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tx_sync_idx         ON transactions (owner_id, updated_at);

-- Division de un gasto entre varias categorias o personas
CREATE TABLE transaction_splits (
    id              UUID PRIMARY KEY,
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    category_id     UUID REFERENCES categories(id),
    -- A quien le corresponde esta parte (para reparto tipo Splitwise)
    user_id         UUID REFERENCES users(id),
    amount          BIGINT NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Adjuntos (fotos de tickets)
CREATE TABLE attachments (
    id              UUID PRIMARY KEY,
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    owner_id        UUID NOT NULL REFERENCES users(id),
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_path    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Etiquetas: una dimension separada de la categoria.
--
-- La categoria dice de que TIPO es el gasto (Comida/Restaurante); la etiqueta a
-- que PROYECTO pertenece (Viaje 2027). Un gasto de comida durante un viaje va a
-- 'Comida' con la etiqueta 'Viaje 2027', y asi salen los dos informes sin
-- pisarse. Ver ESPECIFICACION 3.6. Estructura ahora, sin interfaz todavia.
-- ------------------------------------------------------------

CREATE TABLE tags (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id),
    group_id    UUID REFERENCES groups(id),
    name        TEXT NOT NULL,
    color       TEXT,
    archived    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE transaction_tags (
    id              UUID PRIMARY KEY,
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    tag_id          UUID NOT NULL REFERENCES tags(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Unico parcial (respeta el borrado logico, ver 0003): una etiqueta se puede
-- sacar y volver a poner sin chocar con la fila borrada.
CREATE UNIQUE INDEX transaction_tags_uniq
    ON transaction_tags (transaction_id, tag_id)
    WHERE deleted_at IS NULL;

CREATE INDEX transaction_tags_tag_idx ON transaction_tags (tag_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Presupuestos por sobres
--
-- Cada fila es la ASIGNACION de un mes a un sobre (categoria). Los sobres son
-- mensuales (`period_start` = dia 1). El arrastre vive en la categoria
-- (`rollover`); la asignacion recurrente va por el sistema de recurrentes.
-- Ver ESPECIFICACION 3.6 y decision 0004.
-- ------------------------------------------------------------

CREATE TABLE budgets (
    id              UUID PRIMARY KEY,
    owner_id        UUID REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    category_id     UUID NOT NULL REFERENCES categories(id),
    -- Primer dia del mes
    period_start    DATE NOT NULL,
    amount          BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Unico parcial (respeta borrado logico) con NULLS NOT DISTINCT: con group_id
-- NULL (presupuesto personal) un unique comun no deduplicaria. Ver 0003.
--
-- La moneda es parte de la clave porque el sobre es categoria + moneda + mes
-- (ver 0005): `Viaje 2027` puede tener sobre en pesos y en dolares a la vez, y
-- cada uno tiene su propio "por asignar".
CREATE UNIQUE INDEX budgets_uniq
    ON budgets (owner_id, group_id, category_id, currency, period_start)
    NULLS NOT DISTINCT
    WHERE deleted_at IS NULL;

-- Asignacion recurrente a un sobre: cada mes, /recurring/run crea la fila de
-- budgets del mes con este monto si todavia no hay una (no pisa lo asignado a
-- mano). Reemplaza al viejo default_budget. Ver 3.6 / 0004.
CREATE TABLE budget_rules (
    id              UUID PRIMARY KEY,
    owner_id        UUID REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    category_id     UUID NOT NULL REFERENCES categories(id),
    amount          BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Una regla por sobre, y el sobre incluye la moneda (ver 0005). Unico parcial
-- que respeta el borrado logico (ver 0003).
CREATE UNIQUE INDEX budget_rules_uniq
    ON budget_rules (owner_id, group_id, category_id, currency)
    NULLS NOT DISTINCT
    WHERE deleted_at IS NULL;

-- Metas de ahorro: "Viaje 2027", "Notebook nueva"
CREATE TABLE goals (
    id              UUID PRIMARY KEY,
    owner_id        UUID REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    name            TEXT NOT NULL,
    target_amount   BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    target_date     DATE,
    account_id      UUID REFERENCES accounts(id),
    archived        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Recurrentes y plantillas
-- ------------------------------------------------------------

CREATE TABLE recurring_rules (
    id                  UUID PRIMARY KEY,
    owner_id            UUID NOT NULL REFERENCES users(id),
    group_id            UUID REFERENCES groups(id),
    name                TEXT NOT NULL,
    kind                TEXT NOT NULL,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    transfer_account_id UUID REFERENCES accounts(id),
    category_id         UUID REFERENCES categories(id),
    payment_method_id   UUID REFERENCES payment_methods(id),
    amount              BIGINT NOT NULL,
    currency            CHAR(3) NOT NULL,
    payee               TEXT,
    notes               TEXT,
    frequency           TEXT NOT NULL,
    interval_count      SMALLINT NOT NULL DEFAULT 1,
    -- Dia del mes o de la semana segun frequency
    day_of_period       SMALLINT,
    start_date          DATE NOT NULL,
    end_date            DATE,
    next_run_date       DATE NOT NULL,
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT rec_kind_chk CHECK (kind IN ('expense','income','transfer')),
    CONSTRAINT rec_freq_chk CHECK (frequency IN ('daily','weekly','monthly','yearly'))
);

-- Marcadores: gastos frecuentes precargados
CREATE TABLE templates (
    id                  UUID PRIMARY KEY,
    owner_id            UUID NOT NULL REFERENCES users(id),
    -- De un grupo (1.6.0, T1): de gasto, categoria del grupo, sin cuenta.
    group_id            UUID REFERENCES groups(id),
    name                TEXT NOT NULL,
    kind                TEXT NOT NULL,
    account_id          UUID REFERENCES accounts(id),
    category_id         UUID REFERENCES categories(id),
    payment_method_id   UUID REFERENCES payment_methods(id),
    amount              BIGINT,
    currency            CHAR(3),
    payee               TEXT,
    notes               TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT templates_kind_chk CHECK (kind IN ('expense','income','transfer'))
);

-- ------------------------------------------------------------
-- Deudas y prestamos entre personas
-- ------------------------------------------------------------

CREATE TABLE debts (
    id              UUID PRIMARY KEY,
    owner_id        UUID NOT NULL REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    direction       TEXT NOT NULL,
    counterparty    TEXT NOT NULL,
    -- Si la contraparte es otro usuario de la app
    counterparty_user_id UUID REFERENCES users(id),
    description     TEXT,
    amount          BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    amount_settled  BIGINT NOT NULL DEFAULT 0,
    due_date        DATE,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT debts_direction_chk CHECK (direction IN ('payable','receivable'))
);

-- ------------------------------------------------------------
-- Multimoneda
-- ------------------------------------------------------------

-- Cotizaciones. `rate` es cuantas unidades de `quote_currency` compra 1 de
-- `base_currency`: el dolar oficial va base='USD', quote='ARS', rate=1735.10
-- (ver 0005). NUMERIC y nunca float: la cotizacion multiplica montos.
--
-- Lleva updated_at/deleted_at porque una cotizacion se puede haber cargado mal
-- y hay que poder corregirla o darla de baja, y nada se borra fisicamente.
CREATE TABLE exchange_rates (
    id              UUID PRIMARY KEY,
    base_currency   CHAR(3) NOT NULL,
    quote_currency  CHAR(3) NOT NULL,
    rate            NUMERIC(20,10) NOT NULL,
    rate_date       DATE NOT NULL,
    -- 'oficial', 'manual', 'mep'... en Argentina conviven varias y no siempre
    -- aplica la misma.
    source          TEXT NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

-- Una cotizacion por (par, fecha, fuente) entre las vigentes. Parcial para que
-- borrar y volver a cargar no choque (ver 0003).
CREATE UNIQUE INDEX fx_uniq
    ON exchange_rates (base_currency, quote_currency, rate_date, source)
    WHERE deleted_at IS NULL;

-- La consulta caliente es "la ultima cotizacion conocida de este par".
CREATE INDEX fx_par_fecha ON exchange_rates (base_currency, quote_currency, rate_date);


-- ------------------------------------------------------------
-- Nota sobre sincronizacion
--
-- Aca no hay tablas de sincronizacion a proposito. Una version anterior de
-- este esquema tenia `sync_state` y `sync_log` para un mecanismo escrito a
-- mano del tipo "que cambio desde X".
--
-- Se eliminaron al decidir PowerSync como motor: el maneja la base local, la
-- cola de escrituras sin conexion, los reintentos y la reconexion. Mantener
-- tablas que nadie usa solo confunde sobre cual es el mecanismo real.
--
-- Lo que si hace falta y ya esta en cada tabla: `updated_at` y `deleted_at`.
-- Sin ellos no se puede propagar un cambio ni un borrado hecho sin conexion.
--
-- Las reglas de que filas ve cada usuario viven en
-- infra/powersync/sync-rules.yaml, no en el esquema.
-- ------------------------------------------------------------