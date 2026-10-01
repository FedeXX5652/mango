"""La version de Mango es UNA (0025): la misma en el frontend y en el backend."""

import json
import pathlib
import re
import tomllib

RAIZ = pathlib.Path(__file__).resolve().parents[2]


def test_version_igual_en_frontend_y_backend() -> None:
    paquete = (RAIZ / "frontend" / "package.json").read_text(encoding="utf-8")
    proyecto = (RAIZ / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    frontend = json.loads(paquete)["version"]
    backend = tomllib.loads(proyecto)["project"]["version"]
    assert frontend == backend, "subir la version en package.json Y en pyproject.toml"
    assert re.fullmatch(r"\d+\.\d+\.\d+", frontend), "la version es SemVer: MAYOR.MENOR.PARCHE"
