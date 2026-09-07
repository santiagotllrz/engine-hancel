# Engine Hancel

Motor de investigacion de contenido sobre tecnologia, IA, startups y venture
capital. Investiga multiples fuentes, guarda los hechos en Supabase y produce
insumos para contenido original y oportuno.

Proyecto Next.js 16 (App Router, Node) en la raiz del repositorio: el motor y su
interfaz viven juntos. Base de datos: proyecto Supabase `iddjepduokjysnibjjqy`.

## Estado de la migracion

| Etapa                          | Donde corre                                  |
| ------------------------------ | -------------------------------------------- |
| 1 — Ingesta de noticias        | **Aqui, en codigo**                          |
| 2 — Analisis y enriquecimiento | **Se dispara desde aqui** (rutina de Claude) |
| 3 — Generacion de contenido    | Sin automatizar                              |

Antes de activar la ingesta hay que **apagar el workflow de n8n**, o las dos
correran en paralelo y duplicaran el consumo de Serper.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev                  # http://localhost:3000
```

## Variables de entorno

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # lectura de noticias
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # motor y configuracion
SERPER_API_KEY=xxx                            # busqueda de noticias
INGEST_SECRET=<openssl rand -hex 32>          # protege /api/ingest
ANALYSIS_ROUTINE_URL=https://api.anthropic.com/v1/claude_code/routines/<id>/fire
ANALYSIS_ROUTINE_TOKEN=sk-ant-oat01-xxx       # sin el prefijo "Bearer"
```

**Ninguna lleva prefijo `NEXT_PUBLIC_`, a proposito.** `raw_news` y
`pipeline_runs` tienen RLS deshabilitado, asi que esas claves equivalen a acceso
total. Todo se lee y escribe en el servidor; nada llega al navegador.

Las tablas de configuracion (`engine_categories`, `engine_segments`,
`engine_routines`, `engine_settings`, `pipeline_events`) **si** tienen RLS activo
y sin politicas:
solo entra `service_role`. `engine_routines` guarda los tokens de webhook, y la
clave publicable no debe poder leerlos.

## La interfaz

| Ruta                 | Que es                                                        |
| -------------------- | ------------------------------------------------------------- |
| `/engine`            | Consola en vivo: lanza corridas y las ve ocurrir              |
| `/engine/config`     | Taxonomia editable: categoria → segmento → keyword            |
| `/engine/schedule`   | Horario de ejecucion automatica                                |
| `/engine/routines`   | Rutinas de Claude (webhook + token)                            |
| `/engine/graph`      | Grafo categoria → segmento → noticia                          |
| `/noticias`          | Todas las noticias con todos sus campos y el articulo completo |
| `/pipeline`          | Historial de corridas                                          |
| `/api/ingest`        | Dispara la Etapa 1 desde un scheduler (requiere secreto)       |
| `/api/engine/stream` | Corrida con eventos en streaming (usa la consola en vivo)      |

### La consola en vivo no simula nada

El centro es una **red de coautoria**, al estilo de las redes de Medline: una
maraña densa sobre blanco, con la masa en carmin y los racimos de la periferia
en el color de su categoria. Cada punto es una noticia real del corpus y cada
concentrador un segmento; el tamaño del concentrador crece con lo que ha traido.

En reposo dibuja lo que ya hay en la base. Durante una corrida, **cada busqueda
que responde hace brotar en su sector tantos nodos como noticias trajo de
verdad**, con sus aristas dibujandose hacia el centro. Los concentradores en
vuelo laten; los que fallaron se marcan en rojo. Con el motor parado no entra un
solo nodo.

Los sectores de cada segmento se solapan a proposito: asi las categorias se
funden en una sola masa en vez de verse como porciones de tarta, que es lo que
da la textura de red. La estructura local sigue ahi para quien la busque.

La colocacion es determinista (ruido sembrado, no `Math.random`): la red se
dibuja igual en cada render, o cambiaria de forma sola al llegar cada resultado.

Lo unico que se mueve siempre es la deriva lenta del conjunto, que es ambiente
del lienzo. Todo lo demas responde a trabajo real.

El transporte es SSE: `/api/engine/stream` ejecuta la corrida dentro de la
peticion y va empujando cada evento segun ocurre. Los mismos eventos se guardan
en `pipeline_events` para poder revisar corridas pasadas.

