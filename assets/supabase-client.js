// ============================================================================
// El Pelao Erasmo — Cliente de Supabase (compartido por login/vendedor/admin)
//
// Requiere que la página que lo use haya cargado antes el script UMD de
// Supabase, por ejemplo:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
//   <script src="assets/supabase-client.js"></script>
// ============================================================================

// Clave PUBLICABLE (equivalente a la "anon key"): es segura de exponer en el
// navegador siempre que las tablas tengan RLS habilitado (así están en
// schema.sql). NUNCA poner aquí la clave "secreta" (sb_secret_...).
const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nFPkaD6iiTKZMlhIufS9-w__4fdlfqo";

// Dominio interno usado para transformar "usuario" en un email válido para
// Supabase Auth (el sistema pidió login por usuario/contraseña, no por email).
const DOMINIO_INTERNO = "pelaoerasmo.internal";

function emailDesdeUsuario(username) {
  return `${(username || "").trim().toLowerCase()}@${DOMINIO_INTERNO}`;
}

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
