-- Serviços focados em casa (busca + cadastro de prestador).
insert into public.service_areas (slug, name) values
  ('chaveiro', 'Chaveiro'),
  ('limpeza_pos_obra', 'Limpeza pós-obra'),
  ('impermeabilizacao', 'Impermeabilização e telhado')
on conflict (slug) do nothing;
