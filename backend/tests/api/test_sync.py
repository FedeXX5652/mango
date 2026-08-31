"""Token de PowerSync (Inc 13)."""

from types import SimpleNamespace

import jwt

from app.api.v1.sync import _clave


async def test_token_valido_y_firmado(api: SimpleNamespace) -> None:
    resp = await api.client.get("/api/v1/sync/token")
    assert resp.status_code == 200
    body = resp.json()
    assert body["powersync_url"]

    # Decodifica con la misma clave: sub = usuario de la prueba, aud = powersync.
    claims = jwt.decode(body["token"], _clave(), algorithms=["HS256"], audience="powersync")
    assert claims["sub"] == str(api.owner_id)
    assert claims["aud"] == "powersync"
    assert claims["exp"] > claims["iat"]

    # El header lleva el kid que espera PowerSync.
    assert jwt.get_unverified_header(body["token"])["kid"] == "mango-hs256"
