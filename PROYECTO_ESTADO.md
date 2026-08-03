# El Pelao Erasmo — Sistema de Gestión de Pedidos y Rutas

Este archivo es un resumen del proyecto para que una sesión nueva de Claude
Code (u otro desarrollador) pueda continuar sin perder contexto. Léelo
completo antes de tocar código.

## Objetivo

Evolucionar la landing de pedidos de Pipeño/Granadina de "El Pelao Erasmo" a
un sistema completo: vendedores ingresan pedidos, el sistema asigna
automáticamente el día de reparto según la comuna, y el administrador
gestiona todo, genera rutas y exporta a Excel.

Especificación completa original del cliente (roles, campos, estados, etc.)
está en el historial de la conversación de Cowork — lo esencial ya está
reflejado en `schema.sql` y en los módulos construidos.

## Stack y decisiones de arquitectura ya tomadas

- **Sin framework / sin build step.** HTML + JS puro (ES modules donde aplica),
  igual que la landing original. Se decidió así porque el entorno donde se
  construyó esto (Cowork sandbox) no tenía salida de red hacia npm — pero
  además encaja con la preferencia del cliente de mantenerlo simple. **Si
  ahora se dispone de Claude Code con npm real, se puede evaluar migrar a
  Next.js si conviene, pero no es obligatorio** — el enfoque actual funciona
  bien en Vercel tal cual (páginas estáticas + funciones serverless en
  `/api`).
- **Supabase** (Postgres + Auth + RLS) como backend. Plan Free.
- **Autenticación por "usuario"**, no email: se mapea `usuario` →
  `usuario@pelaoerasmo.internal` internamente (ver `assets/supabase-client.js`).
- El login de administrador/vendedor es un sistema interno, **separado** de
  la landing pública (`index.html`), que NO requiere login y NO se debe
  modificar en su diseño.

## Estado actual (lo que YA está hecho y probado)

1. **`index.html`** — landing pública de pedidos (customer-facing). Terminada,
   probada con Playwright, con diseño aprobado por el cliente. **No tocar el
   diseño sin que el cliente lo pida explícitamente.**
2. **`schema.sql`** — esquema completo de base de datos. Ya está corrido en el
   proyecto real de Supabase del cliente (org "El Pelao Erasmo", proyecto
   "pelao-erasmo"). Incluye:
   - Tablas: `perfiles`, `pedidos`, `comunas_rutas` (con la semilla de
     comuna→día que pidió el cliente), `historial`, `configuraciones`.
   - RLS: un vendedor solo ve/edita sus propios pedidos, y solo antes de
     `listo_despacho`. El admin ve/edita todo. El historial es inmutable
     (nadie puede editarlo ni borrarlo, ni siquiera el admin).
   - Trigger que asigna `dia_reparto` automáticamente según la comuna.
   - Trigger que registra automáticamente en `historial` cada creación/cambio
     de un pedido.
   - **Probado de verdad**: se instaló Postgres local, se simuló el sistema
     de `auth.users`/`auth.uid()` de Supabase, y se corrieron pruebas de
     seguridad reales (aislamiento entre vendedores, bloqueo de edición
     post-despacho, inmutabilidad del historial). Todo pasó. Si se modifica
     el esquema, sería bueno repetir ese tipo de prueba antes de aplicar
     cambios en producción.
3. **`login.html`** — página de login. Pide usuario/contraseña, resuelve el
   email interno, llama a `supabase.auth.signInWithPassword`, revisa
   `perfiles.rol` y `perfiles.activo`, redirige a `vendedor.html` o
   `admin.html`. Probado con un mock de Supabase (login incorrecto, login
   correcto, redirección, cuenta bloqueada).
4. **`vendedor.html`** — formulario de nuevo pedido (reutiliza
   `assets/pricing.js` para los tramos de precio) + tabla "Mis pedidos" (la
   RLS se encarga de que solo vea los suyos). Probado con mock: cálculo de
   precio reactivo, validación de campos, inserción correcta, listado.
5. **`admin.html`** — panel de administrador, con 4 pestañas:
   - **Resumen**: tarjetas (pedidos hoy, pendientes, en ruta, entregados,
     anulados, ventas hoy/mes) + desglose por vendedor, comuna, día de ruta
     y forma de pago.
   - **Pedidos**: tabla de TODOS los pedidos con filtros (estado, día,
     comuna, vendedor), cambio de estado inline, modal de edición completa
     (recalcula el total con `pricing.js` al cambiar cantidades) y
     eliminación con confirmación.
   - **Comunas / Rutas**: tabla editable de `comunas_rutas` (día de reparto,
     activa/inactiva) + formulario para agregar comunas nuevas.
   - **Usuarios**: lista de vendedores/admins con bloqueo/desbloqueo directo
     (RLS ya lo permite), y creación de vendedores nuevos vía
     `api/admin-users.js`.
   Probado con un mock local del cliente de Supabase (mismo patrón que
   vendedor.html): las 4 pestañas cargan sin errores de consola, el modal de
   edición recalcula el total correctamente, y los toggles de comuna/usuario
   actualizan el estado. **No probado todavía contra el Supabase real** —
   falta que el cliente confirme el bootstrap del admin (ver sección
   siguiente) para poder hacer login real y probar de punta a punta.
