-- Promociones de posts de Instagram (Meta) que Andrea lanza desde el panel, y ajustes simples (tope mensual).
-- Solo el servidor (llave secreta) lee y escribe. Ninguna promoción se crea sin la confirmación de Andrea en el panel.

alter table public.movimientos drop constraint if exists movimientos_metodo_check;
alter table public.movimientos add constraint movimientos_metodo_check check (metodo in ('SINPE', 'Efectivo', 'Datáfono', 'Transferencia', 'ONVO', 'Tarjeta'));

create table public.promociones (
  id uuid primary key,                       -- id que manda el panel: el mismo toque no crea dos promociones
  media_id text not null,
  permalink text,
  caption text,
  miniatura text,
  por_dia int not null check (por_dia between 500 and 50000),
  dias int not null check (dias between 1 and 30),
  total int not null check (total > 0),       -- colones antes del IVA; Meta nunca gasta más que esto
  inicio timestamptz not null,
  fin timestamptz not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  estado text not null default 'creando' check (estado in ('creando', 'activa', 'detenida', 'terminada', 'error')),
  error text,
  gastado numeric(12,2) not null default 0,
  gasto_registrado boolean not null default false,
  creado timestamptz not null default now(),
  check (fin > inicio)
);

create table public.ajustes (
  clave text primary key,
  valor jsonb not null,
  actualizado timestamptz not null default now()
);

alter table public.promociones enable row level security;
alter table public.ajustes enable row level security;
revoke all on public.promociones, public.ajustes from anon, authenticated;
create trigger bit_promociones after insert or update on public.promociones for each row execute function public.registrar_bitacora();