Dos modos: **Ensayo** busca de verdad pero no escribe nada (util para probar sin
tocar produccion ni gastar cuota de escritura), y **Ejecutar** hace la corrida
completa.

## Etapa 1 — Ingesta

```bash
npm run ingest              # corrida real
npm run ingest -- --dry-run # busca y reporta, sin escribir nada
```

1. Abre una fila en `pipeline_runs` con `status: running`.
2. Lanza las busquedas activas **en paralelo y aisladas**: si una falla, las
   demas siguen y el error queda en el resumen.
3. Normaliza y descarta lo que no trae link o titulo.
4. Colapsa links repetidos e inserta con `ON CONFLICT DO NOTHING` sobre el
   UNIQUE de `link`.
5. Deduplica por titulo entre **todo lo del dia** y borra lo repetido.
6. **Dispara la rutina de analisis** si entro alguna noticia nueva.
7. Cierra la corrida con `raw_inserted`, `duplicates_removed` y `ended_at`.

La deduplicacion compara conjuntos de palabras (Jaccard > 0.6) dentro de cada
categoria. Portada literal desde n8n, rarezas incluidas; ver
[`src/engine/dedupe.ts`](src/engine/dedupe.ts).

### Taxonomia

Las busquedas **ya no estan en el codigo**: viven en `engine_categories` y
`engine_segments` y se editan en `/engine/config`.

- **Categoria** — el nicho. Su slug se escribe en `raw_news.niche`, por eso no
  se puede cambiar despues de crearla.
- **Segmento** — el tema dentro de la categoria. Se escribe en `raw_news.tema` y
  `query_used`.
- **Keyword** — la consulta literal que recibe Serper, junto con idioma, pais,
  numero de resultados y ventana temporal.

Categorias y segmentos se activan y desactivan por separado; el motor solo corre
segmentos activos dentro de categorias activas. Si no hay ninguno configurado,
cae al respaldo de [`src/engine/config.ts`](src/engine/config.ts), que son las 16
busquedas originales de n8n.

### Rutina de analisis

Al final de cada ingesta que haya traido noticias nuevas se dispara la rutina de
analisis de Claude Code, una sola vez por corrida. Se configura por entorno, no
en la base:

```bash
ANALYSIS_ROUTINE_URL=https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire
ANALYSIS_ROUTINE_TOKEN=sk-ant-oat01-xxx      # sin el prefijo "Bearer"
```

Vive en el entorno **a proposito**: es la pieza que no puede perderse si hay que
recrear la base. Ver [`src/engine/analysis-routine.ts`](src/engine/analysis-routine.ts).

Es un gatillo y nada mas: no se le mandan ids. La rutina ya sabe que noticias le
tocan y como analizarlas, definido en su propia interfaz; el `input` solo le
avisa de cuantas han llegado.

```http
POST <ANALYSIS_ROUTINE_URL>
Authorization: Bearer <ANALYSIS_ROUTINE_TOKEN>
anthropic-version: 2023-06-01
anthropic-beta: experimental-cc-routine-2026-04-01

{"input": "Han llegado 12 noticias nuevas en la corrida <uuid>. Analizalas ..."}
```

No se dispara si la corrida no inserto nada, ni en el ensayo en seco. Corta a los
30 segundos, igual que hacia el nodo HTTP de n8n, para que una rutina que no
contesta no bloquee el cierre de la corrida. Y si falla **no** tumba la ingesta:
las noticias ya estan guardadas y el error queda en el resumen de la corrida.

> `engine_routines` y la pantalla `/engine/routines` siguen existiendo, pero ya
> **no** intervienen en la ingesta.

### Diferencias intencionales respecto de n8n

- **`raw_inserted` se llena.** n8n lo dejaba en 0 siempre.
- **Las corridas fallidas se marcan** como `failed` con el motivo, en vez de
  quedarse colgadas en `running`.
- **Los errores de busqueda son visibles** en el resumen y en la consola.
- Se elimino la espera de 2 segundos previa al dedupe: era un parche por el
  modelo asincrono de n8n.

### Programacion

Los horarios se editan en `/engine/schedule`, no en el codigo. Se configuran las
horas locales (0-23), la zona horaria y un interruptor general. Arranca con 11:00
y 18:00 en `America/Bogota`, que es lo que tenia n8n.

