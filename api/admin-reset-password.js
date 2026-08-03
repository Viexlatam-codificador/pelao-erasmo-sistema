// ============================================================================
// El Pelao Erasmo — Función serverless (Vercel) para restablecer contraseñas
//
// Igual que api/admin-users.js: verifica primero que quien llama es un admin
// activo (con su propio token), y solo entonces usa la clave secreta de
// Supabase para cambiar la contraseña de otra cuenta. Nunca guarda ni
// registra la contraseña en ningún lado — solo la pasa a Supabase.
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
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Sesión inválida." });
    return;
  }

  const { data: perfilLlamante, error: perfilError } = await supaComoUsuario
    .from("perfiles")
    .select("rol, activo")
    .eq("id", userData.user.id)
    .single();

  if (perfilError || !perfilLlamante || perfilLlamante.rol !== "admin" || !perfilLlamante.activo) {
    res.status(403).json({ error: "Solo un administrador activo puede restablecer contraseñas." });
    return;
  }

  const { userId, nuevaPassword } = req.body || {};

  if (!userId || !nuevaPassword) {
    res.status(400).json({ error: "Falta el usuario o la nueva contraseña." });
    return;
  }
  if (nuevaPassword.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);

  const { error: updateError } = await supaAdmin.auth.admin.updateUserById(userId, {
    password: nuevaPassword
  });

  if (updateError) {
    res.status(400).json({ error: "No se pudo restablecer la contraseña: " + updateError.message });
    return;
  }

  res.status(200).json({ ok: true });
};
