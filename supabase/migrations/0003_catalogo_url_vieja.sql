-- El catálogo público incluye la dirección vieja de Squarespace, para redirigir los links viejos (Instagram, WhatsApp, Google).
create or replace function public.catalogo_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'nuevo', p.nuevo, 'orden', p.orden,
    'coleccion', c.nombre, 'url_vieja', p.url_vieja,
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'talla', v.talla, 'color', v.color) order by v.talla, v.color)
                           from public.variantes v where v.pieza_id = p.id), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(f.url order by f.orden, f.creado) from public.fotos f where f.pieza_id = p.id), '[]'::jsonb)
  ) order by p.orden, p.creado), '[]'::jsonb)
  from public.piezas p left join public.colecciones c on c.id = p.coleccion_id
  where p.publicada
$$;
revoke all on function public.catalogo_publico() from public, anon, authenticated;
grant execute on function public.catalogo_publico() to anon, authenticated, service_role;
