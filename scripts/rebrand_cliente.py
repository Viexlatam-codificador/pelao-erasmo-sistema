#!/usr/bin/env python3
"""
============================================================================
Veltrix — Rebautizar esta plantilla para una empresa nueva
============================================================================

Este proyecto (hoy configurado para "El Pelao Erasmo") está pensado para
reutilizarse: cada empresa nueva que quiera su propio sistema de pedidos y
rutas parte de una copia de este repositorio y le pone su nombre, sus
colores y su logo. Este script hace esa parte automáticamente — el resto
(el contenido de index.html, los mensajes de las API en /api, y el script
de creación de cuentas iniciales) hay que revisarlo a mano porque tiene
lógica y textos propios del negocio, no solo la marca visual. Ver
REBRANDING.md para la lista completa de pasos.

Uso (parado en la raíz del proyecto, sobre una copia/clon nueva):

  python3 scripts/rebrand_cliente.py \
    --nombre "Distribuidora Ejemplo" \
    --nombre-corto "Ejemplo" \
    --logo /ruta/al/logo-nuevo.png

  Los colores son opcionales — si no se pasan, se deja la paleta actual
  (verde/rojo/azul de El Pelao Erasmo). Para cambiarlos también:

  python3 scripts/rebrand_cliente.py \
    --nombre "Distribuidora Ejemplo" --nombre-corto "Ejemplo" \
    --logo /ruta/al/logo-nuevo.png \
    --color-primario "#0d3b66" --color-secundario "#145da0" \
    --color-claro "#1c7ed6" --color-acento "#e63946" \
    --color-azul "#023e8a" --color-miel "#f4a261" --color-fondo "#f7f7fb"

  IMPORTANTE — conexión a Supabase: este proyecto necesita SU PROPIO
  proyecto de Supabase (nunca reusar el de otro cliente, o terminarían
  viendo los datos unos de otros). Una vez creado ese proyecto nuevo y
  corrido schema.sql ahí, pásale sus datos a este mismo script para que
  actualice la URL/clave en TODOS los archivos que la usan (assets/ y
  /api, que si no quedan todos alineados algún archivo se queda apuntando
  a la base de datos del cliente viejo sin que se note a simple vista):

  python3 scripts/rebrand_cliente.py \
    --nombre "Distribuidora Ejemplo" --nombre-corto "Ejemplo" \
    --supabase-url "https://xxxxxxxx.supabase.co" \
    --supabase-key "sb_publishable_..." \
    --dominio-interno "distribuidoraejemplo.internal"

  Si no se pasa --dominio-interno, se genera solo a partir de --nombre-corto
  (ej. "Ejemplo" → "ejemplo.internal"). La URL y la clave se consiguen en
  Supabase → el proyecto nuevo → Project Settings → API ("Project URL" y
  la clave "anon" / "publishable" — NUNCA la "service_role").

Requiere Pillow (pip install Pillow --break-system-packages) solo si se
pasa --logo, para generar los íconos de la app instalable.
============================================================================
"""

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

NOMBRE_ACTUAL = "El Pelao Erasmo"

# Archivos donde el nombre de la empresa aparece en texto visible para el
# usuario (títulos, encabezados, mensajes de WhatsApp, cotizaciones,
# informes en PDF) o en comentarios de encabezado. Es un simple
# reemplazo de texto — seguro porque "El Pelao Erasmo" no se usa acá para
# nada más que como nombre propio.
ARCHIVOS_CON_NOMBRE = [
    "login.html",
    "admin.html",
    "vendedor.html",
    "reparto.html",
    "manifest.webmanifest",
    "sw.js",
    "assets/informes.js",
    "assets/auth-guard.js",
    "assets/deshacer.js",
    "assets/mapa-ruta.js",
    "assets/pricing.js",
    "assets/supabase-client.js",
]

# Nombre de cada variable de color en assets/brand.css (:root) → el
# argumento de línea de comandos correspondiente.
VARIABLES_COLOR = {
    "--verde-oscuro": "color_primario",
    "--verde": "color_secundario",
    "--verde-claro": "color_claro",
    "--rojo": "color_acento",
    "--azul": "color_azul",
    "--miel": "color_miel",
    "--bg": "color_fondo",
}

