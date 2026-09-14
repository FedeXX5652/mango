import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

// Reglas del frontend. Lo que de verdad interesa es `react-hooks`: los dos
// `eslint-disable-next-line react-hooks/exhaustive-deps` que hay en el codigo
// estaban puestos para un linter que no estaba instalado, o sea que nadie los
// verificaba. El resto es la base de TypeScript.
export default tseslint.config(
  { ignores: ["dist", "dev-dist", "node_modules", "*.tsbuildinfo"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      // Vite recarga en caliente solo si el archivo exporta componentes. Es un
      // aviso, no un error: hay modulos que exportan un hook al lado del
      // proveedor a proposito.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // TypeScript ya se queja de una variable que no existe, y sabe de los
      // globales del navegador. Dejarlo prendido daria falsos positivos con
      // `window`, `localStorage` y compania.
      "no-undef": "off",
      // Cinco lugares la incumplen y los cinco son el mismo patron legitimo:
      // sembrar estado de formulario cuando llega el dato (DetalleMovimiento,
      // Alta con una plantilla), o leer algo externo al montar (los colores del
      // tema, el umbral del esqueleto). Reescribirlos es un refactor de cinco
      // componentes que hoy andan, y no se hace como efecto secundario de
      // instalar un linter. Queda como aviso para no perderlo de vista.
      "react-hooks/set-state-in-effect": "warn",
      // El `_` para lo que se ignora a proposito (p. ej. en un destructuring).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
)
