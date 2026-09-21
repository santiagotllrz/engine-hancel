import { Card, CardContent } from "@/components/ui/card"
import type { EstadoIA } from "@/lib/content-data"
import { AlertTriangleIcon } from "lucide-react"

/**
 * Avisa si falta el token de Claude.
 *
 * Sin token, el motor no puede analizar ni escribir nada: los trabajos se
 * encolan bien pero se quedan en 'pending' porque no hay con que procesarlos.
 * El aviso evita que el sistema falle en silencio.
 */
export function RoutinesWarning({ status }: { status: EstadoIA }) {
  if (status.tokenConfigurado) return null

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
      <CardContent className="flex gap-3 py-4">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Falta conectar Claude
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300/90">
            Sin token de Claude no se analiza ni se genera contenido: lo que envies se queda
            encolado. Pegalo en la tarjeta <strong>Conexion con Claude</strong> de la pantalla de
            configuracion.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
