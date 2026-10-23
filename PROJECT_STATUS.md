# PreBuyScan — estado del proyecto

Actualizado: 23 oct 2026 (Prompt 2.2 publicado; auditoría externa en `fix/audit-ext`, PR #5, pendiente de aprobación para publicar). Responsable del producto: Mario («jefe»). Este archivo es el punto de continuidad entre sesiones.

PreBuyScan es una herramienta de **solo lectura** para revisar tokens y wallets de **Robinhood Chain (chain 4663)** antes de comprar: «Scan before the scam». Sin wallet, sin firmas, sin transacciones ni dinero real.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Página pública | https://492gueq-gif.github.io/PreBuyScan/ (rama `gh-pages`, GitHub Pages) |
| Desarrollo de la página | rama `fix/audit-ext`, PR #5 → merge normal hacia `gh-pages` |
| Base de creadores (cada hora) | código en `main` (`creator_db.py`), datos en la rama `creator-db` (`creators.json`) |
| Estudio PRECISION_V2 (cada hora, 22–29 oct) | código y datos en `research/precision-v2`; el horario vive en `main` (`.github/workflows/precision-v2.yml`) |
| Estudios anteriores | `research/base-rates-v1` (BASE_RATES_V1, PRECISION_V1) |
| Pruebas en navegador real (CI) | rama `research/probes` (workflows *Candidate page check*, *Live page check*, *Blockscout probe*); capturas y notas en `research/shots`, `research/probe-out`, `research/live-out` |

## Arquitectura (sin servidor)

Todo corre en el navegador del usuario contra APIs públicas; GitHub Actions hace los trabajos programados.

- `index.html` — interfaz (móvil con barra inferior; escritorio con menú lateral y columna derecha), reporte, puntuación, simulador de compra/venta (cálculo), historial, favoritos, avisos, ajustes, modo claro/oscuro, Content-Security-Policy.
- `sellsim.js` — venta simulada real: compra → approve → venta en un bloque con `eth_simulateV1` y sobrescritura de estado (V2, V3, V4 incluidos hooks). Montos 0.01 / 0.1 / 0.5 ETH.
- `creator.js` — creador (Blockscout v2), reputación, control de la liquidez (V2 LP holders; V3/V4 posiciones NFT y `ModifyLiquidity`), holders, snipers del primer minuto con su fondeo; presupuesto de tiempo de 60 s (120 s al reintentar).
- `bubblemap.js` — mapa de wallets (holders, fondeo, transferencias, grupos, ventanas de 1 h para contratos fondeadores).
- `profile.js` — perfil de wallet.
- `share.js` — Smart Share Engine: tarjetas X (1600×900), Telegram (1080×1080) y reporte premium (1080×1350) dibujadas en Canvas con datos reales; enlace verificable con SHA-256 y QR (≤700 bytes, módulos ≥3 px, decodificación comprobada en CI). Sin firma digital hasta tener servidor. Detalle en `docs/SMART_SHARE.md` (rama de la página).
- `sw.js`, `manifest.webmanifest`, íconos — app instalable (PWA), notificaciones locales con permiso.

Fuentes: RPC pública `https://rpc.mainnet.chain.robinhood.com`, Blockscout `robinhoodchain.blockscout.com` (API v2; la API legacy limita tras ~9 llamadas), DexScreener, GeckoTerminal (datos y gráfico incrustado), base de creadores propia.

## Prompt 2.2 (rama `feature/prompt-2.2`, PR hacia `gh-pages`)

- Hecho: auditoría (`AUDIT_REPORT.md`, 16 hallazgos), estado «Error técnico», regla «No evaluable», Safety Score / Data Confidence / Cobertura / Estado del análisis separados, capa de red `net.js` (timeouts, reintentos, backoff, `Retry-After`, caché, espaciado de GeckoTerminal), indicador de conexión que caduca, Alpha Radar 2.2 (`alpha.js`, edad ≤12 h, prioridad <6 h, Alpha Signal Score independiente), logo vectorial `logo.svg`, SRI en CDN, accesibilidad, CI (`.github/workflows/ci.yml`) y documentación (`ARCHITECTURE.md`, `SCORING_METHODOLOGY.md`, `DATA_SOURCES.md`, `TEST_RESULTS.md`, `DEPLOYMENT.md`).
- Pruebas: lint OK, 19/19 unitarias, SRI OK, 34/34 en navegador, comprobación real ejecutada (`TEST_RESULTS.md`).
- Firma digital pendiente (requiere servidor). En la auditoría, `script-src` ya no permite scripts en línea; `style-src` conserva `unsafe-inline`.
- Publicar = fusionar la PR hacia `gh-pages`, solo con el «ok» del jefe.

## Puntuaciones (algoritmo `2026.10.23-1` en la rama 2.2; `2026.10.22-2` publicado — mismos pesos)

- **Safety Score 0–100** (100 = menor riesgo detectado): 100 − 25 por riesgo alto − 10 por precaución − 5 por «sin datos»; tope 39 con algún riesgo alto y 79 con alguna precaución.
- **Confianza de los datos 0–100**: pesos mercado 15, venta 20, contrato 15, dueño 5, creador 10, historial 10, liquidez 10, snipers 5, holders 5, operaciones 5. Lo no verificado se muestra «NO VERIFICADO».
- Cada hallazgo indica su fuente; cada reporte, el bloque y la hora.
- **Error técnico** cuenta como «sin datos»; sin ninguna comprobación concluyente el reporte es «No evaluable».
- **Alpha Radar**: filtros configurables (edad ≤6/12/24 h; 12 h por defecto en 2.2, liquidez ≥15k, volumen 1 h ≥3k, tx 1 h ≥30, FDV ≤1M) y señales observadas. El **Alpha Signal Score** (2.2) mide actividad, no seguridad ni ganancia. **Sin Opportunity Score** hasta validarlo con un estudio preregistrado. Un riesgo alto bloquea cualquier etiqueta favorable.

## Precisión publicada

- PRECISION_V1 (17–21 oct, 749 tokens, solo señales de mercado): colapso a 24 h en riesgo alto 87 %, precaución 61 %, sin alertas 57 %.
- PRECISION_V2 (prospectivo, señales nuevas): recolección 22–29 oct; resultados programados el **30 oct 9:37 (México)**; se publican todas las señales, sirvan o no.

## Tareas programadas

- 26 oct 9:07 — publicar la página de estado de VIGIA Cloud (pide confirmación antes de Render).
- 27 oct — reporte final del Sniper simulado de VIGIA (tarea horaria).
- 28 oct 9:07 — recordar al jefe la decisión de alertas por Telegram.
- 30 oct 9:37 — resultados de PRECISION_V2 y actualización de la página.

## Decisiones

- Solo lectura y paper; nunca wallets, firmas, claves ni dinero real.
- Lo desconocido nunca cuenta como seguro.
- Plataformas de lanzamiento (creador con >500 transacciones) no se juzgan como creador individual.
- No se publican métricas sin método, muestra y periodo.
- Se publica a `gh-pages` cuando el jefe lo aprueba («hazlo») y después de pruebas en navegador real.

## Pendiente de decisión del jefe (requiere servidor o pago)

- Alertas por Telegram y notificaciones con la página cerrada (bot siempre encendido).
- Tiempo real por WebSocket / indexación de eventos (proveedor con clave + backend).
- Dominio propio (p. ej. prebuyscan.xyz).
- Rotar la clave de Alchemy (acción del jefe).
- Firma digital de los reportes compartidos (clave privada en un backend).

## Pendiente técnico

- Opportunity Score: diseñar y preregistrar su validación después de PRECISION_V2.
- Completar traducción de descripciones largas; el modo inglés básico ya está implementado en la auditoría.
- Lista pública de creadores en serie.
- «Seguir el dinero» después de un rug.

## Cierre de auditoría externa (PR #5)

Base revisada: `8c738a8`. CI `40011181162` confirmada en GitHub: unit, dependencies, ui y live terminaron con success. Lint y 36/36 unitarias repetidas localmente. No se ha publicado esta auditoría.

- Cada tasa debe incluir n e intervalo de Wilson del 95 %. Con menos de 30 tokens por grupo: «indicio, muestra pequeña», nunca «útil». Esta regla de presentación no modifica protocolos congelados.
- Venta no simulada, historial incompleto y liquidez no verificada son datos pendientes, no vulnerabilidades confirmadas.
- Pendientes: completar la base de creadores desde génesis; ABI no estándar de lockers; traducciones largas; decidir con Mario la actualización del escáner de GEMS_V1 antes de recolectar datos.
- Antes de publicar: ejecutar la CI del cierre, verificar el caso inglés `_english`, completar descripción del PR y solicitar autorización específica de publicación.

## Carga automática de visualizaciones

Al terminar el análisis se carga el gráfico también en móvil y arranca el mapa de wallets en el resumen, sin clic ni desplazamiento previo. El mapa usa una tarea independiente del escaneo y permite reintentar si falla el explorador. Resultados de mapas de análisis anteriores no reemplazan el reporte actual. Shell `pbs-shell-v13`. Pendiente de revisión de CI y publicación con aprobación.

## Explicación de la puntuación

Franja debajo del marcador y antes de las métricas: «¿Por qué recibe esta puntuación?». Usa hasta tres hallazgos actuales, prioriza riesgo alto sobre precaución y explica los topes existentes de 39/79 sin cambiar el cálculo. Pendientes y errores se identifican como falta de datos, nunca como vulnerabilidades probadas. No evaluable y sin alertas tienen mensajes propios. Shell `pbs-shell-v14`. Pendiente de CI visual y publicación.
