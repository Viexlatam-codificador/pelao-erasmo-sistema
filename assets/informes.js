// ============================================================================
// El Pelao Erasmo — Informes de ventas en PDF (diario / semanal / mensual)
//
// Se usa desde vendedor.html (cada vendedor descarga el suyo, con sus propias
// estadísticas) y desde admin.html (el admin descarga el de cualquier
// vendedor). Genera el PDF enteramente en el navegador con jsPDF +
// jspdf-autotable — no requiere backend ni guarda nada en el servidor.
// ============================================================================

const ESTADO_LABEL_INFORME = {
  pendiente: "Pendiente",
  preparacion: "Preparación",
  listo_despacho: "Listo p/ despacho",
  en_ruta: "En ruta",
  entregado: "Entregado",
  anulado: "Anulado",
  rechazado: "Rechazado"
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

// Un solo día: desde y hasta son la misma fecha.
function rangoDiaInforme(fechaStr) {
  const dia = fechaStr || formatoFechaInforme(new Date());
  return { desde: dia, hasta: dia };
}

// Mes completo (del 1 al último día) del mes al que pertenece fechaStr.
function rangoMesInforme(fechaStr) {
  const base = fechaStr ? new Date(fechaStr + "T12:00:00") : new Date();
  const primerDia = new Date(base.getFullYear(), base.getMonth(), 1);
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: formatoFechaInforme(primerDia), hasta: formatoFechaInforme(ultimoDia) };
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

// Estadísticas de un conjunto de pedidos, pensadas para que el vendedor vea
// de un vistazo cómo le fue: total vendido, ticket promedio, comuna donde
// más vende, y cuántos bidones/displays movió en total. Se usa tanto en el
// PDF como en la pantalla de "Mis pedidos" de vendedor.html.
function calcularEstadisticasInforme(pedidos) {
  const entregados = pedidos.filter((p) => p.estado === "entregado");
  const enCurso = pedidos.filter((p) => ESTADOS_EN_CURSO_INFORME.includes(p.estado));
  const anulados = pedidos.filter((p) => p.estado === "anulado");
  const rechazados = pedidos.filter((p) => p.estado === "rechazado");

  const totalEntregado = entregados.reduce((s, p) => s + (p.total || 0), 0);
  const totalEnCurso = enCurso.reduce((s, p) => s + (p.total || 0), 0);
  const totalPipeno = entregados.reduce((s, p) => s + (p.cantidad_pipeno || 0), 0);
  const totalGranadina = entregados.reduce((s, p) => s + (p.cantidad_granadina || 0), 0);
  const ticketPromedio = entregados.length ? totalEntregado / entregados.length : 0;

  const porComuna = {};
  entregados.forEach((p) => {
    if (!p.comuna) return;
    porComuna[p.comuna] = (porComuna[p.comuna] || 0) + (p.total || 0);
  });
  let comunaTop = null, comunaTopMonto = 0;
  Object.entries(porComuna).forEach(([comuna, monto]) => {
    if (monto > comunaTopMonto) { comunaTop = comuna; comunaTopMonto = monto; }
  });

  return {
    entregados, enCurso, anulados, rechazados,
    totalEntregado, totalEnCurso, totalPipeno, totalGranadina, ticketPromedio,
    comunaTop, comunaTopMonto
  };
}

// Genera el PDF para cualquier rango de fechas (día, semana o mes), con una
// sección de estadísticas arriba de las tablas de siempre.
function generarInformeVentasPDF({ pedidos, nombreVendedor, desde, hasta, tituloPeriodo }) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No se pudo generar el PDF: la librería no cargó. Revisa tu conexión e intenta de nuevo.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const stats = calcularEstadisticasInforme(pedidos);
  const { entregados, enCurso, anulados, rechazados, totalEntregado, totalEnCurso, ticketPromedio, comunaTop } = stats;

  doc.setFontSize(16);
  doc.setTextColor(21, 87, 36);
  doc.text(`El Pelao Erasmo — ${tituloPeriodo || "Informe de ventas"}`, 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`Vendedor: ${nombreVendedor}`, 14, 27);
  doc.text(`Periodo: ${desde} al ${hasta}`, 14, 33);
  doc.text(`Generado: ${new Date().toLocaleString("es-CL")}`, 14, 39);

  // ---- Estadísticas ----
  doc.setFontSize(12);
  doc.setTextColor(21, 87, 36);
  doc.text("Tus estadísticas de este periodo", 14, 49);
  doc.autoTable({
    startY: 53,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ["Vendido y entregado", `${moneyInforme(totalEntregado)}  (${entregados.length} pedido${entregados.length === 1 ? "" : "s"})`],
      ["Todavía en curso", `${moneyInforme(totalEnCurso)}  (${enCurso.length} pedido${enCurso.length === 1 ? "" : "s"})`],
      ["Ticket promedio (entregados)", moneyInforme(ticketPromedio)],
      ["Bidones Pipeño 5L entregados", String(stats.totalPipeno)],
      ["Displays Granadina entregados", String(stats.totalGranadina)],
      ["Comuna donde más vendiste", comunaTop ? `${comunaTop} (${moneyInforme(stats.comunaTopMonto)})` : "-"],
      ["Rechazados / reagendados", String(rechazados.length)],
      ["Anulados", String(anulados.length)]
    ]
  });

  let cursorY = doc.lastAutoTable.finalY + 8;

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
    doc.text("No hay pedidos entregados en este periodo.", 14, cursorY + 6);
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
    doc.text("No hay pedidos en curso en este periodo.", 14, cursorY + 6);
    cursorY += 14;
  }

  if (rechazados.length || anulados.length) {
    if (cursorY > 260) { doc.addPage(); cursorY = 18; }
    doc.setFontSize(9);
    doc.setTextColor(150, 40, 30);
    if (rechazados.length) {
      doc.text(`Pedidos rechazados/reagendados en el periodo (no se cuentan en los totales de arriba): ${rechazados.length}`, 14, cursorY);
      cursorY += 6;
    }
    if (anulados.length) {
      doc.text(`Pedidos anulados en el periodo (no se cuentan en los totales de arriba): ${anulados.length}`, 14, cursorY);
    }
  }

  const slugVendedor = (nombreVendedor || "vendedor")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const slugPeriodo = (tituloPeriodo || "informe")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  doc.save(`${slugPeriodo}-${slugVendedor}-${desde}.pdf`);
}

// Se mantiene por compatibilidad con el código existente (admin.html la usa
// tal cual) — ahora es un envoltorio del informe genérico de arriba.
function generarInformeSemanalPDF({ pedidos, nombreVendedor, desde, hasta }) {
  generarInformeVentasPDF({ pedidos, nombreVendedor, desde, hasta, tituloPeriodo: "Informe semanal de ventas" });
}
