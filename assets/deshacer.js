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
})();
