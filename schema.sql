-- ============================================================================
-- El Pelao Erasmo — Sistema de Gestión de Pedidos y Rutas
-- Esquema de base de datos para Supabase (Postgres)
--
-- CÓMO USAR: copia y pega TODO este archivo en Supabase → SQL Editor → Run.
-- Se puede ejecutar una sola vez sobre un proyecto nuevo.
-- ============================================================================

-- Extensión para generar UUIDs
create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- unaccent(text) de un solo argumento depende del search_path (no es IMMUTABLE),
-- por lo que no se puede usar directo en columnas generadas ni en índices.
-- Este wrapper fija el diccionario explícitamente y sí es IMMUTABLE.
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select unaccent('unaccent', $1)
$$;

-- ============================================================================
-- 1. PERFILES (uno por cada usuario de auth.users, con su rol)
-- ============================================================================
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nombre_completo text not null,
  rol text not null check (rol in ('admin','vendedor')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is 'Un perfil por usuario de auth.users. El login real (usuario/contraseña) vive en auth.users; username se mapea a un email interno tipo usuario@pelaoerasmo.internal.';

-- Función auxiliar: ¿el usuario autenticado es admin? (security definer para evitar recursión en RLS)
create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo = true
  );
$$;

-- Función auxiliar: ¿el usuario autenticado está activo? (para bloquear usuarios sin borrar su cuenta)
create or replace function public.usuario_activo()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select activo from public.perfiles where id = auth.uid()), false);
$$;

alter table public.perfiles enable row level security;

create policy "perfiles_select_propio_o_admin"
  on public.perfiles for select
  using (id = auth.uid() or public.es_admin());

create policy "perfiles_update_admin"
  on public.perfiles for update
  using (public.es_admin());

-- Los perfiles se crean únicamente vía función administrativa (service role), no por el cliente.
create policy "perfiles_insert_admin"
  on public.perfiles for insert
  with check (public.es_admin());

