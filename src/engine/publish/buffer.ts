/**
 * Publicacion en Instagram via Buffer.
 *
 * Se pasa por Buffer y no por la Graph API de Meta porque esta exige una cuenta
 * business vinculada a una pagina de Facebook, revision de la app y un token de
 * larga duracion que hay que renovar. Buffer ya tiene esa relacion resuelta y
 * expone una sola llamada.
 *
 * Contrato verificado contra la API en vivo, no de memoria: la REST v1 esta
 * retirada para estos tokens ("Public API tokens are not accepted for REST API
 * access") y lo que funciona es el GraphQL de api.buffer.com.
 */

const BUFFER_API = "https://api.buffer.com"

export type BufferChannel = {
  id: string
  name: string
  service: string
  isQueuePaused: boolean
}

export function bufferConfigurado(): boolean {
  return Boolean(process.env.BUFFER_API_KEY)
}

async function consultar<T>(query: string, variables?: unknown): Promise<T> {
  const key = process.env.BUFFER_API_KEY
  if (!key) throw new Error("Falta BUFFER_API_KEY en el entorno.")

  const response = await fetch(BUFFER_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })

  const cuerpo = (await response.json()) as { data?: T; errors?: { message: string }[] }

  // GraphQL responde 200 aunque falle, asi que el estado HTTP no basta.
  if (cuerpo.errors?.length) {
    throw new Error(cuerpo.errors.map((e) => e.message).join(" | ").slice(0, 400))
  }
  if (!cuerpo.data) throw new Error("Buffer no devolvio datos.")

  return cuerpo.data
}

/** La organizacion del token. Buffer cuelga los canales de ella. */
async function organizationId(): Promise<string | null> {
  const data = await consultar<{
    account?: { organizations?: { id: string; name: string }[] }
  }>(`query { account { organizations { id name } } }`)

  return data.account?.organizations?.[0]?.id ?? null
}

/** Los canales conectados, para poder elegir en cual se publica. */
export async function listarCanales(): Promise<BufferChannel[]> {
  const org = await organizationId()
  if (!org) return []

  const data = await consultar<{ channels?: BufferChannel[] }>(
    `query Canales($input: ChannelsInput!) {
       channels(input: $input) { id name service isQueuePaused }
     }`,
    { input: { organizationId: org } }
  )

  return data.channels ?? []
}

export type BufferResult =
  | { ok: true; postId: string; status: string }
  | { ok: false; error: string }

/**
 * Manda el carrusel a Buffer.
 *
 * El carrusel no se declara: se infiere de mandar varias imagenes. Instagram
 * rechaza `type: "carousel"` explicitamente ("Valid types are post, story, or
 * reel"), asi que va como `post` con varios assets.
 *
 * `shareNow` publica en el momento; `addToQueue` lo deja en la cola de Buffer
 * para su siguiente hueco.
 *
 * No lanza: el fallo viaja en el resultado, igual que en LinkedIn.
 */
export async function publicarEnBuffer(opciones: {
  channelId: string
  texto: string
  imagenes: string[]
  ahora?: boolean
}): Promise<BufferResult> {
  const { channelId, texto, imagenes, ahora = true } = opciones

  if (imagenes.length === 0) {
    return { ok: false, error: "El carrusel no tiene imagenes que publicar." }
  }

  try {
    const data = await consultar<{
      createPost?: { __typename: string; post?: { id: string; status: string }; message?: string }
    }>(
      `mutation Publicar($input: CreatePostInput!) {
         createPost(input: $input) {
           __typename
           ... on PostActionSuccess { post { id status } }
           ... on MutationError { message }
         }
       }`,
      {
        input: {
          channelId,
          text: texto,
          assets: imagenes.map((url) => ({ image: { url } })),
          mode: ahora ? "shareNow" : "addToQueue",
          schedulingType: "automatic",
          needsApproval: false,
          metadata: { instagram: { type: "post", shouldShareToFeed: true } },
        },
      }
    )

    const resultado = data.createPost
    if (!resultado) return { ok: false, error: "Buffer no devolvio resultado." }

    if (resultado.__typename === "PostActionSuccess" && resultado.post) {
      return { ok: true, postId: resultado.post.id, status: resultado.post.status }
    }

    // Los errores vienen dentro de la respuesta, con su propio __typename.
    return {
      ok: false,
      error: resultado.message ?? `Buffer devolvio ${resultado.__typename}.`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
