-- ============================================================================
-- El Pelao Erasmo — Migración v4
--
-- CÓMO USAR: copia y pega TODO este archivo en Supabase → SQL Editor → Run.
-- Requiere haber corrido antes, en orden: schema.sql, luego
-- schema_v2_actualizacion.sql, luego schema_v3_productos_banner.sql.
-- Se puede correr una sola vez.
--
-- Qué agrega:
--   1) Tabla "dias_especiales_reparto": excepciones puntuales por fecha (ej.
--      "el jueves 14 sí se reparte en Providencia aunque no sea su día
--      habitual", o un día especial para todas las comunas a la vez). Se
--      usa para avisarle al cliente en la landing y para que "Generar ruta"
--      en el admin incluya esos pedidos aunque su día habitual sea otro.
--   2) No hace falta ninguna tabla nueva para las imágenes editables (hero,
--      flyers) ni para el banner de delivery de 7 días — ambas cosas
--      reutilizan la tabla "configuraciones" que ya existe desde
--      schema.sql, con sus mismas políticas de lectura pública (anon) y
--      escritura solo-admin ya creadas en schema.sql/schema_v3. Solo se
--      documentan acá las claves nuevas que usa: "imagenes_landing".
-- ============================================================================

-- ============================================================================
-- 1. DÍAS ESPECIALES DE REPARTO
-- ============================================================================
create table public.dias_especiales_reparto (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  -- null = aplica a TODAS las comunas ese día; si no, aplica solo a esa comuna.
  comuna text,
  comuna_normalizada text generated always as (
    case when comuna is null then null else public.f_unaccent(lower(trim(comuna))) end
  ) stored,
  nota text,
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint dias_especiales_nota_no_vacia check (nota is null or length(trim(nota)) > 0)
);

create index dias_especiales_fecha_idx on public.dias_especiales_reparto (fecha);
create index dias_especiales_comuna_idx on public.dias_especiales_reparto (comuna_normalizada);

alter table public.dias_especiales_reparto enable row level security;

-- Lectura pública (sin login), igual que comunas_rutas y configuraciones —
-- así la landing le puede avisar al cliente de días especiales próximos.
create policy "dias_especiales_select_publico"
  on public.dias_especiales_reparto for select
  using (true);

grant select on public.dias_especiales_reparto to anon;
grant select, insert, update, delete on public.dias_especiales_reparto to authenticated;

-- Solo el admin puede crear/editar/eliminar días especiales.
create policy "dias_especiales_admin_todo"
  on public.dias_especiales_reparto for insert
  with check (public.es_admin());

create policy "dias_especiales_admin_update"
  on public.dias_especiales_reparto for update
  using (public.es_admin())
  with check (public.es_admin());

create policy "dias_especiales_admin_delete"
  on public.dias_especiales_reparto for delete
  using (public.es_admin());

comment on table public.dias_especiales_reparto is 'Excepciones puntuales de reparto por fecha exacta (ej. reparto especial un feriado, o en una comuna fuera de su día habitual). No reemplaza el día habitual de comunas_rutas, se suma para esa fecha puntual.';

-- ============================================================================
-- 2. IMÁGENES EDITABLES DE LA LANDING (reutiliza "configuraciones")
-- ============================================================================
-- Clave "imagenes_landing" en public.configuraciones, con esta forma:
--   {
--     "hero_base64": "data:image/jpeg;base64,..." | null,   -- foto principal (portada)
--     "flyer_rm_base64": "data:image/...;base64,..." | null, -- flyer de precios Región Metropolitana
--     "flyer_vr_base64": "data:image/...;base64,..." | null, -- flyer de precios V Región
--     "actualizado_en": "2026-08-10T12:00:00.000Z"
--   }
-- Un valor null (o la clave sin crear todavía) significa "usar la imagen de
-- respaldo que ya viene incluida en la página" — así nunca se rompe aunque
-- el admin no haya subido nada nuevavía. La landing intenta cargar esta
-- clave al abrir y, si existe y trae una imagen, la reemplaza; si falla o
-- no existe, sigue mostrando la imagen de siempre. No requiere una fila
-- sembrada de antemano (el admin.html la crea/actualiza con upsert la
-- primera vez que se guarda algo desde "Imágenes de la página principal").
