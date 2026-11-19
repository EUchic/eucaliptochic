-- Fotos de producto con IA: al aprobarlas, la foto original en la que se basó se esconde de la tienda
-- (queda guardada como "rechazada" para poder rehacer la foto de IA si sale con un error).

alter table public.fotos add column if not exists base uuid references public.fotos(id) on delete set null;

create or replace function public.ocultar_base_ia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'propuesta' and new.estado = 'aprobada' and new.base is not null then
    update public.fotos set estado = 'rechazada' where id = new.base and coalesce(estado, 'original') <> 'propuesta';
  end if;
  return new;
end $$;
drop trigger if exists fotos_ocultar_base on public.fotos;
create trigger fotos_ocultar_base after update of estado on public.fotos for each row execute function public.ocultar_base_ia();

-- Las que ya se aprobaron: se esconde la primera original (la portada que usó la IA).
update public.fotos f set estado = 'rechazada'
from (
  select distinct on (o.pieza_id) o.id
  from public.fotos o
  where o.origen <> 'ia' and coalesce(o.estado, 'original') not in ('propuesta', 'rechazada')
    and exists (select 1 from public.fotos a where a.pieza_id = o.pieza_id and a.origen = 'ia' and a.estado = 'aprobada')
  order by o.pieza_id, o.orden, o.creado
) b
where f.id = b.id;

create or replace function public.catalogo_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'nuevo', p.nuevo, 'orden', p.orden,
    'coleccion', c.nombre, 'url_vieja', p.url_vieja, 'descripcion', p.descripcion,
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'talla', v.talla, 'color', v.color) order by v.talla, v.color)
                           from public.variantes v where v.pieza_id = p.id and coalesce(v.existencias, 1) > 0), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(f.url order by f.orden, f.creado) from public.fotos f
                       where f.pieza_id = p.id and coalesce(f.estado, 'original') not in ('propuesta', 'rechazada')), '[]'::jsonb)
  ) order by p.orden, p.creado), '[]'::jsonb)
  from public.piezas p left join public.colecciones c on c.id = p.coleccion_id
  where p.publicada
$$;
revoke all on function public.catalogo_publico() from public, anon, authenticated;
grant execute on function public.catalogo_publico() to anon, authenticated, service_role;

create or replace function public.estado_panel() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'coleccion', coalesce(c.nombre, ''),
        'oculta', not p.publicada, 'descripcion', p.descripcion,
        'foto', (select f.url from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') not in ('propuesta', 'rechazada') order by f.orden, f.creado limit 1),
        'fotos', (select count(*) from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') not in ('propuesta', 'rechazada')),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url, 'ia', f.origen = 'ia') order by f.orden, f.creado)
                           from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') not in ('propuesta', 'rechazada')), '[]'::jsonb),
        'propuesta', (select jsonb_build_object('id', f.id, 'url', f.url) from public.fotos f
                      where f.pieza_id = p.id and f.estado = 'propuesta' order by f.creado desc limit 1),
        'tallas', coalesce((select jsonb_agg(jsonb_build_object('talla', v.talla, 'existencias', v.existencias) order by v.talla)
                            from public.variantes v where v.pieza_id = p.id), '[]'::jsonb)
      ) order by p.orden, p.creado) from public.piezas p left join public.colecciones c on c.id = p.coleccion_id), '[]'::jsonb),
    'colecciones', coalesce((select jsonb_agg(nombre order by orden, nombre) from public.colecciones), '[]'::jsonb),
    'ferias', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'nombre', nombre, 'fecha', fecha, 'lugar', lugar, 'direccion', direccion, 'lat', lat, 'lng', lng, 'foto', foto
      ) order by fecha desc) from public.ferias), '[]'::jsonb),
    'movs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', 'movimiento', 'sentido', m.sentido, 'monto', m.monto, 'moneda', m.moneda, 'categoria', m.categoria,
        'metodo', m.metodo, 'concepto', m.concepto, 'feria', fe.nombre, 'fecha', m.fecha, 'crc', m.monto_crc, 'persona', m.persona,
        'anulado', m.anulado is not null, 'creado', m.creado
      ) order by m.fecha desc, m.creado desc)
      from (select * from public.movimientos order by fecha desc, creado desc limit 2000) m
      left join public.ferias fe on fe.id = m.feria_id), '[]'::jsonb),
    'fotos', coalesce((select jsonb_object_agg(f.foto_local, p.slug) from public.fotos f join public.piezas p on p.id = f.pieza_id where f.foto_local is not null), '{}'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'sentido', sentido) order by creado) from public.categorias), '[]'::jsonb),
    'aprendido', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'sentido', sentido, 'categoria', categoria) order by creado) from public.aprendido), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'rol', rol, 'categoria', categoria, 'notas', notas, 'veces', veces, 'ultimo', ultimo) order by veces desc, nombre) from public.personas), '[]'::jsonb),
    'memoria', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'texto', texto) order by creado) from public.memoria), '[]'::jsonb),
    'ajustes', coalesce((select jsonb_object_agg(clave, valor) from public.ajustes where clave like 'panel_%' or clave like 'analisis_%' or clave = 'tope_mensual'), '{}'::jsonb)
  )
$$;
revoke all on function public.estado_panel() from public, anon, authenticated;
grant execute on function public.estado_panel() to service_role;
