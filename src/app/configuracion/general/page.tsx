import { SeleccionDeNoticias } from "@/components/configuracion/seleccion-noticias"
import { DashboardShell } from "@/components/dashboard-shell"
import { configuracionDeGeneracion, getScoreDistribution } from "@/lib/content-data"

export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina corren en su misma ruta, asi que heredan
 * este tope. Sin declararlo se quedan en el de por defecto de la plataforma.
 */
export const maxDuration = 60

export const metadata = { title: "General · Engine Hancel" }

/**
 * Lo que vale para toda la cuenta y no pertenece a ningun agente.
 *
 * Hoy es solo el umbral. Se queda como seccion propia porque no encaja ni en
 * Conexiones ni en Marca, y meterlo en un agente concreto mentiria: el liston
 * es de la cuenta, aunque quien lo mira sea el agente de angulo.
 */
export default async function ConfiguracionGeneralPage() {
  const [config, distribution] = await Promise.all([
    configuracionDeGeneracion(),
    getScoreDistribution(),
  ])

  return (
    <DashboardShell title="General">
      <div className="flex max-w-3xl flex-col gap-4">
        <SeleccionDeNoticias config={config} distribution={distribution} />
      </div>
    </DashboardShell>
  )
}
