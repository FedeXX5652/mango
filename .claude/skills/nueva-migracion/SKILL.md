---
name: nueva-migracion
description: Como se crea y aplica una migracion de base de datos en este proyecto. Usar ante cualquier cambio de esquema.
---

# Crear una migracion

## Antes que nada: ¿rompe a un cliente viejo?

La app es local-first: hay escrituras en la cola que un cliente **una version
atras** va a subir contra el servidor **nuevo**. Antes de tocar el esquema,
mirar la decision **0012**:

- **Aditivo** (columna opcional con default, sacar una columna, aflojar una
  validacion): se hace en un paso.
- **No aditivo** (renombrar, columna obligatoria nueva, apretar validacion,
  indice unico nuevo): va en dos releases, **expandir y contraer**. No en uno.

Regla dura: **un campo nunca cambia de significado; si cambia, es un nombre
nuevo.**

## Reglas del esquema

Toda tabla nueva lleva, sin excepcion:

```sql
id          UUID PRIMARY KEY,
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at  TIMESTAMPTZ
```

`updated_at` y `deleted_at` no son opcionales: son lo que hace posible la
sincronizacion sin conexion.

Los montos se declaran `BIGINT` (centavos). **Nunca `NUMERIC` ni `REAL` para
dinero.**

## Procedimiento

1. Modificar el modelo en `backend/app/models/`
2. Generar la migracion:
   ```
   alembic revision --autogenerate -m "descripcion corta"
   ```
3. **Leer la migracion generada.** Alembic se equivoca seguido con indices
   parciales y restricciones CHECK; hay que corregirlas a mano.
4. Verificar que exista el `downgrade` y que sea correcto.
5. Aplicar y probar:
   ```
   make migrate
   make test
   ```

## Si la tabla se sincroniza a los dispositivos

Cuatro cosas en el **mismo** deploy, o la tabla no llega y el cliente pierde su
copia local en el proximo checkpoint:

1. La migracion (esto).
2. La consulta en `infra/powersync/sync-config.yaml`, filtrando por
   `auth.user_id()` como las demas (ver 0009).
3. **Reiniciar PowerSync** (`docker compose restart powersync`): lee el archivo
   al arrancar.
4. La tabla en el `AppSchema` del cliente (`frontend/src/lib/powersync/esquema.ts`).
