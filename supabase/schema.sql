-- ---------------------------------------------------------------------------
-- Esquema completo de engine-hancel.
--
-- Reconstruye la base entera desde cero. Es idempotente: se puede volver a
-- ejecutar sobre una base existente sin borrar datos ni duplicar objetos.
--
-- Uso: Supabase Dashboard -> SQL Editor -> pegar todo -> Run.
-- Despues, scheduler.sql monta el cron del motor dentro de Postgres.
--
-- Orden: tablas -> indices -> RLS -> semillas. Las dependencias por clave
-- foranea obligan a crear engine_categories antes que engine_segments y
-- pipeline_runs antes que pipeline_events.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ noticias

-- El corpus. Una fila por articulo; `link` es la identidad real de una noticia
-- y por eso lleva UNIQUE: la ingesta hace upsert con onConflict:"link" e
-- ignoreDuplicates, que es un ON CONFLICT DO NOTHING sobre esta restriccion.
create table if not exists public.raw_news (
  id                   uuid primary key default gen_random_uuid(),

  -- Escrito por la ingesta desde la taxonomia: niche = engine_categories.slug,
  -- tema = engine_segments.label. Son texto plano, no claves foraneas: una
  -- noticia sobrevive al borrado del segmento que la trajo.
  niche                text        not null,
  tema                 text        not null,

  title                text        not null,
  link                 text        not null,
  snippet              text,
  -- Serper devuelve la fecha como texto libre ("2 hours ago"), no como fecha.
  date_serper          text,
  source               text,
  image_url            text,

  status               text        not null default 'pending_analysis',

  -- Los rellena la rutina de analisis, no la ingesta.
  relevance_score      numeric,
  keywords_matched     text[],
  analysis_notes       text,

  query_used           text,
  created_at           timestamptz not null default now(),
  analyzed_at          timestamptz,

  -- Cuerpo completo del articulo, traido despues de la ingesta.
  full_content         text,
  content_fetched_at   timestamptz,
  content_fetch_status text,

  constraint raw_news_link_key unique (link)
);

create index if not exists raw_news_created_at_idx on public.raw_news (created_at desc);
create index if not exists raw_news_niche_idx      on public.raw_news (niche);
create index if not exists raw_news_status_idx     on public.raw_news (status);
create index if not exists raw_news_niche_tema_idx on public.raw_news (niche, tema);

-- ------------------------------------------------------------------ corridas

-- Una fila por ejecucion del motor. Nace en 'running' y se cierra en
-- 'completed' o 'failed'; el ensayo en seco no abre corrida.
create table if not exists public.pipeline_runs (
  id                 uuid primary key default gen_random_uuid(),
  run_type           text        not null,
  status             text        not null default 'running',
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  raw_inserted       integer,
  duplicates_removed integer,
  error_message      text
);

create index if not exists pipeline_runs_started_at_idx on public.pipeline_runs (started_at desc);

-- Traza paso a paso de cada corrida, volcada al terminar. `run_id` admite NULL
-- porque el ensayo en seco emite eventos sin corrida asociada.
create table if not exists public.pipeline_events (
  id     bigint generated always as identity primary key,
  run_id uuid references public.pipeline_runs (id) on delete cascade,
  at     timestamptz not null default now(),
  kind   text        not null,
  label  text,
  detail jsonb
);

create index if not exists pipeline_events_at_idx     on public.pipeline_events (at desc);
create index if not exists pipeline_events_run_id_idx on public.pipeline_events (run_id);

-- ----------------------------------------------------------------- taxonomia

-- Categoria de contenido. `slug` es lo que acaba en raw_news.niche, de ahi el
-- formato restringido: la UI valida lo mismo antes de escribir.
create table if not exists public.engine_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null,
  description text,
  color       text        not null default '#8b8b8b',
  is_active   boolean     not null default true,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint engine_categories_slug_key   unique (slug),
  constraint engine_categories_slug_check check (slug ~ '^[A-Za-z0-9_-]+$')
);

-- Una busqueda concreta contra Serper. El borrado de la categoria arrastra sus
-- segmentos; las noticias ya ingeridas no se tocan.
create table if not exists public.engine_segments (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid        not null references public.engine_categories (id) on delete cascade,
  label       text        not null,
  query       text        not null,
  hl          text        not null default 'en',
  gl          text        not null default 'us',
  num         integer     not null default 15,
  freshness   text        not null default 'qdr:d',
  is_active   boolean     not null default true,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- La UI traduce el 23505 de aqui a "ya existe un segmento con ese nombre".
  constraint engine_segments_category_label_key unique (category_id, label)
);

