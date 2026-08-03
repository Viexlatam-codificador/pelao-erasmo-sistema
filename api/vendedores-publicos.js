// ============================================================================
// El Pelao Erasmo — Endpoint público (sin login) para que el cliente elija,
// en index.html, qué vendedor lo está atendiendo (opcional).
//
// Expone únicamente id + nombre de vendedores activos (nada sensible, ni
// username/email ni contraseñas) — usa la clave secreta para leer, porque
// perfiles no es legible sin sesión desde el navegador.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." });
    return;
  }

  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);

  const { data, error } = await supaAdmin
    .from("perfiles")
    .select("id, nombre_completo, username")
    .eq("rol", "vendedor")
    .eq("activo", true)
    .neq("username", "pedidos-web")
    .order("nombre_completo");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json(data.map(v => ({ id: v.id, nombre_completo: v.nombre_completo })));
};
