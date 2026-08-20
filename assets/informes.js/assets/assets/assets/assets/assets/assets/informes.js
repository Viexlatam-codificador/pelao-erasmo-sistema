// ============================================================================
// El Pelao Erasmo — Informes semanales de ventas en PDF
//
// Se usa desde vendedor.html (cada vendedor descarga el suyo) y desde
// admin.html (el admin descarga el de cualquier vendedor). Genera el PDF
// enteramente en el navegador con jsPDF + jspdf-autotable — no requiere
// backend ni guarda nada en el servidor.
//
// Páginas que usan este archivo deben cargar, en este orden, ANTES de este
// script:
//   <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.js"></script>
// ============================================================================

const ESTADO_LABEL_INFORME = {
  pendiente: "Pendiente",
  preparacion: "Preparación",
  listo_despacho: "Listo p/ despacho",
  en_ruta: "En ruta",
  entregado: "Entregado",
  anulado: "Anulado"
};

const ESTADOS_EN_CURSO_INFORME = ["pendiente", "preparacion", "listo_despacho", "en_ruta"];

function lunesDeLaSemanaInforme(fechaStr) {
  const base = fechaStr ? new Date(fechaStr + "T12:00:00") : new Date();
  const diaSemana = base.getDay();
  const offsetHastaLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(base);
  lunes.setDate(base.getDate() + offsetHastaLunes);
  return lunes;
}

function formatoFechaInforme(d) {
  return d.toISOString().slice(0, 10);
}

function rangoSemanaInforme(fechaStr) {
  const lunes = lunesDeLaSemanaInforme(fechaStr);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { desde: formatoFechaInforme(lunes), hasta: formatoFechaInforme(domingo) };
}

function moneyInforme(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CL");
}

function resumenProductosInforme(p) {
  const partes = [];
  if (p.cantidad_pipeno > 0) partes.push(`${p.cantidad_pipeno} Pipeño`);
  if (p.cantidad_granadina > 0) partes.push(`${p.cantidad_granadina} Granadina`);
  (p.detalle_productos || []).forEach((l) => {
    if (l && l.nombre && l.cantidad) partes.push(`${l.cantidad} ${l.nombre}`);
  });
  return partes.length ? partes.join(", ") : "-";
}

function generarInformeSemanalPDF({ pedidos, nombreVendedor, desde, hasta }) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No se pudo generar el PDF: la librería no cargó. Revisa tu conexión e intenta de nuevo.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const entregados = pedidos.filter((p) => p.estado === "entregado");
  const enCurso = pedidos.filter((p) => ESTADOS_EN_CURSO_INFORME.includes(p.estado));
  const anulados = pedidos.filter((p) => p.estado === "anulado");

  const totalEntregado = entregados.reduce((s, p) => s + (p.total || 0), 0);
  const totalEnCurso = enCurso.reduce((s, p) => s + (p.total || 0), 0);

  doc.setFontSize(16);
  doc.setTextColor(21, 87, 36);
  doc.text("El Pelao Erasmo — Informe semanal de ventas", 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`Vendedor: ${nombreVendedor}`, 14, 27);
  doc.text(`Semana: ${desde} al ${hasta}`, 14, 33);
  doc.text(`Generado: ${new Date().toLocaleString("es-CL")}`, 14, 39);

  doc.setFontSize(12);
  doc.setTextColor(21, 87, 36);
  doc.text(`Total realmente vendido (entregado): ${moneyInforme(totalEntregado)}  ·  ${entregados.length} pedido(s)`, 14, 49);
  doc.setTextColor(138, 75, 0);
  doc.text(`Total en curso (aún no entregado): ${moneyInforme(totalEnCurso)}  ·  ${enCurso.length} pedido(s)`, 14, 56);

  let cursorY = 66;

  doc.setFontSize(12);
  doc.setTextColor(21, 87, 36);
  doc.text(`Pedidos entregados (${entregados.length})`, 14, cursorY);
  if (entregados.length) {
    doc.autoTable({
      startY: cursorY + 3,
      head: [["Fecha", "Cliente", "Comuna", "Productos", "Forma de pago", "Total"]],
      body: entregados.map((p) => [
        p.fecha, p.nombre_cliente, p.comuna, resumenProductosInforme(p), p.forma_pago, moneyInforme(p.total)
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [21, 87, 36] },
      margin: { left: 14, right: 14 }
    });
    cursorY = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("No hay pedidos entregados en esta semana.", 14, cursorY + 6);
    cursorY += 14;
  }

  if (cursorY > 250) { doc.addPage(); cursorY = 18; }

  doc.setFontSize(12);
  doc.setTextColor(138, 75, 0);
  doc.text(`Pedidos en curso — todavía no entregados (${enCurso.length})`, 14, cursorY);
  if (enCurso.length) {
    doc.autoTable({
      startY: cursorY + 3,
      head: [["Fecha", "Cliente", "Comuna", "Estado", "Total"]],
      body: enCurso.map((p) => [
        p.fecha, p.nombre_cliente, p.comuna, ESTADO_LABEL_INFORME[p.estado] || p.estado, moneyInforme(p.total)
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [138, 75, 0] },
      margin: { left: 14, right: 14 }
    });
    cursorY = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("No hay pedidos en curso en esta semana.", 14, cursorY + 6);
    cursorY += 14;
  }

  if (anulados.length) {
    if (cursorY > 260) { doc.addPage(); cursorY = 18; }
    doc.setFontSize(9);
    doc.setTextColor(150, 40, 30);
    doc.text(`Pedidos anulados en la semana (no se cuentan en los totales de arriba): ${anulados.length}`, 14, cursorY);
  }

  const slugVendedor = (nombreVendedor || "vendedor")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  doc.save(`informe-semanal-${slugVendedor}-${desde}.pdf`);
}
