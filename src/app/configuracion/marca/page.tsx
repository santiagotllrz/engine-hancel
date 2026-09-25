import { CarouselStyleEditor } from "@/components/contenido/carousel-style-editor"
import { Comunicacion } from "@/components/configuracion/comunicacion"
import { LogoMarca } from "@/components/configuracion/logo-marca"
import { DashboardShell } from "@/components/dashboard-shell"
import { pexelsConfigurado } from "@/engine/render/pexels"
import { estiloDesdeConfig } from "@/engine/render/theme"
import { configuracionDeGeneracion } from "@/lib/content-data"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = { title: "Marca · Engine Hancel" }

/**
 * Como suena y como se ve la cuenta.
 *
 * Las dos mitades van juntas porque se revisan juntas: el tono del texto y el
 * aspecto de la imagen son la misma decision de marca vista por dos lados.
 */
export default async function MarcaPage() {
  const config = await configuracionDeGeneracion()
  const estilo = estiloDesdeConfig(config.carousel)

  return (
    <DashboardShell title="Marca">
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Comunicacion</h2>
          <Comunicacion config={config} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Visual</h2>
          <LogoMarca logo={estilo.logo} />
          <CarouselStyleEditor
            estilo={estilo}
            paletaActual={((config.carousel ?? {}) as { paleta?: string }).paleta ?? "negro"}
            pexelsConfigurado={pexelsConfigurado()}
          />
        </section>
      </div>
    </DashboardShell>
  )
}
