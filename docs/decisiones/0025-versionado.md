# 0025 - Versionado: SemVer + commit, visible en la app

Estado: aceptada
Fecha: 2026-10-01

## Contexto

Con la PWA en caché y deploys seguidos, no había forma de saber desde un
teléfono si estaba corriendo la última versión. `package.json` y `pyproject.toml`
decían `0.1.0` desde el principio y nadie los tocaba. Las imágenes ya salían
etiquetadas con el commit (`release.sh`, 0020), pero eso no se veía en la app.

## Opciones evaluadas

1. **SemVer** (`MAYOR.MENOR.PARCHE`): el estándar. El número dice **qué
   cambió**: un arreglo, algo nuevo o algo que rompe.
2. **CalVer** (`2026.10.1`, como Home Assistant o Ubuntu): el número dice
   **cuándo**. Es cómodo para "¿es reciente?", pero no dice si lo nuevo pide un
   paso a mano.
3. **Solo el commit**: identifica la compilación exacta, pero no se lee ("¿la
   a1b2c3d es más nueva que la 9f8e7d6?").

## Decision

**SemVer como versión que se lee, y el commit y la fecha como identidad de la
compilación.** Se muestran juntos al fondo de Ajustes:

`Mango 1.0.0 · 1b6e277 · 01/10/2026`

- **Arranca en 1.0.0**: la versión que ya está en uso diario. La ingesta
  automática (fase 2), cuando llegue, es un MENOR: suma sin romper.
- **Qué sube cada número:**
  - **PARCHE**: arreglos.
  - **MENOR**: algo nuevo compatible.
  - **MAYOR**: algo que pide un paso a mano en el servidor o deja atrás a los
    clientes viejos (lo que 0012 llama "no aditivo" y no se pudo partir).
- **Una sola versión para todo Mango**: la misma en `frontend/package.json` y en
  `backend/pyproject.toml`. Un test (`backend/tests/test_version.py`) frena si no
  coinciden o si no tienen forma SemVer.
- **Se inyecta al compilar** (`vite.config.ts` → `define`):
  - la versión, desde `package.json`;
  - el commit, desde `APP_COMMIT` o `git` en desarrollo;
  - la fecha de compilación.

  La imagen Docker no tiene `.git`, así que el commit lo pasan `release.sh`
  (`--build-arg APP_COMMIT=<tag>`, el mismo tag de las imágenes), el compose de
  `infra/` y `make deploy`. Sin commit, Ajustes muestra la versión sola.

- **Para sacar una versión**: subir el número en los dos archivos y en el badge
  del README, sumar la entrada en `CHANGELOG.md` y etiquetar el commit
  (`git tag vX.Y.Z`).

## Por que

La pregunta "¿estoy en la última?" la contesta el **commit**: es lo que se
compara con GitHub. La pregunta "¿qué cambió?" la contesta **SemVer**, y CalVer
no. Mostrar los dos cuesta una línea al pie de Ajustes, donde molesta poco. La
fecha queda como pista rápida sin tener que adoptar CalVer.

Lo que se acepta: subir el número es manual. Si se olvida, el commit sigue
diciendo la verdad sobre la compilación, y el test de coincidencia evita la
peor deriva, que es frontend y backend con números distintos.

## Consecuencias

- Cada release lleva su entrada en `CHANGELOG.md`.
- La versión que muestra Ajustes es la del **bundle que corre en ese
  dispositivo**: con la PWA en caché, puede ir detrás del servidor hasta que se
  reabre la app.
