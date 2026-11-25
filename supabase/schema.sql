-- Esquema de sincronización para Control de Préstamos.
-- Ejecutar UNA vez en Supabase: Dashboard > SQL Editor > New query > pegar todo > Run.

create table if not exists public.registros (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coleccion   text not null check (coleccion in ('personas','cuentas','prestamos','abonos','envios','ajustes')),
  data        jsonb not null,
  updated_at  timestamptz not null,           -- hora del cambio en el dispositivo (resuelve conflictos)
  deleted     boolean not null default false, -- borrado lógico (se propaga a todos los dispositivos)
  synced_at   timestamptz not null default now() -- hora del servidor (cursor de descarga)
);

create index if not exists registros_user_synced_idx on public.registros (user_id, synced_at);

-- El servidor fija synced_at en cada escritura (evita problemas por relojes desfasados)
create or replace function public.registros_set_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if; -- el dueño no se puede cambiar
  return new;
end $$;

drop trigger if exists trg_registros_synced on public.registros;
create trigger trg_registros_synced before insert or update on public.registros
for each row execute function public.registros_set_synced_at();

-- Seguridad a nivel de fila: cada usuario solo ve y modifica sus propios registros
alter table public.registros enable row level security;

drop policy if exists "leer propios" on public.registros;
drop policy if exists "insertar propios" on public.registros;
drop policy if exists "actualizar propios" on public.registros;

create policy "leer propios" on public.registros
  for select to authenticated using (user_id = auth.uid());
create policy "insertar propios" on public.registros
  for insert to authenticated with check (user_id = auth.uid());
create policy "actualizar propios" on public.registros
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No hay política de DELETE a propósito: los borrados son lógicos (deleted = true).

revoke all on public.registros from anon;
grant select, insert, update on public.registros to authenticated;
