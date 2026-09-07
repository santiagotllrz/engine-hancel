-- ---------------------------------------------------------------------------
-- El planificador del motor, dentro de Postgres.
--
-- Ejecutar DESPUES de schema.sql. Idempotente.
--
-- Por que aqui y no en Vercel: un cron de Vercel es una expresion fija en
-- vercel.json, asi que la unica forma de tener horarios editables era llamar
-- cada hora y descartar 23 de cada 24 llamadas. Ademas el plan Hobby no admite
-- crons horarios. pg_cron dispara a la hora exacta y se reprograma solo.
--
-- Quien manda sigue siendo `/engine/schedule`: el trigger de abajo reescribe el
-- job cada vez que se guarda el horario. La app no sabe que pg_cron existe.
--
-- Puesta en marcha, una sola vez y con la URL del despliegue:
--
--   select public.configure_ingest(
--     'https://<host>/api/ingest',
--     '<INGEST_SECRET>'
--   );
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Endpoint y secreto viven en Vault, cifrados: el job los lee al disparar.
create or replace function public.configure_ingest(url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name in ('ingest_url', 'ingest_secret');
  perform vault.create_secret(url, 'ingest_url', 'Endpoint /api/ingest de engine-hancel');
  perform vault.create_secret(secret, 'ingest_secret', 'INGEST_SECRET de engine-hancel');
  return public.sync_ingest_schedule();
end;
$$;

/**
 * Llama a /api/ingest. Es lo que ejecuta el job de pg_cron.
 *
 * Va con ?force=1 a proposito: el cron ya dispara a la hora correcta, no hace
 * falta que la app vuelva a comprobarla. El http_post de pg_net es asincrono,
 * asi que la corrida no bloquea al planificador.
 */
create or replace function public.fire_ingest()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'ingest_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';

  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta configurar ingest_url/ingest_secret (usa configure_ingest)';
    return null;
  end if;

  select net.http_post(
    url := v_url || '?force=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

/**
 * Reescribe el job de pg_cron a partir de engine_settings.
 *
 * pg_cron corre en UTC, asi que las horas locales se traducen aqui: 11:00 y
 * 18:00 en America/Bogota salen como `0 16,23 * * *`. Colombia no tiene horario
 * de verano; en una zona que si lo tuviera habria que resincronizar en cada
 * cambio, porque la traduccion se calcula al guardar y no en cada disparo.
 */
create or replace function public.sync_ingest_schedule()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.engine_settings%rowtype;
  v_hours    text;
  v_expr     text;
begin
  select * into v_settings from public.engine_settings where id;

  -- Un job viejo con otro horario tiene que morir antes de programar el nuevo.
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_ingest';

  if not found and v_settings is null then
    return 'sin configuracion';
  end if;

  if not v_settings.enabled or coalesce(array_length(v_settings.run_hours, 1), 0) = 0 then
    return 'programacion desactivada';
  end if;

  select string_agg(distinct utc_hour::text, ',' order by utc_hour::text)
  into v_hours
  from (
    select extract(
             hour from ((current_date + make_interval(hours => h)) at time zone v_settings.timezone)
                        at time zone 'UTC'
           )::int as utc_hour
    from unnest(v_settings.run_hours) as h
  ) as horas;

  v_expr := '0 ' || v_hours || ' * * *';
  perform cron.schedule('engine_hancel_ingest', v_expr, 'select public.fire_ingest();');

  return v_expr;
end;
$$;

-- El enlace entre la pantalla de horarios y el cron real: guardar reprograma.
create or replace function public.engine_settings_sync_cron()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_ingest_schedule();
  return null;
end;
$$;

drop trigger if exists engine_settings_sync_cron_trg on public.engine_settings;
create trigger engine_settings_sync_cron_trg
after insert or update on public.engine_settings
for each statement execute function public.engine_settings_sync_cron();

-- PostgREST expone `public` como API y estas funciones son SECURITY DEFINER:
-- sin esto, `anon` podria disparar ingestas desde /rest/v1/rpc/fire_ingest o
-- reescribir el endpoint con configure_ingest usando solo la clave publicable.
revoke all on function public.configure_ingest(text, text)   from public, anon, authenticated;
revoke all on function public.fire_ingest()                  from public, anon, authenticated;
revoke all on function public.sync_ingest_schedule()         from public, anon, authenticated;
revoke all on function public.engine_settings_sync_cron()    from public, anon, authenticated;

-- service_role es quien escribe engine_settings desde la app y dispara el trigger.
grant execute on function public.configure_ingest(text, text) to service_role;
grant execute on function public.fire_ingest()                to service_role;
grant execute on function public.sync_ingest_schedule()       to service_role;
grant execute on function public.engine_settings_sync_cron()  to service_role;

-- Deja el job alineado con lo que haya en engine_settings ahora mismo.
select public.sync_ingest_schedule();
