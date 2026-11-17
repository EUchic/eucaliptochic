-- Fotos que Andrea sube desde el panel: viven en Storage (bucket público "fotos", solo lectura para el público).
-- Solo el servidor (llave secreta) puede subir; las URLs de foto_nueva las arma el servidor, nunca el navegador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 4194304, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- El panel necesita la lista de fotos de cada pieza para poder quitarlas.
create or replace function public.estado_panel() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'coleccion', coalesce(c.nombre, ''),
        'oculta', not p.publicada,
        'foto', (select f.url from public.fotos f where f.pieza_id = p.id order by f.orden, f.creado limit 1),
        'fotos', (select count(*) from public.fotos f where f.pieza_id = p.id),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url) order by f.orden, f.creado) from public.fotos f where f.pieza_id = p.id), '[]'::jsonb)
      ) order by p.orden, p.creado) from public.piezas p left join public.colecciones c on c.id = p.coleccion_id), '[]'::jsonb),
    'colecciones', coalesce((select jsonb_agg(nombre order by orden, nombre) from public.colecciones), '[]'::jsonb),
    'ferias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'fecha', fecha, 'lugar', lugar) order by fecha desc) from public.ferias), '[]'::jsonb),
    'movs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', 'movimiento', 'sentido', m.sentido, 'monto', m.monto, 'moneda', m.moneda, 'categoria', m.categoria,
        'metodo', m.metodo, 'concepto', m.concepto, 'feria', fe.nombre, 'fecha', m.fecha, 'crc', m.monto_crc,
        'anulado', m.anulado is not null, 'creado', m.creado
      ) order by m.fecha desc, m.creado desc)
      from (select * from public.movimientos order by fecha desc, creado desc limit 1000) m
      left join public.ferias fe on fe.id = m.feria_id), '[]'::jsonb),
    'fotos', coalesce((select jsonb_object_agg(f.foto_local, p.slug) from public.fotos f join public.piezas p on p.id = f.pieza_id where f.foto_local is not null), '{}'::jsonb)
  )
$$;

create or replace function public.aplicar_accion(a jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (a->>'id')::uuid;
  v_tipo text := a->>'tipo';
  v_col uuid;
  v_feria uuid;
  v_pieza uuid;
  v_slug text;
begin
  if v_id is null or v_tipo is null then raise exception 'acción sin id o sin tipo'; end if;
  insert into public.acciones (id, tipo, datos) values (v_id, v_tipo, a) on conflict (id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'repetida', true); end if;

  case v_tipo
  when 'movimiento' then
    if coalesce(a->>'feria', '') <> '' then
      select id into v_feria from public.ferias where nombre = a->>'feria' order by fecha desc limit 1;
    end if;
    insert into public.movimientos (id, sentido, fecha, concepto, categoria, metodo, moneda, monto, tipo_cambio, monto_crc, feria_id)
    values (v_id, a->>'sentido', coalesce(nullif(a->>'fecha', '')::date, current_date), left(coalesce(nullif(a->>'concepto', ''), a->>'categoria'), 300),
            a->>'categoria', a->>'metodo', coalesce(a->>'moneda', 'CRC'), (a->>'monto')::numeric,
            nullif(a->>'tipoCambio', '')::numeric, (a->>'crc')::numeric, v_feria);
  when 'anular' then
    update public.movimientos set anulado = now() where id = (a->>'mov')::uuid and anulado is null;
  when 'precio' then
    update public.piezas set precio = (a->>'precio')::numeric, actualizado = now() where slug = a->>'slug';
    if not found then raise exception 'No encontré la pieza %', a->>'slug'; end if;
  when 'visible' then
    update public.piezas set publicada = (a->>'visible')::boolean, actualizado = now() where slug = a->>'slug';
    if not found then raise exception 'No encontré la pieza %', a->>'slug'; end if;
  when 'coleccion' then
    insert into public.colecciones (slug, nombre) values (public.slug(a->>'nombre'), trim(a->>'nombre')) on conflict (slug) do nothing;
  when 'mover' then
    if coalesce(trim(a->>'coleccion'), '') = '' then
      v_col := null;
    else
      insert into public.colecciones (slug, nombre) values (public.slug(a->>'coleccion'), trim(a->>'coleccion')) on conflict (slug) do nothing;
      select id into v_col from public.colecciones where slug = public.slug(a->>'coleccion');
    end if;
    update public.piezas set coleccion_id = v_col, actualizado = now() where slug = a->>'slug';
    if not found then raise exception 'No encontré la pieza %', a->>'slug'; end if;
  when 'pieza' then
    if coalesce(trim(a->>'coleccion'), '') <> '' then
      insert into public.colecciones (slug, nombre) values (public.slug(a->>'coleccion'), trim(a->>'coleccion')) on conflict (slug) do nothing;
      select id into v_col from public.colecciones where slug = public.slug(a->>'coleccion');
    end if;
    v_slug := public.slug(a->>'nombre');
    if exists (select 1 from public.piezas where slug = v_slug) then v_slug := v_slug || '-' || left(v_id::text, 4); end if;
    insert into public.piezas (slug, nombre, tipo, precio, coleccion_id, nuevo, orden)
    values (v_slug, trim(a->>'nombre'), coalesce(a->>'tipoPieza', 'Blusas'), coalesce((a->>'precio')::numeric, 0), v_col, true,
            (select coalesce(min(orden), 0) - 1 from public.piezas));
    insert into public.variantes (pieza_id, talla) select p.id, t.talla from public.piezas p, unnest(array['S-M', 'M-L', 'Talla única']) as t(talla) where p.slug = v_slug;
  when 'feria' then
    insert into public.ferias (id, nombre, fecha, lugar) values (v_id, trim(a->>'nombre'), (a->>'fecha')::date, nullif(a->>'lugar', ''));
  when 'foto' then
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    insert into public.fotos (pieza_id, url, origen, foto_local, orden)
    values (v_pieza, '/fotos/' || (a->>'foto'), 'propia', a->>'foto', -100)
    on conflict (foto_local) do update set pieza_id = excluded.pieza_id;
  when 'foto_nueva' then
    -- Foto subida por Andrea: queda de primera en la pieza.
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    insert into public.fotos (id, pieza_id, url, origen, orden)
    values (v_id, v_pieza, a->>'url', 'storage', (select coalesce(min(orden), 0) - 1 from public.fotos where pieza_id = v_pieza));
  when 'quitar_foto' then
    delete from public.fotos where id = (a->>'foto_id')::uuid and pieza_id = (select id from public.piezas where slug = a->>'slug');
    if not found then raise exception 'No encontré esa foto'; end if;
  else
    raise exception 'Acción desconocida: %', v_tipo;
  end case;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.estado_panel(), public.aplicar_accion(jsonb) from public, anon, authenticated;
grant execute on function public.estado_panel(), public.aplicar_accion(jsonb) to service_role;
