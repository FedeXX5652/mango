---
name: nueva-migracion
description: Como se crea y aplica una migracion de base de datos en este proyecto. Usar ante cualquier cambio de esquema.
---

# Crear una migracion

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

Agregarla tambien a la configuracion de PowerSync en
`infra/powersync/sync-rules.yaml`, con la regla de que filas ve cada usuario.

Una tabla que no este ahi no llega a los clientes.
