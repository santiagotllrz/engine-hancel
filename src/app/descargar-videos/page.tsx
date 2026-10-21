import { DashboardShell } from "@/components/dashboard-shell"
import { DescargadorVideos } from "@/components/videos/descargador-videos"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = {
  title: "Descargar videos · Engine Hancel",
}

/**
 * Herramienta del panel para descargar videos de paginas web o streams HLS
 * (.m3u8 de Mux, Cloudflare, Vimeo, etc.) y empaquetarlos directamente en MP4.
 */
export default async function DescargarVideosPage() {
  return (
    <DashboardShell title="Descargar videos">
      <DescargadorVideos />
    </DashboardShell>
  )
}
