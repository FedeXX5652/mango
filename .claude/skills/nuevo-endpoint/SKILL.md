---
name: nuevo-endpoint
description: Como se agrega un endpoint nuevo a la API de este proyecto. Usar al crear cualquier ruta nueva en el backend.
---

# Agregar un endpoint

Orden de trabajo. No saltear pasos.

## 1. Esquema Pydantic

En `backend/app/schemas/<recurso>.py`. Separar siempre:

- `<Recurso>Create` - lo que entra al crear
- `<Recurso>Update` - lo que entra al modificar, todo opcional
- `<Recurso>Read` - lo que sale

Los montos se declaran como `int` (centavos), nunca `float` ni `Decimal` en la
capa de transporte.

## 2. Operaciones de base

En `backend/app/crud/<recurso>.py`. Funciones puras que reciben la sesion como
parametro. Sin logica de HTTP.

Toda consulta filtra por `deleted_at IS NULL` salvo que explicitamente se
quieran los borrados.

## 3. Ruta

En `backend/app/api/v1/<recurso>.py`. La ruta solo:

- valida permisos
- llama al CRUD
- traduce excepciones de dominio a codigos HTTP

Sin logica de negocio en la ruta.

## 4. Pruebas

En `backend/tests/api/test_<recurso>.py`. Como minimo:

- caso feliz
- validacion rechazada
- acceso a un recurso de otro usuario devuelve 404 (no 403: no revelar
  existencia)
- si el recurso tiene montos, un caso con monto grande para verificar que no
  hay perdida de precision

## 5. Registrar la ruta

En `backend/app/api/v1/__init__.py`.

## Verificacion

```
make test
make lint
```
