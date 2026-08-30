# 0002 - Alcance de las categorias: personal, de grupo o global

- **Fecha**: 2026-08-30
- **Estado**: aceptada

## Contexto

Surgio la pregunta de si las categorias son por usuario o si un grupo puede
tener un set propio de categorias y subcategorias compartido por todos sus
integrantes. Hay que fijar el modelo de alcance antes de que se construya el
multiusuario, para no migrar despues.

## Opciones evaluadas

- **Solo por usuario.** Simple, pero impide que una pareja/familia comparta un
  arbol de categorias comun; cada uno tendria que recrearlo.
- **Solo por grupo.** No sirve para el uso individual (fase 1) ni para quien no
  esta en ningun grupo.
- **Tres alcances con `owner_id` + `group_id` (ambos nullable).** Una misma
  tabla cubre los tres casos segun que columna este seteada.

## Decision

Tres alcances sobre la tabla `categories`, distinguidos por que columna tiene
valor:

| owner_id | group_id | Alcance |
|---|---|---|
| seteado  | null     | Personal (solo la ve/edita ese usuario) |
| null     | seteado  | Del grupo (la ven/usan todos los integrantes) |
| null     | null     | Global del sistema (default compartido) |

La tabla ya esta asi en `schema.sql` (ambas columnas nullable). No requiere
cambios de esquema.

## Por que

`owner_id` + `group_id` nullable es la forma mas barata de cubrir los tres
casos sin duplicar tablas ni migrar mas adelante. Es coherente con 5.4
(owner/visibility desde el dia uno). Se acepta perder algo de simplicidad en las
consultas: listar categorias implica traer *las del usuario* mas *las de sus
grupos* mas *las globales*, y resolver colisiones de nombre entre alcances.

## Consecuencias

- **Fase 1 (hoy):** solo se usan categorias personales. `create_category`
  setea `owner_id` al usuario actual y no acepta `group_id`; `list_categories`
  filtra solo por `owner_id`. Ver `app/crud/category.py`.
- **Fase 3 (multiusuario):** se habilita crear categorias de grupo (con
  `group_id`, `owner_id` null) y `list_categories` pasa a traer
  `owner_id = usuario` OR `group_id IN (grupos del usuario)` OR ambas null.
  La edicion de categorias de grupo la puede hacer cualquier integrante (o segun
  rol; a definir en fase 3).
- **Regla que se mantiene:** siguen siendo dos niveles y la subcategoria comparte
  el `kind` del padre (ver `create_category`), sin importar el alcance.
- No hay migracion pendiente: las columnas ya existen.
