-- ============================================================================
-- El Pelao Erasmo — Vendedor puede reactivar sus propios pedidos anulados
--
-- Hoy solo el admin puede pasar un pedido anulado de vuelta a "pendiente"
-- (porque la política de permisos de la tabla pedidos no deja que un
-- vendedor edite un pedido que está en estado "anulado" — a propósito, para
-- que un vendedor no pueda cambiar cualquier cosa en cualquier pedido). Este
-- script agrega una función específica y acotada: el vendedor SOLO puede
-- reactivar (volver a "pendiente") un pedido que sea suyo y que esté
-- anulado — nada más. Deja registro en el historial de quién lo reactivó.
--
-- Ejecutar este script completo en el SQL Editor de Supabase.
-- ============================================================================

create or replace function public.vendedor_reactivar_pedido_anulado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_estado text;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado';
  end if;

  select vendedor_id, estado into v_vendedor_id, v_estado
  from public.pedidos where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado <> 'anulado' then
    raise exception 'Este pedido no está anulado (está en estado %)', v_estado;
  end if;

  if not public.es_admin() and (v_vendedor_id is null or v_vendedor_id <> auth.uid()) then
    raise exception 'No puedes reactivar un pedido que no es tuyo';
  end if;

  update public.pedidos set estado = 'pendiente' where id = p_pedido_id;

  insert into public.historial (pedido_id, usuario_id, accion, detalle)
  values (p_pedido_id, auth.uid(), 'reactivado', jsonb_build_object('estado_anterior', 'anulado', 'estado_nuevo', 'pendiente'));
end;
$$;

grant execute on function public.vendedor_reactivar_pedido_anulado(uuid) to authenticated;
