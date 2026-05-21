-- Rode este script no Supabase: SQL Editor → New query → Run
-- https://supabase.com/dashboard/project/_/sql

create extension if not exists "pgcrypto";

-- Áreas de atuação (encanador, pintor, etc.)
create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text not null,
  address text not null,
  city text,
  state text,
  bio text,
  avatar_url text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_service_areas (
  provider_id uuid not null references public.providers (id) on delete cascade,
  area_id uuid not null references public.service_areas (id) on delete cascade,
  primary key (provider_id, area_id)
);

-- Pedidos rápidos da home (categoria + cidade)
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  area_slug text,
  city text not null,
  client_lat double precision,
  client_lng double precision,
  client_name text,
  client_phone text,
  created_at timestamptz not null default now()
);

-- Dados iniciais (slugs usados no front e na RPC)
insert into public.service_areas (slug, name) values
  ('encanador', 'Encanador'),
  ('pintor', 'Pintor'),
  ('eletricista', 'Eletricista'),
  ('pedreiro', 'Pedreiro'),
  ('marceneiro', 'Marceneiro'),
  ('diarista', 'Diarista'),
  ('jardineiro', 'Jardineiro'),
  ('ar_condicionado', 'Ar condicionado'),
  ('informatica', 'Informática / TI'),
  ('design', 'Design'),
  ('fotografo', 'Fotógrafo'),
  ('buffet', 'Buffet / gastronomia'),
  ('bem_estar', 'Bem-estar / Qualidade de vida'),
  ('desentupidor', 'Desentupidor'),
  ('marido_aluguel', 'Marido de aluguel'),
  ('vidraceiro', 'Vidraceiro'),
  ('cuidador', 'Cuidador de pessoas'),
  ('gesso_drywall', 'Gesso e drywall'),
  ('eletrodomesticos', 'Assistência eletrodomésticos'),
  ('baba', 'Babá'),
  ('serralheria', 'Serralheria e solda'),
  ('redes_cabeamento', 'Cabeamento e redes'),
  ('desenvolvimento', 'Sites e sistemas'),
  ('seguranca_eletronica', 'Segurança eletrônica'),
  ('cozinheira', 'Cozinheira'),
  ('manicure', 'Manicure e pedicure'),
  ('personal_trainer', 'Personal trainer'),
  ('cabeleireiro', 'Cabeleireiros'),
  ('nutricionista', 'Nutricionista'),
  ('dedetizador', 'Dedetizador'),
  ('motorista', 'Motorista'),
  ('arquiteto', 'Arquitetos'),
  ('marketing', 'Marketing online'),
  ('aulas_idiomas', 'Aula de idiomas'),
  ('passadeira', 'Passadeira'),
  ('redes_protecao', 'Redes de proteção'),
  ('psicologo', 'Psicólogo'),
  ('contador', 'Contador'),
  ('tapeceiro', 'Tapeceiro'),
  ('bartender', 'Bartenders'),
  ('audio_video', 'Áudio e vídeo'),
  ('engenheiro', 'Engenheiro'),
  ('chaveiro', 'Chaveiro'),
  ('limpeza_pos_obra', 'Limpeza pós-obra'),
  ('impermeabilizacao', 'Impermeabilização e telhado')
on conflict (slug) do nothing;

-- Cadastro atômico: prestador + vínculos (evita abuso na tabela de junção)
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

grant select on table public.service_areas to anon, authenticated;
grant select on table public.providers to anon, authenticated;
grant insert, update on table public.providers to authenticated;
grant select on table public.provider_service_areas to anon, authenticated;
grant insert, delete on table public.provider_service_areas to authenticated;
grant insert on table public.service_requests to anon, authenticated;

alter table public.service_areas enable row level security;
alter table public.providers enable row level security;
alter table public.provider_service_areas enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "service_areas_select_public" on public.service_areas;
create policy "service_areas_select_public"
  on public.service_areas for select
  using (true);

drop policy if exists "providers_select_public" on public.providers;
create policy "providers_select_public"
  on public.providers for select
  using (true);

drop policy if exists "providers_insert_own" on public.providers;
create policy "providers_insert_own"
  on public.providers for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

drop policy if exists "providers_update_own" on public.providers;
create policy "providers_update_own"
  on public.providers for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

update public.providers p
set auth_user_id = u.id
from auth.users u
where p.auth_user_id is null
  and lower(p.email) = lower(u.email);

create or replace function public.handle_new_auth_user_provider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.providers
  set auth_user_id = new.id,
      email = lower(new.email)
  where lower(email) = lower(new.email)
    and (auth_user_id is null or auth_user_id = new.id);

  if found then
    return new;
  end if;

  insert into public.providers (auth_user_id, email, full_name, phone, address)
  values (new.id, lower(new.email), '', '', '')
  on conflict (auth_user_id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_provider on auth.users;
create trigger on_auth_user_created_provider
after insert on auth.users
for each row execute function public.handle_new_auth_user_provider();

drop policy if exists "provider_service_areas_select_public" on public.provider_service_areas;
create policy "provider_service_areas_select_public"
  on public.provider_service_areas for select
  using (true);

drop policy if exists "provider_service_areas_insert_own" on public.provider_service_areas;
create policy "provider_service_areas_insert_own"
  on public.provider_service_areas for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "provider_service_areas_delete_own" on public.provider_service_areas;
create policy "provider_service_areas_delete_own"
  on public.provider_service_areas for delete
  to authenticated
  using (
    exists (
      select 1
      from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "service_requests_insert_public" on public.service_requests;
create policy "service_requests_insert_public"
  on public.service_requests for insert
  with check (true);

insert into storage.buckets (id, name, public)
values ('provider-avatars', 'provider-avatars', true)
on conflict (id) do nothing;

drop policy if exists "provider_avatars_upload_own" on storage.objects;
create policy "provider_avatars_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "provider_avatars_update_own" on storage.objects;
create policy "provider_avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'provider-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "provider_avatars_public_read" on storage.objects;
create policy "provider_avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'provider-avatars');
