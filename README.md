# Mango

Sistema de finanzas personales y compartidas, self-hosted y offline-first.

Cada persona lleva sus gastos privados; una pareja o familia comparte solo lo
que decide compartir. Las transacciones de tarjeta se importan solas desde los
correos de alerta del banco.

## Estado

En diseno. El modelo de datos y la especificacion estan cerrados; el codigo
todavia no empezo.

## Por donde empezar

1. Leer `docs/ESPECIFICACION.md`. Es la fuente de verdad: explica el problema,
   las decisiones tomadas y por que.
2. Leer `docs/schema.sql`, que es el modelo de datos completo y comentado.
3. Leer `.claude/README.md` si vas a trabajar con agentes de IA en este repo.

## Estructura

```
CLAUDE.md          contexto permanente para agentes de IA
docs/              especificacion, esquema y decisiones de arquitectura
backend/           API en FastAPI
frontend/          PWA en React
infra/             docker compose y configuracion de PowerSync
n8n/               parsers de correo para la ingesta automatica
.claude/           agentes, skills y hooks del proyecto
```

## Stack

| Capa | Tecnologia |
|---|---|
| Base de datos | PostgreSQL |
| Sincronizacion | PowerSync Open Edition |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Frontend | React, TypeScript, Tailwind, shadcn/ui |
| Ingesta | n8n |

## Fases

1. Sistema manual, un usuario. Reemplaza el uso diario de una app de gastos.
2. Ingesta automatica desde correo, con bandeja de pendientes.
3. Multiusuario, grupos y visibilidad compartida.
4. Multimoneda y reparto de gastos.
5. Deudas, metas y adjuntos.

Ver `docs/ESPECIFICACION.md` seccion 7 para el detalle.
