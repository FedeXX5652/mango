# Sistema de agentes de Mango

Configuracion propia para trabajar con agentes de IA. No es codigo de la
aplicacion: es la infraestructura para construirla.

## Las tres piezas y cuando usar cada una

La regla que las ordena: **la skill ensena el como, el hook impone la regla,
el subagente aisla el trabajo.**

### Skills (`skills/`)

Carpetas con un `SKILL.md`. El agente lee el nombre y la descripcion de cada
una al inicio de la sesion, y trae el contenido completo solo cuando la tarea
coincide. Cuesta pocas decenas de tokens tenerlas disponibles.

Se usan para **conocimiento recurrente del proyecto**: como se agrega un
endpoint aca, como se escribe una migracion aca.

Regla practica: si te encontras explicando lo mismo por segunda vez, eso es
una skill.

### Hooks (`hooks/`)

Scripts que se disparan en eventos, sin criterio del agente. Formatear despues
de editar, correr pruebas al terminar.

Se usan para lo que tiene que pasar **siempre**, y ademas ahorran tokens: no
hay que pedirle al agente que formatee si un hook lo hace solo.

### Subagentes (`agents/`)

Instancias con su propia ventana de contexto. Hacen una tarea, devuelven un
resumen y desaparecen. Nada de lo que leyeron entra en la conversacion
principal.

Dos beneficios: el contexto principal queda limpio, y se puede **asignar un
modelo distinto por agente**. Buscar en el repositorio no necesita el modelo
caro.

Los subagentes heredan el modelo del principal si no se especifica. Por eso
cada uno declara su `model` explicitamente.

## Los subagentes de este proyecto

| Agente | Para que | Modelo |
|---|---|---|
| `explorador` | Encontrar cosas en el repo sin ensuciar el contexto | Haiku |
| `revisor` | Revisar codigo antes de darlo por terminado | Sonnet |
| `documentador` | Mantener la documentacion al dia | Haiku |

Empezar con estos tres. Sumar mas solo si aparece una necesidad concreta y
repetida.

## Sobre instalar skills de terceros

Existen bibliotecas grandes de skills publicas. Conviene ser selectivo: hay un
caso documentado de alguien que instalo las 47 skills de un hilo viral y midio
que **40 empeoraron el resultado** frente a no usar ninguna.

Vale la pena mirar:

- **Graphify** — construye un grafo del codigo una vez y responde consultas
  contra el en lugar de releer archivos. Util cuando el proyecto crezca; hoy
  todavia no.
- **Superpowers** — framework completo de ciclo de desarrollo con TDD
  obligatorio. Potente pero muy opinado. Probarlo en una rama antes de
  adoptarlo.
- **Caveman** — comprime las respuestas. Su propio README aclara que solo
  reduce tokens de salida, agrega entre 1.000 y 1.500 de entrada por turno, y
  que en cargas ya concisas el ahorro puede ser negativo. Mediciones
  independientes dan 15-25% real, no el 65% que se promociona.

## Lo que mas ahorra, en orden

1. **Este `CLAUDE.md` bien escrito.** Evita re-explicar el proyecto en cada
   sesion. Ningun truco de compresion se le acerca.
2. **Modelos baratos en subagentes** para tareas mecanicas.
3. **Hooks** para lo deterministico, en vez de pedirselo al agente.
4. **Skills** para procedimientos repetidos.
5. Recien despues, tecnicas de compresion de salida.
