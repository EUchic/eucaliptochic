-- Asistente profesional: recuerda personas y datos, piezas con tallas/existencias/descripción,
-- fotos de producto propuestas por la IA (Andrea las aprueba) y ajustes del panel.

alter table public.fotos drop constraint if exists fotos_estado_check;
alter table public.fotos add constraint fotos_estado_check check (estado = any (array['original', 'por_revisar', 'aprobada', 'rechazada', 'propuesta']));
alter table public.fotos drop constraint if exists fotos_origen_check;
alter table public.fotos add constraint fotos_origen_check check (origen = any (array['squarespace', 'propia', 'storage', 'ia']));

alter table public.movimientos add column if not exists persona text check (persona is null or char_length(persona) <= 80);

create table if not exists public.personas (
  clave text primary key,              -- nombre en minúscula, sin espacios dobles
  nombre text not null check (char_length(nombre) between 1 and 80),
  rol text check (rol in ('clienta', 'proveedor', 'otro')),
  categoria text,                      -- categoría de siempre (ej.: Juanita -> Confección)
  notas text check (notas is null or char_length(notas) <= 300),
  veces int not null default 0,
  ultimo date,
  creado timestamptz not null default now()
);
create table if not exists public.memoria (
  id uuid primary key,
  texto text not null check (char_length(texto) between 2 and 300),
  creado timestamptz not null default now()
);
alter table public.personas enable row level security;
alter table public.memoria enable row level security;
revoke all on public.personas, public.memoria from anon, authenticated;

-- Las fotos "propuesta" (hechas por la IA) no salen en la tienda hasta que Andrea las aprueba.
create or replace function public.catalogo_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'nuevo', p.nuevo, 'orden', p.orden,
    'coleccion', c.nombre, 'url_vieja', p.url_vieja, 'descripcion', p.descripcion,
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'talla', v.talla, 'color', v.color) order by v.talla, v.color)
                           from public.variantes v where v.pieza_id = p.id and coalesce(v.existencias, 1) > 0), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(f.url order by f.orden, f.creado) from public.fotos f
                       where f.pieza_id = p.id and coalesce(f.estado, 'original') <> 'propuesta'), '[]'::jsonb)
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
        'foto', (select f.url from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') <> 'propuesta' order by f.orden, f.creado limit 1),
        'fotos', (select count(*) from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') <> 'propuesta'),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url) order by f.orden, f.creado)
                           from public.fotos f where f.pieza_id = p.id and coalesce(f.estado, 'original') <> 'propuesta'), '[]'::jsonb),
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