create index if not exists engine_segments_category_id_idx on public.engine_segments (category_id);

-- ------------------------------------------------------------------- rutinas

-- Webhooks de Claude que el motor invoca. `webhook_url` NULL = borrador a la
-- espera de sus claves, y por eso is_active nace en false.
create table if not exists public.engine_routines (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  kind           text        not null default 'analysis',
  webhook_url    text,
  token          text,
  is_active      boolean     not null default false,
  last_called_at timestamptz,
  last_status    text,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint engine_routines_kind_check check (kind in ('analysis', 'writing', 'other'))
);

create index if not exists engine_routines_kind_idx on public.engine_routines (kind, is_active);

-- ------------------------------------------------------------------- horario

-- Tabla de una sola fila: el `check (id)` sobre una PK booleana impide que
-- exista mas de un registro de configuracion. El codigo la lee y escribe
-- siempre con .eq("id", true), asi que la fila tiene que existir (ver semilla).
create table if not exists public.engine_settings (
  id         boolean primary key default true,
  run_hours  integer[]   not null default '{11,18}',
  -- Minuto comun a todas las horas: 11 y 18 con run_minute 30 son 11:30 y 18:30.
  run_minute integer     not null default 0,
  timezone   text        not null default 'America/Bogota',
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now(),

  constraint engine_settings_singleton   check (id),
  constraint engine_settings_run_minute_check check (run_minute between 0 and 59)
);

-- ----------------------------------------------------------------------- RLS
--
-- Dos regimenes distintos, segun con que clave se lee cada tabla:
--
--   raw_news y pipeline_runs  el dashboard las lee con la clave publicable,
--                             que no salta RLS. Sin politicas y con RLS activo
--                             devolverian cero filas, asi que va desactivado.
--
--   el resto                  solo se tocan con la service role, que salta RLS
--                             por completo. Dejarlo activo y sin politicas las
--                             cierra a cualquier otra credencial sin costo.

alter table public.raw_news      disable row level security;
alter table public.pipeline_runs disable row level security;

alter table public.pipeline_events   enable row level security;
alter table public.engine_categories enable row level security;
alter table public.engine_segments   enable row level security;
alter table public.engine_routines   enable row level security;
alter table public.engine_settings   enable row level security;

-- ------------------------------------------------------------------ semillas

-- Obligatoria: updateSchedule hace UPDATE, no upsert, y sin esta fila el
-- horario no se puede guardar.
insert into public.engine_settings (id, run_hours, run_minute, timezone, enabled)
values (true, '{11,18}', 0, 'America/Bogota', true)
on conflict (id) do nothing;

-- Opcional pero recomendable: las 16 busquedas portadas de n8n, las mismas que
-- FALLBACK_SEARCHES en src/engine/config.ts. Sin esto el motor sigue corriendo
-- (cae al respaldo del codigo), pero /engine/config aparece vacio y no hay nada
-- que editar desde la interfaz.
insert into public.engine_categories (name, slug, description, color, position) values
  ('AI',      'AI',      'Modelos, releases y laboratorios',   '#6366f1', 0),
  ('Startup', 'Startup', 'Lanzamientos, fundadores y movidas',  '#f59e0b', 1),
  ('Tech',    'Tech',    'Open source, seguridad e infra',      '#10b981', 2),
  ('VC',      'VC',      'Rondas, fondos y salidas',            '#ec4899', 3)
on conflict (slug) do nothing;

