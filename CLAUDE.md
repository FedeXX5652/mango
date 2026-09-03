# Mango

Aplicacion de finanzas personales y compartidas. Antes de cualquier tarea,
lee `docs/ESPECIFICACION.md`: contiene el problema que se resuelve, las
decisiones ya tomadas y los criterios de diseno. **No re-decidas lo que ya
esta decidido ahi.**

## Stack

- PostgreSQL como base
- Python con FastAPI, SQLAlchemy y Alembic para el backend
- PowerSync Open Edition para sincronizacion offline
- React con TypeScript, Tailwind y shadcn/ui para el frontend (PWA)
- n8n para la ingesta desde correo

## Reglas que no se negocian

1. **Montos en enteros (centavos).** Nunca punto flotante en operaciones
   monetarias. `2302.72` se guarda como `230272`.
2. **IDs UUID generados por el cliente.** El servidor no asigna identificadores
   a lo que crea el cliente: rompe el funcionamiento sin conexion.
3. **Borrado logico.** Nada se borra fisicamente; se marca `deleted_at`.
4. **Estado `pending` solo lo produce la ingesta automatica.** Una carga
   manual siempre llega completa y validada. La base lo impone con una
   restriccion.
5. **Comercio no es categoria.** El comercio es texto libre que describe donde
   se gasto. La categoria es una entidad elegida de una lista.
6. **Las sugerencias de IA nunca se aplican solas.** Van a
   `suggested_category_id` y esperan confirmacion humana.

## Como trabajar

- **Plan antes de codigo.** Proponer que se va a hacer, esperar aprobacion,
  recien ahi ejecutar.
- **Incrementos chicos.** Una tabla, un endpoint, una pantalla. Con su prueba.
- **Preguntar ante ambiguedad** en vez de asumir. Las decisiones de producto
  las toma el humano.
- **No agregar dependencias** sin justificarlo primero.
- **Seguir las skills del proyecto.** Ante un cambio de esquema, usar
  `nueva-migracion`; al crear una ruta nueva en la API, usar `nuevo-endpoint`.

## Estructura

```
docs/           especificacion, esquema, decisiones de arquitectura
backend/        FastAPI
frontend/       React PWA
infra/          docker compose, configuracion de PowerSync
n8n/            flujos exportados y parsers
.claude/        agentes, skills y hooks del proyecto
```

## Comandos habituales

```
make dev        levanta el stack local
make test       corre las pruebas
make lint       formatea y revisa
make migrate    aplica migraciones
```
