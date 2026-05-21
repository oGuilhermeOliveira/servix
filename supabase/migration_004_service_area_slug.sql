-- Busca por serviço específico (slug da área) nos pedidos da home.
alter table public.service_requests
  add column if not exists area_slug text;

create index if not exists service_requests_area_slug_idx on public.service_requests(area_slug);
