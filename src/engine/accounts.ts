import { supabaseAdmin } from "./supabase-admin"

/**
 * Las cuentas del motor.
 *
 * Una cuenta es un espacio de trabajo completo: su taxonomia, sus noticias, su
 * contenido, su LinkedIn y su Instagram. Lo unico que comparten todas son las
 * credenciales de las herramientas —Serper, Pexels, la app de LinkedIn, las
 * rutinas de Claude— porque son la misma maquinaria trabajando para clientes
 * distintos. De ahi que esas vivan en el entorno y todo lo demas en la base,
 * colgando de `account_id`.
 *
 * Este modulo es el lado del motor: corre sin usuario delante, tanto desde los
 * endpoints que dispara Postgres como desde `npm run ingest`. Por eso no importa
 * "server-only" —ese paquete lanza fuera de Next— y por eso usa la service role.
 * El lado con sesion vive en `src/lib/accounts.ts`.
 */

export type Cuenta = {
  id: string
  name: string
  slug: string
  /** Canal de Instagram en Buffer. `null` mientras nadie lo haya configurado. */
  buffer_channel_id: string | null
}

const CAMPOS = "id, name, slug, buffer_channel_id"

/** Todas las cuentas, en orden de creacion. Es sobre lo que itera el motor. */
export async function todasLasCuentas(): Promise<Cuenta[]> {
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .order("created_at")

  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`)
  return (data ?? []) as Cuenta[]
}

export async function cuentaPorId(accountId: string): Promise<Cuenta | null> {
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .eq("id", accountId)
    .maybeSingle()

  return (data as Cuenta) ?? null
}

export async function cuentaPorSlug(slug: string): Promise<Cuenta | null> {
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select(CAMPOS)
    .eq("slug", slug)
    .maybeSingle()

  return (data as Cuenta) ?? null
}
