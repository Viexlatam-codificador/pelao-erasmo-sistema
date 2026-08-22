/* ============================================================================
   El Pelao Erasmo — Utilidad compartida "Deshacer"
   Muestra un aviso flotante (toast) con un botón para revertir la última
   acción realizada (editar, eliminar, cambiar fecha, rechazar, etc.), para
   que nadie pierda trabajo por una equivocación. Se usa en admin.html,
   vendedor.html y reparto.html.
   Uso: mostrarDeshacer("Pedido eliminado", async () => { ...revertir... });
   ============================================================================ */
(function () {
  let temporizador = null;

  function ocultarToastDeshacer() {
    const el = document.getElementById("toastDeshacer");
    if (el) el.classList.remove("visible");
    if (temporizador) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  }

  window.mostrarDeshacer = function (mensaje, fnDeshacer, segundos) {
    segundos = segundos || 8;
    let el = document.getElementById("toastDeshacer");
    if (!el) {
      el = document.createElement("div");
      el.id = "toastDeshacer";
      el.className = "toast-deshacer";
      el.innerHTML =
        '<span class="toast-deshacer-msg"></span>' +
        '<button type="button" class="toast-deshacer-btn">Deshacer</button>' +
        '<div class="toast-deshacer-barra"><div class="toast-deshacer-barra-fill"></div></div>';
      document.body.appendChild(el);
    }
    ocultarToastDeshacer();
    el.querySelector(".toast-deshacer-msg").textContent = mensaje;
    const btn = el.querySelector(".toast-deshacer-btn");
    const fill = el.querySelector(".toast-deshacer-barra-fill");

    btn.onclick = async function () {
      btn.disabled = true;
      btn.textContent = "Deshaciendo...";
      try {
        await fnDeshacer();
      } catch (e) {
        alert("No se pudo deshacer: " + (e && e.message ? e.message : e));
      }
      btn.disabled = false;
      btn.textContent = "Deshacer";
      ocultarToastDeshacer();
    };

    requestAnimationFrame(function () {
      el.classList.add("visible");
      fill.style.transition = "none";
      fill.style.width = "100%";
      requestAnimationFrame(function () {
        fill.style.transition = "width " + segundos + "s linear";
        fill.style.width = "0%";
      });
    });

    temporizador = setTimeout(ocultarToastDeshacer, segundos * 1000);
  };

  window.ocultarToastDeshacer = ocultarToastDeshacer;

  // ==========================================================================
  // HISTORIAL DE CAMBIOS — botón fijo (no desaparece) + panel con la lista de
  // cambios guardados en la base de datos, para volver atrás aunque haya
  // pasado tiempo, se haya cerrado la página, o se te haya pasado el aviso
  // de "Deshacer" de los primeros segundos.
  //
  // Uso en cada página: en vez de (o además de) mostrarDeshacer(...), se
  // llama a deshacerConHistorial(mensaje, fnDeshacer, historialInfo, segundos)
  // donde historialInfo describe CÓMO revertir de forma que se pueda guardar
  // en la base de datos (no una función, sino datos), por ejemplo:
  //   { pagina:"admin", pedidoId:id, accion:"rpc",
  //     payload:{ rpc:"deshacer_cambio_pedido", params:{ p_pedido_id:id, p_estado:estadoAnterior } } }
  // ==========================================================================
  let panelHistorialAbierto = false;
  let paginaHistorialActual = null;

  function generarPasswordAleatoriaHistorial() {
    const caracteres = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 8; i++) out += caracteres[Math.floor(Math.random() * caracteres.length)];
    return out;
  }

  window.inicializarBotonHistorial = function (pagina) {
    paginaHistorialActual = pagina || null;
    if (document.getElementById("botonHistorialFijo")) return;

    const boton = document.createElement("button");
    boton.id = "botonHistorialFijo";
    boton.type = "button";
    boton.className = "boton-historial-fijo";
    boton.title = "Historial de cambios — recuperar algo borrado o editado por error";
    boton.textContent = "🕘";
    boton.onclick = toggleHistorialPanel;
    document.body.appendChild(boton);

    const panel = document.createElement("div");
    panel.id = "panelHistorialFijo";
    panel.className = "panel-historial-fijo";
    panel.style.display = "none";
    panel.innerHTML =
      '<div class="panel-historial-header">' +
      '<span>🕘 Historial de cambios</span>' +
      '<button type="button" id="cerrarPanelHistorial">✕</button>' +
      "</div>" +
      '<div class="panel-historial-lista" id="panelHistorialLista"><p class="empty-state">Cargando...</p></div>';
    document.body.appendChild(panel);
    document.getElementById("cerrarPanelHistorial").onclick = toggleHistorialPanel;
  };

  async function toggleHistorialPanel() {
    const panel = document.getElementById("panelHistorialFijo");
    if (!panel) return;
    panelHistorialAbierto = !panelHistorialAbierto;
    panel.style.display = panelHistorialAbierto ? "flex" : "none";
    if (panelHistorialAbierto) await cargarListaHistorial();
  }
  window.toggleHistorialPanel = toggleHistorialPanel;

  window.registrarHistorial = async function (info) {
    if (!info || !info.accion || !info.payload) return;
    try {
      await supa.from("historial_cambios").insert({
        pagina: info.pagina || paginaHistorialActual,
        pedido_id: info.pedidoId || null,
        descripcion: info.descripcion || "Cambio",
        accion: info.accion,
        tabla: info.tabla || null,
        payload: info.payload,
        creado_por: info.creadoPor || null
      });
    } catch (e) {
      // El historial es una ayuda extra — si falla el guardado, no se
      // interrumpe la acción principal que ya se hizo en pantalla.
    }
  };

  window.deshacerConHistorial = function (mensaje, fnDeshacer, historialInfo, segundos) {
    mostrarDeshacer(mensaje, fnDeshacer, segundos);
    if (historialInfo) {
      registrarHistorial(Object.assign({ descripcion: mensaje }, historialInfo));
    }
  };

  async function cargarListaHistorial() {
    const lista = document.getElementById("panelHistorialLista");
    if (!lista) return;
    lista.innerHTML = '<p class="empty-state">Cargando...</p>';

    let query = supa.from("historial_cambios")
      .select("id, pagina, descripcion, restaurado, creado_por, creado_en")
      .order("creado_en", { ascending: false })
      .limit(50);

    // El admin ve todo (necesita poder revisar cambios de todo el equipo);
    // vendedor y repartidor solo ven lo suyo, para no mezclar historiales.
    if (paginaHistorialActual && paginaHistorialActual !== "admin") {
      query = query.eq("pagina", paginaHistorialActual);
    }

    const { data, error } = await query;

    if (error) {
      lista.innerHTML = `<p class="empty-state">No se pudo cargar el historial: ${error.message}</p>`;
      return;
    }
    if (!data || !data.length) {
      lista.innerHTML = '<p class="empty-state">Todavía no hay cambios registrados.</p>';
      return;
    }

    lista.innerHTML = data.map(h => `
      <div class="item-historial ${h.restaurado ? "restaurado" : ""}">
        <div class="item-historial-texto">
          <div class="item-historial-desc">${h.descripcion || "Cambio"}</div>
          <div class="item-historial-fecha">${formatearFechaHoraHistorial(h.creado_en)}${h.creado_por ? " · " + h.creado_por : ""}</div>
        </div>
        ${h.restaurado
          ? `<span class="item-historial-badge">Restaurado</span>`
          : `<button type="button" class="item-historial-restaurar" onclick="restaurarDesdeHistorial('${h.id}')">Restaurar</button>`
        }
      </div>
    `).join("");
  }

  function formatearFechaHoraHistorial(iso) {
    try {
      return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return iso || "";
    }
  }

  // Ejecuta la reversión guardada — cubre todas las formas de "deshacer" que
  // usa el sistema (una llamada RPC, volver a insertar una fila borrada,
  // actualizar campos de un pedido, actualizar varios pedidos en fila, o
  // repetir una llamada a una función del servidor como crear/restablecer un
  // usuario).
  async function ejecutarAccionHistorial(fila) {
    const accion = fila.accion;
    const p = fila.payload || {};

    if (accion === "rpc") {
      const { error } = await supa.rpc(p.rpc, p.params || {});
      if (error) throw error;
    } else if (accion === "insert") {
      const { error } = await supa.from(fila.tabla).insert(p.datos);
      if (error) throw error;
    } else if (accion === "update") {
      const { error } = await supa.from(fila.tabla).update(p.datos).eq(p.campo || "id", p.valor);
      if (error) throw error;
    } else if (accion === "update_lote") {
      for (const item of (p.items || [])) {
        const { error } = await supa.from(fila.tabla).update(item.datos).eq("id", item.id);
        if (error) throw error;
      }
    } else if (accion === "fetch") {
      const { data: sd } = await supa.auth.getSession();
      const token = sd && sd.session ? sd.session.access_token : null;
      if (!token) throw new Error("Tu sesión expiró, vuelve a iniciar sesión.");
      const body = Object.assign({}, p.body);
      let passwordGenerada = null;
      if (body.password === "__GENERAR__") {
        passwordGenerada = generarPasswordAleatoriaHistorial();
        body.password = passwordGenerada;
      }
      const resp = await fetch(p.url, {
        method: p.method || "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        let msg = "No se pudo deshacer (falló la llamada al servidor).";
        try { const r = await resp.json(); if (r && r.error) msg = r.error; } catch (e) {}
        throw new Error(msg);
      }
      if (passwordGenerada) {
        alert(`Cuenta restaurada. Como no había una contraseña anterior guardada, se generó una nueva: ${passwordGenerada}`);
      }
    } else {
      throw new Error("Tipo de acción del historial desconocido.");
    }
  }

  window.restaurarDesdeHistorial = async function (historialId) {
    const { data, error } = await supa.from("historial_cambios").select("*").eq("id", historialId).single();
    if (error || !data) {
      alert("No se pudo leer ese cambio del historial.");
      return;
    }
    if (data.restaurado) {
      alert("Ese cambio ya había sido restaurado antes.");
      return;
    }
    if (!confirm(`¿Restaurar este cambio?\n\n"${data.descripcion}"`)) return;

    try {
      await ejecutarAccionHistorial(data);
    } catch (e) {
      alert("No se pudo restaurar: " + (e && e.message ? e.message : e));
      return;
    }

    await supa.from("historial_cambios").update({ restaurado: true }).eq("id", historialId);
    alert("Listo, se restauró el cambio. La página se va a recargar para que todo se vea al día.");
    location.reload();
  };
})();
