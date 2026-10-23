# Fuentes de datos

Todas son públicas y sin claves. Ninguna credencial está en el frontend ni en el repositorio.

| Fuente | Uso | Manejo de errores | Caché |
|---|---|---|---|
| RPC `https://rpc.mainnet.chain.robinhood.com` | código, dueño, proxy, saldos, `eth_simulateV1`, bloque y gas | `net.js`: timeout 9 s, hasta 2 reintentos solo por fallos de transporte o 429; `sellsim.js` espacia llamadas y reintenta 429 | nunca |
| Blockscout `robinhoodchain.blockscout.com/api/v2` | creador, fondeo, holders, transferencias, perfil de wallet | `creator.js`: reintenta 429/5xx con pausa creciente; presupuesto global de 60 s (120 s al «Reintentar análisis»); lo que no llega queda «Error técnico» y dice si fue tiempo agotado o falla del proveedor | no |
| DexScreener `api.dexscreener.com` | par principal, precio, liquidez, volumen, imagen y redes | `net.js`: timeout, 2 reintentos con backoff y jitter, `Retry-After` (máx 10 s), JSON validado | 30 s |
| GeckoTerminal `api.geckoterminal.com` | pools nuevos y en tendencia, Alpha Radar, operaciones, OHLCV; gráfico incrustado | igual que DexScreener; Alpha Radar indica cuántas consultas fallaron y marca la lista como incompleta | 30 s (+ 60 s de lista) |
| `raw.githubusercontent.com` (`creator-db/creators.json`) | historial de creadores (cada hora) | si falla, «Historial del creador no disponible» | navegador |

## Datos desactualizados y salud

- Cada reporte guarda el bloque y la hora del análisis; las tarjetas los muestran.
- Alpha Radar muestra la fuente, el número de pools y la hora de actualización.
- El indicador de la red dice «Conectado · hace N s» solo con una comprobación exitosa en los últimos 90 s; si no, «Sin comprobación reciente» o «Sin respuesta».
- Un proveedor que falla produce «Error técnico», nunca un aprobado.
