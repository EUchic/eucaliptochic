-- Copia de las fotos viejas (CDN de Squarespace) al bucket "fotos", para poder cancelar Squarespace sin perderlas.
-- Algunas originales son PNG (capturas de pantalla), así que el bucket también acepta PNG.
update storage.buckets set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'] where id = 'fotos';

-- Siguiente tanda de fotos que todavía viven en Squarespace.
create or replace function public.fotos_en_squarespace(lim int default 4) returns table (id uuid, url text, slug text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.url, p.slug from public.fotos f join public.piezas p on p.id = f.pieza_id
  where f.origen = 'squarespace' order by f.creado, f.id limit greatest(1, least(lim, 20))
$$;

-- Cambia una foto a su copia en Storage. Solo toca fotos que siguen en Squarespace (repetirlo no hace nada).
create or replace function public.foto_mudada(p_id uuid, p_url text) returns int
language sql security definer set search_path = '' as $$
  with c as (update public.fotos set url = p_url, origen = 'storage' where id = p_id and origen = 'squarespace' returning 1)
  select count(*)::int from c
$$;

create or replace function public.fotos_por_mudar() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.fotos where origen = 'squarespace'
$$;

revoke all on function public.fotos_en_squarespace(int), public.foto_mudada(uuid, text), public.fotos_por_mudar() from public, anon, authenticated;
grant execute on function public.fotos_en_squarespace(int), public.foto_mudada(uuid, text), public.fotos_por_mudar() to service_role;
