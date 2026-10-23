# Arquitectura de PreBuyScan

Aplicación web estática (sin servidor propio ni compilación) publicada en GitHub Pages desde la rama `gh-pages`. Todo el análisis ocurre en el navegador del usuario contra APIs públicas sin claves. GitHub Actions ejecuta los trabajos programados y las pruebas.

```
navegador ──► index.html (UI, render, vistas)
              ├─ net.js       capa de red: timeout, reintentos con backoff, Retry-After, caché 30 s
              ├─ scoring.js   Safety Score, Data Confidence, cobertura, estados (puro, probado)
              ├─ alpha.js     filtros y Alpha Signal Score (puro, probado)
              ├─ sellsim.js   venta simulada eth_simulateV1 (V2/V3/V4)
              ├─ creator.js   creador, liquidez, holders, snipers (Blockscout + RPC)
              ├─ bubblemap.js mapa de wallets 3D (d3 desde CDN con SRI)
              ├─ profile.js   perfil de wallet
              ├─ share.js     tarjetas X/Telegram/Premium, enlace y QR verificables (qrcode-generator con SRI)
              └─ sw.js        app instalable: red primero para archivos propios, nunca cachea APIs
   ▲
   │ datos públicos
   ├─ RPC Robinhood Chain (eth_call, eth_getCode, eth_simulateV1…)
   ├─ Blockscout robinhoodchain.blockscout.com (API v2)
   ├─ DexScreener (mercado, imagen y redes del token)
   ├─ GeckoTerminal (pools nuevos, tendencias, OHLCV, operaciones, gráfico incrustado)
   └─ raw.githubusercontent.com: creators.json de la rama creator-db

GitHub Actions
   ├─ main: creator_db.py cada hora → rama creator-db
   ├─ main: PRECISION_V2 cada hora (estudio prospectivo, hasta el 29 oct)
   └─ gh-pages / PR: PreBuyScan CI (lint, unitarias, SRI, navegador, servicios reales)
```

## Flujo de un análisis

1. `analyze(dirección)` valida la dirección (0x + 40 hex) y muestra el anillo de progreso.
2. `inspect()` reúne datos en paralelo con un presupuesto de tiempo; cada hallazgo es `{s, t, d, c, src, err?}` con `s` ∈ high/warn/ok/unk y `err:true` para errores técnicos.
3. `scoring.js` calcula Safety Score, veredicto, Data Confidence, cobertura y estado del análisis. Si ninguna comprobación concluye, el resultado es «No evaluable» (sin número).
4. `render()` muestra el reporte, el gráfico, el mapa de wallets y las tarjetas; `addHistory()` guarda un resumen en `localStorage`.

## Almacenamiento local (solo en el navegador)

`pbs_hist`, `pbs_fav`, `pbs_alerts`, `pbs_alpha` (filtros), `pbs_alpha_liq` (liquidez vista por pool, para su variación), `pbs_theme`, `pbs_notif`, `pbs_fav_check`. Todos los accesos van dentro de `try/catch`.

## Seguridad

- Content-Security-Policy por `<meta>` con lista cerrada de orígenes de conexión e imágenes.
- Scripts de terceros solo desde cdnjs/jsdelivr con versión fija e `integrity` sha384.
- Todo dato externo se escapa (`esc`, `safeUrl`) antes de insertarse en el DOM.
- Sin wallets, claves ni firmas; las simulaciones usan una cuenta inerte con saldo sobrescrito.
