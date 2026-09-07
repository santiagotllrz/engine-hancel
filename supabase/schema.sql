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
  timezone   text        not null default 'America/Bogota',
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now(),

  constraint engine_settings_singleton check (id)
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
insert into public.engine_settings (id, run_hours, timezone, enabled)
values (true, '{11,18}', 'America/Bogota', true)
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