# Valores actuales de conexión a Supabase de El Pelao Erasmo, hardcodeados en
# varios archivos (no solo assets/supabase-client.js) — hay que reemplazarlos
# TODOS por los del proyecto Supabase nuevo del cliente. La clave publicable
# (anon) es segura de tener en el código porque las tablas usan RLS; la clave
# secreta (service_role) nunca está en el repo, así que este script no la toca.
SUPABASE_URL_ACTUAL = "https://kbrnecuueekypztyopua.supabase.co"
SUPABASE_KEY_ACTUAL = "sb_publishable_nFPkaD6iiTKZMlhIufS9-w__4fdlfqo"
DOMINIO_INTERNO_ACTUAL = "pelaoerasmo.internal"

ARCHIVOS_CON_CONEXION_SUPABASE = [
    "assets/supabase-client.js",
    "index.html",
    "scripts/crear-cuentas-iniciales.js",
    "schema.sql",
    "api/public-order.js",
    "api/admin-reset-password.js",
    "api/precios-publicos.js",
    "api/comunas-publicas.js",
    "api/admin-users.js",
    "api/eliminar-usuario.js",
    "api/vendedores-publicos.js",
    "api/crear-vendedor.js",
]


def slug_dominio(nombre_corto: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "", nombre_corto.lower())
    return f"{slug or 'cliente'}.internal"


def reemplazar_nombre(nombre_nuevo: str):
    total_reemplazos = 0
    for ruta_rel in ARCHIVOS_CON_NOMBRE:
        ruta = RAIZ / ruta_rel
        if not ruta.exists():
            print(f"  (aviso) no encontré {ruta_rel}, lo salto")
            continue
        contenido = ruta.read_text(encoding="utf-8")
        cantidad = contenido.count(NOMBRE_ACTUAL)
        if cantidad:
            contenido = contenido.replace(NOMBRE_ACTUAL, nombre_nuevo)
            ruta.write_text(contenido, encoding="utf-8")
            total_reemplazos += cantidad
        print(f"  {ruta_rel}: {cantidad} reemplazo(s)")
    print(f"Total: {total_reemplazos} reemplazos de \"{NOMBRE_ACTUAL}\" → \"{nombre_nuevo}\"")


def actualizar_nombre_corto_manifest(nombre_corto: str):
    ruta = RAIZ / "manifest.webmanifest"
    contenido = ruta.read_text(encoding="utf-8")
    contenido = re.sub(r'"short_name":\s*"[^"]*"', f'"short_name": "{nombre_corto}"', contenido)
    ruta.write_text(contenido, encoding="utf-8")
    print(f"  manifest.webmanifest: short_name → \"{nombre_corto}\"")

    for ruta_rel in ["login.html", "admin.html", "vendedor.html", "reparto.html"]:
        ruta_html = RAIZ / ruta_rel
        contenido = ruta_html.read_text(encoding="utf-8")
        contenido = re.sub(
            r'(<meta name="apple-mobile-web-app-title" content=")[^"]*(">)',
            rf'\g<1>{nombre_corto}\g<2>',
            contenido,
        )
        ruta_html.write_text(contenido, encoding="utf-8")
    print(f"  apple-mobile-web-app-title en las 4 páginas → \"{nombre_corto}\"")


