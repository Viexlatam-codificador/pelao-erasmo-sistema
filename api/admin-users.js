// ============================================================================
// El Pelao Erasmo — Función serverless (Vercel) para crear usuarios vendedores
//
// Necesita crear cuentas en auth.users, lo que requiere la clave "secreta"
// (service role) de Supabase. Esa clave NUNCA vive en este archivo ni en
// ningún archivo del repo: se lee desde la variable de entorno
// SUPABASE_SERVICE_ROLE_KEY, configurada solo en el dashboard de Vercel.
//
// Antes de crear el usuario, esta función verifica con el token del que
// llama que efectivamente es un admin activo — si no, rechaza la solicitud.
// Así el endpoint no puede usarse para crear cuentas sin autorización aunque
// alguien conozca la URL.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFPkaD6iiTKZMlhIufS9-w__4fdlfqo";
const DOMINIO_INTERNO = "pelaoerasmo.internal";

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

  // Cliente "como el usuario que llama" (con su token), solo para verificar quién es.
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
    res.status(403).json({ error: "Solo un administrador activo puede crear usuarios." });
    return;
  }

  const { username, nombre_completo, password, rol } = req.body || {};

  if (!username || !nombre_completo || !password) {
    res.status(400).json({ error: "Faltan datos: usuario, nombre completo o contraseña." });
    return;
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    res.status(400).json({ error: "El usuario solo puede tener letras minúsculas, números, puntos, guiones y guion bajo." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const rolFinal = rol === "admin" ? "admin" : "vendedor";
  const email = `${username}@${DOMINIO_INTERNO}`;

  // Cliente con la clave secreta: puede crear usuarios y saltarse RLS.
  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);

  const { data: nuevoUsuario, error: createError } = await supaAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError) {
    res.status(400).json({ error: "No se pudo crear el usuario: " + createError.message });
    return;
  }

  const { error: perfilInsertError } = await supaAdmin.from("perfiles").insert({
    id: nuevoUsuario.user.id,
    username,
    nombre_completo,
    rol: rolFinal,
    activo: true
  });

  if (perfilInsertError) {
    // El usuario de auth ya se creó pero no su perfil: lo deshacemos para no dejar cuentas huérfanas.
    await supaAdmin.auth.admin.deleteUser(nuevoUsuario.user.id);
    res.status(400).json({ error: "No se pudo crear el perfil: " + perfilInsertError.message });
    return;
  }

  res.status(200).json({ ok: true, id: nuevoUsuario.user.id });
};
