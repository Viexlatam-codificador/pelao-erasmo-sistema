// ============================================================================
// El Pelao Erasmo — Endpoint público (sin login) para mostrarle al cliente
// el día de reparto y el precio de despacho de su comuna en index.html.
//
// comunas_rutas no tiene una política de RLS que permita leerla sin sesión
// (solo "authenticated"), así que este endpoint usa la clave secreta para
// leerla del lado del servidor y expone únicamente comuna/región/día/precio
// de despacho — nada sensible, es la misma información que ya se le
// muestra al cliente en la landing. El precio de despacho lo administra el
// admin en la pestaña Comunas/Rutas y no afecta el total que se guarda en
// la base de datos (eso sigue siendo solo producto, igual que siempre).
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
    .from("comunas_rutas")
    .select("comuna, region, dia_reparto, precio_despacho")
    .eq("activa", true)
    .order("comuna");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json(data);
};
