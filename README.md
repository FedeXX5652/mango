<div align="center">

<img src="frontend/public/icons/png/mango-512.png" alt="Mango" width="128" height="128" />

# Mango

**Tus finanzas, y las de tu casa, en un solo lugar — privadas, sin conexión, y sin planillas.**

App de finanzas personales y compartidas, *self-hosted* y *offline-first*. Cada
persona lleva sus gastos privados; una pareja o familia comparte **solo lo que
decide compartir**, con reparto de gastos estilo Splitwise incluido.

<br />

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![PowerSync](https://img.shields.io/badge/PowerSync-offline--first-1c1c1c)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-414%20verdes-2EA043)
![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white)

</div>

---

## ¿A qué apunta Mango?

Las apps de finanzas te piden elegir: o subís tus datos a la nube de un tercero, o
terminás con una planilla que nadie mantiene. Y ninguna resuelve bien lo
**compartido**: en una pareja o familia, parte de la plata es de cada uno y parte
es común, y saber "quién debe a quién" siempre termina en capturas de pantalla y
memoria.

Mango apunta a llevar las **finanzas globales** de una persona y, opcionalmente,
de un hogar, con tres convicciones:

- **Privado por diseño.** Corre en tu propio servidor (un homelab, una Raspberry,
  una VPS). Tus datos son tuyos. Lo compartido es *opt-in*, campo por campo.
- **Funciona sin conexión.** Es una PWA local-first: cada dispositivo tiene su
  base y sincroniza cuando hay red. Cargás un gasto en el subte sin señal y
  aparece igual.
- **Bajo esfuerzo.** El objetivo final es que los gastos de tarjeta se **importen
  solos** desde los correos de alerta del banco, y que la IA sugiera la categoría
  (nunca la aplica sola).

---

## Características

### 💸 Finanzas personales
- Gastos, ingresos y transferencias sobre un modelo único, con **cuentas** y
  **medios de pago**.
- **Categorías** de dos niveles, **etiquetas**, **comercios** (texto libre, algo
  distinto de la categoría).
- **Presupuesto por sobres** mensual, con arrastre.
- **Multimoneda**: cada movimiento en su moneda; conversión a la moneda de la
  cuenta con la cotización guardada (el peso físico nunca se distorsiona).
- **Plantillas** y **movimientos recurrentes** que se generan solos en el
  dispositivo.
- **Metas de ahorro**, **deudas y préstamos**, y **fotos de tickets** adjuntas.
- Tarjetas de crédito con día de **cierre** y **vencimiento**.

### 👥 Compartido (hogar / pareja)
- **Grupos**: se comparte *solo* lo que marcás como compartido. Lo privado
  (cuenta, medio de pago, monto debitado) **no viaja** a los demás.
- **Taxonomía del grupo**: categorías y tags propios del grupo, con color, para
  que todos clasifiquen igual.
- **Reparto estilo Splitwise**: división por partes iguales, montos exactos o
  porcentajes; **balance** de quién puso qué y **quién le debe a quién**.
- **Saldar deudas**: marcar como saldado (por fuera) o registrar un **pago real**
  que sale de tu cuenta, en partes. El cobro le llega al otro para confirmar en
  qué cuenta entró.
- **Cuenta conjunta**: plata que ya es de todos; lo que se paga con ella no genera
  deuda.
- **Presupuesto del grupo** y **notificaciones** in-app de lo que pasa.

### 🔒 Privacidad y sincronización
- **Local-first** con PowerSync: base SQLite en cada dispositivo, sincronización
  en segundo plano y resolución de conflictos.
- **Particionado de la sync**: cada quien recibe lo suyo y lo de sus grupos, nada
  más — ni siquiera las columnas privadas de un gasto compartido ajeno.
- **Autenticación** con usuario y contraseña (Argon2id), sesión por JWT.

> Parte del roadmap (ingesta automática desde correo con IA, multimoneda con
> reportes en moneda base) está en camino — ver [Estado](#estado).

---

## Cómo funciona (arquitectura)

```
┌──────────────┐        ┌──────────────┐        ┌───────────────┐
│  PWA (React) │◄──────►│  PowerSync   │◄──────►│  PostgreSQL   │
│  SQLite local│  sync  │  (buckets)   │  CDC   │  (verdad)     │
└──────┬───────┘        └──────────────┘        └───────▲───────┘
       │ escrituras (cola offline)                      │
       └──────────────► FastAPI (validación de dominio) ┘
                              ▲
                        n8n (ingesta de correo) ──┘  [roadmap]
```

Cada dispositivo lee y escribe contra su **SQLite local**: por eso anda sin
conexión. Las escrituras se encolan y suben a la **API (FastAPI)**, que es la
única que valida las reglas de dominio. **PowerSync** replica desde PostgreSQL a
cada dispositivo, filtrando por lo que le corresponde a cada usuario.

---

## Stack y metodología

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL |
| Sincronización | PowerSync Open Edition (self-hosted) |
| Backend | Python · FastAPI · SQLAlchemy (async) · Alembic |
| Frontend | React · TypeScript · Tailwind · shadcn/ui · Vite (PWA) |
| Auth | Argon2id · JWT |
| Ingesta | n8n *(roadmap)* |
| Infra | Docker Compose · nginx · `pg_dump` |

**Cómo se construyó, y se mantiene:**

- **Montos en enteros (centavos).** Nunca punto flotante en plata.
- **IDs UUID del cliente** y **borrado lógico** (`deleted_at`): condiciones para
  que la sincronización offline no rompa nada.
- **Migraciones expandir/contraer**: los cambios de esquema no rompen a un
  cliente una versión atrás.
- **Decisiones de arquitectura documentadas** (19 ADRs en
  [`docs/decisiones/`](docs/decisiones)) — nada importante se decide dos veces.
- **Incrementos chicos con pruebas**: ~**414** pruebas (backend + frontend) en
  verde, más un banco de compatibilidad para detectar regresiones de esquema.

---

## Modos de uso

- **Personal.** Una persona, un dispositivo o varios. Reemplaza la app de gastos
  del día a día, sin nube ajena.
- **Hogar / pareja.** Cada uno con lo suyo, un grupo para lo común, y el reparto
  resuelto sin planillas ni capturas.
- **Self-host.** Lo levantás en tu servidor y entrás desde el celular y la
  compu. Pensado para ir por [Tailscale](https://tailscale.com/) (cifrado punta a
  punta) sin exponer nada a internet.

---

## Puesta en marcha (desarrollo)

**Requisitos:** Docker, Python 3.13+ y Node 20+.

```bash
# 1. Levantar la capa de datos (Postgres + PowerSync) en Docker
make dev

# 2. Backend (FastAPI) — en otra terminal
cd backend
python -m venv .venv && . .venv/Scripts/activate   # en Linux/Mac: source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload

# 3. Frontend (PWA) — en otra terminal
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `make dev` | Levanta la capa de datos local |
| `make test` | Corre las pruebas (backend + frontend) |
| `make lint` | Formatea y revisa |
| `make migrate` | Aplica migraciones |
| `make deploy` | Build + up de todo el stack |

---

## Deploy (self-hosted)

Todo el stack corre en Docker: base, PowerSync, API, PWA y respaldos.

```bash
cp .env.example .env      # completar secretos y la URL desde la que entrás
make deploy               # docker compose --profile app up -d --build
```

La API **migra y siembra sola** al arrancar. Los respaldos (`pg_dump` diario con
retención) van en un servicio aparte. Guía completa —variables, redeploy,
restaurar un backup, la nota de que la URL de la API se hornea en el frontend— en
**[`infra/README.md`](infra/README.md)**.

---

## Estructura del repo

```
docs/          especificación, esquema SQL comentado y decisiones (ADRs)
backend/       API en FastAPI (app/, tests/, alembic/)
frontend/      PWA en React (src/, PowerSync, componentes)
infra/         docker compose, configuración de PowerSync, deploy
n8n/           parsers de correo para la ingesta automática
.claude/       agentes, skills y hooks del proyecto
```

---

## Estado

Uso personal y compartido: **funcionando**. Resumen del roadmap (detalle en
[`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md) §7 y
[`docs/BACKLOG.md`](docs/BACKLOG.md)):

