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
![Versión](https://img.shields.io/badge/versión-1.3.0-FDBE02)
![Tests](https://img.shields.io/badge/tests-521%20verdes-2EA043)
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
- **Espacios**: Personal y cada grupo tienen **las mismas pantallas** (Inicio,
  Movimientos, Presupuesto, Estadísticas). Pasás de uno a otro con el selector de
  arriba, y la dirección dice dónde estás (`/grupos/<grupo>/movimientos`).
- **El + carga donde estás**: dentro de un grupo, el gasto ya sale compartido,
  con sus categorías, su cuenta conjunta y su reparto. El formulario dice
  "Se carga en ● Casa" y se cambia ahí mismo.
- **Grupos**: se comparte *solo* lo que marcás como compartido. Lo privado
  (cuenta, medio de pago, monto debitado) **no viaja** a los demás.
- **Taxonomía del grupo**: categorías y tags propios del grupo, con color, para
  que todos clasifiquen igual.
- **Reparto estilo Splitwise**: partes iguales, montos exactos, porcentajes o
  **partes** ("2 a 1"), y un **reparto por defecto** por grupo (Casa 60/40) con
  el que arranca cada gasto; **balance** de quién puso qué y **quién le debe a
  quién**.
- **Historia del grupo**: gastos, pagos entre miembros y aportes a la conjunta
  intercalados, con tu parte en cada gasto y filtros por quién pagó y categoría.
- **Cada grupo, de un vistazo**: en tu Inicio, una tarjeta por grupo con cómo
  quedaste ("Beto te debe $X"); en el del grupo, accesos a **Saldar**, **Poner
  plata**, Miembros y Categorías.
- **Saldar deudas**: marcar como saldado (por fuera) o registrar un **pago real**
  que sale de tu cuenta, en partes. El cobro le llega al otro para confirmar en
  qué cuenta entró, ya como **reintegro**: en tus estadísticas va aparte de los
  ingresos, porque es plata tuya que vuelve.
- **Cuenta conjunta**: plata que ya es de todos; lo que se paga con ella no genera
  deuda. **Poner** o **sacar plata** es una transferencia con la conjunta ya
  elegida.
- **Presupuesto del grupo** y **notificaciones** in-app de lo que pasa.

### 📲 App instalable
- **PWA**: se instala desde el navegador en Android, iOS y escritorio, y anda sin
  conexión.
- **Atajos del ícono**: mantené apretado el ícono en Android (o usá la lista de
  saltos en escritorio) para ir directo a **Nuevo gasto**, **Nuevo ingreso**,
  **Movimientos**, **Estadísticas**, tu **último grupo**, **Transferencia** o
  **Presupuesto**. iOS no muestra atajos, pero los enlaces directos
  (`/nuevo?tipo=gasto`, `/grupos/ultimo`…) funcionan igual.
- **Dos interfaces, no una estirada**: en el teléfono, barra inferior con el
  **+** al centro para cargar en dos toques y filtros en una hoja; en la compu,
  barra lateral, filtros a la vista y el detalle de un movimiento en un panel al
  lado de la lista.
- **Accesos a tu medida**: en Inicio, un panel con tus cuatro accesos (metas,
  deudas, recurrentes, estadísticas…), elegidos y ordenados por vos, y un "Más"
  con todo lo demás. Viajan con tu usuario a todos tus dispositivos.
- **Carga rápida**: calculadora en el monto (muestra la cuenta y guarda el
  resultado), plantillas a un toque y guardar lo cargado como plantilla nueva.

### 🔒 Privacidad y sincronización
- **Local-first** con PowerSync: base SQLite en cada dispositivo, sincronización
  en segundo plano y resolución de conflictos.
- **Particionado de la sync**: cada quien recibe lo suyo y lo de sus grupos, nada
  más — ni siquiera las columnas privadas de un gasto compartido ajeno. Lo del
  grupo vive en sus propias tablas locales, así que tus saldos se calculan solo
  con tu plata.
- **Autenticación** con usuario y contraseña (Argon2id), sesión por JWT.

> Parte del roadmap (ingesta automática desde correo con IA, multimoneda con
> reportes en moneda base) está en camino — ver [Estado](#estado).

---

## Cómo funciona (arquitectura)

```text
        Celular / compu: PWA con su SQLite local (anda sin conexión)
                                  │
                                  │  un solo origen, un solo puerto
                                  ▼
                   ┌─────────────────────────────┐
                   │   nginx · puerta de entrada │
                   └───────┬─────────────┬───────┘
                   /api    │             │    /powersync
                           ▼             ▼
               ┌──────────────────┐ ┌──────────────────┐
               │     FastAPI      │ │    PowerSync     │
               │  valida y migra  │ │ sync por usuario │
               └────────┬─────────┘ └────────▲─────────┘
                escribe │                    │ replica (WAL lógico)
                        ▼                    │
               ┌─────────────────────────────┴─────────┐
               │        PostgreSQL (la verdad)         │
               └───────────────────────────────────────┘
          n8n (ingesta de correo) ──► FastAPI            [roadmap]
```

Cada dispositivo lee y escribe contra su **SQLite local**: por eso anda sin
conexión. Las escrituras se encolan y suben a la **API (FastAPI)**, que es la
única que valida las reglas de dominio. **PowerSync** replica desde PostgreSQL a
cada dispositivo, filtrando por lo que le corresponde a cada usuario. Todo entra
por **una sola puerta** (nginx), así que se expone un único puerto.

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
| Infra | Docker Compose · nginx (proxy) · imágenes en GHCR · Watchtower · `pg_dump` |

**Cómo se construyó, y se mantiene:**

- **Montos en enteros (centavos).** Nunca punto flotante en plata.
- **IDs UUID del cliente** y **borrado lógico** (`deleted_at`): condiciones para
  que la sincronización offline no rompa nada.
- **Migraciones expandir/contraer**: los cambios de esquema no rompen a un
  cliente una versión atrás.
- **Decisiones de arquitectura documentadas** (20 ADRs en
  [`docs/decisiones/`](docs/decisiones)) — nada importante se decide dos veces.
- **Incrementos chicos con pruebas**: **521** pruebas (backend + frontend) en
  verde, más un banco de compatibilidad para detectar regresiones de esquema.
- **Deploy por imágenes**: el servidor no tiene el código; baja imágenes
  publicadas, y la base migra sola al arrancar.

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
| `make deploy` | Construye y levanta todo el stack desde el código, en esta máquina |
| `make release` | Publica las imágenes de producción en GHCR |

---

## Instalación (self-hosted)

Mango se instala como cualquier app dockerizable: tu servidor **baja imágenes ya
publicadas** y las corre. No necesita el código.

**Requisitos:** un servidor (Linux, x86 o ARM) con Docker y el plugin
`docker compose`.

```bash
curl -fsSL https://raw.githubusercontent.com/FedeXX5652/mango/master/deploy/install.sh | sh
```

Eso es todo. El instalador:

1. crea `./mango/` con el `docker-compose.yml`,
2. genera un `.env` con **secretos al azar** (si ya existe uno, lo conserva),
3. baja las imágenes y levanta el stack; la base **se migra sola**,
4. imprime la dirección (`http://<servidor>:8081`) y la **clave temporal** del
   primer usuario, que la app pide cambiar al entrar.

¿Preferís sin script? Bajá [`deploy/docker-compose.yml`](deploy/docker-compose.yml)
y [`deploy/.env.example`](deploy/.env.example) (como `.env`), completá los tres
secretos y corré `docker compose up -d`.

### Cómo está compuesto

Seis contenedores, **un solo puerto** publicado:

| Contenedor | Qué hace |
|---|---|
| `mango-frontend` | La PWA y la **puerta de entrada**: nginx sirve la app y hace de proxy a `/api` y `/powersync`. Único puerto expuesto (`MANGO_PORT`, 8081) |
| `mango-backend` | API FastAPI. Valida el dominio y **migra la base al arrancar** |
| `mango-powersync` | Sincronización, con la configuración de Mango incluida en la imagen |
| `mango-postgres` | La base de la app (PostgreSQL 16, WAL lógico) |
| `mango-powersync-storage` | Buckets de sincronización (cache derivada, se reconstruye sola) |
| `mango-backup` | `pg_dump` diario con retención |

Los datos viven en volúmenes con nombre fijo: `mango-pgdata`,
`mango-attachments` (fotos de tickets), `mango-backups` y
`mango-powersync-storage`.

### Actualizaciones

- **Automáticas con [Watchtower](https://containrrr.dev/watchtower/):** las
  imágenes de Mango traen el label para que las actualice; las bases no (un
  reinicio de la base lo decidís vos). Al llegar una versión, el backend migra al
  arrancar y PowerSync se reinicia después.
- **A mano:** `docker compose pull && docker compose up -d`.
- **Volver atrás:** `MANGO_TAG=<commit>` en el `.env` y `docker compose up -d`.

Guía completa —respaldos y cómo restaurarlos, volúmenes, opciones— en
**[`infra/README.md`](infra/README.md)**.

### Publicar una versión

Desde la máquina de desarrollo, sin CI: `make release` (o `sh scripts/release.sh`)
arma las cuatro imágenes y las sube a GHCR con el tag del commit y `latest`.
Detalle en [`infra/README.md`](infra/README.md#publicar-una-versión-mantenimiento).

### Versiones

Mango usa **[SemVer](https://semver.org/lang/es/)**: `MAYOR.MENOR.PARCHE`.

| Sube | Cuándo | Ejemplo |
|---|---|---|
| **PARCHE** | Arreglos, sin nada nuevo | 1.0.0 → 1.0.1 |
| **MENOR** | Algo nuevo que no rompe nada | 1.0.1 → 1.1.0 |
| **MAYOR** | Algo que pide un paso a mano o deja atrás a los clientes viejos | 1.4.2 → 2.0.0 |

Cada compilación lleva además el **commit** del que salió (el mismo tag de las
imágenes) y la **fecha**. Se ven **al fondo de Ajustes**:
`Mango 1.0.0 · 1b6e277 · 01/10/2026`. Si el commit es el último de GitHub, ese
dispositivo tiene la última versión; si no, cerrá y abrí la app para que tome la
nueva.

Para sacar una versión: subir el número en `frontend/package.json` **y** en
`backend/pyproject.toml` (un test frena si no coinciden), el badge de arriba, una
entrada en [`CHANGELOG.md`](CHANGELOG.md), y etiquetar el commit
(`git tag v1.1.0`). Ver [decisión 0025](docs/decisiones/0025-versionado.md).

---

## Estructura del repo

```
docs/          especificación, esquema SQL comentado y decisiones (ADRs)
backend/       API en FastAPI (app/, tests/, alembic/)
frontend/      PWA en React (src/, PowerSync, componentes) + nginx
deploy/        lo que va al servidor: docker-compose, .env de ejemplo, instalador
infra/         compose de desarrollo, imágenes de PowerSync y backup, guía de deploy
scripts/       release (publicación de imágenes) y utilidades
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
