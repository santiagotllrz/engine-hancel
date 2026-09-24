import { QueuePanel } from "@/components/contenido/queue-panel"
import { DashboardShell } from "@/components/dashboard-shell"
import { getQueue } from "@/lib/content-data"

export const dynamic = "force-dynamic"

/**
 * Las server actions de esta pagina corren en su misma ruta, asi que heredan
 * este tope. Sin declararlo se quedan en el de por defecto de la plataforma
 * —unos segundos— y las acciones largas (redibujar un carrusel, analizar una
 * noticia, publicar) se cortan a media faena sin decir nada.
 */
export const maxDuration = 60


export const metadata = {
  title: "Cola · Engine Hancel",
}

export default async function ContenidoColaPage() {
  const queue = await getQueue()

  return (
    <DashboardShell title="Cola">

      <QueuePanel angle={queue.angle} linkedin={queue.linkedin} instagram={queue.instagram} />
    </DashboardShell>
  )
}
