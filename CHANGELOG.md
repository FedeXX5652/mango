# Cambios

Todas las versiones de Mango. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/) (ver `docs/decisiones/0025-versionado.md`).

## [1.0.1] - 2026-10-01

### Arreglado

- **Presupuesto del grupo**: un grupo recién creado mostraba las ~20 categorías
  de su árbol por defecto con "$ 0 · poner tope", como si tuviera presupuestos
  armados. Ahora muestra solo las categorías con tope y, sin ninguno, un estado
  vacío con **Agregar tope** (categoría + monto). No se había creado ningún
  presupuesto: era solo lo que mostraba la pantalla.

## [1.0.0] - 2026-10-01

Primera versión numerada: la que ya está en uso diario en el homelab.

### Incluye

- **Finanzas personales**: cuentas, medios de pago, categorías de dos niveles,
  etiquetas, presupuesto por sobres, recurrentes, plantillas, metas de ahorro,
  deudas y préstamos, adjuntos y multimoneda.
- **Compartido**: grupos con su propia taxonomía, reparto estilo Splitwise,
  saldar deudas, cuenta conjunta, presupuesto del grupo y notificaciones in-app.
- **Local-first**: base en cada dispositivo con PowerSync; lo del grupo, en sus
  propias tablas locales (0021).
- **PWA**: instalable, con atajos del ícono (0023) y accesos de Inicio elegibles
  (0024).
- **Self-hosted**: imágenes en GHCR, una sola puerta de entrada y respaldos
  diarios verificados (0020).
