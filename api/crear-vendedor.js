// ============================================================================
// El Pelao Erasmo — Función serverless (Vercel): crear vendedor nuevo
//
// Se ejecuta en el servidor, nunca en el navegador, porque necesita la
// clave SECRETA de Supabase (service role) para poder crear usuarios de
// autenticación. Esa clave NUNCA debe estar en admin.html ni en ningún
// archivo del repositorio — se configura como variable de entorno en Vercel.
//
// Variables de entorno requeridas en Vercel (Project Settings -> Environment
// Variables), ver PROYECTO_ESTADO.md para la guía paso a paso:
//   SUPABASE_URL                -> misma URL pública del proyecto
//   SUPABASE_SERVICE_ROLE_KEY   -> clave secreta (empieza con "sb_secret_...")
//
// Seguridad: esta función SIEMPRE verifica, contra la base de datos (no
// contra lo que diga el navegador), que quien llama es un admin activo,
// usando el token de sesión que manda el navegador en el header
// Authorization. Si algo fuera de eso falla, no se crea nada.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

const DOMINIO_INTERNO = "pelaoerasmo.internal";

function emailDesdeUsuario(username) {
  return `${(username || "").trim().toLowerCase()}@${DOMINIO_INTERNO}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || "https://kbrnecuueekypztyopua.supabase.co";
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "El servidor no tiene configurada la clave de administración (SUPABASE_SERVICE_ROLE_KEY). Revisa las variables de entorno en Vercel." });
    return;
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Falta autenticación." });
    return;
  }

  const supaAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1) Verificar que el token corresponda a un usuario real.
  const { data: userData, error: userError } = await supaAdmin.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    res.status(401).json({ error: "Tu sesión no es válida o expiró. Vuelve a iniciar sesión." });
    return;
  }

  // 2) Verificar, contra la tabla perfiles (nunca confiando en el cliente),
  //    que ese usuario es un admin activo.
  const { data: perfilCaller, error: perfilError } = await supaAdmin
    .from("perfiles")
    .select("rol, activo")
    .eq("id", userData.user.id)
    .single();

  if (perfilError || !perfilCaller || perfilCaller.rol !== "admin" || !perfilCaller.activo) {
    res.status(403).json({ error: "Solo un administrador activo puede crear vendedores." });
    return;
  }

  // 3) Validar los datos del nuevo vendedor.
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const username = (body.username || "").trim().toLowerCase();
  const nombreCompleto = (body.nombre_completo || "").trim();
  const telefonoWhatsapp = (body.telefono_whatsapp || "").trim() || null;
  const password = body.password || "";

  if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
    res.status(400).json({ error: "El usuario debe tener entre 3 y 40 caracteres (letras, números, puntos o guiones, sin espacios)." });
    return;
  }
  if (!nombreCompleto) {
    res.status(400).json({ error: "Ingresa el nombre completo." });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  // 4) Verificar que el nombre de usuario no esté ya en uso.
  const { data: existente } = await supaAdmin
    .from("perfiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existente) {
    res.status(409).json({ error: "Ese nombre de usuario ya existe. Elige otro." });
    return;
  }

  // 5) Crear el usuario de autenticación (email interno, no un email real).
  const { data: nuevoUsuario, error: crearAuthError } = await supaAdmin.auth.admin.createUser({
    email: emailDesdeUsuario(username),
    password,
    email_confirm: true
  });

  if (crearAuthError || !nuevoUsuario || !nuevoUsuario.user) {
    res.status(500).json({ error: "No se pudo crear la cuenta: " + (crearAuthError ? crearAuthError.message : "error desconocido") });
    return;
  }

  // 6) Crear su fila en perfiles. Si esto falla, deshacemos la cuenta de
  //    autenticación para no dejar un usuario "fantasma" sin perfil.
  const { error: perfilInsertError } = await supaAdmin.from("perfiles").insert({
    id: nuevoUsuario.user.id,
    username,
    nombre_completo: nombreCompleto,
    telefono_whatsapp: telefonoWhatsapp,
    rol: "vendedor",
    activo: true
  });

  if (perfilInsertError) {
    await supaAdmin.auth.admin.deleteUser(nuevoUsuario.user.id);
    res.status(500).json({ error: "No se pudo crear el perfil del vendedor: " + perfilInsertError.message });
    return;
  }

  res.status(200).json({ ok: true, id: nuevoUsuario.user.id, username });
};
