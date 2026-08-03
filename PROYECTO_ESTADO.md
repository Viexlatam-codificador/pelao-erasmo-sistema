# El Pelao Erasmo — Sistema de Gestión de Pedidos y Rutas

Este archivo es un resumen del proyecto para que una sesión nueva de Claude
Code (u otro desarrollador) pueda continuar sin perder contexto. Léelo
completo antes de tocar código.

## ✅ Estado al 2026-08-03: sistema completo funcionando en producción

Todo lo pendiente de la sesión anterior quedó resuelto y **verificado de
punta a punta contra el Supabase real, no un mock**:

- **Logo real** de "Distribuidora El Pelao Erasmo" agregado en
  `assets/logo.jpeg` y wireado en `index.html`, `login.html`, y las topbars
  de `vendedor.html`/`admin.html`. Confirmado visualmente en producción.
- **`SUPABASE_SERVICE_ROLE_KEY` configurada en Vercel** (el cliente la
  agregó él mismo en el dashboard, como corresponde — Claude nunca la vio
  ni la manejó).
- **Cuentas creadas** con `scripts/crear-cuentas-iniciales.js`: `pedidos-web`
  (cuenta de sistema para pedidos públicos) + `vendedor1`, `vendedor2`,
  `vendedor3`. Login de `vendedor1` verificado en producción: entra,
  redirige a `vendedor.html`, carga el formulario, sin errores de consola.
- **`api/public-order.js` verificado en producción**: un pedido de prueba
  enviado por curl quedó registrado correctamente (`{"ok":true}`).

### 🔧 Un hallazgo importante de esta sesión: el esquema NUNCA se había corrido

A pesar de que la documentación anterior decía "ya está corrido en el
proyecto real de Supabase", al verificar directamente (consultando la API
REST con la clave pública) **ninguna tabla existía en la base de datos real**.
Se corrió `schema.sql` recién en esta sesión, vía SQL Editor de Supabase.

Además, tras correrlo apareció un problema adicional: **los roles
`anon`/`authenticated`/`service_role` no tenían los permisos base de
Postgres** (GRANT) para tocar las tablas nuevas — esto es independiente de
RLS (RLS filtra qué filas, pero antes de eso Postgres exige el permiso base
de la operación). Sin este GRANT, todo fallaba con "permission denied"
aunque las políticas de RLS estuvieran perfectas. Se agregó una sección
nueva al final de `schema.sql` con los `grant` necesarios — **si alguna vez
se recrea este proyecto desde cero, correr `schema.sql` completo (que ya
incluye esta sección) debería bastar; no debería repetirse este problema.**

### ✅ Cuenta admin creada y probada — sistema 100% verificado

Se agregó una cuenta `admin` al script `crear-cuentas-iniciales.js` y se
corrió. **Login de `admin` probado en producción de punta a punta**:
entra, carga el panel completo, y en la pestaña Resumen se ve en tiempo
real el pedido de prueba que se mandó por `api/public-order` (Providencia,
jueves, $45.600, vendedor "Pedidos Web (formulario público)") — confirma
que todo el flujo público → base de datos → panel admin funciona. La
pestaña Usuarios también muestra las 5 cuentas correctamente
(admin, pedidos-web, vendedor1, vendedor2, vendedor3), todas activas.

No queda ningún pendiente técnico conocido. Lo único no probado en vivo es
"Crear vendedor" desde la UI de `admin.html` (que llama a
`api/admin-users.js`) y el motor de rutas / exportación a Excel (no
construidos todavía, ver "Lo que falta por construir").

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
- **Dos perfiles bien separados, confirmado con el cliente**: `index.html`
  es 100% público (sin login) para que cualquier cliente pida directo por
  WhatsApp; `login.html` → `vendedor.html`/`admin.html` es el sistema
  interno con cuenta, solo para el equipo. Nada del sistema interno es
  accesible sin loguearse (lo hace `assets/auth-guard.js`).

## Estado actual (lo que YA está hecho y probado)

