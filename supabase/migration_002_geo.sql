-- Execute no SQL Editor se você já rodou o schema inicial.
-- Coordenadas para ordenar por proximidade + pedido com local do cliente.

alter table public.providers add column if not exists lat double precision;
alter table public.providers add column if not exists lng double precision;

alter table public.service_requests add column if not exists client_lat double precision;
alter table public.service_requests add column if not exists client_lng double precision;

insert into public.service_areas (slug, name) values
  ('bem_estar', 'Bem-estar / Qualidade de vida')
on conflict (slug) do nothing;

drop function if exists public.register_provider(text, text, text, text, text, text[]);

create or replace function public.register_provider(
  p_full_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_state text,
  p_area_slugs text[],
  p_lat double precision default null,
  p_lng double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  s text;
begin
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Nome inválido';
  end if;
  if p_email is null or position('@' in p_email) < 2 then
    raise exception 'E-mail inválido';
  end if;
  if p_area_slugs is null or cardinality(p_area_slugs) < 1 then
    raise exception 'Selecione ao menos uma área de atuação';
  end if;

  insert into public.providers (full_name, email, phone, city, state, lat, lng)
  values (
    trim(p_full_name),
    lower(trim(p_email)),
    nullif(trim(p_phone), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_state), ''),
    p_lat,
    p_lng
  )
  returning id into v_id;

  foreach s in array p_area_slugs
  loop
    insert into public.provider_service_areas (provider_id, area_id)
    select v_id, id from public.service_areas where slug = trim(s)
    on conflict do nothing;
  end loop;

  if not exists (select 1 from public.provider_service_areas where provider_id = v_id) then
    delete from public.providers where id = v_id;
    raise exception 'Nenhuma área válida selecionada';
  end if;

  return v_id;
end;
$$;

grant execute on function public.register_provider(text, text, text, text, text, text[], double precision, double precision) to anon, authenticated;
