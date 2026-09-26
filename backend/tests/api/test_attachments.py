"""Adjuntos: fotos de tickets (fase 5)."""

import uuid
from types import SimpleNamespace

# PNG 1x1 valido (suficiente para probar la subida).
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082"
)


async def _tx(api: SimpleNamespace) -> str:
    acc = (
        await api.client.post(
            "/api/v1/accounts",
            json={"id": str(uuid.uuid4()), "name": "Cta", "type": "cash", "currency": "ARS"},
        )
    ).json()["id"]
    cat = (
        await api.client.post(
            "/api/v1/categories",
            json={"id": str(uuid.uuid4()), "name": "Super", "kind": "expense"},
        )
    ).json()["id"]
    tx = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2026-09-01T12:00:00-03:00",
            "amount": 10000,
            "currency": "ARS",
            "account_id": acc,
            "category_id": cat,
        },
    )
    return tx.json()["id"]


async def test_subir_y_ver_adjunto(api: SimpleNamespace) -> None:
    tx = await _tx(api)
    r = await api.client.post(
        f"/api/v1/transactions/{tx}/attachments",
        files={"file": ("ticket.png", PNG, "image/png")},
    )
    assert r.status_code == 201, r.text
    att = r.json()
    assert att["mime_type"] == "image/png"
    assert att["size_bytes"] == len(PNG)
    # Se puede bajar el binario.
    ver = await api.client.get(f"/api/v1/attachments/{att['id']}/file")
    assert ver.status_code == 200
    assert ver.content == PNG


async def test_tipo_no_permitido_se_rechaza(api: SimpleNamespace) -> None:
    tx = await _tx(api)
    r = await api.client.post(
        f"/api/v1/transactions/{tx}/attachments",
        files={"file": ("virus.exe", b"MZ", "application/octet-stream")},
    )
    assert r.status_code == 422
    assert "permitido" in r.json()["detail"]


async def test_adjuntar_a_tx_ajena_se_rechaza(api: SimpleNamespace) -> None:
    r = await api.client.post(
        f"/api/v1/transactions/{uuid.uuid4()}/attachments",
        files={"file": ("ticket.png", PNG, "image/png")},
    )
    assert r.status_code == 422
    assert "no existe" in r.json()["detail"]


async def test_borrar_adjunto(api: SimpleNamespace) -> None:
    tx = await _tx(api)
    att = (
        await api.client.post(
            f"/api/v1/transactions/{tx}/attachments",
            files={"file": ("t.png", PNG, "image/png")},
        )
    ).json()
    assert (await api.client.delete(f"/api/v1/attachments/{att['id']}")).status_code == 204
    assert (await api.fila("attachments", att["id"]))["deleted_at"] is not None