6. **`api/admin-users.js`** — función serverless (Node, formato Vercel) que
   crea vendedores nuevos: verifica con el token de quien llama que es un
   admin activo, y solo entonces usa la clave secreta de Supabase (leída de
   `process.env.SUPABASE_SERVICE_ROLE_KEY`, nunca hardcodeada) para crear el
   usuario en `auth.users` + su fila en `perfiles`. Si falla la inserción del
   perfil, deshace la creación del usuario de auth (no deja cuentas
   huérfanas). Sintaxis verificada con `node --check`; **no probada en vivo**
   porque necesita estar desplegada en Vercel con la variable de entorno
   configurada (ver "Despliegue" más abajo).
   Requiere `package.json` con `@supabase/supabase-js` como dependencia
   (agregado).
7. **`assets/`**:
   - `brand.css` — estilos compartidos del sistema interno (misma paleta que
     la landing).
   - `pricing.js` — lógica pura de tramos de precio (testeada con Node
     directamente, sin DOM).
   - `supabase-client.js` — cliente de Supabase con la URL y la
     **clave publicable** (`sb_publishable_...`) ya cargadas — esa clave es
     segura de exponer en el navegador.
   - `auth-guard.js` — protege `vendedor.html`/`admin.html`: si no hay sesión,
     o el usuario está bloqueado, o no tiene el rol correcto, redirige a
     `login.html`.

### ⚠️ Importante sobre credenciales

- La **clave publicable** de Supabase ya está en `assets/supabase-client.js`
  — está bien que esté ahí y en el repo de GitHub, es pública por diseño.
- La **clave secreta** (`sb_secret_...`) de Supabase **NO está en ningún
  archivo de este proyecto**. El cliente la tiene guardada aparte. Cuando se
  construya el módulo de administrador (crear usuarios, etc.), esa clave
  debe ir **únicamente** como variable de entorno en la configuración del
  proyecto de Vercel (nunca en un archivo del repo, nunca en el código que
  corre en el navegador). Pídesela al cliente cuando la necesites, y bajo
  ningún motivo la guardes en un archivo que se vaya a commitear.

## Bootstrap pendiente (antes de poder probar login)

El cliente debe crear a mano el primer usuario admin en el dashboard de
Supabase (Authentication → Users → Add user, con email
`admin@pelaoerasmo.internal`), y luego insertar la fila correspondiente en
`public.perfiles` vía SQL Editor. Instrucciones exactas ya se le dieron por
chat. Confirmar si ya lo hizo.

## Lo que falta por construir (módulos pendientes, en orden)

1. **Motor de rutas / pantalla "Generar ruta"** — seleccionar
   hoy/mañana/fecha/día de la semana → listar pedidos de esa ruta. Podría
   vivir como una pestaña más dentro de `admin.html`.
2. **Exportación a Excel** — botón que genera un `.xlsx` en el navegador
   (evaluar SheetJS vía CDN, mismo patrón que el resto del proyecto) con las
   columnas que pidió el cliente, ordenado por comuna y luego dirección,
   con filtros/formato de tabla.
3. **Vista de historial** dentro del panel admin (por ahora el historial ya
   se registra solo en la base de datos vía trigger; falta la UI para verlo).
4. Preparar la arquitectura para integrar la API de Google Maps más adelante
   (no implementar ahora, solo no bloquear el camino).
5. **Probar `admin.html` y `api/admin-users.js` contra el Supabase real**
   una vez que el cliente confirme el bootstrap del admin y el proyecto esté
   desplegado en Vercel (ver "Despliegue").

## Despliegue

Todavía NO está en GitHub ni en Vercel. Con Claude Code corriendo en la
máquina del cliente (con red real, git real, npm real), esto ya se puede
hacer directo:
- `git init`, commit, `gh repo create` (o crear el repo manualmente y hacer
  `git remote add` + `git push`).
- Conectar el repo a Vercel (`vercel link` + `vercel deploy`, o import desde
  el dashboard de Vercel).
- Las variables de entorno de Vercel (cuando se necesiten, para `/api`) se
  configuran desde el dashboard de Vercel, nunca committeadas.

## Estilo de trabajo que pidió el cliente

- Cambios pequeños y verificables, sin romper lo que ya funciona.
- Reutilizar al máximo el código existente.
- No reconstruir la landing pública desde cero ni cambiar su diseño.
- Explicarle los pasos de forma clara y concreta (suele trabajar desde el
  celular, con poco tiempo) — pero ahora que tiene Claude Code en su Mac,
  probablemente prefiera que las cosas se hagan directo (git, deploy, etc.)
  en vez de que se le pidan pasos manuales uno por uno.
