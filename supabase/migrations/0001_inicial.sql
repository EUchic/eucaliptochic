-- Eucalipto Chic — esquema inicial (tienda + finanzas)
-- Principios:
--   1. RLS activo en TODAS las tablas. El público solo lee catálogo publicado. Todo lo demás: solo personal.
--   2. Los cobros nunca se confían al navegador: los pedidos y pagos los escribe el servidor (service role)
--      después de verificar la firma del webhook de ONVO.
--   3. Idempotencia: cada operación que mueve plata tiene una llave única, así un doble clic,
--      un reintento de red o un webhook repetido nunca crea un cobro o un registro duplicado.
--   4. Los montos se guardan en colones con 2 decimales; lo que entra en dólares guarda también el tipo de cambio usado.

create extension if not exists pgcrypto;

-- ── Personal ──────────────────────────────────────────────────────────────
create table public.personal (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('duena', 'admin')),
  creado timestamptz not null default now()
);
alter table public.personal enable row level security;

create or replace function public.es_personal() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.personal p where p.user_id = (select auth.uid()));
$$;
revoke all on function public.es_personal() from public, anon;
grant execute on function public.es_personal() to authenticated;

create policy personal_lee on public.personal for select to authenticated using (public.es_personal());

-- ── Catálogo ──────────────────────────────────────────────────────────────
create table public.colecciones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  descripcion text,
  orden int not null default 0,
  visible boolean not null default true,
  creado timestamptz not null default now()
);

create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  descripcion text,
  tipo text not null,                       -- Blusas, Faldas, Vestidos…
  coleccion_id uuid references public.colecciones(id) on delete set null,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  precio_oferta numeric(12,2) check (precio_oferta is null or precio_oferta >= 0),
  costo numeric(12,2) check (costo is null or costo >= 0),  -- tela + confección, para margen
  publicada boolean not null default false,
  squarespace_id text unique,               -- de dónde vino en la migración
  url_vieja text,                           -- para redirigir /tienda/p/jason-necklace-…
  orden int not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index piezas_coleccion on public.piezas(coleccion_id);

create table public.variantes (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas(id) on delete cascade,
  sku text unique,
  talla text not null,
  color text,
  existencias int check (existencias is null or existencias >= 0),  -- null = sin control de inventario
  unique (pieza_id, talla, color)
);
create index variantes_pieza on public.variantes(pieza_id);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas(id) on delete cascade,
  ruta_original text not null,              -- Storage: nunca se borra ni se sobreescribe
  ruta_mejorada text,                       -- resultado de la IA
  estado text not null default 'original' check (estado in ('original', 'en_proceso', 'por_revisar', 'aprobada', 'rechazada')),
  orden int not null default 0,
  origen_url text,
  creado timestamptz not null default now()
);
create index fotos_pieza on public.fotos(pieza_id);

alter table public.colecciones enable row level security;
alter table public.piezas enable row level security;
alter table public.variantes enable row level security;
alter table public.fotos enable row level security;

create policy col_publico on public.colecciones for select to anon, authenticated using (visible or public.es_personal());
create policy col_personal on public.colecciones for all to authenticated using (public.es_personal()) with check (public.es_personal());
create policy pz_publico on public.piezas for select to anon, authenticated using (publicada or public.es_personal());
create policy pz_personal on public.piezas for all to authenticated using (public.es_personal()) with check (public.es_personal());
create policy var_publico on public.variantes for select to anon, authenticated
  using (exists (select 1 from public.piezas p where p.id = pieza_id and (p.publicada or public.es_personal())));
create policy var_personal on public.variantes for all to authenticated using (public.es_personal()) with check (public.es_personal());
create policy fot_publico on public.fotos for select to anon, authenticated
  using (exists (select 1 from public.piezas p where p.id = pieza_id and (p.publicada or public.es_personal())));
create policy fot_personal on public.fotos for all to authenticated using (public.es_personal()) with check (public.es_personal());

