// ============================================================================
// El Pelao Erasmo — Planificador de ruta con mapa (arrastrar para ordenar)
//
// Se usa desde admin.html (armar la ruta antes de enviarla) y reparto.html
// (el repartidor la reordena en terreno si hace falta). Muestra un mapa con
// un pin numerado y coloreado por comuna para cada parada, y una lista al
// lado que se puede arrastrar para cambiar el orden — el orden se guarda en
// la columna "orden_ruta" de la tabla pedidos.
//
// Requiere, en este orden, ANTES de este script:
//   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
//   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
//   <script src="assets/supabase-client.js"></script>  (ya provee "supa")
// ============================================================================

const PALETA_COMUNAS_MAPA = [
  "#2f7d32", "#1976d2", "#c2185b", "#f57c00", "#7b1fa2",
  "#00796b", "#5d4037", "#455a64", "#c62828", "#0288d1"
];

function colorParaComunaMapa(comuna) {
  let hash = 0;
  const texto = comuna || "";
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return PALETA_COMUNAS_MAPA[hash % PALETA_COMUNAS_MAPA.length];
}

function comparadorOrdenRutaMapa(a, b) {
  if (a.orden_ruta != null && b.orden_ruta != null) return a.orden_ruta - b.orden_ruta;
  if (a.orden_ruta != null) return -1;
  if (b.orden_ruta != null) return 1;
  const c = (a.comuna || "").localeCompare(b.comuna || "", "es");
  return c !== 0 ? c : (a.direccion || "").localeCompare(b.direccion || "", "es");
}

// ==========================================================================
// Geocodificación (dirección de texto -> lat/lng) usando Nominatim de
// OpenStreetMap, que es gratis y no requiere clave. Su política de uso pide
// no pasar de ~1 consulta por segundo, así que se hace de a una, en fila.
// ==========================================================================
function esperarMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function geocodificarDireccionTextoMapa(direccionCompleta) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(direccionCompleta)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    return null;
  }
}

async function geocodificarPedidosFaltantesMapa(pedidos, onProgreso) {
  const faltantes = pedidos.filter((p) => !p.lat || !p.lng);
  let hechos = 0;
  for (const p of faltantes) {
    const direccionCompleta = `${p.direccion} ${p.numero}, ${p.comuna}, Chile`;
    const coords = await geocodificarDireccionTextoMapa(direccionCompleta);
    if (coords) {
      p.lat = coords.lat;
      p.lng = coords.lng;
      // Se guarda para no tener que geocodificar esta misma dirección de nuevo la próxima vez.
      supa.from("pedidos").update({ lat: coords.lat, lng: coords.lng }).eq("id", p.id).then(() => {});
    }
    hechos++;
    if (onProgreso) onProgreso(hechos, faltantes.length);
    if (hechos < faltantes.length) await esperarMs(1100);
  }
  return pedidos;
}

// ==========================================================================
// Mapa (Leaflet) — un pin numerado y coloreado por comuna por cada parada,
// en el orden actual de la lista.
// ==========================================================================
const mapaRutaInstancias = {};

function crearIconoNumeradoMapa(numero, color) {
  return L.divIcon({
    className: "marcador-ruta-pelao",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"><span style="transform:rotate(45deg);font-weight:800;font-size:.75rem;">${numero}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });
}

function inicializarMapaRutaMapa(mapaContenedorId) {
  if (mapaRutaInstancias[mapaContenedorId]) return mapaRutaInstancias[mapaContenedorId].map;
  const map = L.map(mapaContenedorId).setView([-33.45, -70.65], 11); // Santiago por defecto
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; colaboradores de OpenStreetMap"
  }).addTo(map);
  mapaRutaInstancias[mapaContenedorId] = { map, marcadores: [] };
  return map;
}

function renderMarcadoresRutaMapa(mapaContenedorId, pedidosOrdenados) {
  const instancia = mapaRutaInstancias[mapaContenedorId];
  if (!instancia) return;
  instancia.marcadores.forEach((m) => instancia.map.removeLayer(m));
  instancia.marcadores = [];

  const puntos = [];
  pedidosOrdenados.forEach((p, i) => {
    if (!p.lat || !p.lng) return;
    const color = colorParaComunaMapa(p.comuna);
    const marker = L.marker([p.lat, p.lng], { icon: crearIconoNumeradoMapa(i + 1, color) })
      .addTo(instancia.map)
      .bindPopup(`<b>${i + 1}. ${p.nombre_cliente}</b><br>${p.comuna}<br>${p.direccion} ${p.numero}`);
    instancia.marcadores.push(marker);
    puntos.push([p.lat, p.lng]);
  });

  // El mapa puede estar en un contenedor que estuvo oculto (display:none) —
  // hay que decirle a Leaflet que recalcule su tamaño antes de encuadrar,
  // si no, se ve cortado o en gris hasta que se hace scroll o zoom a mano.
  setTimeout(() => {
    instancia.map.invalidateSize();
    if (puntos.length) instancia.map.fitBounds(puntos, { padding: [30, 30] });
  }, 80);
}

