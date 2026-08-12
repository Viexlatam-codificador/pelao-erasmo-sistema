// ============================================================================
// El Pelao Erasmo — Resguardo de sesión para páginas internas
//
// Uso en vendedor.html / admin.html:
//   <script>
//     requireSession({ rolesPermitidos: ["vendedor","admin"] }).then(perfil => {
//       // perfil = { id, username, nombre_completo, rol, activo }
//       iniciarPagina(perfil);
//     });
//   </script>
//
// Si no hay sesión, o el perfil está bloqueado, o el rol no calza, redirige
// automáticamente a login.html — así ninguna página interna queda accesible
// sin autenticación (cumple "proteger las rutas internas").
// ============================================================================

const PAGINA_POR_ROL = { admin: "admin.html", vendedor: "vendedor.html", repartidor: "reparto.html" };

async function requireSession({ rolesPermitidos }) {
  const { data: { session } } = await supa.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  const { data: perfil, error } = await supa
    .from("perfiles")
    .select("id, username, nombre_completo, rol, activo")
    .eq("id", session.user.id)
    .single();

  if (error || !perfil) {
    await supa.auth.signOut();
    window.location.href = "login.html?error=sin_perfil";
    return null;
  }

  if (!perfil.activo) {
    await supa.auth.signOut();
    window.location.href = "login.html?error=bloqueado";
    return null;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
    // Usuario válido pero sin permiso para esta página: lo mandamos a la suya.
    window.location.href = PAGINA_POR_ROL[perfil.rol] || "vendedor.html";
    return null;
  }

  return perfil;
}

async function cerrarSesion() {
  await supa.auth.signOut();
  window.location.href = "login.html";
}
