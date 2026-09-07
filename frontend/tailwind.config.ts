import type { Config } from "tailwindcss"

// Los componentes usan nombres de token (bg-primary, text-muted-foreground...),
// nunca colores literales. Cada token es una variable CSS que resuelve el tema
// activo (ver src/styles/tema-mango.css). El modo oscuro se activa por clase.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        // Tokens propios del dominio financiero (DESIGN.md 3).
        expense: "var(--expense)",
        income: "var(--income)",
        transfer: "var(--transfer)",
        pending: "var(--pending)",
        rejected: "var(--rejected)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
        latido: "latido 1200ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config
