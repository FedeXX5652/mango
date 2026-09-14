"""API /users: solo el PATCH que sube la sincronizacion.

La lectura ya no pasa por aca: la fila del usuario viaja al dispositivo por la
sync y el cliente la lee de su base local.
"""

import uuid
from types import SimpleNamespace


async def test_update_color_scheme(api: SimpleNamespace) -> None:
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"color_scheme": "dark"})
    assert resp.status_code == 200
    assert resp.json()["color_scheme"] == "dark"
    assert (await api.fila("users", api.owner_id))["color_scheme"] == "dark"


async def test_invalid_color_scheme_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"color_scheme": "neon"})
    assert resp.status_code == 422


async def test_update_base_currency_normalized(api: SimpleNamespace) -> None:
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"base_currency": "usd"})
    assert resp.status_code == 200
    assert resp.json()["base_currency"] == "USD"


async def test_fx_manual_roundtrip(api: SimpleNamespace) -> None:
    # La lista de monedas manuales es lo que sube el interruptor de Cotizaciones.
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"fx_manual": ["ARS"]})
    assert resp.status_code == 200
    assert resp.json()["fx_manual"] == ["ARS"]


async def test_no_se_puede_tocar_otro_usuario(api: SimpleNamespace) -> None:
    # 404 y no 403: no se revela que exista. Es el mismo criterio que el resto
    # de los recursos, y lo que impide que un cliente escriba preferencias
    # ajenas aunque adivine el id.
    resp = await api.client.patch(f"/api/v1/users/{uuid.uuid4()}", json={"color_scheme": "dark"})
    assert resp.status_code == 404


async def test_no_hay_alta_ni_baja_de_usuarios(api: SimpleNamespace) -> None:
    # El cliente no crea ni borra usuarios: la sync solo manda PATCH para esta
    # tabla, y del lado del servidor esas rutas directamente no existen.
    assert (await api.client.post("/api/v1/users", json={"id": str(uuid.uuid4())})).status_code in (
        404,
        405,
    )
    assert (await api.client.delete(f"/api/v1/users/{api.owner_id}")).status_code in (404, 405)


async def test_fx_manual_acepta_el_json_que_manda_la_sync(api: SimpleNamespace) -> None:
    # En el dispositivo `fx_manual` es una columna de TEXTO con el JSON adentro
    # (SQLite no tiene arrays), asi que la subida manda un string. Si el servidor
    # no lo aceptara, la preferencia se descartaria en silencio y volveria atras
    # en la proxima sincronizacion.
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"fx_manual": '["USD"]'})
    assert resp.status_code == 200, resp.text
    assert resp.json()["fx_manual"] == ["USD"]


async def test_fx_manual_basura_se_rechaza(api: SimpleNamespace) -> None:
    resp = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"fx_manual": "no-json"})
    assert resp.status_code == 422
