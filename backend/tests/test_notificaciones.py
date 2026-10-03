"""Avisos: el texto del monto y el despertador del planificador (1.4.0)."""

from types import SimpleNamespace

from app.crud import notification as notif
from app.services import planificador


def test_monto_del_aviso_en_enteros() -> None:
    assert notif.formatear_monto(230272, "ARS") == "$2.302,72"
    assert notif.formatear_monto(5, "ARS") == "$0,05"
    assert notif.formatear_monto(-1250, "USD") == "US$-12,50"
    # Grande: sin perder centavos (con punto flotante se redondeaba).
    assert notif.formatear_monto(999_999_999_999_99, "ARS") == "$999.999.999.999,99"
    assert notif.formatear_monto(1500, "JPY") == "JPY 1.500"


def test_titulo_dice_de_que_grupo_es() -> None:
    assert notif.de_grupo("Casa", "Te registraron un pago") == "Casa · Te registraron un pago"
    assert notif.de_grupo(None, "Te registraron un pago") == "Te registraron un pago"


async def test_un_aviso_nuevo_despierta_al_planificador_al_confirmarse(
    api: SimpleNamespace,
) -> None:
    planificador._despertar.clear()
    await notif.crear(api.session, user_id=api.owner_id, tipo="prueba", title="t", body="b")
    # Antes del commit, no: el planificador no lo veria.
    assert not planificador._despertar.is_set()
    await api.session.commit()
    assert planificador._despertar.is_set()
    planificador._despertar.clear()
