"""Notificaciones push (1.4.0): suscripciones, envio y planificador."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.services import planificador
from app.services import push as servicio_push


@pytest.fixture
def push_activo(monkeypatch):
    """Push configurado y un servicio de push falso que anota lo que recibe."""
    monkeypatch.setattr(settings, "vapid_public_key", "clave-publica")
    monkeypatch.setattr(settings, "vapid_private_key", "clave-privada")
    monkeypatch.setattr(settings, "vapid_subject", "https://mango.test")
    enviados: list[tuple[dict, str]] = []
    # `secuencia`: respuestas en orden (una por intento); despues, `codigo`.
    respuesta: dict = {"codigo": 201, "secuencia": []}

    async def falso(info: dict, data: str) -> int:
        enviados.append((info, data))
        return respuesta["secuencia"].pop(0) if respuesta["secuencia"] else respuesta["codigo"]

    monkeypatch.setattr(servicio_push, "enviar_mensaje", falso)
    # Los mismos reintentos, sin esperar.
    monkeypatch.setattr(servicio_push, "_REINTENTOS_S", (0,) * len(servicio_push._REINTENTOS_S))
    return SimpleNamespace(enviados=enviados, respuesta=respuesta)


def _sub(endpoint: str | None = None, **over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "endpoint": endpoint or f"https://push.example/{uuid.uuid4()}",
        "keys": {"p256dh": "BOx", "auth": "aut"},
        "dispositivo": "Chrome en Android",
    }
    base.update(over)
    return base


async def _otro_usuario(api: SimpleNamespace) -> uuid.UUID:
    uid = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, email, password_hash, display_name) "
            "VALUES (:id, :u, :e, '!', 'Otro')"
        ),
        {"id": str(uid), "u": f"otro-{uid.hex[:6]}", "e": f"{uid}@test.local"},
    )
    await api.session.flush()
    return uid


# --- Configuracion -------------------------------------------------------------


async def test_sin_claves_el_push_no_esta_disponible(api: SimpleNamespace, monkeypatch) -> None:
    monkeypatch.setattr(settings, "vapid_private_key", "")
    r = await api.client.get("/api/v1/push/config")
    assert r.status_code == 200
    assert r.json() == {"disponible": False, "clave_publica": None}
    r = await api.client.post("/api/v1/push/subscriptions", json=_sub())
    assert r.status_code == 503


async def test_con_claves_da_la_publica(api: SimpleNamespace, push_activo) -> None:
    r = await api.client.get("/api/v1/push/config")
    assert r.json() == {"disponible": True, "clave_publica": "clave-publica"}


# --- Suscripciones ---------------------------------------------------------------


async def test_suscribir_y_actualizar_por_endpoint(api: SimpleNamespace, push_activo) -> None:
    sub = _sub()
    r = await api.client.post("/api/v1/push/subscriptions", json=sub)
    assert r.status_code == 201, r.text
    # El mismo dispositivo otra vez: se actualiza, no se duplica.
    otra = _sub(endpoint=sub["endpoint"], keys={"p256dh": "nueva", "auth": "otra"})
    r = await api.client.post("/api/v1/push/subscriptions", json=otra)
    assert r.status_code == 201, r.text
    assert r.json()["id"] == sub["id"]
    n = (
        await api.session.execute(
            text(
                "SELECT count(*) FROM push_subscriptions WHERE endpoint = :e AND deleted_at IS NULL"
            ),
            {"e": sub["endpoint"]},
        )
    ).scalar_one()
    assert n == 1


async def test_endpoint_que_no_es_https_se_rechaza(api: SimpleNamespace, push_activo) -> None:
    r = await api.client.post(
        "/api/v1/push/subscriptions", json=_sub(endpoint="http://push.example/x")
    )
    assert r.status_code == 422
    r = await api.client.post("/api/v1/push/subscriptions", json=_sub(keys={"p256dh": "x"}))
    assert r.status_code == 422


async def _de_otro(api: SimpleNamespace, endpoint: str) -> uuid.UUID:
    """Una suscripcion de otra persona, con las claves por defecto de `_sub`."""
    otro = await _otro_usuario(api)
    await api.session.execute(
        text(
            "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) "
            "VALUES (:id, :u, :e, 'BOx', 'aut')"
        ),
        {"id": str(uuid.uuid4()), "u": str(otro), "e": endpoint},
    )
    await api.session.flush()
    return otro


async def _duenio(api: SimpleNamespace, endpoint: str) -> uuid.UUID:
    return (
        await api.session.execute(
            text("SELECT user_id FROM push_subscriptions WHERE endpoint = :e"), {"e": endpoint}
        )
    ).scalar_one()


async def test_si_otra_persona_entra_en_el_dispositivo_la_suscripcion_es_suya(
    api: SimpleNamespace, push_activo
) -> None:
    # Mismo navegador (mismas claves), otra sesion: los avisos de la anterior
    # no tienen que llegar mas ahi.
    endpoint = f"https://push.example/{uuid.uuid4()}"
    await _de_otro(api, endpoint)
    r = await api.client.post("/api/v1/push/subscriptions", json=_sub(endpoint=endpoint))
    assert r.status_code == 201, r.text
    assert await _duenio(api, endpoint) == api.owner_id


async def test_un_endpoint_ajeno_con_otras_claves_no_se_puede_reclamar(
    api: SimpleNamespace, push_activo
) -> None:
    # Conocer el endpoint de otro no alcanza para quedarse con sus avisos.
    endpoint = f"https://push.example/{uuid.uuid4()}"
    otro = await _de_otro(api, endpoint)
    r = await api.client.post(
        "/api/v1/push/subscriptions",
        json=_sub(endpoint=endpoint, keys={"p256dh": "otra", "auth": "clave"}),
    )
    assert r.status_code == 404
    assert await _duenio(api, endpoint) == otro


async def test_baja_de_un_endpoint_ajeno_es_404(api: SimpleNamespace, push_activo) -> None:
    endpoint = f"https://push.example/{uuid.uuid4()}"
    otro = await _otro_usuario(api)
    await api.session.execute(
        text(
            "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) "
            "VALUES (:id, :u, :e, 'k', 'a')"
        ),
        {"id": str(uuid.uuid4()), "u": str(otro), "e": endpoint},
    )
    await api.session.flush()
    r = await api.client.request(
        "DELETE", "/api/v1/push/subscriptions", json={"endpoint": endpoint}
    )
    assert r.status_code == 404


async def test_baja_propia(api: SimpleNamespace, push_activo) -> None:
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    r = await api.client.request(
        "DELETE", "/api/v1/push/subscriptions", json={"endpoint": sub["endpoint"]}
    )
    assert r.status_code == 204
    fila = await api.fila("push_subscriptions", sub["id"])
    assert fila["deleted_at"] is not None


# --- Envio -----------------------------------------------------------------------


async def test_prueba_llega_a_ese_dispositivo(api: SimpleNamespace, push_activo) -> None:
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    r = await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert r.status_code == 200, r.text
    assert r.json() == {"enviados": 1}
    info, data = push_activo.enviados[-1]
    assert info["endpoint"] == sub["endpoint"]
    # Logo con fondo transparente y monocromo para la barra (siempre).
    assert '"icono": "/icons/png/mango-512.png"' in data
    assert '"insignia": "/icons/png/mango-mono-96.png"' in data


async def _envejecer(api: SimpleNamespace, sub_id: str) -> None:
    """La suscripcion deja de ser nueva (pasada la gracia)."""
    await api.session.execute(
        text("UPDATE push_subscriptions SET created_at = now() - interval '1 hour' WHERE id = :id"),
        {"id": sub_id},
    )
    await api.session.flush()
    # La API usa esta misma sesion: que no siga viendo la fecha anterior.
    api.session.expire_all()


@pytest.mark.parametrize("codigo", [401, 403, 404, 410])
async def test_suscripcion_que_ya_no_sirve_se_da_de_baja(
    api: SimpleNamespace, push_activo, codigo: int
) -> None:
    # 404/410: el dispositivo ya no existe. 401/403: no acepta las claves del
    # servidor (se cambiaron); el dispositivo la rehace al abrir la app.
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    await _envejecer(api, sub["id"])
    push_activo.respuesta["codigo"] = codigo
    r = await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert r.json() == {"enviados": 0}
    fila = await api.fila("push_subscriptions", sub["id"])
    assert fila["deleted_at"] is not None


async def test_recien_creada_un_410_se_reintenta(api: SimpleNamespace, push_activo) -> None:
    # FCM puede no conocer todavia un endpoint nuevo: 410 y a los segundos 201.
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    push_activo.respuesta["secuencia"] = [410, 410]
    r = await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert r.json() == {"enviados": 1}
    assert len(push_activo.enviados) == 3
    assert (await api.fila("push_subscriptions", sub["id"]))["deleted_at"] is None


async def test_recien_creada_no_se_da_de_baja(api: SimpleNamespace, push_activo) -> None:
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    push_activo.respuesta["codigo"] = 410
    r = await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert r.json() == {"enviados": 0}
    # Un intento mas los reintentos; despues de la gracia, si sigue asi, se da de
    # baja.
    assert len(push_activo.enviados) == 1 + len(servicio_push._REINTENTOS_S)
    assert (await api.fila("push_subscriptions", sub["id"]))["deleted_at"] is None


async def test_una_vieja_no_se_reintenta(api: SimpleNamespace, push_activo) -> None:
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    await _envejecer(api, sub["id"])
    push_activo.respuesta["secuencia"] = [410]
    await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert len(push_activo.enviados) == 1


@pytest.mark.parametrize("codigo", [413, 429, 500])
async def test_un_error_pasajero_no_da_de_baja(
    api: SimpleNamespace, push_activo, codigo: int
) -> None:
    sub = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=sub)
    push_activo.respuesta["codigo"] = codigo
    r = await api.client.post("/api/v1/push/test", json={"endpoint": sub["endpoint"]})
    assert r.json() == {"enviados": 0}
    fila = await api.fila("push_subscriptions", sub["id"])
    assert fila["deleted_at"] is None


# --- Planificador ----------------------------------------------------------------


async def _aviso(api: SimpleNamespace, *, tipo: str = "pago_recibido", hace_h: int = 0) -> str:
    aid = str(uuid.uuid4())
    creado = datetime.now(UTC) - timedelta(hours=hace_h)
    await api.session.execute(
        text(
            "INSERT INTO notifications (id, user_id, type, title, body, link, created_at) "
            "VALUES (:id, :u, :t, 'Casa · Te registraron un pago', 'Beto pago', '/', :c)"
        ),
        {"id": aid, "u": str(api.owner_id), "t": tipo, "c": creado},
    )
    await api.session.flush()
    return aid


async def test_el_planificador_manda_lo_pendiente_y_lo_marca(
    api: SimpleNamespace, push_activo
) -> None:
    await api.client.post("/api/v1/push/subscriptions", json=_sub())
    aid = await _aviso(api)
    await planificador.despachar_avisos(api.session)
    assert len(push_activo.enviados) == 1
    assert "Casa · Te registraron un pago" in push_activo.enviados[0][1]
    assert (await api.fila("notifications", aid))["pushed_at"] is not None
    # La segunda pasada no lo vuelve a mandar.
    await planificador.despachar_avisos(api.session)
    assert len(push_activo.enviados) == 1


async def test_lo_viejo_no_sale_por_push(api: SimpleNamespace, push_activo) -> None:
    await api.client.post("/api/v1/push/subscriptions", json=_sub())
    aid = await _aviso(api, hace_h=settings.push_max_antiguedad_h + 1)
    await planificador.despachar_avisos(api.session)
    assert push_activo.enviados == []
    assert (await api.fila("notifications", aid))["pushed_at"] is not None


async def test_respeta_los_tipos_que_acepta_cada_dispositivo(
    api: SimpleNamespace, push_activo
) -> None:
    # Este dispositivo solo acepta recordatorios: un aviso de grupo no le llega.
    await api.client.post("/api/v1/push/subscriptions", json=_sub(tipos=["recordatorios"]))
    await _aviso(api, tipo="pago_recibido")
    await planificador.despachar_avisos(api.session)
    assert push_activo.enviados == []


async def test_un_tipo_sin_familia_no_salta_el_filtro(api: SimpleNamespace, push_activo) -> None:
    # Un tipo nuevo que nadie sumo a FAMILIA: le llega al que acepta todo, no al
    # que eligio solo recordatorios.
    elige = _sub(tipos=["recordatorios"])
    todo = _sub()
    await api.client.post("/api/v1/push/subscriptions", json=elige)
    await api.client.post("/api/v1/push/subscriptions", json=todo)
    await _aviso(api, tipo="tipo_nuevo")
    await planificador.despachar_avisos(api.session)
    assert [info["endpoint"] for info, _ in push_activo.enviados] == [todo["endpoint"]]