insert into public.engine_segments (category_id, label, query, hl, gl, num, freshness, position)
select c.id, s.label, s.query, s.hl, s.gl, 15, 'qdr:d', s.position
from (values
  ('AI',      'AI releases',                'AI releases',                                       'en', 'us', 0),
  ('AI',      'new AI model LLM',           'new AI model released LLM',                         'en', 'us', 1),
  ('AI',      'OpenAI',                     'OpenAI',                                            'en', 'us', 2),
  ('AI',      'Anthropic Claude',           'Anthropic Claude',                                  'en', 'us', 3),
  ('Startup', 'startup launch latam',       'startup launch latam colombia',                     'es', 'co', 0),
  ('Startup', 'SaaS product hunt',          'new SaaS product hunt launch',                      'en', 'us', 1),
  ('Startup', 'startup acquisition merger', 'startup acquisition merger shutdown pivot',         'en', 'us', 2),
  ('Startup', 'founder story',              'founder story startup lessons',                     'en', 'us', 3),
  ('Tech',    'open source release',        'open source software release github',               'en', 'us', 0),
  ('Tech',    'cybersecurity',              'cybersecurity breach vulnerability hack',           'en', 'us', 1),
  ('Tech',    'developer tools',            'developer tools framework API launch',              'en', 'us', 2),
  ('Tech',    'cloud hardware',             'cloud infrastructure GPU chip hardware',            'en', 'us', 3),
  ('VC',      'VC funding latam',           'venture capital funding raised latam',              'en', 'us', 0),
  ('VC',      'Series A B seed',            'Series A Series B seed round tech',                 'en', 'us', 1),
  ('VC',      'Kaszek Softbank a16z',       'Kaszek Softbank a16z Sequoia portfolio investment', 'en', 'us', 2),
  ('VC',      'IPO acquisition',            'startup IPO acquisition merger deal',               'en', 'us', 3)
) as s (niche, label, query, hl, gl, position)
join public.engine_categories c on c.slug = s.niche
on conflict (category_id, label) do nothing;

-- ---------------------------------------------------------------- generacion
--
-- Etapa 2: de una noticia analizada a una pieza de LinkedIn.
--
-- Dos clases de tabla, separadas a proposito:
--   jobs_*      buzones. El mecanismo de ejecucion de las rutinas de Claude.
--   content_*   el resultado limpio que consume la interfaz.
-- Si algun dia se cambia de rutinas a la API directa, solo cambian los buzones.

-- Tabla de una sola fila, como engine_settings: el check sobre la PK booleana
-- impide un segundo registro.
--
-- `score_threshold` nace NULL a proposito: el scoring lo define el usuario desde
-- la interfaz, y hasta entonces el modo automatico no selecciona nada. Un valor
-- inventado aqui encolaria noticias con un criterio que nadie eligio.
create table if not exists public.generation_config (
  id              boolean primary key default true,
  -- Las ranuras de personalizacion que se inyectan en cada job. En jsonb y no
  -- en columnas porque el juego de ranuras va a crecer; los valores admitidos
  -- se validan en src/engine/content/variables.ts, que es el unico que escribe.
  variables       jsonb       not null default
    '{"tono":"profesional","audiencia":"","voz_marca":"","cta":"","evitar":"","longitud":"medio","idioma":"es"}'::jsonb,
  score_threshold integer,
  generation_mode text        not null default 'manual',
  updated_at      timestamptz not null default now(),

  constraint generation_config_singleton       check (id),
  constraint generation_config_threshold_check check (score_threshold is null or score_threshold between 0 and 10),
  constraint generation_config_mode_check      check (generation_mode in ('auto', 'manual'))
);

-- Buzon de la rutina de angulo.
--
-- La app escribe la fila en 'pending' y avisa por webhook; la rutina externa lee
-- la cola, escribe `respuesta` y marca 'done' o 'failed'. El webhook solo
-- despierta: los datos viajan en `input`, nunca en la peticion.
--
-- `consumed_at` lo escribe SOLO la app, al materializar la respuesta. Es columna
-- aparte y no un cuarto estado por dos motivos: deja el contrato de la rutina en
-- pending|done|failed exactamente como se especifico, y como el trigger de aviso
-- vigila `status`, la escritura de la app no se despierta a si misma en bucle.
create table if not exists public.jobs_angle (
  id           uuid primary key default gen_random_uuid(),
  raw_news_id  uuid        not null references public.raw_news (id) on delete cascade,
  input        jsonb       not null,
  status       text        not null default 'pending',
  respuesta    jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  consumed_at  timestamptz,

  constraint jobs_angle_status_check check (status in ('pending', 'processing', 'done', 'failed'))
);

create index if not exists jobs_angle_status_idx      on public.jobs_angle (status, created_at);
create index if not exists jobs_angle_raw_news_id_idx on public.jobs_angle (raw_news_id);
-- Indice parcial sobre la consulta caliente: lo hecho y sin consumir.
create index if not exists jobs_angle_por_drenar_idx  on public.jobs_angle (created_at)
  where consumed_at is null and status in ('done', 'failed');

