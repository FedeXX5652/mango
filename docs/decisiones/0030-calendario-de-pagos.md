# 0030 - Calendario de pagos

Estado: aceptada (etapas 1 y 2 en la 1.5.0: el calendario y los avisos; la 3 va en la 1.6.0)
Fecha: 2026-10-04

## Contexto

El usuario pidió un "calendario de pagos" al estilo de Samsung Reminder: anotar
lo que hay que pagar (alquiler, tarjeta, expensas), cuándo vence y cada cuánto se
repite, y que la app avise y pregunte si ya se pagó. Las decisiones de producto
las tomó él (2026-10-03 y 2026-10-04). Las que importan acá:

- **C2/C8.** Cada recordatorio se puede asociar a una plantilla. "Cargar el
  pago" abre el alta con ella, y el monto vive en la plantilla. Si se borra la
  plantilla, el recordatorio queda, desvinculado.
- **C4.** Qué hacer si vence en fin de semana se elige al crear, sin opción
  preelegida.
- **C6.** Los avisos son a las 9:00 por defecto, y nunca entre las 22 y las 8.
- **C10.** Se guarda en la base y se sincroniza: se ve en todos los dispositivos.
- **R1. Sin feriados.** No se puede saber qué feriados respeta cada vencimiento,
  y menos en otros países. Solo se considera el fin de semana.
- **R2. "Más tarde"** ofrece opciones a elegir; es de la etapa 2.
- **R3. Repetición y avisos.** Las repeticiones son como en Samsung Reminder.
  Hay un aviso por defecto y se pueden agregar los que se quieran.
- **R4.** Si no se responde, se sigue avisando 3 días por defecto. Es editable,
  e incluye "hasta que responda".
- **R5.** Hay una tarjeta "Próximos pagos" en el Inicio, y la pantalla está en
  "Más" y en los accesos. La barra de navegación no se toca.

## Decision

### La regla de repetición, como en Samsung

Un recordatorio (`reminders`) tiene su regla en columnas, para que la base las
valide:

| Se elige | Columnas |
| --- | --- |
| No repetir, o cada N días, semanas, meses o años | `freq`, `interval_count` |
| Semanal: qué días | `weekdays` (máscara: lunes = 1 … domingo = 64) |
| Mensual: el día D, o el primero…cuarto o último de un día de la semana | `month_mode`, `month_day`, o `month_week` (1–4, −1) + `month_weekday` |
| Anual | la fecha de inicio |
| Hasta cuándo: siempre, N veces o una fecha | `count` o `until_date` |
| Si cae sábado o domingo: queda, pasa al lunes o se adelanta al viernes | `weekend_shift` |