-- ============================================================================
-- 2. COMUNAS → DÍA DE REPARTO
-- ============================================================================
create table public.comunas_rutas (
  id uuid primary key default gen_random_uuid(),
  comuna text not null unique,
  comuna_normalizada text generated always as (f_unaccent(lower(trim(comuna)))) stored,
  region text not null default 'Región Metropolitana',
  dia_reparto text check (dia_reparto in ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')),
  precio_despacho integer not null default 0 check (precio_despacho >= 0),
  activa boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create unique index comunas_rutas_normalizada_idx on public.comunas_rutas (comuna_normalizada);

alter table public.comunas_rutas enable row level security;

create policy "comunas_rutas_select_autenticados"
  on public.comunas_rutas for select
  to authenticated
  using (true);

create policy "comunas_rutas_admin_todo"
  on public.comunas_rutas for all
  using (public.es_admin())
  with check (public.es_admin());

-- Semilla inicial de comunas según configuración entregada por el cliente
insert into public.comunas_rutas (comuna, region, dia_reparto) values
  ('Colina', 'Región Metropolitana', 'lunes'),
  ('Lampa', 'Región Metropolitana', 'lunes'),
  ('Huechuraba', 'Región Metropolitana', 'lunes'),
  ('Quilicura', 'Región Metropolitana', 'lunes'),
  ('Conchalí', 'Región Metropolitana', 'lunes'),
  ('Renca', 'Región Metropolitana', 'lunes'),
  ('Maipú', 'Región Metropolitana', 'martes'),
  ('Pudahuel', 'Región Metropolitana', 'martes'),
  ('Cerrillos', 'Región Metropolitana', 'martes'),
  ('Cerro Navia', 'Región Metropolitana', 'martes'),
  ('Lo Prado', 'Región Metropolitana', 'martes'),
  ('Quinta Normal', 'Región Metropolitana', 'martes'),
  ('Estación Central', 'Región Metropolitana', 'martes'),
  ('San Bernardo', 'Región Metropolitana', 'miercoles'),
  ('El Bosque', 'Región Metropolitana', 'miercoles'),
  ('San Ramón', 'Región Metropolitana', 'miercoles'),
  ('La Cisterna', 'Región Metropolitana', 'miercoles'),
  ('Lo Espejo', 'Región Metropolitana', 'miercoles'),
  ('Pedro Aguirre Cerda', 'Región Metropolitana', 'miercoles'),
  ('San Joaquín', 'Región Metropolitana', 'miercoles'),
  ('San Miguel', 'Región Metropolitana', 'miercoles'),
  ('La Granja', 'Región Metropolitana', 'miercoles'),
  ('Providencia', 'Región Metropolitana', 'jueves'),
  ('Las Condes', 'Región Metropolitana', 'jueves'),
  ('Vitacura', 'Región Metropolitana', 'jueves'),
  ('Lo Barnechea', 'Región Metropolitana', 'jueves'),
  ('Ñuñoa', 'Región Metropolitana', 'jueves'),
  ('Macul', 'Región Metropolitana', 'jueves'),
  ('La Reina', 'Región Metropolitana', 'jueves'),
  ('Peñalolén', 'Región Metropolitana', 'jueves'),
  ('La Florida', 'Región Metropolitana', 'jueves'),
  ('Valparaíso', 'V Región', 'viernes'),
  ('Viña del Mar', 'V Región', 'viernes'),
  ('Concón', 'V Región', 'viernes'),
  ('Quilpué', 'V Región', 'viernes'),
  ('Villa Alemana', 'V Región', 'viernes'),
  ('Limache', 'V Región', 'viernes'),
  ('Casablanca', 'V Región', 'viernes'),
  ('Quillota', 'V Región', 'viernes');

-- ============================================================================
-- 3. PEDIDOS
-- ============================================================================
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  nombre_cliente text not null,
  telefono text not null,
  direccion text not null,
  numero text not null,
  departamento text,
  comuna text not null,
  comuna_normalizada text generated always as (f_unaccent(lower(trim(comuna)))) stored,
  region text not null default 'Región Metropolitana',
  cantidad_pipeno integer not null default 0,
  precio_unitario_pipeno integer not null default 0,
  cantidad_granadina integer not null default 0,
  detalle_productos jsonb not null default '[]'::jsonb,
  observaciones text,
  forma_pago text not null default 'Contra entrega',
  total integer not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','preparacion','listo_despacho','en_ruta','entregado','anulado')),
  dia_reparto text,
  dia_reparto_manual boolean not null default false,
  vendedor_id uuid not null references public.perfiles(id),
  creado_por uuid not null references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cantidades_no_negativas check (cantidad_pipeno >= 0 and cantidad_granadina >= 0),
  constraint total_no_negativo check (total >= 0)
);

create index pedidos_vendedor_idx on public.pedidos (vendedor_id);
create index pedidos_dia_reparto_idx on public.pedidos (dia_reparto, fecha);
create index pedidos_estado_idx on public.pedidos (estado);
create index pedidos_comuna_idx on public.pedidos (comuna_normalizada);

-- Asigna automáticamente el día de reparto según la comuna (o 'sin_asignar').
-- Si dia_reparto_manual = true, el admin fijó el día a mano (caso especial,
-- por ejemplo una entrega en fin de semana) y este trigger no lo toca.
create or replace function public.asignar_dia_reparto()
returns trigger
language plpgsql
as $$
begin
  if new.dia_reparto_manual then
    new.actualizado_en := now();
    return new;
  end if;

  select cr.dia_reparto into new.dia_reparto
  from public.comunas_rutas cr
  where cr.comuna_normalizada = public.f_unaccent(lower(trim(new.comuna)))
    and cr.activa = true;

  if new.dia_reparto is null then
    new.dia_reparto := 'sin_asignar';
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

create trigger trg_asignar_dia_reparto
  before insert or update of comuna on public.pedidos
  for each row execute function public.asignar_dia_reparto();

alter table public.pedidos enable row level security;

create policy "pedidos_select_propio_o_admin"
  on public.pedidos for select
  using (public.usuario_activo() and (vendedor_id = auth.uid() or public.es_admin()));

create policy "pedidos_insert_propio_o_admin"
  on public.pedidos for insert
  with check (
    public.usuario_activo()
    and (public.es_admin() or vendedor_id = auth.uid())
  );

-- Un vendedor solo puede editar SUS pedidos y solo antes de que estén listos para despacho.
-- El admin puede editar cualquier pedido en cualquier estado.
create policy "pedidos_update_propio_antes_despacho_o_admin"
  on public.pedidos for update
  using (
    public.usuario_activo()
    and (
      public.es_admin()
      or (vendedor_id = auth.uid() and estado in ('pendiente','preparacion'))
    )
  )
  with check (
    public.es_admin()
    or (vendedor_id = auth.uid() and estado in ('pendiente','preparacion'))
  );

create policy "pedidos_delete_admin"
  on public.pedidos for delete
  using (public.es_admin());

-- ============================================================================
-- 4. HISTORIAL (auditoría — nunca se borra ni se edita)
-- ============================================================================
create table public.historial (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  usuario_id uuid references public.perfiles(id),
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index historial_pedido_idx on public.historial (pedido_id, creado_en);

alter table public.historial enable row level security;

create policy "historial_select_propio_o_admin"
  on public.historial for select
  using (
    public.es_admin()
    or exists (
      select 1 from public.pedidos p
      where p.id = historial.pedido_id and p.vendedor_id = auth.uid()
    )
  );

-- Solo se inserta vía triggers (security definer), nunca directo desde el cliente.
create policy "historial_insert_sistema"
  on public.historial for insert
  with check (false);

-- Nota: no existen políticas de UPDATE ni DELETE para 'historial' → quedan
-- implícitamente denegadas para todos los roles (RLS deniega por defecto).

-- Registra automáticamente cada creación / cambio de estado / edición de un pedido
create or replace function public.registrar_historial_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.historial (pedido_id, usuario_id, accion, detalle)
    values (new.id, auth.uid(), 'creado', jsonb_build_object('estado', new.estado, 'dia_reparto', new.dia_reparto));
  elsif (tg_op = 'UPDATE') then
    insert into public.historial (pedido_id, usuario_id, accion, detalle)
    values (
      new.id, auth.uid(), 'modificado',
      jsonb_build_object(
        'estado_anterior', old.estado, 'estado_nuevo', new.estado,
        'dia_reparto_anterior', old.dia_reparto, 'dia_reparto_nuevo', new.dia_reparto
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_historial_pedido
  after insert or update on public.pedidos
  for each row execute function public.registrar_historial_pedido();

-- ============================================================================
-- 5. CONFIGURACIONES (parámetros generales editables por el admin)
-- ============================================================================
create table public.configuraciones (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);

alter table public.configuraciones enable row level security;

create policy "configuraciones_select_autenticados"
  on public.configuraciones for select
  to authenticated
  using (true);

create policy "configuraciones_admin_todo"
  on public.configuraciones for all
  using (public.es_admin())
  with check (public.es_admin());

insert into public.configuraciones (clave, valor) values
  ('whatsapp_pedidos', '"56957248108"'),
  ('despacho_referencial_rm', '3000'),
  ('precio_granadina', '22000'),
  ('pricing_tiers', '{"rm":{"min":12,"tiers":[{"min":12,"max":19,"price":3800},{"min":20,"max":39,"price":3700},{"min":40,"max":null,"price":3600}]},"vr":{"min":20,"tiers":[{"min":20,"max":29,"price":3900},{"min":30,"max":39,"price":3800},{"min":40,"max":null,"price":3600}]}}');

-- ============================================================================
-- 6. PERMISOS BASE (necesarios para que RLS pueda aplicarse)
--
-- RLS restringe QUÉ FILAS puede ver/editar cada rol, pero primero el rol
-- necesita el permiso base de Postgres para intentar la operación. En
-- proyectos nuevos de Supabase esto normalmente ya viene configurado por
-- defecto para 'anon'/'authenticated', pero si no es el caso, sin este
-- bloque el cliente del navegador (que usa la clave publicable = rol
-- 'anon' antes de loguearse, 'authenticated' después) recibe "permission
-- denied" aunque las políticas de RLS estén bien.
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.perfiles to anon, authenticated, service_role;
grant select, insert, update, delete on public.pedidos to anon, authenticated, service_role;
grant select, insert, update, delete on public.comunas_rutas to anon, authenticated, service_role;
grant select, insert, update, delete on public.historial to anon, authenticated, service_role;
grant select, insert, update, delete on public.configuraciones to anon, authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- ============================================================================
-- Fin del esquema
-- ============================================================================
