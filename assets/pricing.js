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

let GRANADINA_PRICE = 22000;
const DEFAULT_DELIVERY_RM = 3000;

// Comisión que gana el vendedor por unidad vendida (fija, no depende de la
// región ni del precio de venta): $100 por cada Pipeño 5L y $300 por cada
// display de Granadina entregado.
const COMISION_PIPENO = 100;
const COMISION_GRANADINA = 300;

// Estos valores de arriba son solo el respaldo inicial (por si falla la
// carga desde la base de datos). La fuente real de verdad son las filas
// 'pricing_tiers' y 'precio_granadina' de la tabla `configuraciones`, que
// el admin edita en admin.html → pestaña Comunas/Rutas → "Precios de
// productos". Cada página (index.html, vendedor.html, admin.html,
// api/public-order.js) las carga por su cuenta y llama a esta función
// para aplicarlas — pricing.js en sí no sabe nada de Supabase/red, sigue
// siendo lógica pura.
function aplicarPrecios(datos) {
  if (datos && datos.pricing_tiers) {
    ["rm", "vr"].forEach(key => {
      const region = datos.pricing_tiers[key];
      if (!region || !Array.isArray(region.tiers)) return;
      PRICING[key].min = region.min;
      PRICING[key].tiers = region.tiers.map(t => ({
        min: t.min,
        max: t.max === null || t.max === undefined ? Infinity : t.max,
        price: t.price
      }));
    });
  }
  if (datos && typeof datos.precio_granadina === "number") {
    GRANADINA_PRICE = datos.precio_granadina;
  }
}

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
    PRICING, DEFAULT_DELIVERY_RM, COMISION_PIPENO, COMISION_GRANADINA,
    regionKeyFromLabel, tierFor, money, normalizeComuna, calcularPedido, aplicarPrecios
  };
  // GRANADINA_PRICE es un número (no un objeto), así que si se exportara
  // como propiedad normal quedaría "congelado" en su valor inicial aunque
  // aplicarPrecios() lo cambie después — con un getter siempre se lee el
  // valor actual.
  Object.defineProperty(module.exports, "GRANADINA_PRICE", {
    get: () => GRANADINA_PRICE,
    enumerable: true
  });
}
