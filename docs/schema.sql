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

-- ------------------------------------------------------------
-- Cuentas: donde esta la plata
-- ------------------------------------------------------------

CREATE TABLE accounts (
    id                  UUID PRIMARY KEY,
    owner_id            UUID NOT NULL REFERENCES users(id),
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT categories_kind_chk CHECK (kind IN ('expense','income'))
);

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
-- Presupuestos
-- ------------------------------------------------------------

CREATE TABLE budgets (
    id              UUID PRIMARY KEY,
    owner_id        UUID REFERENCES users(id),
    group_id        UUID REFERENCES groups(id),
    category_id     UUID NOT NULL REFERENCES categories(id),
    period          TEXT NOT NULL DEFAULT 'monthly',
    -- Primer dia del periodo
    period_start    DATE NOT NULL,
    amount          BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    -- Si el sobrante pasa al periodo siguiente
    rollover        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT budgets_period_chk CHECK (period IN ('weekly','monthly','yearly'))
);

-- Unico parcial (respeta borrado logico) con NULLS NOT DISTINCT: con group_id
-- NULL (presupuesto personal) un unique comun no deduplicaria. Ver 0003.
CREATE UNIQUE INDEX budgets_uniq
    ON budgets (owner_id, group_id, category_id, period, period_start)
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
    -- Si genera la transaccion sola o solo avisa
    auto_create         BOOLEAN NOT NULL DEFAULT true,
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

CREATE TABLE exchange_rates (
    id              UUID PRIMARY KEY,
    base_currency   CHAR(3) NOT NULL,
    quote_currency  CHAR(3) NOT NULL,
    rate            NUMERIC(20,10) NOT NULL,
    rate_date       DATE NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fx_uniq UNIQUE (base_currency, quote_currency, rate_date, source)
);


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