-- El costo de cada pieza no debe verse desde la web pública.
-- (Un revoke por columna no basta si la tabla entera está concedida: se quita la tabla y se conceden las columnas.)
revoke select on public.piezas from anon;
grant select (id, slug, nombre, descripcion, tipo, coleccion_id, precio, precio_oferta, publicada, orden, creado, actualizado)
  on public.piezas to anon;

-- ── Pedidos y pagos (solo servidor + personal) ────────────────────────────
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  llave_idempotencia uuid not null unique,  -- la genera el navegador al abrir el checkout
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'fallido', 'cancelado', 'reembolsado', 'entregado')),
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_correo text,
  entrega jsonb,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  iva numeric(12,2) not null default 0 check (iva >= 0),
  envio numeric(12,2) not null default 0 check (envio >= 0),
  total numeric(12,2) not null check (total >= 0),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  canal text not null default 'web' check (canal in ('web', 'whatsapp', 'feria', 'tienda')),
  feria_id uuid,
  creado timestamptz not null default now()
);

create table public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  variante_id uuid references public.variantes(id) on delete set null,
  nombre text not null,                     -- copia: el pedido no cambia si luego se edita la pieza
  talla text,
  color text,
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0)  -- se toma de la base, nunca del navegador
);
create index lineas_pedido on public.pedido_lineas(pedido_id);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete restrict,
  proveedor text not null check (proveedor in ('onvo', 'sinpe', 'efectivo', 'datafono')),
  referencia text,                          -- id del payment intent de ONVO / comprobante SINPE
  estado text not null check (estado in ('iniciado', 'aprobado', 'rechazado', 'reembolsado')),
  monto numeric(12,2) not null check (monto >= 0),
  comision numeric(12,2) not null default 0,
  moneda text not null default 'CRC',
  creado timestamptz not null default now(),
  unique (proveedor, referencia)            -- el mismo cobro no puede registrarse dos veces
);

-- Cada evento de webhook se procesa una sola vez, aunque ONVO lo reenvíe.
create table public.webhook_eventos (
  proveedor text not null,
  evento_id text not null,
  tipo text,
  cuerpo jsonb not null,
  procesado timestamptz,
  recibido timestamptz not null default now(),
  primary key (proveedor, evento_id)
);

alter table public.pedidos enable row level security;
alter table public.pedido_lineas enable row level security;
alter table public.pagos enable row level security;
alter table public.webhook_eventos enable row level security;
create policy ped_personal on public.pedidos for select to authenticated using (public.es_personal());
create policy ped_personal_upd on public.pedidos for update to authenticated using (public.es_personal()) with check (public.es_personal());
create policy lin_personal on public.pedido_lineas for select to authenticated using (public.es_personal());
create policy pag_personal on public.pagos for select to authenticated using (public.es_personal());
-- webhook_eventos: sin políticas → solo el service role.

-- ── Finanzas ──────────────────────────────────────────────────────────────
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                     -- Juanita (confección), tiendas de tela…
  rubro text not null check (rubro in ('confeccion', 'tela', 'feria', 'envios', 'publicidad', 'otro')),
  telefono text,
  notas text,
  creado timestamptz not null default now()
);

create table public.ferias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  lugar text,
  inicia date not null,
  termina date not null check (termina >= inicia),
  notas text,
  creado timestamptz not null default now()
);
alter table public.pedidos add constraint pedidos_feria foreign key (feria_id) references public.ferias(id) on delete set null;

create table public.tipos_cambio (
  fecha date primary key,
  compra numeric(10,4) not null check (compra > 0),
  venta numeric(10,4) not null check (venta > 0),
  fuente text not null default 'hacienda',
  consultado timestamptz not null default now()
);

