// Paleta categorica unica: la usan el selector de color de etiquetas y los
// graficos de composicion (dona por categoria). Una sola fuente para que no
// deriven en dos listas parecidas pero distintas.
//
// Diez tonos repartidos por la rueda de color, ordenados como un arcoiris. La
// regla es que dos vecinos se distingan de un vistazo en un punto de 10 px:
// por eso no hay dos verdes ni dos naranjas, que era el problema anterior.
export const PALETA = [
  "#DC2626", // rojo
  "#EA580C", // naranja
  "#FDBE02", // ambar
  "#65A30D", // lima
  "#16A34A", // verde
  "#0891B2", // cian
  "#2563EB", // azul
  "#9333EA", // violeta
  "#DB2777", // rosa
  "#78716C", // piedra (neutro)
] as const

// Color de una etiqueta sin color asignado.
export const SIN_COLOR = "#9CA3AF"
