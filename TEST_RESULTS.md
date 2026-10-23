# Resultados de pruebas

## Auditoría externa — revisión del 23 oct 2026

Commit de implementación: `8c738a8`. CI verificada en GitHub: `40011181162`, success en los jobs unit, dependencies, ui y live. El paso de navegador (fixtures, accesibilidad, QR y regresión visual) y el paso de servicios reales terminaron correctamente. No se sustituyeron baselines: la regresión pasó.

Repetición local: lint OK y 36/36 unitarias OK. No se ejecutó navegador local: Playwright no está instalado.

Casos reales: JSON de `ci/probe-40010012917/audit_cases.json` revisado: todas las expectativas de UHI, PONS, PAPER y GRUDGE son verdaderas, sin errores JS y con ancho 360/1440 correcto. UHI vende 0.5 ETH en ese registro; PONS no tiene dueño según código verificado; PAPER muestra discrepancia de fuentes; GRUDGE tiene riesgo alto. Son observaciones históricas, no cotizaciones actuales.

El registro anterior no incluye `_english`: queda pendiente verificar esa prueba en una ejecución posterior. El runner de auditoría registra expectativas, pero no falla automáticamente si una es falsa; no se considera prueba bloqueante por su código de salida.

Los resultados que siguen son el registro histórico de Prompt 2.2; no describen el cierre actual.

# Registro histórico — Prompt 2.2

Commit probado: `139e1dc` (rama `feature/prompt-2.2`). Ejecución de CI: run `39902247016`, conclusión **success** (23 oct 2026, 04:48 UTC).

Las pruebas simuladas (fixtures y mocks, sin red) y las comprobaciones con servicios reales se reportan por separado. Ningún resultado se declara exitoso solo con mocks.

## 1. Lint (bloqueante) — OK

`node tests/lint.js`: sintaxis de los 9 scripts, los 2 scripts en línea de `index.html`, el manifiesto y los JSON de fixtures; sin `id` duplicados.

## 2. Unitarias con fixtures (bloqueante) — 19/19 OK

`node --test tests/*.test.js` (sin red). Cubren:

| Área | Pruebas |
|---|---|
| Safety Score | pesos y topes (100 = menor riesgo detectado); el error técnico cuesta como «sin datos» y nunca aprueba; cobertura y estado del análisis; «No evaluable» sin ninguna comprobación concluyente; pesos de Data Confidence suman 100 |
| Clasificación de alertas | confirmado / sospechoso / pendiente / error técnico / sin señal |
| Integridad de direcciones | vectores de checksum EIP-55 y keccak |
| Reportes y QR | hash determinista, enlace alterado rechazado, presupuesto del QR, el estado de error se conserva en la tarjeta |
| Alpha Radar | valores por defecto del Prompt 2.2 y cada regla de filtro; Alpha Signal Score acotado e independiente del riesgo, nunca favorable con riesgo alto; orden (riesgo alto al final, prioridad < 6 h primero, variación de liquidez) |
| Red | reintentos con backoff y `Retry-After`; sin reintento en 4xx ni JSON inválido; RPC solo reintenta fallos de transporte y nunca se cachea; espaciado de GeckoTerminal y 429 sin `Retry-After` |

## 3. Dependencias (bloqueante) — OK

`tests/sri_check.py`: d3 7.9.0 y qrcode-generator 1.4.4 se descargan del CDN real y su hash sha384 coincide con el atributo `integrity` de la página.

## 4. Navegador con datos simulados (bloqueante) — 34/34 OK

`tests/ui_check.py` (Chromium, Playwright 1.56, axe-core 4.10.2). Resultado etiquetado `MOCKED_FIXTURES`.

- Escritorio 1440 px y móvil 390 px: sin errores de JavaScript, sin scroll horizontal, logo vectorial presente.
- Accesibilidad (axe-core): 0 infracciones en inicio (escritorio y móvil) y en el reporte con error de conexión.
- Error de conexión: insignia correcta, «No evaluable», pastillas de error técnico, sin puntuación en el historial, sin tarjeta para compartir.
- Alpha Radar: filtros por defecto, insignias de actividad, riesgo alto al final y sin etiqueta favorable, fuente y hora visibles, filtros editables desde la interfaz.
- Tarjetas: tamaños 1600×900, 1080×1080 y 1080×1350; QR dibujado (69 módulos) y **decodificado** con OpenCV al enlace de verificación; verificación aceptada; enlace alterado rechazado; estado de error conservado.
- Regresión visual contra `tests/baseline/*.png`: diferencia 0.0 en las 4 vistas.

Capturas y JSON: rama `ci/ui-39902247016`.

## 5. Servicios reales (no bloqueante) — ejecutado

`tests/live_check.py`, etiquetado `REAL_SERVICES`, contra la RPC de Robinhood Chain, Blockscout, DexScreener y GeckoTerminal (token de prueba `0xa01f…cbd`):

| Comprobación | Resultado |
|---|---|
| Análisis completo | 14.7 s · «ANÁLISIS PARCIAL» · Safety Score 60 «Precaución» · cobertura 8 de 10 · Data Confidence 85 % · 0 errores de JavaScript · 0 errores técnicos |
| Alpha Radar | 9 filas de 98 pools; 2 consultas a GeckoTerminal fallaron por red y la página lo dijo («lista incompleta»); 27 solicitudes, 4 reintentos, 1 acierto de caché |
| Sitio publicado vs. `gh-pages` | `index.html` idéntico (SHA-256) |

Capturas: rama `ci/live-39902247016`.

## No cubierto o pendiente

- **Firma digital** de reportes: no existe (requiere servidor con clave privada). La verificación es solo por hash; la página lo dice.
- **Pruebas en dispositivos físicos**: solo emulación de viewport en Chromium.
- **GeckoTerminal** limita a ~30 solicitudes/min; con la red saturada Alpha Radar puede salir incompleto (se indica en pantalla).
- **CSP histórica:** conservaba `unsafe-inline`; la auditoría lo eliminó de `script-src`, pero lo conserva en `style-src`.