1. **`index.html`** — landing pública de pedidos (customer-facing). Terminada,
   probada con Playwright, con diseño aprobado por el cliente. **No tocar el
   diseño sin que el cliente lo pida explícitamente.** El cliente SÍ pidió
   (en esta última sesión) que el pedido quede registrado automáticamente
   en el sistema además de ir a WhatsApp — se implementó reemplazando el
   viejo stub de Formspree (nunca configurado, `TU_ID_AQUI`) por una llamada
   a `/api/public-order` (no bloqueante: si falla, el flujo de WhatsApp
   sigue igual que siempre). Probado en navegador: cálculo de precio,
   resumen y mensaje de éxito funcionan igual que antes; sin errores de
   consola.
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
7. **`api/public-order.js`** — función serverless pública (sin login) que
   `index.html` llama al enviar un pedido. Recalcula el precio en el
   servidor con `assets/pricing.js` (nunca confía en el total que manda el
   navegador — es un endpoint público, cualquiera podría mandar cualquier
   cosa), valida los campos, y usa la clave secreta para insertar en
   `pedidos` con `vendedor_id` apuntando a la cuenta fija `pedidos-web`.
   Devuelve error explícito si falta `SUPABASE_SERVICE_ROLE_KEY` o si no
   existe la cuenta `pedidos-web` todavía. Probado con un harness local
   (mock de `req`/`res`, sin llamar a Supabase real): método no permitido,
   falta de service key, y validación de campos — los 4 casos devuelven el
   status/mensaje esperado.
8. **`scripts/crear-cuentas-iniciales.js`** — script de configuración
   inicial (correr una sola vez, localmente, con la clave secreta como
   variable de entorno) que crea la cuenta de sistema `pedidos-web` y las
   cuentas `vendedor1`/`vendedor2`/`vendedor3`. Idempotente (si una cuenta
   ya existe, la salta). Imprime las contraseñas generadas solo en la
   terminal, una vez. Sintaxis verificada con `node --check`; no se pudo
   probar en vivo porque necesita la clave secreta.
9. **`assets/`**:
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

**✅ Ya está en GitHub y en Vercel, en producción.**

- **GitHub**: https://github.com/Viexlatam-codificador/pelao-erasmo-sistema
  (repo público, cuenta `Viexlatam-codificador`). `gh` se instaló localmente
  en `~/.local/bin/gh` (no vía Homebrew, que no está instalado en esta Mac).
- **Vercel**: https://pelao-erasmo-sistema.vercel.app (proyecto
  `viex-s-projects/pelao-erasmo-sistema`). El repo de GitHub quedó conectado
  automáticamente, así que **cada push a `main` dispara un deploy nuevo**.
  Verificado en navegador: `login.html` carga bien, sin errores de consola.
- El proyecto no tiene `vercel.json`: es un sitio estático en la raíz + una
  función serverless en `/api`, que Vercel detecta automáticamente.
  `package.json` declara `@supabase/supabase-js` como dependencia para que
  la función la tenga disponible (se instaló sola en el build).

### ⚠️ Pendiente para que el panel admin funcione al 100%

Falta configurar en el dashboard de Vercel (Project → Settings →
Environment Variables) la variable **`SUPABASE_SERVICE_ROLE_KEY`** con la
clave secreta que el cliente tiene guardada aparte. Sin esto:
- Todo el sitio funciona igual (landing, login, vendedor, y el panel admin
  en sus pestañas de Resumen/Pedidos/Comunas).
- Solo falla "Crear vendedor" en la pestaña Usuarios de `admin.html`, con un
  error explícito ("Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel"),
  no en silencio.
Claude no debe pedir ni manejar esa clave directamente — el cliente debe
pegarla él mismo en el dashboard de Vercel, y luego redesplegar (o esperar
al próximo push).

## Estilo de trabajo que pidió el cliente

- Cambios pequeños y verificables, sin romper lo que ya funciona.
- Reutilizar al máximo el código existente.
- No reconstruir la landing pública desde cero ni cambiar su diseño.
- Explicarle los pasos de forma clara y concreta (suele trabajar desde el
  celular, con poco tiempo) — pero ahora que tiene Claude Code en su Mac,
  probablemente prefiera que las cosas se hagan directo (git, deploy, etc.)
  en vez de que se le pidan pasos manuales uno por uno.
