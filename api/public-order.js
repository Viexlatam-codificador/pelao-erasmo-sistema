// ============================================================================
// El Pelao Erasmo — Función serverless (Vercel) para pedidos públicos
//
// index.html (landing pública, sin login) llama a este endpoint además de
// abrir WhatsApp, para que el pedido quede registrado automáticamente en el
// sistema (visible en admin.html) sin que el cliente necesite cuenta.
//
// Por seguridad, la tabla `pedidos` NO tiene ninguna política de RLS que
// permita insertar sin sesión (ver schema.sql) — así que este endpoint usa
// la clave secreta (service role) para insertar, pero primero valida y
// recalcula el precio en el servidor, para que un cliente malicioso no
// pueda mandar un total falso. Nunca confía en el total que manda el
// navegador.
//
// El cliente puede elegir en index.html qué vendedor lo está atendiendo
// (campo opcional, poblado por api/vendedores-publicos.js). Si no elige a
// nadie, o el id que manda no corresponde a un vendedor activo real, el
// pedido queda asociado por defecto a la cuenta DEFAULT_VENDEDOR_USERNAME
// (vendedor1) — así siempre hay una persona real haciendo seguimiento,
// nunca una cuenta "fantasma".
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const { PRICING, calcularPedido } = require("../assets/pricing.js");

const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";
const DEFAULT_VENDEDOR_USERNAME = "vendedor1";

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

  const body = req.body || {};
  const nombre_cliente = String(body.nombre || "").trim().slice(0, 120);
  const telefono = String(body.telefono || "").trim().slice(0, 30);
  const direccion = String(body.direccion || "").trim().slice(0, 220);
  const comuna = String(body.comuna || "").trim().slice(0, 80);
  const observaciones = String(body.notas || "").trim().slice(0, 500);
  const regionLabel = body.regionLabel === PRICING.vr.label ? PRICING.vr.label : PRICING.rm.label;
  const regionKey = regionLabel === PRICING.vr.label ? "vr" : "rm";
  const cantidadPipeno = clampInt(body.qtyPipeno, 0, 500);
  const cantidadGranadina = clampInt(body.qtyGranadina, 0, 500);

  if (!nombre_cliente || !telefono || !direccion || !comuna) {
    res.status(400).json({ error: "Faltan datos obligatorios del pedido." });
    return;
  }
  if (cantidadPipeno === 0 && cantidadGranadina === 0) {
    res.status(400).json({ error: "El pedido no tiene cantidades." });
    return;
  }

  // Precio recalculado en el servidor — nunca se confía en el total del navegador.
  const resultado = calcularPedido({ regionKey, cantidadPipeno, cantidadGranadina, comunaPrecioDespacho: 0 });

  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);

  // Si el cliente eligió un vendedor en el formulario, verificamos que sea
  // un vendedor activo real antes de usarlo (nunca confiamos en el id que
  // manda el navegador sin validarlo).
  let vendedorId = null;
  const vendedorElegido = typeof body.vendedorId === "string" ? body.vendedorId.trim() : "";
  if (vendedorElegido) {
    const { data: vendedorValido } = await supaAdmin
      .from("perfiles")
      .select("id")
      .eq("id", vendedorElegido)
      .eq("rol", "vendedor")
      .eq("activo", true)
      .maybeSingle();
    if (vendedorValido) vendedorId = vendedorValido.id;
  }

  if (!vendedorId) {
    const { data: vendedorDefecto, error: vendedorError } = await supaAdmin
      .from("perfiles")
      .select("id")
      .eq("username", DEFAULT_VENDEDOR_USERNAME)
      .single();

    if (vendedorError || !vendedorDefecto) {
      res.status(503).json({
        error: `El sistema de pedidos automáticos todavía no está configurado (falta la cuenta '${DEFAULT_VENDEDOR_USERNAME}'). Ejecuta scripts/crear-cuentas-iniciales.js.`
      });
      return;
    }
    vendedorId = vendedorDefecto.id;
  }

  const { error: insertError } = await supaAdmin.from("pedidos").insert({
    nombre_cliente,
    telefono,
    direccion,
    numero: "",
    comuna,
    region: regionLabel,
    cantidad_pipeno: cantidadPipeno,
    precio_unitario_pipeno: resultado.precioUnitarioPipeno,
    cantidad_granadina: cantidadGranadina,
    observaciones: observaciones || null,
    total: resultado.total,
    vendedor_id: vendedorId,
    creado_por: vendedorId
  });

  if (insertError) {
    res.status(400).json({ error: "No se pudo registrar el pedido: " + insertError.message });
    return;
  }

  res.status(200).json({ ok: true });
};

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
