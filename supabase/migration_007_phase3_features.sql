-- Fase 3: notificações, pedidos ocultos, serviços concluídos, exclusão de conta, termos
--
-- IMPORTANTE (Supabase Dashboard → Authentication → URL Configuration):
-- Adicione em Redirect URLs: https://SEU-DOMINIO/janelas/redefinir-senha.html
-- (e http://localhost/... para desenvolvimento local)

-- Preferências e termos no prestador
alter table public.providers
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists notify_many_requests boolean not null default true,
  add column if not exists notify_profile_changes boolean not null default true;

-- Notificações in-app
create table if not exists public.provider_notifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_notifications_provider
  on public.provider_notifications (provider_id, created_at desc);

-- Pedidos/orçamentos ocultados pelo prestador
create table if not exists public.provider_dismissed_requests (
  provider_id uuid not null references public.providers (id) on delete cascade,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (provider_id, request_id)
);

-- Serviços concluídos
create table if not exists public.completed_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  request_id uuid references public.service_requests (id) on delete set null,
  category text not null,
  area_slug text,
  city text,
  client_name text,
  client_phone text,
  notes text,
  completed_at timestamptz not null default now()
);

create index if not exists idx_completed_services_provider
  on public.completed_services (provider_id, completed_at desc);

-- RLS
alter table public.provider_notifications enable row level security;
alter table public.provider_dismissed_requests enable row level security;
alter table public.completed_services enable row level security;

drop policy if exists "provider_notifications_own" on public.provider_notifications;
create policy "provider_notifications_own"
  on public.provider_notifications for all
  to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "provider_dismissed_own" on public.provider_dismissed_requests;
create policy "provider_dismissed_own"
  on public.provider_dismissed_requests for all
  to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "completed_services_own" on public.completed_services;
create policy "completed_services_own"
  on public.completed_services for all
  to authenticated
  using (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.providers p
      where p.id = provider_id and p.auth_user_id = auth.uid()
    )
  );

-- Prestador pode ver pedidos (para o painel)
drop policy if exists "service_requests_select_authenticated" on public.service_requests;
create policy "service_requests_select_authenticated"
  on public.service_requests for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.provider_notifications to authenticated;
grant select, insert, delete on table public.provider_dismissed_requests to authenticated;
grant select, insert, update, delete on table public.completed_services to authenticated;

-- Criar notificação (uso interno pelo app)
create or replace function public.create_provider_notification(
  p_provider_id uuid,
  p_type text,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.providers p
    where p.id = p_provider_id and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Acesso negado';
  end if;

  insert into public.provider_notifications (provider_id, type, title, message)
  values (p_provider_id, p_type, p_title, p_message)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_provider_notification(uuid, text, text, text) to authenticated;

-- Exclusão total da conta do prestador (dados + auth)
create or replace function public.delete_own_provider_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  delete from public.providers where auth_user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_own_provider_account() to authenticated;