-- Un angulo editorial propuesto por la rutina.
--
-- Cuantos angulos produce cada noticia lo decide la rutina, no este esquema: se
-- materializa una fila por cada uno que venga en la respuesta y `position`
-- conserva el orden en que los propuso.
create table if not exists public.content_angles (
  id              uuid primary key default gen_random_uuid(),
  raw_news_id     uuid        not null references public.raw_news (id) on delete cascade,
  -- De que buzon salio; para auditar una generacion rara.
  job_angle_id    uuid        references public.jobs_angle (id) on delete set null,
  angle           text        not null,
  thesis          text,
  playbook_format text,
  status          text        not null default 'angled',
  position        integer     not null default 0,
  created_at      timestamptz not null default now(),

  constraint content_angles_status_check
    check (status in ('angled', 'pending_generation', 'generated', 'discarded'))
);

create index if not exists content_angles_raw_news_id_idx on public.content_angles (raw_news_id);
create index if not exists content_angles_status_idx      on public.content_angles (status, created_at desc);

-- Buzon de la rutina de LinkedIn. Mismo contrato que jobs_angle.
create table if not exists public.jobs_linkedin (
  id               uuid primary key default gen_random_uuid(),
  content_angle_id uuid        not null references public.content_angles (id) on delete cascade,
  input            jsonb       not null,
  status           text        not null default 'pending',
  respuesta        jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  consumed_at      timestamptz,

  constraint jobs_linkedin_status_check check (status in ('pending', 'processing', 'done', 'failed'))
);

create index if not exists jobs_linkedin_status_idx     on public.jobs_linkedin (status, created_at);
create index if not exists jobs_linkedin_angle_id_idx   on public.jobs_linkedin (content_angle_id);
create index if not exists jobs_linkedin_por_drenar_idx on public.jobs_linkedin (created_at)
  where consumed_at is null and status in ('done', 'failed');

-- La pieza lista para revisar. `payload` guarda el post tal como lo devolvio la
-- rutina; `variables_usadas` es la copia de las ranuras que produjeron ESTE
-- texto, para poder explicar despues por que salio asi. La publicacion a
-- LinkedIn no es parte de esta etapa.
--
-- `raw_news_id` va con on delete set null y no cascade: la pieza ya no depende
-- de la noticia, y perderla en una limpieza del corpus seria destruir trabajo.
create table if not exists public.content_pieces (
  id               uuid primary key default gen_random_uuid(),
  content_angle_id uuid        not null references public.content_angles (id) on delete cascade,
  raw_news_id      uuid        references public.raw_news (id) on delete set null,
  job_linkedin_id  uuid        references public.jobs_linkedin (id) on delete set null,
  network          text        not null default 'linkedin',
  payload          jsonb       not null,
  status           text        not null default 'generated',
  variables_usadas jsonb,
  override_puntual jsonb,
  created_at       timestamptz not null default now(),
  generated_at     timestamptz,
  approved_at      timestamptz,

  constraint content_pieces_status_check  check (status in ('generated', 'approved', 'rejected')),
  constraint content_pieces_network_check check (network in ('linkedin'))
);

create index if not exists content_pieces_angle_id_idx    on public.content_pieces (content_angle_id);
create index if not exists content_pieces_raw_news_id_idx on public.content_pieces (raw_news_id);
create index if not exists content_pieces_status_idx      on public.content_pieces (status, created_at desc);

-- RLS: mismo regimen que el resto de tablas de configuracion y motor. Solo entra
-- service_role, que es la credencial con la que se autentica tanto la app como
-- la rutina externa cuando escribe en su buzon. Que la rutina toque solo
-- respuesta/status/error/processed_at es una convencion del contrato, no algo
-- que Postgres imponga.
alter table public.generation_config enable row level security;
alter table public.jobs_angle        enable row level security;
alter table public.jobs_linkedin     enable row level security;
alter table public.content_angles    enable row level security;
alter table public.content_pieces    enable row level security;

