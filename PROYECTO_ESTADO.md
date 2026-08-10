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

- **Sin framework / sin build step.** HTML + JS puro, igual que la landing
  original. Se decidió así porque el entorno donde se construyó esto (Cowork
  sandbox) no tenía salida de red hacia npm — pero además encaja con la
  preferencia del cliente de mantenerlo simple. La única excepción es
  `/api/crear-vendedor.js`, una función serverless de Vercel que sí necesita
  `npm install` en el momento del despliegue (Vercel lo hace solo, ver
  "Despliegue" más abajo) porque usa el paquete `@supabase/supabase-js` del
  lado del servidor. **Si ahora se dispone de Claude Code con npm real, se
  puede evaluar migrar a Next.js si conviene, pero no es obligatorio** — el
  enfoque actual funciona bien en Vercel tal cual (páginas estáticas +
  funciones serverless en `/api`).
- **Supabase** (Postgres + Auth + RLS) como backend. Plan Free.
- **Autenticación por "usuario"**, no email: se mapea `usuario` →
  `usuario@pelaoerasmo.internal` internamente (ver `assets/supabase-client.js`).
- El login de administrador/vendedor es un sistema interno, **separado** de
  la landing pública (`index.html`), que NO requiere login y NO se debe
  modificar en su diseño.

## Estado actual — TODO lo del alcance pedido está construido y probado

El panel de administrador ya está **completo**: comunas, productos, banner
de delivery, dashboard de resumen, CRUD de pedidos, generación de rutas +
exportación a Excel, y gestión de vendedores (incluyendo crear cuentas
nuevas). Lo único que falta para que el cliente lo use es **desplegarlo**
(ver la guía paso a paso más abajo) — el código en sí no tiene pendientes
del alcance acordado.