def actualizar_colores(args):
    ruta = RAIZ / "assets" / "brand.css"
    contenido = ruta.read_text(encoding="utf-8")
    cambios = 0
    for variable, arg_nombre in VARIABLES_COLOR.items():
        valor = getattr(args, arg_nombre)
        if not valor:
            continue
        patron = re.compile(re.escape(variable) + r":\s*#[0-9a-fA-F]{3,8};")
        nuevo, n = patron.subn(f"{variable}:{valor};", contenido, count=1)
        if n:
            contenido = nuevo
            cambios += 1
            print(f"  {variable} → {valor}")
        else:
            print(f"  (aviso) no encontré la variable {variable} en brand.css")
    if cambios:
        ruta.write_text(contenido, encoding="utf-8")

    # theme_color / background_color del manifest siguen a los colores
    # primario y de fondo, para que la barra del navegador y la pantalla de
    # carga de la app instalada combinen con la nueva paleta.
    if args.color_primario or args.color_fondo:
        ruta_manifest = RAIZ / "manifest.webmanifest"
        contenido_m = ruta_manifest.read_text(encoding="utf-8")
        if args.color_primario:
            contenido_m = re.sub(r'"theme_color":\s*"[^"]*"', f'"theme_color": "{args.color_primario}"', contenido_m)
        if args.color_fondo:
            contenido_m = re.sub(r'"background_color":\s*"[^"]*"', f'"background_color": "{args.color_fondo}"', contenido_m)
        ruta_manifest.write_text(contenido_m, encoding="utf-8")
        for ruta_rel in ["login.html", "admin.html", "vendedor.html", "reparto.html"]:
            ruta_html = RAIZ / ruta_rel
            c = ruta_html.read_text(encoding="utf-8")
            if args.color_primario:
                c = re.sub(r'(<meta name="theme-color" content=")[^"]*(">)', rf'\g<1>{args.color_primario}\g<2>', c)
            ruta_html.write_text(c, encoding="utf-8")
        print("  theme_color / background_color del manifest y las 4 páginas actualizados")


def actualizar_conexion_supabase(supabase_url: str, supabase_key: str, dominio_interno: str):
    reemplazos = [
        (SUPABASE_URL_ACTUAL, supabase_url),
        (SUPABASE_KEY_ACTUAL, supabase_key) if supabase_key else None,
        (DOMINIO_INTERNO_ACTUAL, dominio_interno),
    ]
    reemplazos = [r for r in reemplazos if r]

    total = 0
    for ruta_rel in ARCHIVOS_CON_CONEXION_SUPABASE:
        ruta = RAIZ / ruta_rel
        if not ruta.exists():
            continue
        contenido = ruta.read_text(encoding="utf-8")
        cantidad_archivo = 0
        for viejo, nuevo in reemplazos:
            cantidad_archivo += contenido.count(viejo)
            contenido = contenido.replace(viejo, nuevo)
        if cantidad_archivo:
            ruta.write_text(contenido, encoding="utf-8")
            total += cantidad_archivo
        print(f"  {ruta_rel}: {cantidad_archivo} reemplazo(s)")
    print(f"Total: {total} reemplazos de conexión a Supabase")
    print("  (nota: la clave SERVICE_ROLE no vive en el código — esa se configura aparte")
    print("   como variable de entorno en Vercel, ver REBRANDING.md / PROYECTO_ESTADO.md)")


