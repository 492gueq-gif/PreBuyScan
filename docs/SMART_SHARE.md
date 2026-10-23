# PreBuyScan Smart Share Engine

Genera tarjetas para compartir a partir de un análisis real de PreBuyScan. Se dibujan con código (Canvas) en el navegador: no se usan imágenes generadas por IA, así que la dirección, las cifras y los hallazgos salen exactos del análisis.

## Formatos

| Formato | Tamaño | Uso |
|---|---|---|
| Social X | 1600 × 900 | X / Twitter |
| Telegram | 1080 × 1080 | grupos y canales |
| Reporte premium | 1080 × 1350 | reporte ampliado con QR verificable |

Exporta PNG (y WebP para el reporte premium). Archivo: `share.js` (`window.PBShare`).

## Flujo

1. El usuario analiza un contrato (`inspect()` en `index.html`).
2. `buildReport()` arma el reporte compacto con los resultados reales: dirección, nombre, símbolo, puntuación, veredicto, confianza de los datos, versión del algoritmo, bloque, hora, hallazgos clasificados y datos de mercado.
3. `classify()` asigna uno de cuatro estados a cada hallazgo (abajo).
4. `verifiableLink()` calcula el SHA-256 del reporte canónico (claves ordenadas). El ID del reporte son los primeros 16 caracteres del hash.
5. `drawX()`, `drawTelegram()` y `drawPremium()` dibujan las tres tarjetas. El motor visual no calcula el riesgo: solo lee el reporte.
6. El usuario descarga, comparte la imagen (Web Share API) o abre X/Telegram con texto y enlace preparados. Nada se publica automáticamente.

## Estados de las alertas

| Estado | Color | Cuándo |
|---|---|---|
| RIESGO CONFIRMADO | rojo | evidencia técnica: venta simulada que falla, liquidez retirable por el creador o una wallet, funciones críticas (mint, lista negra, comisiones, pausa, límites) con dueño activo, dueño con gran parte del suministro, sin contrato |
| SEÑAL SOSPECHOSA | amarillo | patrón que merece precaución sin probar fraude: tokens muertos del creador, snipers fondeados por la misma wallet, concentración, liquidez baja, etc. |
| PENDIENTE / NO VERIFICADO | azul grisáceo | «Venta no simulada» → SIMULACIÓN PENDIENTE; «Dueño del contrato no identificado» → IDENTIDAD NO VERIFICADA; datos «no disponibles» → NO DISPONIBLE; el resto → NO VERIFICADO. Nunca con símbolo de prohibición |
| SIN ALERTAS DETECTADAS | verde | la revisión terminó sin riesgos relevantes. Nunca «100 % seguro» |

## Puntuación

Se usa el valor real del motor (`scoreOf()`, algoritmo `2026.10.22-2`). Escala explícita en cada tarjeta: **100 = menor riesgo detectado**. La confianza de los datos (`confidenceOf()`) aparece junto al medidor.

## Verificación

- El enlace y el QR apuntan a `…/PreBuyScan/?t=<dirección>&r=<id>&b=<bloque>&v=<algoritmo>#rep=<reporte>`. El reporte va en el fragmento (`#rep=`, base64url del JSON canónico, con descripciones recortadas para que el QR sea legible).
- Al abrir el enlace, la página recalcula el SHA-256. Si el ID coincide y la dirección también, muestra «Reporte verificado» con lo que decía el reporte en ese bloque, y debajo el análisis actualizado de hoy. Si alguien cambió algo, muestra «Reporte no verificado».
- **Límite:** sin servidor no hay firma digital. El hash prueba que el contenido del enlace no cambió, no quién lo generó. Para autenticidad hace falta una clave privada en un backend y la clave pública publicada.

## Logotipos y dirección

- Logo: solo el que el proyecto registró en DexScreener para ese contrato en Robinhood Chain. Si no carga (o el servidor no permite usarlo en un canvas), se muestran las iniciales y «logo no verificado».
- Dirección: siempre la del análisis, en formato checksum EIP-55. Completa en el reporte premium y en la cápsula de las tarjetas; el enlace y el QR llevan la dirección íntegra.

## Pruebas

- Unitarias (Node): clasificación de estados, checksum EIP-55 con vectores oficiales, hash canónico determinista, detección de un reporte alterado.
- En navegador real (CI, rama `research/probes`, `cand_ui.py`): tamaños exactos de las tres tarjetas, QR decodificado con OpenCV e idéntico al enlace, verificación correcta y rechazo de un ID alterado, nombre larguísimo y datos faltantes (con datos de prueba marcados), sin violaciones de CSP, sin desbordes en móvil.
