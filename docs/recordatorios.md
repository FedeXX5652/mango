# Recordatorios: el formato

Para quien crea o responde recordatorios desde fuera de la app: la ingesta del
correo, un script o una sesión futura. Las decisiones y el porqué están en
`decisiones/0030-calendario-de-pagos.md`. Acá está solo el contrato.

## Lo esencial

- **Un recordatorio es una regla de repetición más sus avisos.** Las fechas de
  los vencimientos no se guardan: se calculan con la regla, con el mismo motor en
  el servidor (`backend/app/services/repeticion.py`) y en el teléfono
  (`frontend/src/lib/repeticion.ts`).
- **Cada vencimiento (ciclo) tiene un id determinista.** Hay fila en
  `reminder_cycles` solo cuando alguien lo responde o cuando el servidor avisa.
- **El recordatorio no tiene monto.** El monto vive en la plantilla
  (`template_id`), en centavos, como todo monto de Mango.
- **Los ids los genera quien crea** (UUID v4), nunca el servidor. **Nada se borra
  físicamente**: borrar marca `deleted_at`.

## La API

La base es `/api/v1`, con `Authorization: Bearer <token>`. No hay rutas de
lectura: lo guardado se lee por la sincronización.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| POST | `/reminders` | Crea un recordatorio. |
| PATCH | `/reminders/{id}` | Lo modifica: todos los campos son opcionales. |
| DELETE | `/reminders/{id}` | Lo borra. Es idempotente: borrarlo otra vez da 204. |
| POST | `/reminder-cycles` | Responde un vencimiento: lo crea o lo actualiza por su id. |
| PATCH | `/reminder-cycles/{id}` | Cambia la respuesta o el "Más tarde". |

- Un dato que no cumple da **422**, con `detail` en un texto para mostrar.
- Algo que no es tuyo (ni de un grupo tuyo) da **404**: no se dice si existe.
- Los campos que la ruta no conoce se ignoran.

## El recordatorio

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | Obligatorio. Lo genera quien crea. |
| `title` | texto, 1 a 120 | Obligatorio. Qué hay que pagar. |
| `notes` | texto, hasta 1000 | |
| `group_id` | UUID | De un grupo del que seas miembro. Solo al crearlo. |
| `template_id` | UUID | Plantilla del mismo ámbito (personal tuya, o del grupo). Si no sirve, queda en `null`. |
| `freq` | `once`, `daily`, `weekly`, `monthly`, `yearly` | Obligatorio. |
| `interval_count` | 1 a 99 | Cada N días, semanas, meses o años. Por defecto, 1. |
| `weekdays` | 1 a 127 | Semanal (obligatorio): máscara con lunes = 1, martes = 2, …, domingo = 64. |
| `month_mode` | `day`, `weekday` | Mensual (obligatorio). |
| `month_day` | 1 a 31 | Con `day` (obligatorio). 31 es el último día del mes. |
| `month_week` | 1, 2, 3, 4, -1 | Con `weekday` (obligatorio). -1 es la última semana. |
| `month_weekday` | 0 a 6 | Con `weekday` (obligatorio): 0 = lunes … 6 = domingo. |
| `start_date` | AAAA-MM-DD | Obligatorio. El primer vencimiento. |
| `until_date` | AAAA-MM-DD | Fin por fecha. No va con `count`. |
| `count` | 1 a 999 | Fin por cantidad de veces. No va con `until_date`. |
| `weekend_shift` | `none`, `next`, `previous` | Obligatorio, sin valor por defecto. Qué pasa si vence sábado o domingo: queda, pasa al lunes o se adelanta al viernes. |
| `track_from` | AAAA-MM-DD | Obligatorio. Lo vencido sin responder cuenta desde acá. Al crearlo, la fecha más temprana entre hoy y `start_date`. |
| `alerts` | lista de `{days_before, time}` | Hasta 10. `days_before` va de 0 a 30, `time` es "HH:MM" en la hora de Argentina, a cualquier hora. Por defecto, el mismo día a las 09:00. También se acepta el texto del JSON. |
| `followup_days` | 0 a 30, o `null` | Días que se sigue avisando si no se responde. `null` = hasta que se responda. Por defecto, 3. |
| `payment_method_id` | UUID | "Avisarme" en una tarjeta de crédito tuya. Solo al crearlo. |
| `debt_id` | UUID | "Avisarme" en una deuda tuya. Solo al crearlo, y no junto con la tarjeta. |

### La regla

Cada frecuencia usa sus campos y no los de otra. Si no, el servidor responde 422:

- **`once`**: vence una vez, el `start_date`.
- **`daily`**: cada `interval_count` días desde `start_date`.
- **`weekly`**: cada `interval_count` semanas, los días de `weekdays`.
- **`monthly`**: cada `interval_count` meses.
  - Con `month_mode: "day"`, el `month_day`, recortado si el mes es más corto.
  - Con `month_mode: "weekday"`, el `month_week`-ésimo `month_weekday` del mes.
- **`yearly`**: cada `interval_count` años, en el día y el mes de `start_date`.
  El 29 de febrero cae el 28 en los años que no son bisiestos.

Cada ocurrencia tiene dos fechas:

- la **nominal**, la que dice la regla, que identifica al vencimiento;
- la de **vence**, corrida por `weekend_shift`, que es la que se muestra y la que
  dispara los avisos.

Los casos de prueba compartidos por los dos motores están en
`frontend/src/lib/repeticion.casos.json`, calculados a mano. Una implementación
nueva tiene que pasarlos todos.

