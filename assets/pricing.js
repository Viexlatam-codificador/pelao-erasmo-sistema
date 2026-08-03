// ============================================================================
// El Pelao Erasmo — Reglas de precios compartidas (tramos por región + granadina)
//
// Usado por: vendedor.html, admin.html (y, a futuro, si se decide unificar,
// también podría reemplazar la lógica duplicada dentro de index.html — pero
// esa página no se toca por instrucción explícita del cliente).
// ============================================================================

const PRICING = {
  rm: {
    label: "Región Metropolitana",
    min: 12,
    tiers: [
      { min: 12, max: 19, price: 3800 },
      { min: 20, max: 39, price: 3700 },
      { min: 40, max: Infinity, price: 3600 }
    ]
  },
  vr: {
    label: "V Región",
    min: 20,
    tiers: [
      { min: 20, max: 29, price: 3900 },
      { min: 30, max: 39, price: 3800 },
      { min: 40, max: Infinity, price: 3600 }
    ]
  }
};

const GRANADINA_PRICE = 22000;
const DEFAULT_DELIVERY_RM = 3000;

function regionKeyFromLabel(label) {
  if (label === PRICING.vr.label) return "vr";
  return "rm";
}

function tierFor(regionKey, qty) {
  const region = PRICING[regionKey];
  if (!region) return null;
  for (const t of region.tiers) {
    if (qty >= t.min && qty <= t.max) return t;
  }
  return null;
}

function money(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CL");
}

function normalizeComuna(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Calcula el desglose completo de un pedido a partir de sus cantidades.
// No conoce nada de Supabase ni del DOM — función pura, fácil de testear.
function calcularPedido({ regionKey, cantidadPipeno, cantidadGranadina, comunaPrecioDespacho }) {
  const tier = tierFor(regionKey, cantidadPipeno || 0);
  const precioUnitarioPipeno = tier ? tier.price : 0;
  const subtotalPipeno = (cantidadPipeno || 0) * precioUnitarioPipeno;
  const subtotalGranadina = (cantidadGranadina || 0) * GRANADINA_PRICE;
  const despacho = comunaPrecioDespacho || 0;
  const total = subtotalPipeno + subtotalGranadina + despacho;
  return {
    tier,
    precioUnitarioPipeno,
    subtotalPipeno,
    subtotalGranadina,
    despacho,
    total
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PRICING, GRANADINA_PRICE, DEFAULT_DELIVERY_RM,
    regionKeyFromLabel, tierFor, money, normalizeComuna, calcularPedido
  };
}
