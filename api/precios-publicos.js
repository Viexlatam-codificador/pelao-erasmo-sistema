// ============================================================================
// El Pelao Erasmo — Endpoint público (sin login) que expone los precios
// vigentes de Pipeño (por tramo y región) y Granadina.
//
// La fuente de verdad es la tabla `configuraciones` (claves 'pricing_tiers'
// y 'precio_granadina'), que el admin edita en admin.html → Comunas/Rutas
// → "Precios de productos". `configuraciones` no tiene RLS que permita
// leerla sin sesión, así que este endpoint usa la clave secreta para leerla
// del lado del servidor — no es información sensible, es la misma que ya
// se le muestra al cliente en la landing.
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
    .from("configuraciones")
    .select("clave, valor")
    .in("clave", ["pricing_tiers", "precio_granadina"]);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const resultado = {};
  (data || []).forEach(fila => { resultado[fila.clave] = fila.valor; });

  res.setHeader("Cache-Control", "public, max-age=120");
  res.status(200).json(resultado);
};