def regenerar_iconos(ruta_logo: Path):
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: falta Pillow. Instala con: pip install Pillow --break-system-packages")
        sys.exit(1)

    if not ruta_logo.exists():
        print(f"ERROR: no encuentro el logo en {ruta_logo}")
        sys.exit(1)

    src = Image.open(ruta_logo).convert("RGB")

    destino_logo = RAIZ / "assets" / "logo.jpeg"
    src.save(destino_logo, "JPEG", quality=92)
    print(f"  assets/logo.jpeg reemplazado por {ruta_logo.name}")

    carpeta_iconos = RAIZ / "assets" / "icons"
    carpeta_iconos.mkdir(parents=True, exist_ok=True)

    def guardar(size, nombre):
        im = src.resize((size, size), Image.LANCZOS)
        im.save(carpeta_iconos / nombre, "PNG")

    guardar(192, "icon-192.png")
    guardar(512, "icon-512.png")
    guardar(180, "apple-touch-icon.png")

    # Ícono "maskable": el logo se achica y se centra sobre un fondo sólido
    # para que ningún launcher de Android le recorte el contenido importante
    # al aplicar su propia forma de máscara (círculo, squircle, etc.).
    bg_hex = "#faf9f5"
    bg = tuple(int(bg_hex.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    canvas_size = 512
    inner = int(canvas_size * 0.72)
    logo_chico = src.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (canvas_size, canvas_size), bg)
    offset = ((canvas_size - inner) // 2, (canvas_size - inner) // 2)
    canvas.paste(logo_chico, offset)
    canvas.save(carpeta_iconos / "icon-512-maskable.png", "PNG")

    print("  Íconos regenerados: icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png")
    print("  (nota: el ícono maskable usa el fondo #faf9f5 — si cambiaste --color-fondo, regenera")
    print("   los íconos corriendo este script de nuevo después, o avísame y lo ajusto.)")


def main():
    ap = argparse.ArgumentParser(description="Rebautiza esta plantilla (Veltrix) para una empresa nueva.")
    ap.add_argument("--nombre", required=True, help='Nombre completo de la empresa, ej. "Distribuidora Ejemplo"')
    ap.add_argument("--nombre-corto", dest="nombre_corto", required=True, help='Nombre corto para el ícono de la app, ej. "Ejemplo"')
    ap.add_argument("--logo", type=Path, default=None, help="Ruta a la imagen del logo nuevo (cuadrada, PNG o JPG)")
    ap.add_argument("--color-primario", dest="color_primario", default=None, help="--verde-oscuro (color principal / theme-color)")
    ap.add_argument("--color-secundario", dest="color_secundario", default=None, help="--verde")
    ap.add_argument("--color-claro", dest="color_claro", default=None, help="--verde-claro")
    ap.add_argument("--color-acento", dest="color_acento", default=None, help="--rojo (botones destacados, alertas)")
    ap.add_argument("--color-azul", dest="color_azul", default=None, help="--azul")
    ap.add_argument("--color-miel", dest="color_miel", default=None, help="--miel")
    ap.add_argument("--color-fondo", dest="color_fondo", default=None, help="--bg (fondo general)")
    ap.add_argument("--supabase-url", dest="supabase_url", default=None, help="Project URL del proyecto Supabase nuevo del cliente")
    ap.add_argument("--supabase-key", dest="supabase_key", default=None, help="Clave anon/publishable del proyecto Supabase nuevo (NUNCA la service_role)")
    ap.add_argument("--dominio-interno", dest="dominio_interno", default=None, help='Dominio interno para el login por usuario, ej. "distribuidoraejemplo.internal" (si no se pasa, se genera del --nombre-corto)')
    args = ap.parse_args()

    print(f"Rebautizando de \"{NOMBRE_ACTUAL}\" a \"{args.nombre}\"...\n")

    print("1) Reemplazando el nombre en las páginas y archivos compartidos:")
    reemplazar_nombre(args.nombre)

    print("\n2) Actualizando el nombre corto (ícono de la app instalada):")
    actualizar_nombre_corto_manifest(args.nombre_corto)

    if any([args.color_primario, args.color_secundario, args.color_claro, args.color_acento, args.color_azul, args.color_miel, args.color_fondo]):
        print("\n3) Actualizando la paleta de colores:")
        actualizar_colores(args)
    else:
        print("\n3) Sin colores nuevos — se deja la paleta actual.")

    if args.logo:
        print("\n4) Regenerando el logo y los íconos de la app:")
        regenerar_iconos(args.logo)
    else:
        print("\n4) Sin --logo — se deja el logo actual (assets/logo.jpeg). Puedes correr el script")
        print("   de nuevo más adelante solo con --logo para reemplazarlo.")

    if args.supabase_url:
        dominio_interno = args.dominio_interno or slug_dominio(args.nombre_corto)
        print("\n5) Actualizando la conexión a Supabase en todos los archivos que la usan:")
        actualizar_conexion_supabase(args.supabase_url, args.supabase_key, dominio_interno)
    else:
        print("\n5) Sin --supabase-url — el sistema sigue apuntando a la base de datos de")
        print("   El Pelao Erasmo. NO despliegues así para un cliente nuevo: primero crea su")
        print("   proyecto Supabase, corre schema.sql ahí, y vuelve a correr este script solo")
        print("   con --supabase-url, --supabase-key y --dominio-interno.")

    print("\nListo. Todavía falta revisar A MANO (tienen contenido propio del negocio, no solo marca):")
    print("  - index.html (la página pública de cotización/landing) — el texto y los productos")
    print("  - la carpeta /api (textos de correos, WhatsApp Business, etc. si los hay)")
    print("  - scripts/crear-cuentas-iniciales.js (crea el primer usuario admin)")
    print("  - el despliegue en Vercel: un proyecto nuevo apuntando a este repo rebautizado,")
    print("    con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY como variables de entorno")
    print("\nVer REBRANDING.md para el checklist completo paso a paso.")


if __name__ == "__main__":
    main()
