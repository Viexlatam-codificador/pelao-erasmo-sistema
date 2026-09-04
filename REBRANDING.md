# Veltrix — cómo armar esto para una empresa nueva

Este sistema (hoy vive como "El Pelao Erasmo") es la primera instalación de
**Veltrix**, un sistema de pedidos y rutas pensado para reutilizarse con
cualquier empresa que reparta pedidos: cambia el logo, los colores y el
nombre, y sirve para otro rubro. Esta es la guía para armar una instalación
nueva, empresa por empresa — cada cliente tiene su propia copia del sistema,
su propia base de datos y su propio link (no comparten datos entre sí).

## 1. Marca visual — automático

Desde una copia nueva del repositorio (clonarlo de nuevo, no reusar la
carpeta de otro cliente), parado en la raíz del proyecto:

```
python3 scripts/rebrand_cliente.py \
  --nombre "Nombre de la empresa" \
  --nombre-corto "Corto" \
  --logo /ruta/al/logo.png \
  --color-primario "#155724" \
  --color-secundario "#1e7d32" \
  --color-claro "#2e9e42" \
  --color-acento "#D52B1E" \
  --color-azul "#0039A6" \
  --color-miel "#f2b705" \
  --color-fondo "#faf9f5"
```

Los colores y el logo son opcionales — si no se pasan, queda la paleta y el
logo actual. Esto deja listo automáticamente:

- El nombre de la empresa en el login, el panel admin, vendedor y reparto
  (títulos, encabezado, mensajes de WhatsApp, cotizaciones, informes en PDF).
- El nombre corto que aparece bajo el ícono cuando alguien instala la app en
  su celular.
- Los colores de toda la interfaz (un solo lugar: `assets/brand.css`).
- El logo y los 4 íconos de la app instalable (Android + iPhone).

Requiere Pillow si se usa `--logo`: `pip install Pillow --break-system-packages`.

## 2. Contenido propio del negocio — a mano

Esto **no** lo toca el script porque tiene texto y lógica específicos del
negocio (no es solo la marca), y cambia según qué vende cada empresa:

- **`index.html`** — la página pública donde el cliente final cotiza o hace su
  pedido. Tiene los productos, precios y textos de El Pelao Erasmo
  (pipeño, granadina, frutos secos) — para otra empresa hay que rehacer esa
  parte con sus propios productos.
- **`/api`** — las funciones que corren en el servidor (crear vendedores,
  resetear contraseñas, pedidos públicos, etc.). Revisar si tienen textos con
  el nombre de la empresa (correos, mensajes) antes de usarlas con un
  cliente nuevo.
- **`scripts/crear-cuentas-iniciales.js`** — crea el primer usuario
  administrador. Hay que correrlo una vez por cliente nuevo, con sus propios
  datos.
- **`schema.sql`** (y las migraciones `schema_v*.sql`) — la estructura de la
  base de datos en sí no cambia, pero hay que crearla en un proyecto
  **Supabase nuevo y separado** para cada cliente — nunca reusar el mismo
  proyecto Supabase entre empresas, o terminarían viendo los datos unas de
  otras.

## 3. Infraestructura — un proyecto por cliente

Cada empresa nueva necesita, todo separado del resto:

1. Un proyecto de **Supabase** nuevo (base de datos + login), con
   `schema.sql` y las migraciones corridas ahí.
2. Un repositorio de **GitHub** nuevo (o una rama), con este código ya
   rebautizado.
3. Un proyecto de **Vercel** nuevo, apuntando a ese repositorio, con las
   variables de entorno de ese Supabase.

Esto es más trabajo que si todas las empresas compartieran una sola base de
datos, pero es mucho más simple y seguro de armar rápido — y como cada
cliente queda aislado del resto, un problema o un cambio en la cuenta de una
empresa nunca afecta a las demás. Si en algún momento conviene pasar a una
sola plataforma compartida (varias empresas en la misma base de datos,
cada una viendo solo lo suyo), es una reescritura más grande — se puede
evaluar más adelante si Veltrix crece a varios clientes activos a la vez.

## 4. Cobro

Por ahora el cobro es manual (cotización + transferencia), igual que con
El Pelao Erasmo. Cuando haya más de un cliente usando Veltrix y valga la
pena automatizarlo, se puede sumar cobro recurrente dentro del sistema
(requiere abrir una cuenta de cobro propia, por ejemplo Flow o Mercado Pago
en Chile, y construir el bloqueo de acceso para quien no pague).
