import * as React from "react"

import { cn } from "@/lib/utils"

// Select nativo estilizado con los tokens. Accesible y sin dependencias extra;
// se puede migrar a shadcn Select (con busqueda) cuando una lista supere ~10
// opciones (DESIGN.md 6).
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Select.displayName = "Select"
