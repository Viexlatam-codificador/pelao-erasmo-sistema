// ============================================================================
// El Pelao Erasmo — Función serverless (Vercel) para eliminar un vendedor o
// repartidor por completo (cuenta de acceso + perfil).
//
// Igual que las demás funciones de /api: primero verifica con el token de
// quien llama que es un admin activo, y solo entonces usa la clave secreta
// de Supabase para borrar la cuenta.
//
// Por seguridad de los datos históricos: un vendedor con pedidos asociados
// NO se puede eliminar (se sugiere bloquearlo en vez de borrarlo, para no
// perder el vendedor de esos pedidos). Los repartidores no tienen pedidos
// asociados directamente, así que siempre se pueden eliminar.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFPkaD6iiTKZMlhIufS9-w__4fdlfqo";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Falta la sesión del administrador." });
    return;
  }

  const supaComoUsuario = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userError } = await supaComoUsuario.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    res.status(401).json({ error: "Sesión inválida." });
    return;
  }

  const { data: perfilLlamante, error: perfilError } = await supaComoUsuario
    .from("perfiles")
    .select("rol, activo")
    .eq("id", userData.user.id)
    .single();

  if (perfilError || !perfilLlamante || perfilLlamante.rol !== "admin" || !perfilLlamante.activo) {
    res.status(403).json({ error: "Solo un administrador activo puede eliminar usuarios." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const userId = body.userId;
  if (!userId) {
    res.status(400).json({ error: "Falta el usuario a eliminar." });
    return;
  }

  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);

  const { data: perfilObjetivo, error: buscarError } = await supaAdmin
    .from("perfiles")
    .select("id, rol")
    .eq("id", userId)
    .maybeSingle();

  if (buscarError || !perfilObjetivo) {
    res.status(404).json({ error: "No se encontró ese usuario." });
    return;
  }

  if (perfilObjetivo.rol === "admin") {
    res.status(400).json({ error: "No se puede eliminar una cuenta de administrador desde aquí." });
    return;
  }

  if (perfilObjetivo.rol === "vendedor") {
    const { count, error: countError } = await supaAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("vendedor_id", userId);

    if (countError) {
      res.status(500).json({ error: "No se pudo verificar los pedidos del vendedor: " + countError.message });
      return;
    }
    if (count && count > 0) {
      res.status(409).json({
        error: `Este vendedor tiene ${count} pedido(s) asociados. Para no perder esa historia de ventas, bloquéalo en vez de eliminarlo (interruptor "Activo" en la lista).`
      });
      return;
    }
  }

  const { error: deletePerfilError } = await supaAdmin.from("perfiles").delete().eq("id", userId);
  if (deletePerfilError) {
    res.status(500).json({ error: "No se pudo eliminar el perfil: " + deletePerfilError.message });
    return;
  }

  const { error: deleteAuthError } = await supaAdmin.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    res.status(500).json({ error: "El perfil se eliminó, pero no se pudo borrar la cuenta de acceso: " + deleteAuthError.message });
    return;
  }

  res.status(200).json({ ok: true });
};
