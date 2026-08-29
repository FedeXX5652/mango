// Parser de alertas de compra Visa para n8n (nodo Code)
// Entrada: items con el correo (campo text o textPlain del nodo IMAP)
// Salida: un item por transaccion, con campos normalizados

const out = [];

for (const item of $input.all()) {
  const src = item.json;
  // El nodo IMAP puede dejar el cuerpo en distintos campos segun configuracion
  const cuerpo = src.textPlain || src.text || src.textHtml || '';

  if (!cuerpo) continue;

  // Si vino en HTML: convierte los bloques en saltos de linea ANTES de quitar
  // etiquetas, si no todos los campos quedan pegados en una sola linea.
  const plano = cuerpo
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');

  // Extrae "Etiqueta: valor" hasta el fin de linea
  const campo = (etiqueta) => {
    // Corta en salto de linea o al empezar otra etiqueta conocida
    const re = new RegExp(
      etiqueta + '\\s*:\\s*(.*?)(?=\\n|Comercio:|Pa[ií]s:|Ciudad:|Tarjeta:|Autorizaci[oó]n:|Referencia:|Tipo de|Moneda:|Monto:|\$)',
      'i'
    );
    const m = plano.match(re);
    return m ? m[1].trim() : null;
  };

  const comercio = campo('Comercio');
  const montoRaw = campo('Monto');

  // El encabezado dice si fue aprobada o rechazada
  const rechazada = /\bRECHAZAD[AO]\b/i.test(plano);
  const exterior = /se acaba de usar en el exterior/i.test(plano);

  // Si no tiene estos dos, no es una alerta de compra
  if (!comercio || !montoRaw) continue;

  // El monto llega en tres formatos distintos segun el correo:
  //   1.234,56   coma decimal, punto de miles  (formato AR)
  //   1,234.56   punto decimal, coma de miles  (formato US)
  //   15.80      punto decimal sin miles       (compras en el exterior)
  // El tercero es el peligroso: tratarlo como miles daria 1580 en vez de 15.80.
  const parsearMonto = (txt) => {
    if (!txt) return null;
    // Descarta el parentesis con la conversion aproximada
    const limpio = txt.replace(/\(.*?\)/g, '').replace(/[^\d.,-]/g, '').trim();
    if (!limpio) return null;

    const tieneComa = limpio.includes(',');
    const tienePunto = limpio.includes('.');
    let n = limpio;

    if (tieneComa && tienePunto) {
      // Manda el separador que aparece mas a la derecha
      n = limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
        ? limpio.replace(/\./g, '').replace(',', '.')   // AR
        : limpio.replace(/,/g, '');                     // US
    } else if (tieneComa) {
      // Solo coma: decimal si quedan 1-2 digitos, si no es de miles
      n = /,\d{1,2}$/.test(limpio) ? limpio.replace(',', '.') : limpio.replace(/,/g, '');
    } else if (tienePunto) {
      // Solo punto: decimal si quedan 1-2 digitos (15.80), miles si son 3 (1.234)
      n = /\.\d{1,2}$/.test(limpio) ? limpio : limpio.replace(/\./g, '');
    }

    const v = parseFloat(n);
    return isNaN(v) ? null : v;
  };

  const monto = parsearMonto(montoRaw);

  // En compras del exterior viene "(aproximadamente 2.89 USD)"
  let montoConvertido = null, monedaConvertida = null;
  const conv = montoRaw.match(/aproximadamente\s+([\d.,]+)\s*([A-Z]{3})/i);
  if (conv) {
    montoConvertido = parsearMonto(conv[1]);
    monedaConvertida = conv[2].toUpperCase();
  }

  // n8n entrega la fecha como "25 Aug 2026 03:14:33 +0000". Se normaliza a
  // ISO para que sea ordenable y facil de importar en otras herramientas.
  const fechaRaw = src.date || src.receivedDate || null;
  let fecha = fechaRaw, fechaDia = null;
  if (fechaRaw) {
    const d = new Date(fechaRaw);
    if (!isNaN(d.getTime())) {
      fecha = d.toISOString();
      fechaDia = fecha.slice(0, 10);   // YYYY-MM-DD
    }
  } else {
    fecha = new Date().toISOString();
    fechaDia = fecha.slice(0, 10);
  }

  out.push({
    json: {
      fecha,
      fecha_dia: fechaDia,
      comercio,
      monto,
      moneda: campo('Moneda'),
      tarjeta: campo('Tarjeta'),
      pais: campo('Pa[ií]s'),
      ciudad: campo('Ciudad'),
      tipo: campo('Tipo de transacci[oó]n'),
      referencia: campo('Referencia'),
      autorizacion: campo('Autorizaci[oó]n'),
      // Las rechazadas no son gastos reales: filtralas con un IF aguas abajo
      rechazada,
      exterior,
      monto_convertido: montoConvertido,
      moneda_convertida: monedaConvertida,
      // Para detectar correos que cambiaron de formato
      parseo_ok: monto !== null,
      origen: 'visa-alerta',
    },
  });
}

return out;
