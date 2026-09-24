/**
 * Cuantos dias tiene una noticia, a partir de lo que devuelve Serper.
 *
 * Serper no da una fecha: da texto libre y en el idioma de la busqueda ("2 days
 * ago", "hace 3 dias", "13 sept 2026"). Por eso el filtro de antiguedad no se
 * puede hacer en la consulta y se hace aqui, al ingerir.
 *
 * El `tbs` de la busqueda ya acota (qdr:d es el ultimo dia, qdr:w la semana),
 * pero no permite "5 dias" exactos y ademas Google se lo salta a menudo: esto es
 * la red que si corta.
 */

/** Mas viejo que esto no entra al pipeline. */
export const DIAS_DE_FRESCURA = 5

const UNIDADES: { patron: RegExp; dias: number }[] = [
  { patron: /(minut|hour|hora|min\b|segund|second)/i, dias: 0 },
  { patron: /\b(dia|día|day)/i, dias: 1 },
  { patron: /\b(semana|week)/i, dias: 7 },
  { patron: /\b(mes|month)/i, dias: 30 },
  { patron: /\b(año|ano|year)/i, dias: 365 },
]

/**
 * Dias de antiguedad, o `null` si el texto no se entiende.
 *
 * Ante la duda devuelve `null` y quien llama deja pasar la noticia: descartar
 * por no saber leer una fecha seria peor que colar alguna vieja.
 */
export function diasDeAntiguedad(texto: string | null | undefined, ahora = new Date()): number | null {
  if (!texto) return null
  const t = texto.trim().toLowerCase()
  if (t.length === 0) return null

  // "hace 2 dias", "2 days ago", "hace un mes"
  const relativo = t.match(/(\d+|un|una|a|an)\s+(\p{L}+)/u)
  if (relativo) {
    const crudo = relativo[1]
    const cantidad = /^\d+$/.test(crudo) ? Number(crudo) : 1
    for (const { patron, dias } of UNIDADES) {
      if (patron.test(relativo[2])) return cantidad * dias
    }
  }

  // "hoy" / "ayer" y sus equivalentes.
  if (/\b(hoy|today|ahora|just now)\b/.test(t)) return 0
  if (/\b(ayer|yesterday)\b/.test(t)) return 1

  // Fecha absoluta: se deja al parser del entorno, que cubre los formatos ISO
  // y los anglosajones. Si no la entiende, devuelve null.
  const fecha = new Date(texto)
  if (!Number.isNaN(fecha.getTime())) {
    const dias = (ahora.getTime() - fecha.getTime()) / 86_400_000
    return dias >= 0 ? Math.floor(dias) : 0
  }

  return null
}

/** `true` si la noticia es demasiado vieja para el pipeline. */
export function esVieja(dateSerper: string | null | undefined, ahora = new Date()): boolean {
  const dias = diasDeAntiguedad(dateSerper, ahora)
  return dias !== null && dias > DIAS_DE_FRESCURA
}