1. **`index.html`** — landing pública de pedidos (customer-facing). Diseño
   aprobado por el cliente — **no tocar el diseño ya aprobado sin que el
   cliente lo pida explícitamente.** Sí se le agregaron (a pedido del
   cliente, sin tocar el diseño existente) estas piezas nuevas:
   - Panel lateral "Zonas de reparto" (pestaña fija a la izquierda): muestra
     las comunas con despacho agrupadas por día, y las que el admin marcó
     como no disponibles — se carga en vivo desde `comunas_rutas`.
   - Atribución a vendedor vía link personalizado `?v=usuario`: si el
     cliente entra desde ese link, el botón de WhatsApp apunta al número del
     vendedor (no al principal) y el pedido queda guardado con su
     `vendedor_id`.
   - Guardado directo del pedido en la tabla `pedidos` de Supabase (además
     de abrir WhatsApp) — así el administrador tiene un registro automático
     de cada venta sin depender de Formspree (que sigue ahí pero no es la
     vía principal).
   - **Catálogo de productos dinámico**: el Pipeño 5L (con sus tramos por
     región), la Granadina 700cc, el Pipeño 2 Litros y cualquier producto
     nuevo que el admin agregue se cargan en vivo desde `productos` +
     `producto_tramos`. Si Supabase no responde, la landing usa valores de
     respaldo embebidos en el código (los mismos de hoy) — nunca se rompe.
     Cualquier producto "fijo" nuevo que el admin agregue aparece
     automáticamente como una sección más en la landing (mismo estilo que
     Granadina), sin tocar código.
     - **Bug encontrado y corregido** (reporte del cliente: "el Pipeño 2
       Litros no se ve en la página principal"): el Pipeño 2 Litros, al ser
       un producto agregado después (no existía en el HTML original como sí
       existe la Granadina), solo se pintaba cuando la consulta en vivo a
       Supabase funcionaba de verdad — si el proyecto real de Supabase del
       cliente todavía no tiene corrida la migración `schema_v3_productos_banner.sql`
       (que crea la tabla `productos`), la sección quedaba vacía en vez de
       mostrar un valor de respaldo, a diferencia de la Granadina o el
       Pipeño 5L. Se corrigió agregando un catálogo de respaldo embebido
       también para este tipo de productos nuevos (`productosDinamicos`
       ahora arranca con el Pipeño 2 Litros a $12.000 en vez de una lista
       vacía, y se pinta de inmediato sin esperar la red) — así el
       comportamiento queda consistente con el resto de la página: si
       Supabase falla o la migración todavía no está corrida, igual se ve.
       **Importante para el cliente**: si esto le pasó, es una señal de que
       probablemente todavía no corrió `schema_v2_actualizacion.sql` y
       `schema_v3_productos_banner.sql` en su proyecto real de Supabase (SQL
       Editor → pegar el contenido → Run, uno primero y el otro después) —
       sin esas migraciones, el catálogo de respaldo lo salva visualmente,
       pero el resto de las funciones nuevas (banner editable, agregar/quitar
       productos desde el admin, etc.) tampoco van a funcionar hasta que se
       corran. Verificado con una prueba nueva (`test_landing_sin_supabase.js`)
       que simula justo ese escenario (Supabase sin la tabla `productos`) y
       confirma que ahora sí se ve y se puede pedir con el precio correcto.
   - **Banner de delivery** arriba de todo (editable desde `admin.html`):
     título, mensaje, tipo (gratis / con costo / personalizado), fecha
     límite opcional con **cuenta regresiva en vivo**, e imagen/flyer
     opcional. Cuando el tipo es "gratis" y está vigente, el despacho se
     cobra en $0 automáticamente en el cálculo del pedido (no es solo
     cosmético) — y apenas se cumple la fecha límite, la cuenta regresiva lo
     detecta sola y el despacho vuelve a cobrarse según la comuna, sin que
     el admin tenga que acordarse de desactivar nada. Está cargado y activo
     desde ya: delivery gratis en Santiago por 2 semanas desde que se corrió
     `schema_v3_productos_banner.sql` — el cliente puede cambiar la fecha,
     el mensaje o desactivarlo cuando quiera desde el panel admin.
   - El precio de despacho por comuna ahora se lee de verdad desde
     `comunas_rutas.precio_despacho` (antes esa columna existía pero la
     landing no la usaba) — si la comuna no tiene precio cargado, se usa un
     valor referencial ($3.000); si está marcada "no disponible", se avisa
     al cliente en vez de cobrar.
   - Todo esto es "best effort": si Supabase no responde, la landing sigue
     funcionando igual por WhatsApp (no se rompe nada).
   - Fuente editable: `/home/claude/pelao-erasmo/template.html` (con
     placeholders `{{HERO_B64}}` etc.) — `index.html` se regenera desde ahí
     reemplazando esos placeholders con las imágenes en base64. **Edita
     siempre `template.html`, nunca `index.html` directo** (se sobrescribe
     al regenerar).
2. **`schema.sql`** — esquema completo de base de datos. Ya está corrido en el
   proyecto real de Supabase del cliente (org "El Pelao Erasmo", proyecto
   "pelao-erasmo"). Incluye:
   - Tablas: `perfiles`, `pedidos`, `comunas_rutas` (con la semilla de
     comuna→día que pidió el cliente), `historial`, `configuraciones`.
   - RLS: un vendedor solo ve/edita sus propios pedidos, y solo antes de
     `listo_despacho`. El admin ve/edita/elimina todo, en cualquier estado.
     El historial es inmutable (nadie puede editarlo ni borrarlo, ni
     siquiera el admin).
   - Trigger que asigna `dia_reparto` automáticamente según la comuna.
   - Trigger que registra automáticamente en `historial` cada creación/cambio
     de un pedido.
   - **Probado de verdad, varias veces**: se instaló Postgres local, se
     simuló el sistema de `auth.users`/`auth.uid()`/roles `anon` y
     `authenticated` de Supabase, y se corrieron pruebas de seguridad reales
     con datos concretos (no solo revisando el código) para cada capa nueva
     que se agregó. La última ronda (para el panel admin completo) confirmó
     explícitamente, con pedidos de prueba reales: un vendedor puede editar
     su propio pedido mientras esté pendiente/en preparación, NO puede
     editarlo una vez que pasa a "en ruta" o después, NO puede ver ni tocar
     pedidos de otro vendedor, y NO puede eliminar ningún pedido — mientras
     que el admin puede editar, cambiar de estado y eliminar cualquier
     pedido de cualquier vendedor, en cualquier estado, y ve el listado
     completo. Estas políticas ya existían desde antes en `schema.sql`; no
     hizo falta ninguna migración nueva para el CRUD de pedidos del admin,
     solo se le agregó cobertura de prueba explícita.
3. **`login.html`** — página de login. Pide usuario/contraseña, resuelve el
   email interno, llama a `supabase.auth.signInWithPassword`, revisa
   `perfiles.rol` y `perfiles.activo`, redirige a `vendedor.html` o
   `admin.html`. Probado con un mock de Supabase (login incorrecto, login
   correcto, redirección, cuenta bloqueada).
4. **`vendedor.html`** — formulario de nuevo pedido (reutiliza
   `assets/pricing.js` para los tramos de precio) + tabla "Mis pedidos" (la
   RLS se encarga de que solo vea los suyos). Probado con mock: cálculo de
   precio reactivo, validación de campos, inserción correcta, listado.
   Además incluye:
   - **"Mi perfil"**: cada vendedor puede editar su propio nombre y su
     WhatsApp (`telefono_whatsapp`) — protegido por un trigger en la base de
     datos que impide que se auto-edite el rol, el estado activo/bloqueado o
     el username, aunque alguien manipule el request desde el navegador.
   - **"Comunas y días de reparto"**: panel de solo lectura con el día de
     despacho, el valor de despacho y la disponibilidad de cada comuna.
   - **"Mis ventas" → Descargar Excel**: exporta a `.xlsx` (vía SheetJS,
     cargado desde CDN, mismo patrón sin build step del resto del proyecto)
     únicamente los pedidos del vendedor que tiene la sesión abierta — la
     RLS ya garantiza que nunca vea ni pueda exportar pedidos de otro
     vendedor.
5. **`admin.html`** — panel completo:
   - **Resumen de pedidos (dashboard)**: pedidos de hoy, pendientes,
     preparación, listos para despacho, en ruta, entregados y anulados de
     hoy, más ventas de hoy y ventas del mes (ambas excluyendo anulados). Se
     recalcula automáticamente al abrir el panel y cada vez que se cambia el
     estado de un pedido.
   - **Resumen general**: comunas cubiertas, comunas no disponibles,
     vendedores activos.
   - **Pedidos**: listado completo (hasta 300 más recientes por filtro), con
     filtros por texto libre (nombre/teléfono), estado, vendedor, comuna y
     rango de fechas. Cada fila permite cambiar el estado directo desde un
     selector, y tiene un botón "Ver" que despliega: edición de los datos
     del pedido (nombre, teléfono, dirección, número, depto, comuna,
     observaciones), detalle de los productos pedidos, y el historial
     completo de cambios de ese pedido (quién y cuándo). También se puede
     eliminar un pedido (con confirmación).
   - **Generar ruta de reparto**: elegir "hoy", "mañana", una fecha
     específica, o cualquier día de la semana — arma la lista de pedidos de
     esa ruta (excluye anulados), ordenados por comuna y luego por
     dirección, y permite descargar un Excel con columnas: comuna,
     dirección, cliente, teléfono, vendedor, productos, forma de pago,
     total y estado.
   - **Comunas y rutas**: editar día de reparto, valor de despacho y
     marcar/desmarcar una comuna como "no disponible para reparto" (se
     refleja automáticamente en `index.html` y `vendedor.html`, todos leen
     la misma tabla `comunas_rutas`). También permite agregar comunas
     nuevas.
   - **Productos**: editar nombre, unidad, descripción, precio y
     activo/inactivo de cada producto; agregar productos nuevos (fijos o
     por tramos); y para productos de tramos (como el Pipeño 5L) editar los
     precios por cantidad y por región. Eliminar productos también está
     disponible (con confirmación) — no rompe pedidos anteriores porque
     cada pedido guarda una copia de sus productos en
     `pedidos.detalle_productos`, no una referencia viva a la tabla.
   - **Vendedores**: lista de todos los vendedores con su WhatsApp y un
     interruptor para bloquear/desbloquear (un vendedor bloqueado no puede
     iniciar sesión, pero sus pedidos anteriores quedan intactos). Formulario
     para **crear un vendedor nuevo** (usuario, nombre, WhatsApp, contraseña
     provisoria) — esto llama a la función serverless
     `/api/crear-vendedor.js` (ver más abajo) porque crear usuarios de
     autenticación requiere la clave secreta de Supabase, que nunca puede
     estar en el navegador.
   - **Banner de delivery**: activar/desactivar, elegir tipo (gratis / con
     costo / personalizado), título, mensaje, fecha límite opcional (con
     cuenta regresiva automática en la landing) e imagen/flyer opcional.
6. **`schema_v2_actualizacion.sql`** — migración incremental sobre
   `schema.sql` (**el cliente debe correrla una sola vez en Supabase → SQL
   Editor → Run**, sin volver a correr `schema.sql`). Agrega: teléfono de
   WhatsApp por vendedor, autoedición segura del propio perfil, lectura
   pública (sin login) de `comunas_rutas` para la landing, una función
   seguridad-definer para resolver `?v=usuario` a un vendedor válido sin
   exponer el resto de la tabla `perfiles`, y permiso para que la landing
   pública guarde pedidos directo en la base de datos (atribuidos a un
   vendedor o "sin vendedor" si es una venta orgánica). Probada de la misma
   forma rigurosa que `schema.sql`.
7. **`schema_v3_productos_banner.sql`** — migración incremental sobre las
   dos anteriores (**correrla una sola vez, después de la v2, sin repetir
   las anteriores**). Agrega: tabla `productos` (catálogo editable, con
   precio fijo o por tramos), tabla `producto_tramos` (precios por cantidad
   y región para productos de tipo "tramos"), lectura pública de
   `configuraciones` (para que la landing muestre el banner sin login), y
   siembra el catálogo inicial: Pipeño 5 Litros (tramos, sin cambios de
   precio), Granadina 700cc ($22.000 el display de 12) y Pipeño 2 Litros
   ($12.000 el display de 6) — además de un banner de delivery gratis en
   Santiago por 2 semanas ya cargado y activo, editable desde el panel
   admin. Probada con el mismo método (Postgres local + simulación de RLS
   de Supabase).
8. **`api/crear-vendedor.js`** — función serverless (Vercel), NO se ejecuta
   en el navegador. Recibe una petición del panel admin con el token de
   sesión del que está logueado, y:
   1. Verifica ese token contra Supabase (nunca confía en lo que diga el
      navegador sobre quién es).
   2. Verifica, consultando la tabla `perfiles` con la clave secreta, que
      quien llama es realmente un admin activo — si no lo es, rechaza.
   3. Valida los datos del vendedor nuevo (usuario, nombre, contraseña de al
      menos 6 caracteres).
   4. Verifica que el nombre de usuario no esté repetido.
   5. Crea el usuario de autenticación en Supabase (con el mismo esquema
      `usuario@pelaoerasmo.internal` que usa el resto del sistema) y su fila
      en `perfiles` con rol `vendedor`.
   6. Si por algún motivo falla el paso de crear el perfil, deshace
      (elimina) el usuario de autenticación recién creado, para no dejar una
      cuenta fantasma sin perfil asociado.
   - **Probada la lógica completa** (18 casos: falta de configuración,
     método incorrecto, sin token, token inválido, llamador no-admin,
     admin bloqueado, usuario inválido, contraseña corta, usuario duplicado,
     error al crear la cuenta, rollback si falla el perfil, éxito, y
     normalización de mayúsculas) usando un doble local de
     `@supabase/supabase-js` — no se pudo probar contra el Supabase real
     desde este entorno (sin salida de red), pero la lógica del handler está
     verificada exhaustivamente y no depende de nada que no esté cubierto
     por esas pruebas.
   - Requiere el paquete `@supabase/supabase-js` — ya está declarado en
     `package.json` en la raíz del proyecto, Vercel lo instala solo al
     desplegar.
   - Requiere dos variables de entorno en Vercel (ver la guía de despliegue
     abajo): `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
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
  archivo de este proyecto, y nunca debe estarlo**. Va **únicamente** como
  variable de entorno `SUPABASE_SERVICE_ROLE_KEY` en la configuración del
  proyecto de Vercel (Project Settings → Environment Variables) — nunca en
  un archivo del repo, nunca en código que corra en el navegador, nunca
  pegada en un chat. El cliente debe copiarla directo desde Supabase
  (Project Settings → API → clave `service_role`/secreta) al formulario de
  Vercel, sin que pase por ningún otro lugar. Ver el paso a paso en
  "Despliegue" más abajo.

## Novedades de esta sesión — días especiales, comunas por región e imágenes editables (v4)

Todo lo que sigue ya está construido, probado (Postgres local + RLS +
Playwright) y cargado en `admin.html` / `index.html` de este entrega. Como
con `schema_v2` y `schema_v3`, hay **una migración SQL nueva que el cliente
debe correr una sola vez** en su Supabase real.

10. **`schema_v4_dias_especiales_imagenes.sql`** — migración incremental
    (**correrla una sola vez, después de v2 y v3, sin repetir las
    anteriores**: Supabase → SQL Editor → pegar el contenido → Run). Agrega
    la tabla `dias_especiales_reparto` (fecha, comuna opcional — vacío
    significa "todas las comunas", nota, activo/inactivo) con lectura
    pública (para que la landing avise a los clientes) y escritura solo para
    admin. No requiere ninguna tabla nueva para el resto de las funciones de
    abajo: reutiliza la tabla `configuraciones` que ya existía desde
    `schema.sql`, agregando una nueva clave (`imagenes_landing`) además de
    la que ya usaba el banner (`banner_delivery`).
11. **Comunas separadas por región (RM vs V Región)** — pedido explícito del
    cliente para "que se vea la diferencia". En `admin.html`, la tabla de
    comunas ahora se muestra en dos bloques con su propio título
    ("Región Metropolitana" / "V Región"), cada uno con su propia tabla,
    en vez de una sola lista mezclada.
12. **Selección múltiple + edición en lote de comunas** — cada fila de
    comuna en `admin.html` tiene ahora un checkbox de selección (además del
    checkbox de disponibilidad que ya existía). Se pueden marcar varias
    comunas (de una región o de ambas) y, desde una barra que aparece arriba
    de la tabla, aplicarles de una sola vez el mismo día de reparto,
    precio de despacho y/o disponibilidad. Como con la edición fila por
    fila, hay que apretar "Guardar todos los cambios" después para que
    quede guardado en Supabase.
13. **Botón rápido "Activar despacho gratis por esta semana (7 días)"** —
    en la sección de banner de delivery de `admin.html`. Con un solo clic
    completa automáticamente el banner (activo = sí, tipo = gratis, título
    y mensaje sugeridos si estaban vacíos, fecha límite = hoy + 7 días) sin
    borrar nada que el admin ya haya escrito a mano. El editor manual de
    banner que ya existía sigue disponible tal cual para casos distintos a
    "esta semana". Igual que antes, falta apretar "Guardar banner" para que
    quede activo.
14. **Días especiales de reparto (CRUD)** — nueva sección en `admin.html`
    para agregar una excepción puntual: repartir en una comuna (o en
    todas) en una fecha específica aunque no sea su día habitual de la
    semana. Se puede activar/desactivar o eliminar cada una. Esto también
    se conectó al generador de rutas: al generar la ruta de una fecha que
    tiene un día especial activo, la ruta incluye automáticamente los
    pedidos de esas comunas fuera de ciclo (marcados con una etiqueta "día
    especial" para que se distingan de los pedidos normales del día). En la
    landing pública, estos días especiales también aparecen en el panel de
    "Zonas de reparto" como aviso para el cliente.
15. **Imágenes de la página principal editables desde admin** — nueva
    sección en `admin.html` para subir/quitar, sin tocar código ni volver a
    desplegar: la foto principal (hero), el flyer de precios de Región
    Metropolitana y el flyer de precios de V Región. Cada una se puede
    "volver a la de siempre" (vuelve al archivo original que ya venía en el
    proyecto) si el admin se arrepiente. Se guardan en la misma tabla
    `configuraciones` (clave `imagenes_landing`) que ya usaba el banner —
    misma lógica de siempre. Igual que con el resto de imágenes del
    sistema, si no hay nada guardado o Supabase falla, la landing sigue
    mostrando las imágenes originales — nunca queda en blanco.
16. **Landing: comunas filtradas por región + resumen visible al entrar** —
    al elegir "Región Metropolitana" o "V Región" en la landing, tanto el
    panel de "Zonas de reparto" (el que se abre como pestaña) como un nuevo
    resumen que aparece de inmediato al entrar a la página muestran
    **solo** las comunas de la región elegida, con su precio de despacho.
    Este resumen nuevo (tarjeta fija, no un pop-up ni una pestaña que haya
    que abrir) se ve apenas se carga la página, sin que el cliente tenga
    que hacer clic en nada — cumple el pedido de "que se vea directo al
    entrar a la página". **Decisión de diseño**: se probó primero abrir
    automáticamente el panel completo de "Zonas de reparto" al cargar la
    página, pero las pruebas automatizadas detectaron que eso bloqueaba
    toda la página (el cliente no podía hacer clic en el formulario de
    pedido mientras el panel estuviera abierto encima). Por eso se optó por
    esta tarjeta de resumen no bloqueante en vez del panel completo
    abierto — el cliente ve los precios de inmediato y puede seguir
    interactuando con el resto de la página al mismo tiempo; si quiere el
    detalle completo (comunas no disponibles, etc.) puede abrir el panel
    completo con un botón "Ver todas las comunas y detalle completo".

### Pruebas nuevas de esta sesión

- `test_v4.sql` (local, Postgres + simulación de RLS de Supabase): lectura
  pública de días especiales y de la nueva clave de configuración,
  bloqueo de escritura para anon/vendedor, permisos correctos para admin.
- `test_admin_v4.js` (Playwright): comunas agrupadas y ordenadas por
  región, selección múltiple + edición en lote + verificación de guardado,
  botón rápido de banner (fecha calculada y guardado correcto), CRUD
  completo de días especiales, guardado de imágenes (incluye verificar que
  las imágenes no tocadas no se sobreescriben con `null`).
- `test_landing_zonas_region.js` (Playwright): resumen visible sin ningún
  clic, panel completo permanece cerrado por defecto (no bloquea la
  página), filtrado correcto de comunas/precios/días especiales al
  cambiar entre Región Metropolitana y V Región (en ambos sentidos).
- `test_landing_imagenes.js` (Playwright): la landing usa la imagen nueva
  subida por el admin cuando existe, y sigue mostrando la de siempre si no
  hay nada guardado o Supabase falla.
- Se corrigieron además tres pruebas antiguas que quedaron desactualizadas
  por estos cambios (mocks a los que les faltaba la tabla nueva o el campo
  `region`, y un selector de checkbox ambiguo después de agregar el
  checkbox de selección múltiple) — toda la batería de pruebas (SQL +
  Playwright, nuevas y antiguas) vuelve a pasar 100% sin errores.

## Bootstrap pendiente (antes de poder probar login)

El cliente debe crear a mano el primer usuario admin en el dashboard de
Supabase (Authentication → Users → Add user, con email
`admin@pelaoerasmo.internal`), y luego insertar la fila correspondiente en
`public.perfiles` vía SQL Editor. Instrucciones exactas ya se le dieron por
chat. Confirmar si ya lo hizo. (Una vez que exista ese primer admin, ya
puede crear el resto de los vendedores directamente desde el panel — el
botón "Crear vendedor nuevo" en `admin.html` — sin volver a tocar SQL.)

## Nota importante: notificación automática al admin por WhatsApp

El cliente pidió que, además de que el pedido llegue al WhatsApp del
vendedor (o al principal si no hay vendedor), a él **le llegue
automáticamente por WhatsApp la información de cada venta**. Esto **no es
técnicamente posible gratis**: un link `wa.me/...` abre WhatsApp con el
mensaje precargado pero requiere que alguien toque "Enviar" — no se puede
disparar en silencio desde una página web — y un solo link solo puede
apuntar a un número a la vez (no se puede "enviar a dos personas" con un
clic). La única forma de lograr un envío 100% automático y silencioso es la
API oficial de WhatsApp Business, que es paga y requiere aprobación de
Meta — está fuera del alcance actual.

Lo que sí se implementó como equivalente funcional: **cada pedido de la
landing se guarda automáticamente en la base de datos** (tabla `pedidos`),
sea o no atribuido a un vendedor, y ahora el panel admin ya está completo
(dashboard + listado de pedidos), así que el admin puede ver ahí, en tiempo
real, cada venta que entra — sin depender de que alguien le reenvíe el
WhatsApp. Falta confirmarle esto al cliente para que sepa qué esperar.

## Pendientes fuera del alcance ya construido (ideas a futuro, no bloqueantes)

- Integrar la API de Google Maps para optimizar el orden de la ruta por
  distancia real (hoy se ordena alfabéticamente por comuna y dirección, que
  es una aproximación razonable sin costo).
- Notificaciones automáticas reales (fuera de WhatsApp) si el cliente
  eventualmente quiere pagar por la API oficial de WhatsApp Business o un
  servicio de email/SMS.

## Despliegue — guía paso a paso (GitHub + Vercel)

Este entorno de Cowork **no tiene salida de red hacia GitHub ni npm**, así
que no puede hacer el despliegue por sí mismo. Estos pasos están pensados
para hacerse desde el celular o el computador del cliente, sin necesitar
saber programar. Si el cliente tiene Claude Code corriendo en su
computador (con git y npm reales), puede simplemente pedirle "sube este
proyecto a GitHub y despliégalo en Vercel" y Claude Code hará estos mismos
pasos automáticamente.

### Paso 1 — Subir el código a GitHub

1. Si no tiene cuenta, crear una gratis en [github.com](https://github.com).
2. Crear un repositorio nuevo (botón verde "New"), por ejemplo llamado
   `pelao-erasmo-sistema`. Puede dejarlo **privado** (recomendado, aunque no
   es obligatorio ya que no hay claves secretas en el código).
3. Subir todos los archivos de esta carpeta al repositorio. La forma más
   simple sin usar la terminal: en la página del repo recién creado, usar
   "uploading an existing file" y arrastrar todos los archivos y carpetas
   (incluyendo `api/`, `assets/`, `package.json`, `index.html`, `login.html`,
   `vendedor.html`, `admin.html`).
   - **No subir** los archivos que empiezan con `test_` ni `screenshot_` —
     son solo para pruebas internas, no afectan el funcionamiento pero no
     hace falta subirlos.

### Paso 2 — Conectar el repositorio a Vercel

1. Crear una cuenta gratis en [vercel.com](https://vercel.com) (se puede
   entrar directo con la cuenta de GitHub del paso anterior — es lo más
   simple).
2. En el dashboard de Vercel, "Add New..." → "Project".
3. Elegir el repositorio `pelao-erasmo-sistema` de la lista (Vercel pide
   autorización para leer los repos de GitHub la primera vez).
4. En "Configure Project": como es un sitio estático + funciones `/api`,
   Vercel lo detecta automáticamente, no hace falta tocar nada en
   "Build and Output Settings".
5. **Antes de hacer clic en "Deploy"**, abrir la sección "Environment
   Variables" en esa misma pantalla (o después, desde Project Settings →
   Environment Variables) y agregar estas dos:

   | Nombre | Valor | Dónde conseguirlo |
   |---|---|---|
   | `SUPABASE_URL` | `https://kbrnecuueekypztyopua.supabase.co` | Ya es la URL pública del proyecto (la misma que está en `assets/supabase-client.js`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (clave secreta, empieza con `sb_secret_...`) | Supabase → el proyecto → Project Settings → API → sección "Project API keys" → la clave `service_role` / secreta (NO la publicable) |

   La clave secreta **nunca se debe pegar en ningún chat ni archivo del
   repositorio** — solo va en este formulario de Vercel, que es privado y
   está pensado exactamente para esto.
6. Clic en "Deploy". Vercel instala las dependencias (`@supabase/supabase-js`
   desde `package.json`) y publica el sitio solo. En un par de minutos queda
   una URL tipo `https://pelao-erasmo-sistema.vercel.app`.

### Paso 3 — Verificar que quedó bien

1. Abrir la URL que dio Vercel — debería verse la landing pública igual que
   siempre.
2. Ir a `/login.html`, entrar con el usuario admin ya creado en Supabase
   (ver "Bootstrap pendiente" arriba).
3. En el panel admin, ir a "Crear vendedor nuevo" y crear una cuenta de
   prueba — si el mensaje dice "creado correctamente", significa que las
   variables de entorno quedaron bien configuradas. Si dice "no se pudo
   conectar con el servidor", revisar que las dos variables de entorno del
   Paso 2 estén bien escritas (sin espacios de más) y volver a desplegar
   (Vercel → el proyecto → Deployments → los tres puntos del último deploy →
   "Redeploy").

### Paso 4 — Dominio propio (opcional)

Si el cliente ya tiene un dominio (ej. `pelaoerasmo.cl`), en Vercel →
el proyecto → Settings → Domains se puede agregar y Vercel da las
instrucciones exactas de qué registro DNS agregar en el proveedor del
dominio. No es necesario para que el sitio funcione — la URL gratis de
Vercel (`....vercel.app`) ya es un sitio real y funcional.

### Después de desplegado — cómo actualizar el sitio a futuro

Cualquier cambio futuro (otro producto, otro texto) se hace: (1) editar los
archivos localmente o pedírselo a Claude, (2) subir los cambios al mismo
repositorio de GitHub (reemplazando los archivos modificados), y Vercel
**redespliega solo** apenas detecta el cambio — no hay que repetir el Paso 2.

## Estilo de trabajo que pidió el cliente

- Cambios pequeños y verificables, sin romper lo que ya funciona.
- Reutilizar al máximo el código existente.
- No reconstruir la landing pública desde cero ni cambiar su diseño.
- Explicarle los pasos de forma clara y concreta (suele trabajar desde el
  celular, con poco tiempo) — pero si en algún momento tiene Claude Code
  corriendo en su computador (con git y npm reales), probablemente prefiera
  que las cosas se hagan directo (git, deploy, etc.) en vez de que se le
  pidan pasos manuales uno por uno.
