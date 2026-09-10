import { Card, CardContent } from "@/components/ui/card"
import type { RoutinesStatus } from "@/lib/content-data"
import { AlertTriangleIcon } from "lucide-react"

/**
 * Avisa de las rutinas que faltan.
 *
 * Sin este aviso el sistema falla en silencio: los trabajos se encolan bien, la
 * interfaz no protesta, y se quedan en 'pending' para siempre porque no hay
 * nadie al otro lado que los recoja.
 *
 * El pipeline arranca por el angulo, asi que sin esa rutina no se genera nada,
 * por mucho que la de LinkedIn este montada.
 */
export function RoutinesWarning({ status }: { status: RoutinesStatus }) {
  if (status.angle && status.linkedin) return null

  const faltan = [
    !status.angle ? { nombre: "angulo", vars: "ANGLE_ROUTINE_URL / ANGLE_ROUTINE_TOKEN" } : null,
    !status.linkedin
      ? { nombre: "LinkedIn", vars: "LINKEDIN_ROUTINE_URL / LINKEDIN_ROUTINE_TOKEN" }
      : null,
  ].filter((item) => item !== null)

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
      <CardContent className="flex gap-3 py-4">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {faltan.length === 2
              ? "No hay ninguna rutina configurada"
              : `Falta la rutina de ${faltan[0].nombre}`}
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300/90">
            {!status.angle ? (
              <>
                El pipeline arranca por el angulo, asi que lo que envies se quedara encolado sin
                procesar aunque la rutina de LinkedIn este lista.{" "}
              </>
            ) : (
              <>Los angulos se crearan, pero no se podra generar el post. </>
            )}
            Define en el entorno:{" "}
            {faltan.map((item, index) => (
              <span key={item.vars}>
                {index > 0 ? " y " : ""}
                <code className="text-xs">{item.vars}</code>
              </span>
            ))}
            .
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