-- Obligatoria: el codigo lee y escribe con .eq("id", true), como engine_settings.
insert into public.generation_config (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------- publicacion
--
-- Publicar en LinkedIn la pieza generada.

-- La cuenta conectada por OAuth. Tabla de una sola fila, como engine_settings.
--
-- Guarda el token porque la app publica en nombre del miembro cuando el ya no
-- esta delante: un flujo que solo viviera en la sesion del navegador no serviria
-- para el modo automatico. De ahi RLS activo y solo service_role, igual que
-- engine_routines, que tambien custodia credenciales.
--
-- LinkedIn emite tokens de 60 dias y los refresh programaticos estan
-- restringidos a partners, asi que `expires_at` no es informativo: cuando pasa,
-- hay que reconectar a mano. La interfaz avisa una semana antes.
create table if not exists public.linkedin_account (
  id                 boolean primary key default true,
  access_token       text        not null,
  refresh_token      text,
  expires_at         timestamptz not null,
  refresh_expires_at timestamptz,
  -- urn:li:person:{sub}, que es lo que la Posts API espera en `author`.
  person_urn         text        not null,
  display_name       text,
  scope              text,
  connected_at       timestamptz not null default now(),

  constraint linkedin_account_singleton check (id)
);

alter table public.linkedin_account enable row level security;

-- Publicar en automatico nace apagado a proposito: manda contenido generado a
-- una cuenta real sin que nadie lo lea antes.
alter table public.generation_config
  add column if not exists autopublish boolean not null default false;

-- Una pieza publicada guarda el URN que devuelve LinkedIn, que es lo que
-- permite reconstruir la URL del post y no publicarla dos veces.
alter table public.content_pieces add column if not exists published_at  timestamptz;
alter table public.content_pieces add column if not exists linkedin_urn  text;
alter table public.content_pieces add column if not exists publish_error text;

alter table public.content_pieces drop constraint if exists content_pieces_status_check;
alter table public.content_pieces
  add constraint content_pieces_status_check
  check (status in ('generated', 'approved', 'published', 'rejected'));

-- Lo que mira el modo automatico: generado o aprobado, y aun sin publicar.
create index if not exists content_pieces_publicables_idx on public.content_pieces (created_at)
  where status in ('generated', 'approved') and published_at is null;

-- --------------------------------------------------------------- instagram
--
-- Buzon de la rutina de Instagram. Mismo contrato que los otros dos: la app
-- encola, la rutina escribe `respuesta` y marca 'done'; la app materializa.
--
-- Aqui la app hace ademas un paso que las otras redes no tienen: dibujar las
-- imagenes del carrusel y subirlas al storage.
create table if not exists public.jobs_instagram (
  id               uuid primary key default gen_random_uuid(),
  content_angle_id uuid        not null references public.content_angles (id) on delete cascade,
  input            jsonb       not null,
  status           text        not null default 'pending',
  respuesta        jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  consumed_at      timestamptz,

  constraint jobs_instagram_status_check check (status in ('pending', 'processing', 'done', 'failed'))
);

create index if not exists jobs_instagram_status_idx     on public.jobs_instagram (status, created_at);
create index if not exists jobs_instagram_angle_id_idx   on public.jobs_instagram (content_angle_id);
create index if not exists jobs_instagram_por_drenar_idx on public.jobs_instagram (created_at)
  where consumed_at is null and status in ('done', 'failed');

alter table public.jobs_instagram enable row level security;

-- La pieza deja de ser solo de LinkedIn. Cada red guarda su propia forma en
-- `payload`: LinkedIn un texto, Instagram un caption con la lista ordenada de
-- imagenes.
alter table public.content_pieces drop constraint if exists content_pieces_network_check;
alter table public.content_pieces
  add constraint content_pieces_network_check check (network in ('linkedin', 'instagram'));

-- De que buzon salio, para auditar una generacion rara. Cada red tiene el suyo
-- y solo uno de los dos esta relleno.
alter table public.content_pieces
  add column if not exists job_instagram_id uuid references public.jobs_instagram (id) on delete set null;

-- Bucket publico para las imagenes del carrusel.
--
-- Publico a proposito: al publicar, Instagram descarga cada imagen desde sus
-- propios servidores, asi que una URL firmada y efimera no le sirve. Lo que se
-- sube es contenido pensado para publicarse, no datos privados.
insert into storage.buckets (id, name, public)
values ('carousels', 'carousels', true)
on conflict (id) do update set public = true;
