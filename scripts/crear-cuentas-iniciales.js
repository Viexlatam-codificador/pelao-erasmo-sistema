// ============================================================================
// El Pelao Erasmo — Script de configuración inicial (correr UNA sola vez)
//
// Crea:
//   1. La cuenta "pedidos-web": no es para que nadie inicie sesión con ella,
//      es la cuenta "vendedor" fija a la que quedan asociados los pedidos
//      que llegan desde el formulario público (index.html) sin login. La
//      necesita api/public-order.js para poder registrar esos pedidos.
//   2. Vendedores vendedor1, vendedor2, vendedor3 (para que el equipo de
//      ventas pueda entrar a vendedor.html) — el script imprime sus
//      contraseñas UNA vez en la terminal; anótalas, no quedan guardadas en
//      ningún archivo.
//
// Es seguro correrlo más de una vez: si una cuenta ya existe, se salta y no
// la duplica ni le cambia la contraseña.
//
// CÓMO CORRERLO (desde la carpeta del proyecto):
//   npm install
//   SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." node scripts/crear-cuentas-iniciales.js
//
// La clave secreta solo se usa en tu propia máquina en este momento — este
// script nunca la guarda, la imprime ni la envía a ningún lado más que a
// Supabase directamente.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = "https://kbrnecuueekypztyopua.supabase.co";
const DOMINIO_INTERNO = "pelaoerasmo.internal";

const CUENTAS = [
  { username: "pedidos-web", nombre_completo: "Pedidos Web (formulario público)", rol: "vendedor", esSistema: true },
  { username: "admin", nombre_completo: "Administrador", rol: "admin" },
  { username: "vendedor1", nombre_completo: "Vendedor 1", rol: "vendedor" },
  { username: "vendedor2", nombre_completo: "Vendedor 2", rol: "vendedor" },
  { username: "vendedor3", nombre_completo: "Vendedor 3", rol: "vendedor" }
];

function generarPassword() {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY.");
    console.error('Ejemplo: SUPABASE_SERVICE_ROLE_KEY="sb_secret_..." node scripts/crear-cuentas-iniciales.js');
    process.exit(1);
  }

  const supaAdmin = createClient(SUPABASE_URL, serviceRoleKey);
  const resumen = [];

  for (const cuenta of CUENTAS) {
    const { data: existente } = await supaAdmin
      .from("perfiles")
      .select("id")
      .eq("username", cuenta.username)
      .maybeSingle();

    if (existente) {
      console.log(`- ${cuenta.username}: ya existe, no se toca.`);
      continue;
    }

    const password = generarPassword();
    const email = `${cuenta.username}@${DOMINIO_INTERNO}`;

    const { data: nuevoUsuario, error: createError } = await supaAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) {
      console.error(`- ${cuenta.username}: ERROR al crear usuario: ${createError.message}`);
      continue;
    }

    const { error: perfilError } = await supaAdmin.from("perfiles").insert({
      id: nuevoUsuario.user.id,
      username: cuenta.username,
      nombre_completo: cuenta.nombre_completo,
      rol: cuenta.rol,
      activo: true
    });

    if (perfilError) {
      await supaAdmin.auth.admin.deleteUser(nuevoUsuario.user.id);
      console.error(`- ${cuenta.username}: ERROR al crear perfil: ${perfilError.message}`);
      continue;
    }

    console.log(`- ${cuenta.username}: creado.${cuenta.esSistema ? " (cuenta de sistema, nadie inicia sesión con ella)" : ""}`);
    if (!cuenta.esSistema) resumen.push({ username: cuenta.username, password });
  }

  if (resumen.length) {
    console.log("\n=== Anota estas contraseñas ahora — no se muestran de nuevo ===");
    resumen.forEach(r => console.log(`  usuario: ${r.username}   contraseña: ${r.password}`));
    console.log("Pídeles a los vendedores (y a quien use la cuenta admin) que la cambien la primera vez que puedan (por ahora el sistema no tiene un flujo de 'cambiar mi contraseña'; si lo necesitas, avísame y lo agrego).");
  } else {
    console.log("\nNo se crearon cuentas nuevas (ya existían todas).");
  }
}

main();
