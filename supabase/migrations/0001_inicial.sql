-- Eucalipto Chic — base de datos (tienda + finanzas)
-- Seguridad:
--   * RLS activo en todas las tablas y sin políticas: nadie desde afuera lee ni escribe tablas directamente.
--   * El público solo puede llamar catalogo_publico() (piezas publicadas, sin costos).
--   * Todo lo demás pasa por el servidor de la web con la llave secreta (service_role), y el servidor solo
--     acepta cambios de quien entró al panel con la clave de Andrea.
--   * Idempotencia: cada acción del panel trae un id; la tabla acciones lo guarda y una acción repetida no se aplica dos veces.
--   * La plata no se borra: un movimiento se anula y queda en la bitácora.

-- ── Utilidades ────────────────────────────────────────────────────────────
create or replace function public.slug(t text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(t, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9]+', '-', 'g'))
$$;

-- ── Catálogo ──────────────────────────────────────────────────────────────
create table public.colecciones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  orden int not null default 0,
  creado timestamptz not null default now()
);

create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  descripcion text,
  tipo text not null,
  coleccion_id uuid references public.colecciones(id) on delete set null,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  costo numeric(12,2) check (costo is null or costo >= 0),
  publicada boolean not null default true,
  nuevo boolean not null default false,
  orden int not null default 0,
  squarespace_id text unique,
  url_vieja text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index piezas_coleccion on public.piezas(coleccion_id);

create table public.variantes (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas(id) on delete cascade,
  sku text,
  talla text not null,
  color text,
  existencias int check (existencias is null or existencias >= 0), -- null = sin control de inventario
  unique nulls not distinct (pieza_id, talla, color)
);
create index variantes_pieza on public.variantes(pieza_id);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas(id) on delete cascade,
  url text not null,
  origen text not null check (origen in ('squarespace', 'propia', 'storage')),
  foto_local text unique, -- id de las fotos propias en /public/fotos
  orden int not null default 0,
  mejorada_url text,
  estado text not null default 'original' check (estado in ('original', 'por_revisar', 'aprobada', 'rechazada')),
  creado timestamptz not null default now()
);
create index fotos_pieza on public.fotos(pieza_id);

-- ── Finanzas ──────────────────────────────────────────────────────────────
create table public.ferias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null,
  lugar text,
  creado timestamptz not null default now()
);

create table public.movimientos (
  id uuid primary key, -- el id de la acción del panel: la misma venta no entra dos veces
  sentido text not null check (sentido in ('ingreso', 'gasto')),
  fecha date not null,
  concepto text not null,
  categoria text not null check (categoria in ('Venta en feria', 'Venta directa', 'Venta web', 'Tela', 'Confección (Juanita)', 'Feria', 'Envíos', 'Publicidad', 'Comisiones', 'Otro')),
  metodo text not null check (metodo in ('SINPE', 'Efectivo', 'Datáfono', 'Transferencia', 'ONVO')),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  monto numeric(12,2) not null check (monto > 0),
  tipo_cambio numeric(10,4) check (tipo_cambio is null or tipo_cambio > 0),
  monto_crc numeric(12,2) not null check (monto_crc >= 0),
  feria_id uuid references public.ferias(id) on delete set null,
  pedido_id uuid,
  anulado timestamptz,
  creado timestamptz not null default now(),
  check (moneda = 'CRC' or tipo_cambio is not null)
);
create index movimientos_fecha on public.movimientos(fecha desc);

-- Registro de toda acción confirmada en el panel (y llave de idempotencia).
create table public.acciones (
  id uuid primary key,
  tipo text not null,
  datos jsonb not null,
  creado timestamptz not null default now()
);

-- ── Pedidos y pagos de la web (ONVO) ──────────────────────────────────────
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  llave_idempotencia uuid not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'fallido', 'cancelado', 'reembolsado', 'entregado')),
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_correo text,
  entrega jsonb,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  envio numeric(12,2) not null default 0 check (envio >= 0),
  total numeric(12,2) not null check (total >= 0),
  creado timestamptz not null default now()
);
create table public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  pieza_id uuid references public.piezas(id) on delete set null,
  nombre text not null,
  talla text,
  color text,
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0) -- siempre tomado de la base, nunca del navegador
);
create index pedido_lineas_pedido on public.pedido_lineas(pedido_id);
create index pedido_lineas_pieza on public.pedido_lineas(pieza_id);
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete restrict,
  proveedor text not null check (proveedor in ('onvo')),
  referencia text not null,
  estado text not null check (estado in ('iniciado', 'aprobado', 'rechazado', 'reembolsado')),
  monto numeric(12,2) not null check (monto >= 0),
  creado timestamptz not null default now(),
  unique (proveedor, referencia)
);
create index pagos_pedido on public.pagos(pedido_id);
create index movimientos_feria on public.movimientos(feria_id);
create table public.webhook_eventos (
  proveedor text not null,
  evento_id text not null,
  cuerpo jsonb not null,
  recibido timestamptz not null default now(),
  primary key (proveedor, evento_id)
);

-- ── Bitácora ──────────────────────────────────────────────────────────────
create table public.bitacora (
  id bigint generated always as identity primary key,
  tabla text not null,
  accion text not null,
  fila uuid,
  antes jsonb,
  despues jsonb,
  cuando timestamptz not null default now()
);
create or replace function public.registrar_bitacora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bitacora (tabla, accion, fila, antes, despues)
  values (tg_table_name, tg_op, coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger bit_piezas after update or delete on public.piezas for each row execute function public.registrar_bitacora();
create trigger bit_movimientos after insert or update or delete on public.movimientos for each row execute function public.registrar_bitacora();
create trigger bit_pagos after insert or update on public.pagos for each row execute function public.registrar_bitacora();

-- ── Seguridad: todo cerrado ───────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['colecciones','piezas','variantes','fotos','ferias','movimientos','acciones','pedidos','pedido_lineas','pagos','webhook_eventos','bitacora'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Lo único público: el catálogo publicado ───────────────────────────────
create or replace function public.catalogo_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'nuevo', p.nuevo, 'orden', p.orden,
    'coleccion', c.nombre,
    'variantes', coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'talla', v.talla, 'color', v.color) order by v.talla, v.color)
                           from public.variantes v where v.pieza_id = p.id), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(f.url order by f.orden, f.creado) from public.fotos f where f.pieza_id = p.id), '[]'::jsonb)
  ) order by p.orden, p.creado), '[]'::jsonb)
  from public.piezas p left join public.colecciones c on c.id = p.coleccion_id
  where p.publicada
$$;

-- ── Panel (solo el servidor, con la llave secreta) ────────────────────────
create or replace function public.estado_panel() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'piezas', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'nombre', p.nombre, 'tipo', p.tipo, 'precio', p.precio, 'coleccion', coalesce(c.nombre, ''),
        'oculta', not p.publicada,
        'foto', (select f.url from public.fotos f where f.pieza_id = p.id order by f.orden, f.creado limit 1),
        'fotos', (select count(*) from public.fotos f where f.pieza_id = p.id)
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
  else
    raise exception 'Acción desconocida: %', v_tipo;
  end case;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.catalogo_publico(), public.estado_panel(), public.aplicar_accion(jsonb), public.registrar_bitacora(), public.slug(text) from public, anon, authenticated;
grant execute on function public.catalogo_publico() to anon, authenticated, service_role;
grant execute on function public.estado_panel(), public.aplicar_accion(jsonb), public.slug(text) to service_role;
