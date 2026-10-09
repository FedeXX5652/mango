import { FormularioRecordatorio } from "@/componentes/recordatorios/FormularioRecordatorio"
import { Hoja } from "@/componentes/ui/hoja"
import type { RecordatorioLocal, Semilla } from "@/lib/recordatorios"

// "Avisarme" en una tarjeta o una deuda (1.6.0, ver 0030): el recordatorio que
// la sigue, para crearlo (con la semilla) o, si ya esta, para editarlo.
export function HojaAvisarme({
  existente,
  semilla,
  onCerrar,
}: {
  existente?: RecordatorioLocal
  semilla: Semilla
  onCerrar: () => void
}) {
  return (
    <Hoja
      abierta
      onOpenChange={(v) => !v && onCerrar()}
      titulo={existente ? "Editar recordatorio" : "Avisarme"}
    >
      <FormularioRecordatorio
        inicial={existente}
        semilla={existente ? undefined : semilla}
        onCerrar={onCerrar}
      />
    </Hoja>
  )
}