create or replace function public.aplicar_accion(a jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (a->>'id')::uuid;
  v_tipo text := a->>'tipo';
  v_col uuid;
  v_feria uuid;
  v_pieza uuid;
  v_slug text;
  v_persona text;
  t jsonb;
begin
  if v_id is null or v_tipo is null then raise exception 'acción sin id o sin tipo'; end if;
  insert into public.acciones (id, tipo, datos) values (v_id, v_tipo, a) on conflict (id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'repetida', true); end if;

  case v_tipo
  when 'movimiento' then
    if coalesce(a->>'feria', '') <> '' then
      select id into v_feria from public.ferias where nombre = a->>'feria' order by fecha desc limit 1;
    end if;
    v_persona := nullif(left(trim(coalesce(a->>'persona', '')), 80), '');
    insert into public.movimientos (id, sentido, fecha, concepto, categoria, metodo, moneda, monto, tipo_cambio, monto_crc, feria_id, persona)
    values (v_id, a->>'sentido', coalesce(nullif(a->>'fecha', '')::date, current_date), left(coalesce(nullif(a->>'concepto', ''), a->>'categoria'), 300),
            a->>'categoria', a->>'metodo', coalesce(a->>'moneda', 'CRC'), (a->>'monto')::numeric,
            nullif(a->>'tipoCambio', '')::numeric, (a->>'crc')::numeric, v_feria, v_persona);
    -- El asistente recuerda a la gente con la que Andrea hace negocio.
    if v_persona is not null then
      insert into public.personas (clave, nombre, rol, categoria, veces, ultimo)
      values (lower(regexp_replace(v_persona, '\s+', ' ', 'g')), v_persona,
              case when a->>'sentido' = 'ingreso' then 'clienta' else 'proveedor' end,
              case when a->>'sentido' = 'gasto' then a->>'categoria' end, 1, coalesce(nullif(a->>'fecha', '')::date, current_date))
      on conflict (clave) do update set veces = public.personas.veces + 1, ultimo = greatest(public.personas.ultimo, excluded.ultimo),
        categoria = coalesce(excluded.categoria, public.personas.categoria);
    end if;
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
    v_slug := coalesce(nullif(public.slug(coalesce(a->>'slug', '')), ''), public.slug(a->>'nombre'));
    if exists (select 1 from public.piezas where slug = v_slug) then v_slug := v_slug || '-' || left(v_id::text, 4); end if;
    insert into public.piezas (slug, nombre, tipo, precio, coleccion_id, nuevo, orden, descripcion)
    values (v_slug, trim(a->>'nombre'), coalesce(a->>'tipoPieza', 'Blusas'), coalesce((a->>'precio')::numeric, 0), v_col, true,
            (select coalesce(min(orden), 0) - 1 from public.piezas), nullif(left(trim(coalesce(a->>'descripcion', '')), 600), ''))
    returning id into v_pieza;
    if jsonb_typeof(a->'tallas') = 'array' and jsonb_array_length(a->'tallas') > 0 then
      for t in select * from jsonb_array_elements(a->'tallas') loop
        insert into public.variantes (pieza_id, talla, existencias) values (v_pieza, left(trim(t->>'talla'), 30), nullif(t->>'existencias', '')::int);
      end loop;
    else
      insert into public.variantes (pieza_id, talla) select v_pieza, x from unnest(array['S-M', 'M-L']) as x;
    end if;
  when 'tallas' then
    -- Andrea dice qué tallas hay y cuántas quedan de cada una.
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    delete from public.variantes where pieza_id = v_pieza
      and talla not in (select left(trim(x->>'talla'), 30) from jsonb_array_elements(a->'tallas') x);
    for t in select * from jsonb_array_elements(a->'tallas') loop
      update public.variantes set existencias = nullif(t->>'existencias', '')::int where pieza_id = v_pieza and talla = left(trim(t->>'talla'), 30);
      if not found then
        insert into public.variantes (pieza_id, talla, existencias) values (v_pieza, left(trim(t->>'talla'), 30), nullif(t->>'existencias', '')::int);
      end if;
    end loop;
    update public.piezas set actualizado = now() where id = v_pieza;
  when 'descripcion' then
    update public.piezas set descripcion = nullif(left(trim(coalesce(a->>'descripcion', '')), 600), ''), actualizado = now() where slug = a->>'slug';
    if not found then raise exception 'No encontré la pieza %', a->>'slug'; end if;
  when 'feria' then
    insert into public.ferias (id, nombre, fecha, lugar, direccion, lat, lng)
    values (v_id, trim(a->>'nombre'), (a->>'fecha')::date, nullif(a->>'lugar', ''), nullif(a->>'direccion', ''),
            nullif(a->>'lat', '')::double precision, nullif(a->>'lng', '')::double precision);
  when 'feria_lugar' then
    update public.ferias set lugar = nullif(trim(a->>'lugar'), ''), direccion = nullif(trim(a->>'direccion'), ''),
           lat = (a->>'lat')::double precision, lng = (a->>'lng')::double precision
     where id = (a->>'feria')::uuid;
    if not found then raise exception 'No encontré esa feria'; end if;
  when 'feria_foto' then
    update public.ferias set foto = a->>'url' where id = (a->>'feria')::uuid;
    if not found then raise exception 'No encontré esa feria'; end if;
  when 'borrar_feria' then
    delete from public.ferias where id = (a->>'feria')::uuid;
    if not found then raise exception 'No encontré esa feria'; end if;
  when 'aprender' then
    if coalesce((a->>'nueva')::boolean, false) then
      insert into public.categorias (nombre, sentido) values (trim(a->>'categoria'), a->>'sentido') on conflict (nombre) do nothing;
    end if;
    if coalesce(trim(a->>'clave'), '') <> '' then
      insert into public.aprendido (clave, sentido, categoria) values (lower(trim(a->>'clave')), a->>'sentido', trim(a->>'categoria'))
      on conflict (clave) do update set sentido = excluded.sentido, categoria = excluded.categoria, creado = now();
    end if;
  when 'persona' then
    insert into public.personas (clave, nombre, rol, categoria, notas)
    values (lower(regexp_replace(trim(a->>'nombre'), '\s+', ' ', 'g')), trim(a->>'nombre'), nullif(a->>'rol', ''), nullif(a->>'categoria', ''), nullif(a->>'notas', ''))
    on conflict (clave) do update set nombre = excluded.nombre, rol = coalesce(excluded.rol, public.personas.rol),
      categoria = coalesce(excluded.categoria, public.personas.categoria), notas = coalesce(excluded.notas, public.personas.notas);
  when 'recordar' then
    insert into public.memoria (id, texto) values (v_id, left(trim(a->>'texto'), 300));
  when 'olvidar' then
    delete from public.memoria where id = (a->>'memoria')::uuid;
  when 'ajuste' then
    if (a->>'clave') !~ '^(panel_|analisis_)[a-z0-9_-]{1,60}$' then raise exception 'Ajuste no permitido'; end if;
    insert into public.ajustes (clave, valor, actualizado) values (a->>'clave', a->'valor', now())
    on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  when 'feria_sin_foto' then
    update public.ferias set foto = null where id = (a->>'feria')::uuid;
    if not found then raise exception 'No encontré esa feria'; end if;
  when 'foto' then
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    insert into public.fotos (pieza_id, url, origen, foto_local, orden)
    values (v_pieza, '/fotos/' || (a->>'foto'), 'propia', a->>'foto', -100)
    on conflict (foto_local) do update set pieza_id = excluded.pieza_id;
  when 'foto_nueva' then
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    insert into public.fotos (id, pieza_id, url, origen, orden)
    values (v_id, v_pieza, a->>'url', 'storage', (select coalesce(min(orden), 0) - 1 from public.fotos where pieza_id = v_pieza));
  when 'foto_propuesta' then
    -- Foto de producto hecha por la IA: queda esperando que Andrea la apruebe (la URL la arma el servidor).
    select id into v_pieza from public.piezas where slug = a->>'slug';
    if v_pieza is null then raise exception 'No encontré la pieza %', a->>'slug'; end if;
    delete from public.fotos where pieza_id = v_pieza and estado = 'propuesta';
    insert into public.fotos (id, pieza_id, url, origen, orden, estado) values (v_id, v_pieza, a->>'url', 'ia', 0, 'propuesta');
  when 'foto_aprobar' then
    -- La foto de la IA pasa a ser la portada de la pieza.
    update public.fotos set estado = 'aprobada',
           orden = (select coalesce(min(orden), 0) - 1 from public.fotos where pieza_id = (select id from public.piezas where slug = a->>'slug'))
     where id = (a->>'foto_id')::uuid and estado = 'propuesta';
    if not found then raise exception 'Esa foto ya no está pendiente'; end if;
  when 'foto_descartar' then
    delete from public.fotos where id = (a->>'foto_id')::uuid and estado = 'propuesta';
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