**El cron vive en Postgres, no en Vercel.** `pg_cron` dispara `public.fire_ingest()`
a las horas exactas configuradas y `pg_net` hace el POST a `/api/ingest`. Un
trigger sobre `engine_settings` reescribe el job cada vez que se guarda el
horario, asi que la pantalla sigue siendo la unica fuente de verdad y la app no
necesita saber que pg_cron existe. Ver [`supabase/scheduler.sql`](supabase/scheduler.sql).

Se monta una vez, con la URL del despliegue:

```sql
select public.configure_ingest('https://<host>/api/ingest', '<INGEST_SECRET>');
```

El endpoint y el secreto quedan cifrados en Vault; el job los lee al disparar.
Para ver el estado: `select jobname, schedule from cron.job;` y el historial en
`cron.job_run_details`.

> Antes esto lo hacia un cron de `vercel.json` que llamaba **cada hora** para que
> el endpoint decidiera si le tocaba, descartando 23 de cada 24 llamadas. Ademas
> el plan Hobby de Vercel solo admite crons diarios, con lo que el horario de la
> UI no se habria respetado nunca.

`pg_cron` trabaja en UTC y la traduccion se hace al guardar, no en cada disparo:
en una zona con horario de verano habria que resincronizar en cada cambio.
Colombia no lo tiene.

Disparo manual:

```bash
# respeta el horario configurado
curl -X POST https://<host>/api/ingest -H "x-ingest-secret: $INGEST_SECRET"

# lo ignora y corre ya
curl -X POST "https://<host>/api/ingest?force=1" -H "x-ingest-secret: $INGEST_SECRET"
```

`/api/ingest` **falla cerrado**: sin `INGEST_SECRET` responde 401 siempre.

## ⚠ El dashboard no tiene autenticacion

Cualquiera que alcance la URL puede ver las noticias, editar la taxonomia,
leer que rutinas existen y **lanzar corridas** (que gastan cuota de Serper y
escriben en la base). `/api/engine/stream` solo comprueba que la peticion venga
del mismo origen, lo cual frena llamadas cruzadas pero no es autenticacion.

Mientras no haya login, no publiques esto en una URL abierta.

## Estructura

```
scripts/
  ingest.ts              CLI de la Etapa 1
src/
  app/
    api/engine/stream/   SSE: corrida con eventos en vivo
    api/ingest/          Endpoint para schedulers
    engine/              Consola, taxonomia, rutinas, grafo
    engine/actions.ts    Server Actions de configuracion
    noticias/ pipeline/  Lectura de resultados
  engine/                EL MOTOR (no depende de Next: corre tambien en Node)
    config.ts            Constantes y respaldo de busquedas
    taxonomy.ts          Carga la taxonomia desde la base
    schedule.ts          Horario: decide si al cron le toca correr
    serper.ts            Cliente de Serper News
    normalize.ts         Serper -> filas de raw_news
    dedupe.ts            Similitud de titulos (portado de n8n)
    events.ts            Traza de la corrida (vivo + pipeline_events)
    routines.ts          Invocacion de webhooks de Claude
    ingest.ts            Orquesta la corrida completa
    supabase-admin.ts    Cliente service-role
  components/engine/     Consola en vivo, nucleo, grafo, editores
  lib/
    engine-data.ts       Lecturas de configuracion y datos del grafo
    news.ts              Consultas de noticias
```

`src/engine/` no importa nada de Next a proposito: el mismo codigo corre desde
la CLI, desde el endpoint y desde cualquier runner.

## Datos

| Tabla                | Contenido                                       |
| -------------------- | ----------------------------------------------- |
| `raw_news`           | Noticias, con `full_content` cuando se descargo  |
| `pipeline_runs`      | Corridas del motor                               |
| `pipeline_events`    | Traza fina de cada corrida                       |
| `engine_categories`  | Categorias (nichos)                              |
| `engine_segments`    | Segmentos y sus keywords                         |
| `engine_routines`    | Rutinas de Claude (webhook + token)              |
| `engine_settings`    | Horario de ejecucion automatica                  |

## Nota sobre `src/hooks/use-mobile.ts`

La version que genera shadcn hace `setState` dentro de un efecto, lo que falla el
lint de `react-hooks`. Esta reescrito con `useSyncExternalStore`. Si se
reinstalan componentes de shadcn, conviene no dejar que lo sobrescriba.
