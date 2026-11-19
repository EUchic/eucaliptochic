-- Rehacer una foto de IA que salió con un error: al aprobar la nueva, la de IA anterior se esconde.
-- Y si Andrea quita una foto de IA, la original en que se basó vuelve a la tienda (para que la pieza no quede sin foto).

create or replace function public.ocultar_base_ia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'propuesta' and new.estado = 'aprobada' then
    if new.base is not null then
      update public.fotos set estado = 'rechazada' where id = new.base and coalesce(estado, 'original') <> 'propuesta';
    end if;
    if new.origen = 'ia' then
      update public.fotos set estado = 'rechazada'
       where pieza_id = new.pieza_id and origen = 'ia' and estado = 'aprobada' and id <> new.id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.volver_base_ia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.origen = 'ia' and old.estado = 'aprobada' and old.base is not null
     and not exists (select 1 from public.fotos f where f.pieza_id = old.pieza_id and f.origen = 'ia' and f.estado = 'aprobada' and f.id <> old.id) then
    update public.fotos set estado = 'original' where id = old.base and estado = 'rechazada';
  end if;
  return old;
end $$;
drop trigger if exists fotos_volver_base on public.fotos;
create trigger fotos_volver_base after delete on public.fotos for each row execute function public.volver_base_ia();

-- Las fotos de IA que ya están aprobadas: anotar en cuál original se basaron (la que se escondió).
update public.fotos a set base = b.id
from public.fotos b
where a.origen = 'ia' and a.estado = 'aprobada' and a.base is null
  and b.pieza_id = a.pieza_id and b.origen <> 'ia' and b.estado = 'rechazada';
