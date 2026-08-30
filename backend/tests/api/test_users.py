"""API /users/me: preferencias y apariencia (Inc 11)."""

from types import SimpleNamespace


async def test_get_me_returns_defaults(api: SimpleNamespace) -> None:
    resp = await api.client.get("/api/v1/users/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["theme_id"] == "default"
    assert body["color_scheme"] == "system"
    assert body["theme_custom"] is None


async def test_update_color_scheme(api: SimpleNamespace) -> None:
    resp = await api.client.patch("/api/v1/users/me", json={"color_scheme": "dark"})
    assert resp.status_code == 200
    assert resp.json()["color_scheme"] == "dark"
    # persiste
    assert (await api.client.get("/api/v1/users/me")).json()["color_scheme"] == "dark"


async def test_invalid_color_scheme_rejected(api: SimpleNamespace) -> None:
    resp = await api.client.patch("/api/v1/users/me", json={"color_scheme": "neon"})
    assert resp.status_code == 422


async def test_theme_custom_roundtrip(api: SimpleNamespace) -> None:
    custom = {"light": {"primary": "#0f766e"}, "dark": {"primary": "#2dd4bf"}}
    resp = await api.client.patch("/api/v1/users/me", json={"theme_custom": custom})
    assert resp.status_code == 200
    assert resp.json()["theme_custom"] == custom
    # limpiar con null explicito
    cleared = await api.client.patch("/api/v1/users/me", json={"theme_custom": None})
    assert cleared.json()["theme_custom"] is None


async def test_update_base_currency_normalized(api: SimpleNamespace) -> None:
    resp = await api.client.patch("/api/v1/users/me", json={"base_currency": "usd"})
    assert resp.status_code == 200
    assert resp.json()["base_currency"] == "USD"
