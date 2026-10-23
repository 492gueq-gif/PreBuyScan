# PreBuyScan — estado del proyecto

Actualizado: 22 oct 2026. Responsable del producto: Mario («jefe»). Este archivo es el punto de continuidad entre sesiones.

PreBuyScan es una herramienta de **solo lectura** para revisar tokens y wallets de **Robinhood Chain (chain 4663)** antes de comprar: «Scan before the scam». Sin wallet, sin firmas, sin transacciones ni dinero real.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Página pública | https://492gueq-gif.github.io/PreBuyScan/ (rama `gh-pages`, GitHub Pages) |
| Desarrollo de la página | rama `feature/creator-liquidity` → se publica con fast-forward a `gh-pages` |
| Base de creadores (cada hora) | código en `main` (`creator_db.py`), datos en la rama `creator-db` (`creators.json`) |
| Estudio PRECISION_V2 (cada hora, 22–29 oct) | código y datos en `research/precision-v2`; el horario vive en `main` (`.github/workflows/precision-v2.yml`) |
| Estudio GEMS_V1 (joyas; escaneos 30 oct–13 nov, resultados después del 21 nov) | código y datos en `research/gems-v1`; horario en `main` (`.github/workflows/gems-v1.yml`, minuto 47; fuera del periodo no hace nada) |
| Estudios anteriores | `research/base-rates-v1` (BASE_RATES_V1, PRECISION_V1) |
| Pruebas en navegador real (CI) | rama `research/probes` (workflows *Candidate page check*, *Live page check*, *Blockscout probe*); capturas y notas en `research/shots`, `research/probe-out`, `research/live-out` |

## Arquitectura (sin servidor)

Todo corre en el navegador del usuario contra APIs públicas; GitHub Actions hace los trabajos programados.

- `index.html` — interfaz (móvil con barra inferior; escritorio con menú lateral y columna derecha), reporte, puntuación, simulador de compra/venta (cálculo), historial, favoritos, avisos, ajustes, modo claro/oscuro, Content-Security-Policy.
- `sellsim.js` — venta simulada real: compra → approve → venta en un bloque con `eth_simulateV1` y sobrescritura de estado (V2, V3, V4 incluidos hooks). Montos 0.01 / 0.1 / 0.5 ETH.
- `creator.js` — creador (Blockscout v2), reputación, control de la liquidez (V2 LP holders; V3/V4 posiciones NFT y `ModifyLiquidity`), holders, snipers del primer minuto con su fondeo; presupuesto de tiempo de 35 s.
- `bubblemap.js` — mapa de wallets (holders, fondeo, transferencias, grupos, ventanas de 1 h para contratos fondeadores).
- `profile.js` — perfil de wallet.
- `share.js` — Smart Share Engine: tarjetas X (1600×900), Telegram (1080×1080) y reporte premium (1080×1350) dibujadas en Canvas con datos reales; enlace verificable con SHA-256 y QR (≤700 bytes, módulos ≥3 px, decodificación comprobada en CI). Sin firma digital hasta tener servidor. Detalle en `docs/SMART_SHARE.md` (rama de la página).
- `sw.js`, `manifest.webmanifest`, íconos — app instalable (PWA), notificaciones locales con permiso.

Fuentes: RPC pública `https://rpc.mainnet.chain.robinhood.com`, Blockscout `robinhoodchain.blockscout.com` (API v2; la API legacy limita tras ~9 llamadas), DexScreener, GeckoTerminal (datos y gráfico incrustado), base de creadores propia.

## Puntuaciones (algoritmo `2026.10.22-2`)

- **Puntuación 0–100** (más alto = menos riesgo encontrado): 100 − 25 por riesgo alto − 10 por precaución − 5 por «sin datos»; tope 39 con algún riesgo alto y 79 con alguna precaución.
- **Confianza de los datos 0–100**: pesos mercado 15, venta 20, contrato 15, dueño 5, creador 10, historial 10, liquidez 10, snipers 5, holders 5, operaciones 5. Lo no verificado se muestra «NO VERIFICADO».
- Cada hallazgo indica su fuente; cada reporte, el bloque y la hora.
- **Alpha Radar**: filtros configurables (edad ≤6/12/24 h, liquidez ≥15k, volumen 1 h ≥3k, tx 1 h ≥30, FDV ≤1M) y señales observadas. **Sin Opportunity Score** hasta validarlo con un estudio preregistrado. Un riesgo alto bloquea cualquier etiqueta favorable.

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
- Versión en inglés.
- Lista pública de creadores en serie.
- «Seguir el dinero» después de un rug.
