import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { asegurarEstilos } from "@/engine/studio/plantillas"
import { idDeCuentaActual } from "@/lib/accounts"
import { esTipo, normalizarEstilo, TIPOS, type EstiloPlantilla, type TipoEstilo } from "@/lib/plantillas-catalogo"

/** Los estilos graficos de la cuenta abierta, para la capa Plantilla y las recetas. */

export type PlantillaVista = {
  id: string
  name: string
  tipo: TipoEstilo
  descripcion: string
  estilo: EstiloPlantilla
  /** Las laminas de la ultima muestra generada en Canva. */
  muestras: string[]
  canvaEditUrl: string | null
  status: "borrador" | "creando" | "lista" | "error"
  error: string | null
}

export async function getPlantillas(): Promise<PlantillaVista[]> {
  const accountId = await idDeCuentaActual()
  // Cada cuenta parte de los cuatro estilos base: si le falta alguno, se crea.
  await asegurarEstilos(accountId)

  const { data, error } = await supabaseAdmin()
    .from("content_templates")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at")
  if (error) throw new Error(`No se pudieron leer los estilos: ${error.message}`)

  return ((data ?? []) as Record<string, unknown>[])
    .filter((t) => esTipo(t.tipo))
    .map((t) => {
      const tipo = t.tipo as TipoEstilo
      const estructura = (t.estructura ?? {}) as { muestras?: string[] }
      return {
        id: t.id as string,
        name: t.name as string,
        tipo,
        descripcion: ((t.descripcion as string | null) ?? "").trim() || TIPOS[tipo].descripcion,
        estilo: normalizarEstilo(t.estilo, tipo),
        muestras: Array.isArray(estructura.muestras) ? estructura.muestras : [],
        canvaEditUrl: (t.canva_edit_url as string | null) ?? null,
        status: t.status as PlantillaVista["status"],
        error: (t.error as string | null) ?? null,
      }
    })
}
