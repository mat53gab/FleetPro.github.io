-- FleetPro Supabase RLS and Schema Setup
-- Copy and paste all commands in Supabase SQL Editor

-- ============================================
-- 1) TABLA DE PERFILES
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  email text
);

-- IMPORTANTE: No habilitar RLS aún (evita recursión infinita)

-- Función que crea un perfil por defecto cuando se crea un usuario
create or replace function public.create_default_profile()
returns trigger as $$
begin
  insert into public.profiles (id, role, email)
  values (new.id, 'user', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger en auth.users
drop trigger if exists create_default_profile_trigger on auth.users;
create trigger create_default_profile_trigger
after insert on auth.users
for each row
execute function public.create_default_profile();

-- Políticas para profiles
drop policy if exists "Profiles: user puede ver su propio perfil" on public.profiles;
drop policy if exists "Profiles: admin puede ver todos los perfiles" on public.profiles;
drop policy if exists "Profiles: usuario puede crear su propio perfil" on public.profiles;

create policy "Profiles: user puede ver su propio perfil" on public.profiles
for select
using (auth.uid() = id);

create policy "Profiles: admin puede ver todos los perfiles" on public.profiles
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Profiles: usuario puede crear su propio perfil" on public.profiles
for insert
with check (
  auth.uid() = id
  and role = 'user'
);

-- Ahora habilitamos RLS en profiles
alter table public.profiles enable row level security;

-- ============================================
-- 2) TABLA DE ESTADO GLOBAL (BLOQUEO)
-- ============================================
create table if not exists public.app_state (
  key text primary key,
  value text not null
);

-- IMPORTANTE: No habilitar RLS aún (evita recursión infinita)

drop policy if exists "App state: solo auth puede leer" on public.app_state;
drop policy if exists "App state: solo admin puede insertar" on public.app_state;
drop policy if exists "App state: solo admin puede actualizar" on public.app_state;
drop policy if exists "App state: solo admin puede borrar" on public.app_state;

create policy "App state: solo auth puede leer" on public.app_state
for select
using (auth.role() = 'authenticated');

create policy "App state: solo admin puede insertar" on public.app_state
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "App state: solo admin puede actualizar" on public.app_state
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "App state: solo admin puede borrar" on public.app_state
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

insert into public.app_state (key, value)
values ('lock', 'false')
on conflict (key) do nothing;

-- Ahora habilitamos RLS en app_state
alter table public.app_state enable row level security;

-- ============================================
-- 3) TABLAS DE DATOS (VEHICLES, MAINTENANCES, INSURANCES)
-- ============================================

-- Agregar columna user_email si no existe
alter table public.vehicles add column if not exists user_email text;
alter table public.maintenances add column if not exists user_email text;
alter table public.insurances add column if not exists user_email text;

-- Habilitar RLS
alter table public.vehicles enable row level security;
alter table public.maintenances enable row level security;
alter table public.insurances enable row level security;

-- ============================================
-- 4) POLÍTICAS PARA VEHICLES
-- ============================================
drop policy if exists "Select own or manager/admin" on public.vehicles;
drop policy if exists "Insert own or manager/admin" on public.vehicles;
drop policy if exists "Update own or manager/admin" on public.vehicles;
drop policy if exists "Delete own or manager/admin" on public.vehicles;

create policy "Select own or manager/admin" on public.vehicles
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Insert own or manager/admin" on public.vehicles
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Update own or manager/admin" on public.vehicles
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Delete own or manager/admin" on public.vehicles
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

-- ============================================
-- 5) POLÍTICAS PARA MAINTENANCES
-- ============================================
drop policy if exists "Select own or manager/admin" on public.maintenances;
drop policy if exists "Insert own or manager/admin" on public.maintenances;
drop policy if exists "Update own or manager/admin" on public.maintenances;
drop policy if exists "Delete own or manager/admin" on public.maintenances;

create policy "Select own or manager/admin" on public.maintenances
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Insert own or manager/admin" on public.maintenances
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Update own or manager/admin" on public.maintenances
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Delete own or manager/admin" on public.maintenances
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

-- ============================================
-- 6) POLÍTICAS PARA INSURANCES
-- ============================================
drop policy if exists "Select own or manager/admin" on public.insurances;
drop policy if exists "Insert own or manager/admin" on public.insurances;
drop policy if exists "Update own or manager/admin" on public.insurances;
drop policy if exists "Delete own or manager/admin" on public.insurances;

create policy "Select own or manager/admin" on public.insurances
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Insert own or manager/admin" on public.insurances
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Update own or manager/admin" on public.insurances
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

create policy "Delete own or manager/admin" on public.insurances
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('manager','admin')
  )
);

-- ============================================
-- 7) ASIGNAR ROLES ADMIN Y MANAGER
-- ============================================
insert into public.profiles (id, role)
select id, 'admin'
from auth.users
where email = 'admin@fleetpro.local'
on conflict (id) do update set role = 'admin';

insert into public.profiles (id, role)
select id, 'manager'
from auth.users
where email = 'gerente@fleetpro.local'
on conflict (id) do update set role = 'manager';

-- ============================================
-- 8) VERIFICACIÓN (COPY/PASTE ESTOS SELECT)
-- ============================================
-- select id, email, raw_user_meta_data, created_at, confirmed_at
-- from auth.users
-- order by created_at desc;

-- select id, role
-- from public.profiles
-- order by role, id;