| Área | Estado |
|---|---|
| Finanzas personales (cuentas, categorías, presupuesto, recurrentes, plantillas) | ✅ |
| Multimoneda (base del modelo) | ✅ |
| Autenticación (usuario + contraseña) | ✅ |
| Grupos y compartido (taxonomía, colores, notificaciones) | ✅ |
| Reparto estilo Splitwise (splits, saldos, pagos, cuenta conjunta) | ✅ |
| Extras (metas, deudas, adjuntos, fechas de tarjeta) | ✅ |
| Ingesta automática desde correo + sugerencias de IA | 🚧 en camino |
| Multimoneda: histórico de cotización + reportes en moneda base | 🚧 en camino |
| Notificaciones push + TLS (Caddy) | 🗓️ backlog |

---

## Documentación

- **[`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md)** — la fuente de verdad: el
  problema, las decisiones y el porqué.
- **[`docs/schema.sql`](docs/schema.sql)** — el modelo de datos completo y comentado.
- **[`docs/decisiones/`](docs/decisiones)** — las decisiones de arquitectura (ADRs).
- **[`docs/DESIGN.md`](docs/DESIGN.md)** — criterios de diseño de la interfaz.
- **[`infra/README.md`](infra/README.md)** — guía de deploy.

---

<div align="center">
<sub>Proyecto personal, self-hosted. Hecho para llevar las finanzas de una casa sin resignar la privacidad.</sub>
</div>
