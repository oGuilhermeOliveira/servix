-- Cadastro/login de prestador com Auth + endereco/foto.
-- Rode no SQL Editor depois do schema.sql e migration_002_geo.sql.

alter table public.providers
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists address text,
  add column if not exists avatar_url text;

update public.providers
set phone = coalesce(phone, '')
where phone is null;

update public.providers
set address = coalesce(address, '')
where address is null;

alter table public.providers
  alter column phone set not null,
  alter column address set not null;

create unique index if not exists providers_auth_user_id_uq on public.providers(auth_user_id) where auth_user_id is not null;

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

grant insert, update on table public.providers to authenticated;
grant insert, update, delete on table public.provider_service_areas to authenticated;

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
