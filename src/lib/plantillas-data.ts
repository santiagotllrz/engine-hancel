import "server-only"

import { supabaseAdmin } from "@/engine/supabase-admin"
import { idDeCuentaActual } from "@/lib/accounts"
import { normalizarEstilo, type EstiloPlantilla, type EstructuraPlantilla } from "@/lib/plantillas-catalogo"

/** Las plantillas de la cuenta abierta, para la capa Plantilla y las recetas. */

export type PlantillaVista = {
  id: string
  name: string
  format: string
  estilo: EstiloPlantilla
  estructura: EstructuraPlantilla | null
  canvaDesignId: string | null
  canvaEditUrl: string | null
  thumbnailUrl: string | null
  status: "borrador" | "creando" | "lista" | "error"
  error: string | null
  updatedAt: string
}

export async function getPlantillas(): Promise<PlantillaVista[]> {
  const { data, error } = await supabaseAdmin()
    .from("content_templates")
    .select("*")
    .eq("account_id", await idDeCuentaActual())
    .order("created_at")
  if (error) throw new Error(`No se pudieron leer las plantillas: ${error.message}`)

  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    format: t.format as string,
    estilo: normalizarEstilo(t.estilo),
    estructura: (t.estructura as EstructuraPlantilla | null) ?? null,
    canvaDesignId: (t.canva_design_id as string | null) ?? null,
    canvaEditUrl: (t.canva_edit_url as string | null) ?? null,
    thumbnailUrl: (t.thumbnail_url as string | null) ?? null,
    status: t.status as PlantillaVista["status"],
    error: (t.error as string | null) ?? null,
    updatedAt: t.updated_at as string,
  }))
}