En la pantalla, la repetición es **relativa a la fecha**, como en Samsung. Los
atajos salen de ella ("Todas las semanas, los sábados", "Todos los meses, el día
10", "Todos los años, el 10 de octubre"), y "Personalizar" arma el resto. Un día
del mes que no existe cae en el último: el 31 es "el último día del mes", y por
eso no se ofrecen las dos opciones.

La pregunta del fin de semana aparece **solo si puede caer en uno**: mensual,
anual, o "el último domingo". Una fecha única la elige la persona, y lo semanal
elige sus días.

### Las fechas se calculan: un motor, dos copias, los mismos casos

Las fechas de los vencimientos **no se guardan**: salen de la regla. El motor
está dos veces, en el servidor (`services/repeticion.py`) y en el teléfono
(`lib/repeticion.ts`). Así el teléfono arma el calendario sin conexión, y el
servidor avisa (etapa 2).

Las dos copias corren **los mismos casos**: `lib/repeticion.casos.json`, con los
resultados calculados a mano contra el calendario, no con el motor. Si una copia
cambia y la otra no, se rompen las pruebas de una de las dos.

Cada vencimiento tiene dos fechas:

- **`nominal`**: la que dice la regla. Identifica al ciclo.
- **`vence`**: la que se muestra, corrida por el fin de semana.

El cliente cuenta en días enteros desde 1970 en UTC: sin horas, no hay zona
horaria que corra una fecha.

### Un ciclo tiene fila solo cuando se responde

`reminder_cycles` guarda lo que pasó con un vencimiento: **pagado**, **omitido**
o de vuelta a **pendiente** al deshacer. También el movimiento con que se pagó.

- **El id es determinista**: UUID v5 de `reminder_id:nominal_date`. Es lo mismo
  que hacen los recurrentes (3.7): dos dispositivos que marcan el mismo ciclo sin
  conexión escriben **la misma fila**.
- **El alta es un upsert atómico** (`INSERT … ON CONFLICT (id)`). Un POST con un
  id existente daría 409, que el conector toma por "ya aplicado": la segunda
  escritura se perdería sin aviso.
- **Gana la última subida**, como en cualquier otra fila.
- Marcar "Ya lo pagué" sin movimiento no borra el pago que cargó otro
  dispositivo. Deshacer u omitir sí lo suelta; el movimiento queda, como
  cualquiera.
- El servidor pone **quién y cuándo** respondió. Si se repite el mismo estado,
  quedan los del primero.

**Por qué no se materializan los ciclos** (el plan de 2026-10-03 decía
"materializados por el servidor"):

- El teléfono tiene que mostrar el calendario y dejar marcar sin conexión, y un
  ciclo materializado necesita al servidor para existir. Para eso hacía falta el
  motor en el cliente de todas formas.
- Con el motor en los dos lados, guardar las fechas solo agregaba una copia que
  podía desincronizarse.
- El servidor igual va a tener su fila cuando la necesite: en la etapa 2, la
  crea al avisar (para el seguimiento), con el mismo id.

### Qué cuenta como vencido

Un vencimiento sin responder cuyo día ya pasó está **vencido**.

**Cuentan desde `track_from`.** Al crear el recordatorio es hoy, o la fecha de
inicio si es anterior: "venció el 5 y no pagué" es a propósito. Al **cambiar la
regla** pasa a ser hoy: si no, las fechas viejas de la regla nueva aparecerían
vencidas. Lo ya respondido queda en la historia.

En la lista va **un renglón por recordatorio**: el vencido más viejo y cuántos
hay ("y 2 más sin marcar"). Así uno diario sin respuestas no llena la pantalla.

### Lo demás

- **Avisos** (`alerts`): una lista de `{days_before, time}`.
  - Por defecto, el mismo día a las 9:00.
  - Entre las 8:00 y las 21:59 (C6); el servidor lo valida.
  - `followup_days`: 3 por defecto; NULL = hasta que responda; 0 = no seguir.
  - Se cargan con el recordatorio y los manda la etapa 2 (abajo).
- **Validación en el CRUD** (DomainError, 422), no solo en los CHECK de la base.
  Un error de la base vuelve 409 y se pierde (ver más arriba).
  - Cada frecuencia usa sus campos y no los de otra, y el fin es uno solo.
  - Una plantilla ajena o borrada no se rechaza: queda "sin plantilla".
- **Pantalla** "Calendario de pagos" (`/calendario`):
  - Vista "Próximos": vencidos sin marcar, hoy, próximos 30 días y más adelante.
  - Vista "Recordatorios": todos, para editarlos.
  - Cada vencimiento abre una hoja con "Cargar el pago", "Ya lo pagué" y
    "Omitir este vencimiento", o "Deshacer".
- **Tarjeta "Próximos pagos"** en el Inicio: lo vencido y lo que vence en la
  semana, para marcarlo sin salir. Si no hay nada, no aparece.

### Los avisos (etapa 2)

**La tarea `recordatorios` del planificador (0029)** corre cada minuto, con su
candado. Mira la hora local del servidor (`settings.tz`) y decide qué toca
(`services/recordatorios.py`, lógica pura con sus pruebas):

- **Cada aviso sale en su día y a su hora.** Si el servidor estuvo apagado a
  esa hora, sale cuando vuelve, pero solo el mismo día: lo de días anteriores lo
  cubre el seguimiento, y no hay catarata.
- **Seguimiento.** Vencido y sin responder, avisa **una vez por día**, a la hora
  del primer aviso, durante `followup_days` (NULL = hasta que se responda; se
  mira hasta un año para atrás).
- **Nunca entre las 22 y las 8** (C6). Lo que toca en ese rato espera a las 8.
- **Sin avisos, no avisa.** Un recordatorio que no tiene avisos solo se ve en el
  calendario, salvo lo que la persona pospuso a propósito.

**El ciclo anota lo que avisó** (`alerts_sent` con las claves "3@09:00",
`followup_sent_on`), y así no repite. La fila se crea al primer aviso, pendiente
y con el mismo id determinista. Solo el servidor escribe esas dos columnas: el
upsert del cliente no las toca.

**Los avisos son los de la bandeja** (0019), tipo `recordatorio` y familia de
push `recordatorios`. Los manda el despachador de 0029, y por eso aparecen
también en la campanita.

- El título es el del recordatorio.
- El cuerpo dice cuándo vence y cuánto ("Vence hoy · $500.000,00"; "Venció el
  lunes 12/10. ¿Ya lo pagaste?").
- **Tocarlo abre ese vencimiento** (`/calendario?r=<id>&n=<fecha>`).

**"Más tarde"** (R2) calla ese vencimiento hasta un momento (`snoozed_until`).
Cuando llega, avisa una vez ("Te lo recuerdo: …"). Responder lo deja sin efecto.

- **En la app** hay atajos que muestran a qué hora quedaría cada uno: en 1
  hora, en 3, mañana a las 9, el lunes a las 9. También se puede elegir fecha y
  hora.
- **Nunca cae de noche**: entre las 22 y las 8 pasa a las 8, y se dice.
- **Hasta dos meses.** El servidor lo vuelve a correr al horario, por si llega
  de un dispositivo con otra hora.

**Botones del aviso en Android** (C5): "Ya lo pagué" y "Más tarde". Responden
**sin abrir la app**.

- El service worker no tiene la sesión, así que el aviso trae un **permiso de un
  solo uso**: un token aleatorio de 256 bits, del que se guarda **solo el
  SHA-256** (`reminder_action_tokens`) y que vence en 7 días.
- Lo usa la **única ruta sin sesión** de la API, `POST /reminder-actions`. Un
  permiso que no existe, ya se usó o venció da 404, sin decir cuál de las tres.
- **"Más tarde" desde el botón** no deja elegir: usa la preferencia del usuario
  (`users.snooze_default`, en Ajustes; 3 horas si no eligió).
- **Un aviso viejo no deshace** lo que ya se respondió en la app. El "Más
  tarde" del botón solo toca un ciclo pendiente, en la misma sentencia (un upsert
  con condición): si el pago entró mientras tanto, queda pagado.
- **El permiso se guarda antes de mandarlo**: si la base falla, no sale un
  permiso que no existe.
- Al avisar algo pospuesto, el servidor limpia `snoozed_until` **solo si sigue
  siendo el que leyó**. Un "Más tarde" nuevo que llegó mientras tanto no se
  pisa.
- **El aviso pide respuesta** (`requireInteraction`): en la compu queda a la
  vista hasta responder. En Android queda en la bandeja de todas formas.
- Los permisos usados o vencidos **quedan en la tabla** (no se borra nada
  físicamente). Son pocos: uno por aviso.
- Si el botón no puede responder (sin conexión, permiso vencido), abre la app en
  ese vencimiento.
- En iPhone no hay botones: se toca el aviso y se responde en la app.

### Lo que falta (etapa 3, versión 1.6.0)

- **Etapa 3.**
  - Recordatorios de grupo (C3, con plantillas de grupo).
  - "Avisarme" en tarjetas y deudas.
  - Recurrentes como información.
  - Lo automático marcado (A1/A2) y las propuestas de la ingesta (C9) van con
    la fase 2 (decidido el 2026-10-08): hoy nada crea recordatorios
    automáticos, y el indicador no se podría probar con datos reales.
  - `docs/recordatorios.md` para la ingesta.
  - Sale `recurring_rules.auto_create`.

## Consecuencias

- **Un recordatorio no es un movimiento.** Pagarlo es cargar un movimiento, con
  la plantilla o a mano, o solo marcarlo.
- **Cambiar la regla cambia las fechas que vienen**, y desde hoy. Lo ya
  respondido no se toca.
- **Dos copias del motor** obligan a que cualquier cambio de la regla toque las
  dos y los casos compartidos.
