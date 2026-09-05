# Veltrix — instrucciones para instalarlo en una empresa nueva

Este sistema (hoy vive como "El Pelao Erasmo") es la primera instalación de
**Veltrix**, un sistema de pedidos y rutas pensado para reutilizarse con
cualquier empresa que reparta pedidos. Cada empresa nueva tiene su propia
copia completa del sistema — su propia base de datos, su propio link, su
propio logo y colores — nunca comparten nada entre sí. Esta es la guía
completa, paso a paso, en el orden en que hay que hacerlo.

## ⚠️ Antes de empezar — revisar esto una vez

El archivo `schema.sql` de este repositorio quedó **desactualizado**
respecto a lo que realmente corre hoy en el Supabase de El Pelao Erasmo:
varias mejoras (el rol "repartidor", el estado "rechazado", el cálculo
automático del día de reparto, las fotos de entrega) se corrieron
directo en Supabase en su momento pero nunca se guardaron como archivo en
este repositorio. Si un cliente nuevo parte solo con el `schema.sql` actual,
le va a faltar todo eso.

**Antes de usar esta plantilla con el próximo cliente**, avísame y
reconstruimos juntos un `schema.sql` completo y al día: te paso una consulta
para correr en el SQL Editor de tu Supabase actual, me pegas el resultado, y
yo dejo el archivo corregido y commiteado en el repositorio. Es un paso
único — una vez hecho, esta plantilla queda confiable para todos los
clientes que vengan después.

## Paso 1 — Crear el proyecto de Supabase del cliente nuevo

1. Crear un proyecto nuevo en [supabase.com](https://supabase.com/dashboard) —
   plan gratis alcanza para partir.
2. Ir a **SQL Editor** → pegar el contenido completo de `schema.sql` (ya
   corregido, ver advertencia arriba) → **Run**.
3. Ir a **Authentication → Users → Add user** y crear el primer usuario
   administrador (ej. email `admin@nombredelcliente.internal`, con una
   contraseña provisoria).
4. En el **SQL Editor**, insertar la fila de ese admin en `public.perfiles`
   (mismo formato que se usó para El Pelao Erasmo — te paso el `INSERT`
   exacto cuando lleguemos a este paso con un cliente real).
5. Anotar estos dos datos, que se usan en el Paso 3:
   **Project Settings → API** → "Project URL" y la clave **anon /
   publishable** (nunca la "service_role" para esto).

## Paso 2 — Crear el repositorio de GitHub

1. Crear una cuenta gratis en [github.com](https://github.com) si no tiene una.
2. Crear un repositorio nuevo (botón verde "New"), privado de preferencia.
3. Subir ahí una copia completa de este proyecto (todos los archivos y
   carpetas: `api/`, `assets/`, `scripts/`, `index.html`, `login.html`,
   `admin.html`, `vendedor.html`, `reparto.html`, `manifest.webmanifest`,
   `sw.js`, `package.json`, `schema.sql`, `vercel.json`, `.gitignore`).

## Paso 3 — Rebautizar la copia para el cliente nuevo

Parado en la raíz de esa copia (necesita Python 3, y Pillow si se usa
`--logo`: `pip install Pillow --break-system-packages`):

```
python3 scripts/rebrand_cliente.py \
  --nombre "Nombre completo de la empresa" \
  --nombre-corto "Corto" \
  --logo /ruta/al/logo.png \
  --supabase-url "https://xxxxxxxx.supabase.co" \
  --supabase-key "sb_publishable_..." \
  --color-primario "#155724" \
  --color-secundario "#1e7d32" \
  --color-claro "#2e9e42" \
  --color-acento "#D52B1E" \
  --color-azul "#0039A6" \
  --color-miel "#f2b705" \
  --color-fondo "#faf9f5"
```

`--supabase-url` y `--supabase-key` son los dos datos que anotaste en el
Paso 1 — el script los actualiza en TODOS los archivos que los usan
(`assets/` y cada función de `/api`), para que ningún archivo se quede
apuntando por error a la base de datos de otro cliente. El logo y los
colores son opcionales — si no se pasan, queda el diseño actual. Esto deja
listo automáticamente:

- El nombre de la empresa en el login, panel admin, vendedor y reparto
  (títulos, encabezado, mensajes de WhatsApp, cotizaciones, informes en PDF).
- El nombre corto bajo el ícono cuando alguien instala la app en su celular.
- Los colores de toda la interfaz.
- El logo y los 4 íconos de la app instalable (Android + iPhone).
- La conexión a la base de datos correcta en todos los archivos.

## Paso 4 — Revisar a mano lo que no es solo marca

El script no toca esto porque tiene contenido propio del negocio, no solo
diseño:

- **`index.html`** — la página pública donde el cliente final cotiza o hace
  su pedido. Tiene los productos, precios y textos de El Pelao Erasmo
  (pipeño, granadina, frutos secos) — para otra empresa hay que rehacerla
  con sus propios productos.
- **`/api`** — revisar si hay textos con el nombre de la empresa en correos
  o mensajes antes de usarlas con el cliente nuevo (el script ya actualizó
  la conexión a Supabase, esto es solo por si queda algún texto suelto).
- **`scripts/crear-cuentas-iniciales.js`** — si se usa en vez del Paso 1.4,
  correrlo con los datos del cliente nuevo.

## Paso 5 — Desplegar en Vercel

1. Crear una cuenta gratis en [vercel.com](https://vercel.com) (se puede
   entrar directo con la cuenta de GitHub).
2. "Add New..." → "Project" → elegir el repositorio del cliente nuevo.
3. Antes de darle a "Deploy", agregar en "Environment Variables":

   | Nombre | Valor |
   |---|---|
   | `SUPABASE_URL` | La misma "Project URL" del Paso 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → el proyecto → Project Settings → API → clave `service_role` (secreta — nunca pegarla en un chat ni en el repositorio, solo en este formulario de Vercel) |

4. Deploy. En un par de minutos queda una URL tipo
   `https://nombre-del-cliente.vercel.app`.

## Paso 6 — Verificar que quedó todo bien

1. Abrir la URL nueva — debería verse la landing pública con el logo y
   colores del cliente nuevo.
2. Entrar a `/login.html` con el admin creado en el Paso 1.
3. En el panel admin, crear un vendedor de prueba — si dice "creado
   correctamente", las variables de entorno del Paso 5 quedaron bien. Si
   dice "no se pudo conectar con el servidor", revisar esas dos variables.
4. Instalar la app desde el navegador ("Instalar app" / "Agregar a inicio")
   y confirmar que el ícono y el nombre corto sean los del cliente nuevo.

## Infraestructura — resumen

Cada empresa nueva queda con TODO separado del resto: su propio proyecto
Supabase, su propio repositorio de GitHub, su propio proyecto Vercel. Es más
trabajo que si todas compartieran una sola base de datos, pero es mucho más
simple y seguro de armar rápido, y un problema en la cuenta de una empresa
nunca afecta a las demás. Si más adelante Veltrix crece a varios clientes
activos a la vez, se puede evaluar pasar a una sola plataforma compartida
(varias empresas en la misma base de datos, cada una viendo solo lo suyo) —
es una reescritura más grande, no urgente por ahora.

## Cobro

Por ahora el cobro a cada empresa nueva es manual (cotización +
transferencia), igual que con El Pelao Erasmo. Cuando haya más de un
cliente usando Veltrix y valga la pena automatizarlo, se puede sumar cobro
recurrente dentro del sistema (requiere abrir una cuenta de cobro propia,
por ejemplo Flow o Mercado Pago en Chile, y construir el bloqueo de acceso
para quien no pague).
