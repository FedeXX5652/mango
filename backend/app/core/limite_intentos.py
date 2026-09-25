"""Límite de intentos de login (fase 3a).

Sin mail no hay segundo factor ni recuperacion automatica: la clave es lo unico
que hay, asi que un atacante con acceso al puerto no puede probar claves sin
freno. Tras N fallos seguidos para un usuario, se bloquea unos minutos.

En memoria, a proposito: es una sola instancia (un homelab) y reiniciar limpia
el estado, que es aceptable —peor caso, un reinicio le regala a un atacante otra
tanda de intentos, y para eso ya tiene que estar dentro del tailnet—. Si algun
dia hay varias instancias, esto se muda a la base o a Redis.

El reloj se inyecta para poder probar el bloqueo sin esperar de verdad.
"""

import time
from dataclasses import dataclass, field

MAX_INTENTOS = 5
VENTANA_SEGUNDOS = 300  # 5 minutos


@dataclass
class _Estado:
    fallos: int = 0
    hasta: float = 0.0  # instante hasta el que esta bloqueado


@dataclass
class LimiteIntentos:
    ahora: object = time.monotonic  # callable -> float, inyectable en pruebas
    _por_clave: dict[str, _Estado] = field(default_factory=dict)

    def bloqueado(self, clave: str) -> bool:
        e = self._por_clave.get(clave)
        return e is not None and self.ahora() < e.hasta

    def registrar_fallo(self, clave: str) -> None:
        e = self._por_clave.setdefault(clave, _Estado())
        e.fallos += 1
        if e.fallos >= MAX_INTENTOS:
            e.hasta = self.ahora() + VENTANA_SEGUNDOS
            e.fallos = 0

    def registrar_exito(self, clave: str) -> None:
        # Un login bueno limpia el historial del usuario.
        self._por_clave.pop(clave, None)


# Instancia compartida del proceso.
limite = LimiteIntentos()
