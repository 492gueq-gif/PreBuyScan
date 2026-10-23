# PreBuyScan — Informe de auditoría (Prompt Maestro 2.2)

Fecha: 23 oct 2026. Rama auditada: `gh-pages` en `0cc79a8` (igual a `feature/creator-liquidity`). Alcance: código del repositorio, página publicada y flujos automáticos. Cada hallazgo indica evidencia, impacto, ubicación y solución; la columna «Estado» dice qué se corrigió en esta entrega (rama `feature/prompt-2.2`).

## Estructura y stack

| Pieza | Dónde | Notas |
|---|---|---|
| Página (HTML + CSS + JS sin compilación) | `index.html` (~1740 líneas) | Toda la interfaz, el motor de puntuación, Alpha Radar, historial, ajustes |
| Venta simulada | `sellsim.js` | `eth_simulateV1` con sobrescritura de estado; V2, V3, V4 (hooks) |
| Creador, liquidez, holders, snipers | `creator.js` | Blockscout API v2, RPC pública, keccak propio, presupuesto de 60 s (antes 35 s, ver #17) |
| Mapa de wallets | `bubblemap.js` | d3 7.9.0 desde cdnjs; grafo 3D |
| Perfil de wallet | `profile.js` | Blockscout v2 |
| Tarjetas para compartir | `share.js` | Canvas; QR con qrcode-generator 1.4.4 |
| App instalable | `sw.js`, `manifest.webmanifest`, íconos | red primero para archivos propios |
| Base de creadores (cada hora) | `main`: `creator_db.py` + workflow | datos en la rama `creator-db` |
| Estudio PRECISION_V2 | `research/precision-v2` | prospectivo hasta el 29 oct |

No hay dependencias npm en la página; dos librerías se cargan desde CDN (d3 y qrcode-generator). El despliegue es GitHub Pages desde `gh-pages`.

## Funciones reales vs. solo interfaz

Verificado en el código: todas las funciones visibles consultan datos reales (DexScreener, GeckoTerminal, Blockscout, RPC de Robinhood Chain) o los calculan en el navegador. No se encontraron botones simulados. Límites declarados: sin firma digital de reportes (requiere servidor), sin alertas con la página cerrada, sin tiempo real por WebSocket.

## Hallazgos

| # | Nivel | Hallazgo | Evidencia / ubicación | Impacto | Solución | Estado |
|---|---|---|---|---|---|---|
| 1 | Alto | Una falla del proveedor se muestra igual que una comprobación no concluyente | `index.html`, `inspect()`: los `catch` agregan `{s:"unk"}` con el mismo texto que «no verificado» (p. ej. «Contrato no revisado», «Datos de mercado no disponibles») | El usuario no distingue «la RPC falló» de «no se pudo concluir»; el reporte no dice que reintentar puede cambiar el resultado | Quinto estado **ERROR TÉCNICO** (`err:true` en el hallazgo), etiquetado y contado aparte; mismo descuento de puntuación que «sin datos» para no cambiar el algoritmo | Corregido |
| 13 | Crítico | Un análisis sin ninguna comprobación concluyente mostraba un Safety Score alto | Prueba con toda la red bloqueada: 3 errores técnicos + 1 sin datos ⇒ fórmula = 80, anillo «Sin datos» con 80/100 y el historial lo guardaba con anillo verde | Un fallo de conexión parecía un token de bajo riesgo («fallo oculto tras un resultado favorable») | `PBScore.isEvaluable`: sin ninguna comprobación concluyente el reporte muestra «—» y «No evaluable», no guarda puntuación ni genera tarjetas; la fórmula no cambia | Corregido |
| 2 | Alto | No hay pruebas automatizadas dentro del repositorio de la página | Las pruebas vivían en scripts temporales y en la rama `research/probes` | Una regresión puede publicarse sin que nada falle | Carpeta `tests/` (Node, sin dependencias) + Playwright (UI, accesibilidad, QR, regresión visual) + workflow en cada PR | Corregido |
| 3 | Alto | Fetch sin reintentos ni manejo de 429 en la capa común | `timed()` en `index.html`: un intento, sin backoff ni caché (solo `exploreCache` de 60 s) | Fallos transitorios de DexScreener/GeckoTerminal se convierten en «sin datos» | `timed()` con reintentos acotados (2), backoff exponencial con jitter, respeto de `Retry-After`, validación JSON y caché con caducidad por URL de mercado | Corregido |
| 4 | Medio | El indicador «Conectado» no caduca | `chainTick()` escribe «Conectado» y no registra la hora; si la pestaña duerme sigue diciendo «Conectado» | Señal de salud engañosa | Hora de la última comprobación; pasa a «Sin comprobación reciente» después de 90 s | Corregido |
| 5 | Medio | La puntuación no se llama igual en toda la app ni separa cobertura y estado del análisis | Etiquetas «Puntuación», «/100»; la confianza existe pero no la cobertura ni el estado general | Interpretación ambigua de la escala | Nombre único **Safety Score** (100 = menor riesgo detectado), **Data Confidence**, **Cobertura** (comprobaciones concluidas / totales) y **Estado del análisis** (Completado / Parcial / Error de conexión). Sin cambio de pesos ni de escala; versión del algoritmo `2026.10.23-1` documentada | Corregido |
| 6 | Medio | Librerías de CDN sin integridad (SRI) | `loadScript()` de d3 y qrcode-generator | Un CDN comprometido podría inyectar código | Atributo `integrity` sha384 + `crossorigin` en ambas cargas; hashes calculados en CI contra el archivo real | Corregido |
| 7 | Medio | Alpha Radar: edad por defecto 6 h y sin puntuación propia | `ALPHA_DEFAULT.age=6`; texto «sin puntaje» | No coincide con los filtros del Prompt 2.2 (≤12 h, prioridad < 6 h) ni separa actividad de seguridad | Filtro de edad 12 h, marca de prioridad < 6 h, **Alpha Signal Score** de actividad independiente del Safety Score, variación de liquidez desde la última consulta del usuario, fuente y hora de actualización | Corregido |
| 8 | Medio | Reportes compartidos sin firma digital | `share.js`: solo SHA-256 | El hash prueba integridad, no autoría | Requiere servidor con clave privada. Documentado como bloqueo | Pendiente (decisión del jefe) |
| 9 | Medio | CSP con `unsafe-inline` | `<meta http-equiv="Content-Security-Policy">` | Reduce la protección contra XSS | La página es de un solo archivo con scripts en línea; migrar a archivos externos con hash/nonce es un cambio grande. Se mantiene; se agrega escape estricto (ya existe `esc()`), SRI y pruebas | Riesgo residual |
| 10 | Bajo | Logo solo en raster | `logo-mark.png` recortado de la imagen aprobada | Bordes borrosos en tamaños grandes; sin favicon vectorial | `logo.svg` vectorial fiel (contenedor redondeado, ojo geométrico, iris circular, brillo turquesa) para favicon, cabecera, pantalla de carga y reportes; PNG se conservan para PWA | Corregido |
| 14 | Medio | Scroll horizontal en celular con fuentes de respaldo | CI con fuentes del sistema: `scrollWidth` 398–406 px en 390 px; la columna `.app` usaba `1fr` (mínimo = contenido) | Página desplazable de lado en teléfonos sin la fuente web | `grid-template-columns:minmax(0,1fr)` y cápsula de red que se recorta; probado en 360 y 390 px con fuente ancha | Corregido |
| 15 | Medio | Contraste insuficiente del texto secundario | axe-core: `color-contrast` serio, 3.74:1 (`--dim` #5f7482 sobre #0c1620) en la fuente de cada hallazgo | Difícil de leer para personas con baja visión | `--dim` #7a8f9d (≥ 5.1:1) en oscuro y #5d6f7d (≥ 4.6:1) en claro | Corregido |
| 16 | Bajo | Estructura de encabezados | axe-core: `heading-order` en inicio y `page-has-heading-one` en el reporte | Lectores de pantalla navegan peor | `aria-level` en secciones y `h1` accesible en el reporte | Corregido |
| 17 | Alto | Tokens con historial largo salían «Análisis parcial» con «Error técnico» aunque ningún proveedor falló | Reporte del jefe 23 oct (microduck `0xD5f1…E725`, pool V4, 2 errores en celular). Diagnóstico real en CI (run 39963991248): `reputation: time budget` a los 35.0 s; con presupuesto largo todo terminó en 40.2 s sin errores. En celular los snipers (que esperan la reputación) también se cortaban | El reporte parecía roto y bajaba el Safety Score por un corte propio, no por el token | Presupuesto 60 s; «Reintentar análisis» usa 120 s; cada parte faltante dice si fue **tiempo agotado** o **falla del proveedor** (`PBCreator.failReason`). Fórmula sin cambios | Corregido |
| 18 | Alto | «Análisis parcial» en casi todos los tokens y reportes lentos | Reporte del jefe 23 oct (PONS: «2 sin resultado concluyente»). Medición real en CI (run 39966440829), versión anterior `0cc79a8` vs. actual con los mismos tokens: tiempos equivalentes (26–38 s vs 26–50 s), dominados por el explorador (11–20 llamadas, 15–46 s acumulados). La versión anterior decía «COMPLETADO» con las mismas comprobaciones sin conclusión; la 2.2 las marcaba como análisis parcial | Parecía un error nuevo; la espera es crucial para el usuario | Un análisis donde todo corrió es «completado» aunque alguna comprobación no concluya (lo dice la Cobertura); «parcial» solo con error técnico o tiempo agotado. El explorador arranca en paralelo con la simulación, la reputación hace sus llamadas en paralelo y los resultados del explorador se guardan unos minutos en el navegador (re-escaneo inmediato). Gráfico con carga diferida. Puntuación sin cambios | Corregido |
| 19 | Alto | «Historial del creador no disponible» y «Snipers no revisados» al escanear varios tokens seguidos | Diagnóstico real (run 39968560742): la API legacy de Blockscout respondió **HTTP 429 “Too many requests”** a `txlist` y `tokentx` desde el segundo token; la v2 y la RPC respondieron bien. La versión anterior tenía la misma falla pero la mostraba como «sin datos» | Dos comprobaciones clave fallaban justo cuando el usuario compara tokens | Historial del creador: una sola llamada legacy sin reintentos y, si falla, API v2 paginada. Snipers: compras del lanzamiento desde la RPC (logs `Transfer`), con el rango verificado por marcas de tiempo reales; si no se puede verificar, cae a la legacy una vez. Nunca se concluye «sin snipers» de un rango no verificado | Corregido |
| 11 | Bajo | README desactualizado | Dice que solo usa DexScreener y la RPC y que «no guarda datos» | Información incorrecta (también usa Blockscout/GeckoTerminal y guarda historial local) | README actualizado | Corregido |
| 12 | Bajo | Estado «Análisis parcial» implícito | El presupuesto de 35 s marca partes como «sin datos» sin aviso global | El usuario puede no notar que faltó una parte | Banner de estado del análisis en el reporte | Corregido |

## Seguridad

- No hay claves, tokens ni credenciales en el repositorio ni en su historial (búsqueda de `api_key`, `secret`, `alchemy`, `infura`, `token=` en todas las ramas). La clave de Alchemy que el jefe debe rotar no está en este repositorio.
- La página no pide wallet, no firma y no envía transacciones; las simulaciones usan una cuenta inerte con saldo sobrescrito.
- Datos externos se escapan antes de insertarse en el DOM (`esc`, `safeUrl`).

## Sincronía repositorio ↔ publicado

La comprobación en navegador real compara el `index.html` servido por GitHub Pages con `gh-pages` (ver `TEST_RESULTS.md`).
