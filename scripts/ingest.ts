/**
 * Corre la Etapa 1 (ingesta) desde la linea de comandos.
 *
 *   npm run ingest -- --cuenta hancel              corrida real
 *   npm run ingest -- --cuenta hancel --dry-run    ensayo, sin tocar la base
 *
 * La cuenta es obligatoria desde que hay mas de una: adivinarla seria llenar el
 * corpus equivocado, y eso no se deshace con un ctrl+z.
 *
 * Sirve para probar el motor sin levantar Next y para dispararlo desde un cron
 * del sistema o un runner de CI, que es lo que reemplaza al scheduler de n8n.
 */
import { cuentaPorSlug, todasLasCuentas } from "../src/engine/accounts"
import { dryRunIngestion, runIngestion, type SearchOutcome } from "../src/engine/ingest"

// Next carga .env.local solo; en Node plano hay que pedirlo explicitamente.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // El archivo puede no existir: las variables pueden venir del entorno.
  }
}

function printSearches(searches: SearchOutcome[]) {
  console.log("Busquedas:")
  for (const search of searches) {
    const status = search.error ? `ERROR: ${search.error}` : String(search.found)
    console.log(`  ${search.niche.padEnd(8)} ${search.label.padEnd(28)} ${status}`)
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const indice = process.argv.indexOf("--cuenta")
  const slug = indice >= 0 ? process.argv[indice + 1] : undefined
  if (!slug) {
    const disponibles = (await todasLasCuentas()).map((c) => c.slug).join(", ")
    console.error(`Falta --cuenta <slug>. Disponibles: ${disponibles}`)
    process.exitCode = 1
    return
  }

  const cuenta = await cuentaPorSlug(slug)
  if (!cuenta) {
    console.error(`No existe la cuenta "${slug}".`)
    process.exitCode = 1
    return
  }
  console.log(`Cuenta: ${cuenta.name} (${cuenta.slug})`)

  if (dryRun) {
    const summary = await dryRunIngestion({ accountId: cuenta.id })
    console.log("")
    console.log("ENSAYO EN SECO — no se escribio nada en la base")
    console.log(`Duracion       ${(summary.durationMs / 1000).toFixed(1)}s`)
    console.log(`Candidatas     ${summary.candidates}`)
    console.log(`Se insertarian ${summary.wouldInsert}`)
    console.log(`Ya conocidas   ${summary.alreadyKnown}`)
    console.log("")
    printSearches(summary.searches)
    if (summary.failedSearches > 0) process.exitCode = 1
    return
  }

  const summary = await runIngestion({ accountId: cuenta.id })
  console.log("")
  console.log(`Corrida ${summary.runId}`)
  console.log(`Duracion            ${(summary.durationMs / 1000).toFixed(1)}s`)
  console.log(`Candidatas          ${summary.candidates}`)
  console.log(`Insertadas          ${summary.inserted}`)
  console.log(`Duplicados borrados ${summary.duplicatesRemoved}`)
  console.log("")
  printSearches(summary.searches)

  if (summary.failedSearches > 0) {
    console.log("")
    console.error(
      `${summary.failedSearches} de ${summary.searches.length} busquedas fallaron.`
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("")
  console.error("La ingesta fallo:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
