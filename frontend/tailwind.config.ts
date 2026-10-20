import type { Config } from "tailwindcss"

// Un token como color de Tailwind. Sin opacidad es la variable tal cual; con
// opacidad (`bg-primary/10`), la mezcla con transparente. Tailwind 3 no puede
// aplicar opacidad a `var(--x)`: hasta la 1.9.0 esas clases no se generaban y
// no hacian nada. `color-mix` solo aparece en las clases con opacidad.
function token(nombre: string) {
  return ({ opacityValue }: { opacityValue?: string | number }) => {
    const alfa = opacityValue === undefined ? "" : String(opacityValue)
    return alfa === "" || alfa.startsWith("var(")
      ? `var(--${nombre})`
      : `color-mix(in srgb, var(--${nombre}) calc(${alfa} * 100%), transparent)`
  }
}

// Los componentes usan nombres de token (bg-primary, text-muted-foreground...),
// nunca colores literales. Cada token es una variable CSS que resuelve el tema
// activo (ver src/styles/tema-mango.css). El modo oscuro se activa por clase.
export default {
  darkMode: "class",
  // `hover:` solo en dispositivos con puntero que pasa por encima (mouse). En
  // una pantalla tactil el hover queda "pegado" en lo ultimo que se toco: en la
  // calculadora, la tecla anterior quedaba marcada y parecia trabada.
  future: { hoverOnlyWhenSupported: true },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
        },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        // Tokens propios del dominio financiero (DESIGN.md 3).
        expense: token("expense"),
        income: token("income"),
        transfer: token("transfer"),
        pending: token("pending"),
        rejected: token("rejected"),
        // Texto de enlaces y acciones de texto. Es un ALIAS de accent-foreground,
        // no un color nuevo: ese token ya es oscuro sobre claro y claro sobre
        // oscuro en los tres temas (9:1 a 13:1). `text-primary` como texto NO:
        // el amarillo de marca sobre blanco da 1,7:1 (DESIGN.md 3).
        enlace: token("accent-foreground"),
      },
      // Elevacion de una tarjeta (1.9.0): sombra en claro, luminosidad en oscuro.
      boxShadow: {
        tarjeta: "var(--sombra-tarjeta)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Borde inferior seguro del telefono (barra de gestos, indicador de
      // inicio del iPhone; necesita `viewport-fit=cover`, ya en index.html).
      // `barra`: lo que la barra inferior movil tapa del contenido (64 px de
      // barra + 16 de aire + el borde seguro). Con nombre y no como valor
      // arbitrario en cada componente (DESIGN.md 3).
      padding: {
        seguro: "env(safe-area-inset-bottom)",
        barra: "calc(5rem + env(safe-area-inset-bottom))",
      },
      // La escala tipografica de DESIGN.md 3. Los tamaños de Tailwind se llevan a
      // esos valores (antes 12/14/30) para que todo el codigo la siga sin
      // reescribir cada clase; los nombres por rol son los del codigo nuevo.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }], // 13: etiqueta secundaria
        sm: ["0.9375rem", { lineHeight: "1.375rem" }], // 15: cuerpo
        base: ["1rem", { lineHeight: "1.5rem" }], // 16: monto en lista
        lg: ["1.125rem", { lineHeight: "1.625rem" }], // 18: titulo de seccion
        "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24: titulo de pantalla
        "3xl": ["2rem", { lineHeight: "2.5rem" }], // 32: monto destacado
        secundaria: ["0.8125rem", { lineHeight: "1.125rem" }],
        cuerpo: ["0.9375rem", { lineHeight: "1.375rem" }],
        "monto-lista": ["1rem", { lineHeight: "1.5rem" }],
        seccion: ["1.125rem", { lineHeight: "1.625rem" }],
        titulo: ["1.5rem", { lineHeight: "2rem" }],
        destacado: ["2rem", { lineHeight: "2.5rem" }],
        // Excepciones deliberadas (DESIGN.md 3): las etiquetas de la barra
        // inferior (con 13 px "Estadísticas" no entra en una columna de 360 px)
        // y los montos por dia de las celdas del calendario.
        barra: ["0.75rem", { lineHeight: "1rem" }], // 12
        celda: ["0.625rem", { lineHeight: "0.875rem" }], // 10
      },
      fontFamily: {
        // Los nombres con "Variable" son los que declaran los paquetes de
        // @fontsource-variable (ver main.tsx). El resto es red de contencion si
        // la fuente no cargo.
        sans: ["Plus Jakarta Sans Variable", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        // Mono solo para lo tecnico (calculadora, dias del calendario, horas):
        // NO para montos, porque monoespacia el punto y la coma de miles y el
        // monto queda aireado (DESIGN.md 3).
        mono: ["Geist Mono Variable", "ui-monospace", "monospace"],
      },
      // Motion (DESIGN.md 8): solo para comunicar un cambio de estado. Un unico
      // ease-out compartido y las duraciones del presupuesto de §8. Se aplican
      // con la variante motion-safe para respetar prefers-reduced-motion.
      transitionTimingFunction: {
        salida: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      keyframes: {
        subir: {
          from: { opacity: "0", transform: "translateY(8%)" },
          to: { opacity: "1", transform: "none" },
        },
        aparecer: {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        fundir: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        punto: {
          from: { opacity: "0", transform: "scale(0.3)" },
          to: { opacity: "1", transform: "none" },
        },
        // Una pantalla que se abre desde otra (1.9.0): sube poco, sin escala.
        entrar: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        // El movimiento recien cargado, en la lista: el fondo acento se apaga.
        resaltar: {
          from: { backgroundColor: "var(--accent)" },
          to: { backgroundColor: "transparent" },
        },
        // Espera indeterminada: el unico bucle de la app. No comunica un
        // cambio de estado sino "seguimos trabajando", asi que va lento y
        // suave para no llamar la atencion (ver DESIGN.md 8).
        latido: {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.85)" },
          "50%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        subir: "subir 220ms cubic-bezier(0.23, 1, 0.32, 1)",
        aparecer: "aparecer 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        fundir: "fundir 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        punto: "punto 150ms cubic-bezier(0.23, 1, 0.32, 1)",
        entrar: "entrar 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        resaltar: "resaltar 800ms ease-in",
        latido: "latido 1200ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