### Lo que el servidor mantiene

- **Una tarjeta** (`payment_method_id`): si cambia su día de vencimiento, el
  recordatorio se corre a ese día. Si la tarjeta se archiva o se borra, el
  recordatorio se borra.
- **Una deuda** (`debt_id`):
  - si cambia su fecha, el recordatorio se mueve;
  - si la deuda se queda sin fecha o se borra, el recordatorio se borra;
  - si se salda del todo, su vencimiento queda pagado.
- Esto vale solo para la forma que arma "Avisarme": mensual por día para una
  tarjeta, de una vez para una deuda. Si la regla tiene otra forma, el servidor
  no la toca.

## Los vencimientos

**El id** es un UUID v5 con el espacio de nombres
`3b8f7a52-4d1e-4c6b-9a0f-2c5e8d7b1a64` y el texto
`"<id del recordatorio en minúsculas>:<fecha nominal AAAA-MM-DD>"`:

```python
uuid.uuid5(uuid.UUID("3b8f7a52-4d1e-4c6b-9a0f-2c5e8d7b1a64"),
           "7d3c1e2a-0b4f-4a6e-9c1d-2f3e4a5b6c7d:2026-11-10")
# fd62e8ba-becd-5956-962f-2e6697056f6d
```

Un id que no corresponde al recordatorio y a la fecha da 422.

| Campo | Notas |
| --- | --- |
| `id`, `reminder_id`, `nominal_date` | Obligatorios. La fecha es la **nominal**. |
| `status` | Obligatorio. `paid` (pagado), `skipped` (omitido) o `pending` (sin responder, o deshacer). |
| `transaction_id` | Con `paid`: el movimiento con el que se pagó. Tiene que ser tuyo. |
| `snoozed_until` | "Más tarde" de un recordatorio personal: un instante con zona, hasta dos meses. `null` lo saca. |
| `snoozes` | "Más tarde" de uno de grupo: un mapa `{user_id: instante}`, o el texto de su JSON. Solo cuenta tu clave: si no está, se saca la tuya. |

- Responder (`paid` o `skipped`) deja sin efecto todos los "Más tarde".
- Quién respondió y cuándo (`answered_by`, `answered_at`) lo pone el servidor.
  Si el estado no cambia, queda el primero que respondió.
- Lo que el servidor ya avisó (`alerts_sent`, `followup_sent_on`) lo escribe solo
  el servidor.

## Ejemplos

**El alquiler, el 10 de cada mes.** Si cae sábado o domingo pasa al lunes, y avisa
tres días antes y el mismo día a las 9:

```json
POST /api/v1/reminders
{
  "id": "7d3c1e2a-0b4f-4a6e-9c1d-2f3e4a5b6c7d",
  "title": "Alquiler",
  "template_id": "c2a1…",
  "freq": "monthly",
  "month_mode": "day",
  "month_day": 10,
  "start_date": "2026-11-10",
  "weekend_shift": "next",
  "track_from": "2026-10-09",
  "alerts": [{"days_before": 3, "time": "09:00"}, {"days_before": 0, "time": "09:00"}],
  "followup_days": 3
}
```

**La tarjeta, todos los meses el día de vencimiento:**

```json
{
  "id": "…", "title": "Visa", "payment_method_id": "5224…",
  "freq": "monthly", "month_mode": "day", "month_day": 12,
  "start_date": "2026-10-12", "weekend_shift": "next", "track_from": "2026-10-09"
}
```

**Una deuda, una vez, en su fecha:**

```json
{
  "id": "…", "title": "Pagarle a Beto", "debt_id": "987a…",
  "freq": "once", "start_date": "2026-10-20", "weekend_shift": "none",
  "track_from": "2026-10-09"
}
```

**Las expensas de Casa, del grupo:**

```json
{
  "id": "…", "group_id": "0000000c-…", "title": "Expensas",
  "template_id": "<plantilla del grupo>",
  "freq": "monthly", "month_mode": "day", "month_day": 10,
  "start_date": "2026-11-10", "weekend_shift": "next", "track_from": "2026-10-09"
}
```

**Marcar pagado el de noviembre, con el movimiento:**

```json
POST /api/v1/reminder-cycles
{
  "id": "fd62e8ba-becd-5956-962f-2e6697056f6d",
  "reminder_id": "7d3c1e2a-0b4f-4a6e-9c1d-2f3e4a5b6c7d",
  "nominal_date": "2026-11-10",
  "status": "paid",
  "transaction_id": "…"
}
```

**"Más tarde":** en uno personal, `"snoozed_until": "2026-11-10T18:00:00-03:00"`.
En uno de grupo, `"snoozes": {"<tu user_id>": "2026-11-10T18:00:00-03:00"}`.
En los dos casos, el `status` va en `"pending"`.

## Lo que todavía no está

- **Lo que crea un automatismo** no se distingue todavía de lo que crea la
  persona. Eso llega con la fase 2, la ingesta (0030: A1/A2 y C9):
  - lo automático va a quedar marcado, y si la persona lo edita pasa a ser suyo;
  - un recordatorio nuevo de la ingesta va a entrar como propuesta, que se
    acepta con un toque;
  - la ingesta va a poder completar la fecha o el monto de un vencimiento de un
    recordatorio de la persona.
- Hasta entonces, este es el contrato de la persona: lo que se cree por acá
  queda como si lo hubiera cargado ella.
