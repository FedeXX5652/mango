"""Genera las claves VAPID del push (1.4.0) y las escribe en un .env.

    python backend/scripts/generar_vapid.py <ruta/.env> <subject>

<subject>: un https:// o mailto: de quien administra la instancia (Apple lo
exige), p. ej. https://mango.midominio.

NUNCA muestra las claves: escribe VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y
VAPID_SUBJECT en el archivo (reemplaza las que haya) y solo informa sus largos.
Si ya habia claves, no las pisa salvo con --forzar: cambiar la clave publica
invalida las suscripciones de todos los dispositivos (cada uno la rehace sola
cuando vuelve a abrir la app).

Va en la imagen del backend, para correrlo en el servidor sin Python (ver
.env.example).

Formato: la privada es el entero de 32 bytes en base64url (43 caracteres) y la
publica el punto sin comprimir (65 bytes, 87 caracteres): la que usa el
navegador como `applicationServerKey`.
"""

import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02, b64urlencode

CLAVES = ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT")


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--forzar"]
    forzar = "--forzar" in sys.argv[1:]
    if len(args) != 2:
        print(__doc__)
        return 2
    ruta, subject = Path(args[0]), args[1]
    if not subject.startswith(("https://", "mailto:")):
        print("ERROR: el subject tiene que empezar con https:// o mailto:")
        return 2

    lineas = ruta.read_text(encoding="utf-8").splitlines() if ruta.exists() else []
    ya = {ln.split("=", 1)[0] for ln in lineas if "=" in ln and ln.split("=", 1)[1].strip()}
    if {"VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"} <= ya and not forzar:
        print("OK: ya hay claves VAPID; no se tocan (usar --forzar para regenerar).")
        return 0

    v = Vapid02()
    v.generate_keys()
    privada = b64urlencode(v.private_key.private_numbers().private_value.to_bytes(32, "big"))
    publica = b64urlencode(
        v.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
    )
    valores = {"VAPID_PUBLIC_KEY": publica, "VAPID_PRIVATE_KEY": privada, "VAPID_SUBJECT": subject}

    salida = [ln for ln in lineas if ln.split("=", 1)[0].strip() not in CLAVES]
    salida += [f"{k}={valores[k]}" for k in CLAVES]
    ruta.write_text("\n".join(salida) + "\n", encoding="utf-8")
    print(f"OK: claves escritas en {ruta} (publica {len(publica)}, privada {len(privada)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