// ==========================================================================
// Lista arrastrable (SortableJS — funciona con mouse y con el dedo en el
// celular, que es como la usa el repartidor en la calle).
// ==========================================================================
function renderListaOrdenableRutaMapa(listaContenedorId, pedidosOrdenados, onReorder) {
  const wrap = document.getElementById(listaContenedorId);
  if (!wrap) return;

  wrap.innerHTML = pedidosOrdenados.map((p, i) => `
    <div class="parada-ruta-pelao" data-pedido-id="${p.id}">
      <span class="parada-ruta-pelao-handle">⠿</span>
      <span class="parada-ruta-pelao-num" style="background:${colorParaComunaMapa(p.comuna)};">${i + 1}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.85rem;">${p.nombre_cliente} <span style="font-weight:400;color:#888;">· ${p.comuna}</span></div>
        <div style="font-size:.76rem;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.direccion} ${p.numero}${p.lat ? "" : " · sin ubicar todavía"}</div>
      </div>
    </div>
  `).join("");

  if (wrap._sortableRutaPelao) wrap._sortableRutaPelao.destroy();
  wrap._sortableRutaPelao = new Sortable(wrap, {
    animation: 150,
    handle: ".parada-ruta-pelao-handle",
    ghostClass: "parada-ruta-pelao-ghost",
    onEnd: () => {
      const idsEnOrden = Array.from(wrap.children).map((el) => el.dataset.pedidoId);
      const nuevoOrden = idsEnOrden.map((id) => pedidosOrdenados.find((p) => p.id === id)).filter(Boolean);
      onReorder(nuevoOrden);
    }
  });
}

let estilosMapaRutaInyectados = false;
function inyectarEstilosMapaRutaMapa() {
  if (estilosMapaRutaInyectados) return;
  estilosMapaRutaInyectados = true;
  const style = document.createElement("style");
  style.textContent = `
    .parada-ruta-pelao{ display:flex; align-items:center; gap:10px; background:#fff; border:1px solid #e3e3da; border-radius:8px; padding:8px 10px; margin-bottom:6px; }
    .parada-ruta-pelao-handle{ font-size:1.15rem; color:#bbb; cursor:grab; padding:0 2px; touch-action:none; }
    .parada-ruta-pelao-num{ color:#fff; font-weight:800; font-size:.78rem; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .parada-ruta-pelao-ghost{ opacity:.4; }
  `;
  document.head.appendChild(style);
}

// ==========================================================================
// Orquestador: junta mapa + lista + geocodificación + guardado, para que
// admin.html y reparto.html solo tengan que llamar a esta función.
// ==========================================================================
function iniciarPlanificadorRutaMapa({ pedidos, mapaContenedorId, listaContenedorId }) {
  inyectarEstilosMapaRutaMapa();
  let ordenActual = pedidos.slice().sort(comparadorOrdenRutaMapa);

  function repintar() {
    renderMarcadoresRutaMapa(mapaContenedorId, ordenActual);
    renderListaOrdenableRutaMapa(listaContenedorId, ordenActual, (nuevoOrden) => {
      ordenActual = nuevoOrden;
      repintar();
    });
  }

  inicializarMapaRutaMapa(mapaContenedorId);
  repintar();

  return {
    obtenerOrdenActual: () => ordenActual,
    async geocodificarFaltantes(onProgreso) {
      await geocodificarPedidosFaltantesMapa(ordenActual, onProgreso);
      repintar();
    },
    async guardar() {
      let errores = 0;
      for (let i = 0; i < ordenActual.length; i++) {
        const { error } = await supa.from("pedidos").update({ orden_ruta: i }).eq("id", ordenActual[i].id);
        if (error) errores++;
      }
      return errores;
    }
  };
}

// Helper de UI compartido: geocodifica lo que falte mostrando el progreso en
// un <p class="status-msg"> y deja un mensaje final.
async function geocodificarConProgresoUIMapa(planificador, statusElId) {
  const status = statusElId ? document.getElementById(statusElId) : null;
  if (status) { status.className = "status-msg"; status.textContent = "Ubicando direcciones en el mapa..."; }
  await planificador.geocodificarFaltantes((hechos, total) => {
    if (status && total > 0) status.textContent = `Ubicando direcciones en el mapa... (${hechos}/${total})`;
  });
  if (status) {
    status.classList.add("ok");
    status.textContent = "Listo — arrastra el ícono ⠿ de cada parada para ordenar la ruta.";
  }
}
