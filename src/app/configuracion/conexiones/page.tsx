import { BufferChannel } from "@/components/contenido/buffer-channel"
import { ClaudeConnection } from "@/components/contenido/claude-connection"
import { LinkedinConnection } from "@/components/contenido/linkedin-connection"
import { SerperConnection } from "@/components/configuracion/serper-connection"
import { DashboardShell } from "@/components/dashboard-shell"
import { estadoSerper, estadoTokenClaude } from "@/app/cuenta/actions"
import { getLinkedinStatus } from "@/engine/publish/linkedin"
import { cuentaActual } from "@/lib/accounts"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = { title: "Conexiones · Engine Hancel" }

/**
 * Con que habla el motor.
 *
 * Tres familias, en el orden en que importan: el modelo que escribe, los
 * canales donde se publica y las integraciones que alimentan el pipeline.
 */
export default async function ConexionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const cuenta = await cuentaActual()
  const [linkedin, tokenClaude, serper] = await Promise.all([
    getLinkedinStatus(cuenta.id),
    estadoTokenClaude(),
    estadoSerper(),
  ])

  return (
    <DashboardShell title="Conexiones">
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Modelo de IA</h2>
          <ClaudeConnection estado={tokenClaude} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Canales</h2>
          <LinkedinConnection
            status={linkedin}
            resultado={first("linkedin")}
            motivo={first("motivo") ?? first("cuenta")}
          />
          <BufferChannel
            red="instagram"
            canal={cuenta.buffer_instagram_channel_id}
            nombreCuenta={cuenta.name}
          />
          <BufferChannel
            red="facebook"
            canal={cuenta.buffer_facebook_channel_id}
            nombreCuenta={cuenta.name}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Integraciones</h2>
          <SerperConnection estado={serper} />
        </section>
      </div>
    </DashboardShell>
  )
}
