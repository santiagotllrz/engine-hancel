import { AlertTriangleIcon } from "lucide-react"

import { DashboardShell } from "@/components/dashboard-shell"
import { Tablero } from "@/components/kanban/tablero"
import { Card, CardContent } from "@/components/ui/card"
import { getEstadoIA } from "@/lib/content-data"
import { getTablero } from "@/lib/kanban-data"

// Cambia con cada pasada del pipeline: nada que prerenderizar.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Contenido · Engine Hancel",
}

/**
 * El pipeline como tablero.
 *
 * Sustituye a las listas sueltas de candidatas, angulos y piezas, que no dejaban
 * ver que un post venia de un angulo y ese angulo de una noticia. Aqui cada
 * tarjeta es un hecho y se mueve de columna segun avanza.
 */
export default async function ContenidoPage() {
  const [datos, ia] = await Promise.all([getTablero(), getEstadoIA()])

  return (
    <DashboardShell title="Contenido">
      <div className="flex flex-col gap-4">
        {!ia.tokenConfigurado ? (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
            <CardContent className="flex gap-3 py-4">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Falta conectar Claude
                </p>
                <p className="mt-1 text-amber-800 dark:text-amber-300/90">
                  Sin token no se analiza ni se genera nada: lo que envies se queda esperando.
                  Pegalo en la tarjeta <strong>Conexion con Claude</strong> de la configuracion.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Tablero datos={datos} />
      </div>
    </DashboardShell>
  )
}