create table public.dictados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  texto text not null,                      -- lo que Andrea dijo
  propuesta jsonb,                          -- lo que la IA entendió; no se guarda nada hasta que ella confirme
  estado text not null default 'por_confirmar' check (estado in ('por_confirmar', 'confirmado', 'descartado')),
  creado timestamptz not null default now()
);

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  llave_idempotencia uuid not null unique,  -- evita duplicados por doble toque o mala señal en la feria
  sentido text not null check (sentido in ('ingreso', 'gasto')),
  fecha date not null default current_date,
  concepto text not null,
  categoria text not null check (categoria in (
    'venta_web', 'venta_feria', 'venta_directa',
    'tela', 'confeccion', 'feria', 'envios', 'publicidad', 'comisiones', 'servicios', 'otro')),
  metodo text not null check (metodo in ('sinpe', 'efectivo', 'datafono', 'onvo', 'transferencia')),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  monto numeric(12,2) not null check (monto > 0),           -- en la moneda original, IVA incluido
  tipo_cambio numeric(10,4),                                -- obligatorio si es USD
  monto_crc numeric(12,2) not null check (monto_crc > 0),
  iva_tasa numeric(5,2) not null default 0 check (iva_tasa in (0, 1, 2, 4, 13)),
  iva_monto numeric(12,2) not null default 0 check (iva_monto >= 0),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  feria_id uuid references public.ferias(id) on delete set null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  pago_id uuid references public.pagos(id) on delete set null,
  dictado_id uuid references public.dictados(id) on delete set null,
  comprobante text,                         -- ruta en Storage (foto del SINPE o de la factura)
  anulado timestamptz,                      -- no se borra: se anula y queda el rastro
  creado_por uuid references auth.users(id),
  creado timestamptz not null default now(),
  check (moneda = 'CRC' or tipo_cambio is not null)
);
create index mov_fecha on public.movimientos(fecha desc);
create index mov_feria on public.movimientos(feria_id);
create index mov_proveedor on public.movimientos(proveedor_id);

create table public.bitacora (
  id bigint generated always as identity primary key,
  user_id uuid,
  accion text not null,
  tabla text not null,
  fila uuid,
  antes jsonb,
  despues jsonb,
  cuando timestamptz not null default now()
);

alter table public.proveedores enable row level security;
alter table public.ferias enable row level security;
alter table public.tipos_cambio enable row level security;
alter table public.dictados enable row level security;
alter table public.movimientos enable row level security;
alter table public.bitacora enable row level security;

create policy prov_personal on public.proveedores for all to authenticated using (public.es_personal()) with check (public.es_personal());
create policy fer_personal on public.ferias for all to authenticated using (public.es_personal()) with check (public.es_personal());
create policy tc_personal on public.tipos_cambio for select to authenticated using (public.es_personal());
create policy dic_personal on public.dictados for all to authenticated using (public.es_personal()) with check (public.es_personal() and user_id = (select auth.uid()));
create policy mov_lee on public.movimientos for select to authenticated using (public.es_personal());
create policy mov_crea on public.movimientos for insert to authenticated with check (public.es_personal() and creado_por = (select auth.uid()));
create policy mov_anula on public.movimientos for update to authenticated using (public.es_personal()) with check (public.es_personal());
-- Sin política de delete en movimientos: los registros de plata no se borran, se anulan.
create policy bit_lee on public.bitacora for select to authenticated using (public.es_personal());

-- Bitácora automática de todo cambio en plata y precios.
create or replace function public.registrar_bitacora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bitacora (user_id, accion, tabla, fila, antes, despues)
  values ((select auth.uid()), tg_op, tg_table_name, coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke all on function public.registrar_bitacora() from public, anon, authenticated;

create trigger bit_movimientos after insert or update or delete on public.movimientos for each row execute function public.registrar_bitacora();
create trigger bit_piezas after update or delete on public.piezas for each row execute function public.registrar_bitacora();
create trigger bit_pagos after insert or update on public.pagos for each row execute function public.registrar_bitacora();
create trigger bit_pedidos after update on public.pedidos for each row execute function public.registrar_bitacora();
