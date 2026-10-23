# Metodología de puntuación

Versión del algoritmo: **2026.10.23-3** (`scoring.js`). La fórmula y los pesos no cambian desde `2026.10.22-2`.
- La 2026.10.23-2 cambió el estado del análisis: una comprobación sin resultado concluyente ya no lo marca «parcial».
- La 2026.10.23-3 (auditoría externa) agrega hallazgos nuevos (ver «Reglas agregadas por la auditoría externa»).
- En la 2026.10.23-3, «Datos de mercado» solo suma confianza si DexScreener y GeckoTerminal coinciden en el pool principal. Los pesos son los de `2026.10.22-2`; esta versión solo agrega el estado «Error técnico», la cobertura, el estado del análisis y la regla de «No evaluable». Para los mismos hallazgos, la puntuación es idéntica a la versión anterior, así que los resultados históricos no se invierten ni cambian.

## Estados de cada hallazgo

| Estado | Código | Significado |
|---|---|---|
| Riesgo alto | `high` | evidencia de un riesgo grave (en tarjetas: RIESGO CONFIRMADO si hay evidencia técnica reproducible; si es un patrón, SEÑAL SOSPECHOSA) |
| Precaución | `warn` | indicador que requiere investigación (SEÑAL SOSPECHOSA) |
| Bien | `ok` | la comprobación terminó sin señal |
| Sin datos | `unk` | la comprobación no se ejecutó o no fue concluyente (PENDIENTE / NO VERIFICADO / NO DISPONIBLE) |
| Error técnico | `unk` + `err` | falló el proveedor o el procedimiento (RPC, explorador, mercado); reintentar puede cambiar el resultado |

Una venta no simulada nunca se presenta como honeypot: es «SIMULACIÓN PENDIENTE». Solo una venta simulada que falla de forma reproducible es riesgo confirmado.

## Safety Score (0–100)

100 = **menor riesgo detectado**; 0 = mayor riesgo detectado. No garantiza que un token sea seguro.

```
score = 100 − 25·(riesgos altos) − 10·(precauciones) − 5·(sin datos o error técnico)
si hay algún riesgo alto: score = mín(score, 39)
si no, y hay alguna precaución: score = mín(score, 79)
score = máx(0, redondeo(score))
```

Lo no verificado y los errores técnicos restan; nunca cuentan como aprobados.

**No evaluable:** si ninguna comprobación concluyó (todas en «sin datos» o «error técnico»), la página muestra «—» y «No evaluable», no guarda una puntuación en el historial y no genera tarjetas para compartir. Así, un fallo de conexión nunca parece un token de bajo riesgo.

## Data Confidence (0–100)

Peso de cada parte que sí se pudo completar: mercado 15, venta simulada 20, código del contrato 15, dueño 5, creador 10, historial del creador 10, control de la liquidez 10, snipers 5, holders 5, operaciones recientes 5 (total 100).

## Cobertura

Comprobaciones con resultado (bien, precaución o riesgo) / total de comprobaciones del análisis.

## Estado del análisis

- **Análisis completado:** todas las comprobaciones corrieron. Las que terminaron sin conclusión (p. ej. dueño no identificable) se cuentan en la Cobertura y restan como «sin datos».
- **Análisis parcial:** alguna comprobación no pudo correr por error técnico o tiempo agotado (se indica cuántas y se ofrece reintentar).
- **Error de conexión:** no se pudo consultar ni el mercado ni la cadena; el resultado no es una evaluación.

## Reglas agregadas por la auditoría externa (23 oct 2026)

Todas viven en `risk.js` y `contract.js`, con pruebas en `tests/unit.test.js` sobre datos reales guardados en `tests/fixtures/audit_cases.json`.

| Hallazgo | Estado | Regla |
|---|---|---|
| Volumen anómalo | Riesgo alto | ≥ $100k en 24 h con menos de 50 operaciones y ≥ $20k por operación (o sin operaciones) |
| Operaciones repetidas por pocas wallets | Precaución | ≥ 1 000 operaciones y ≥ 30 por wallet única (GeckoTerminal) |
| Ventas no confiables | Sin datos | Reemplaza a «Hay ventas» cuando el volumen es anómalo o vacío |
| Pools con comisión abusiva | Precaución | Algún pool secundario con comisión ≥ 10 % |
| Volumen sin liquidez detrás | Precaución; riesgo alto si es ≥ 50 % del volumen del token | Pool con menos de $25k de liquidez que mueve ≥ 20 veces su liquidez y ≥ $10k |
| Precio distinto entre pools | Precaución | Pool con ≥ $1k de liquidez y precio ≥ 25 % distinto del principal |
| Datos inconsistentes entre fuentes | Precaución, y Data Confidence pierde «Datos de mercado» | El mismo pool difiere ≥ 3× en liquidez o ≥ 25 % en precio entre DexScreener y GeckoTerminal, o GeckoTerminal no tiene el pool principal (≥ $10k) |
| Liquidez no confirmada | Sin datos | Reemplaza a «Liquidez aceptable» cuando las fuentes no coinciden |
| Precio frágil | Precaución | Menos de 2 % del suministro en pools (V2/V3 por pool; V4 en el PoolManager), con FDV ≥ $100k |
| Saldos clonados | Precaución con 6 a 9 wallets; riesgo alto con 10 o más | Wallets (no contratos, ≥ 0.05 % cada una) con saldos dentro de una banda de 3 % |
| Reparto de holders engañoso | Sin datos | Reemplaza a «Holders repartidos» si hay saldos clonados |
| Comprador del lanzamiento grande | Precaución; riesgo alto si tiene ≥ 15 % y no vendió | Comprador del primer minuto que llegó a tener ≥ 5 % del suministro |
| Proxy beacon, ZeppelinOS o diamond | Precaución | Slots EIP-1967 (implementación, beacon, admin), slot ZeppelinOS, `facetAddresses()` |
| Clon EIP-1167 | Bien | No es actualizable; se revisa el código del contrato base |
| Administradores (roles) | Precaución; riesgo alto con funciones riesgosas | AccessControl con miembros visibles, o creador con `DEFAULT_ADMIN_ROLE` |
| Sin dueño ni administradores | Bien | Código verificado sin funciones de dueño, roles ni actualización |
| Funciones riesgosas | Riesgo alto (precaución si hay renuncia) | 6 categorías, unos 100 selectores (keccak verificado) + nombres del ABI verificado |
| Impuesto declarado | Precaución ≥ 10 %; riesgo alto ≥ 25 % | Getters comunes de impuesto de compra y venta (0–100 = %, 101–10000 = puntos base) |
| Liquidez bloqueada hasta una fecha | Bien si faltan más de 30 días; precaución si faltan menos; riesgo alto si ya venció | Getters comunes de vencimiento en el contrato que tiene la liquidez (V2 o posición V4) |
| Solo se puede vender hasta ~X ETH | Riesgo alto | Funciona con poco y falla con más; búsqueda binaria del máximo y causa (error del ABI o límite declarado) |
| La venta falla si esperas | Riesgo alto | Venta en un segundo bloque simulado 1 h después |
| No deja vender en el mismo bloque | Precaución | Cooldown anti-bots: falla en el mismo bloque y funciona 1 h después |
| Wallet con actividad previa: revisar | Sin datos | Creador sin otros tokens pero con 50 o más transacciones enviadas |
| Historial incompleto en la base de creadores | Sin datos | Token anterior al inicio de la base de creadores |

**Simulación en un bloque fijo.** Todas las simulaciones de un análisis usan el mismo bloque. Antes, en tokens muy activos, el precio cambiaba entre dos llamadas y producía un falso «la venta falla con montos grandes» (UHI, 23 oct).

## Alpha Signal Score (0–100, Alpha Radar)

Independiente del Safety Score. Mide actividad observada ahora, con datos de GeckoTerminal (versión `alpha-2026.10.23-1`):

| Componente | Peso | Cálculo (cada uno entre 0 y 1) |
|---|---|---|
| Rotación | 25 | volumen 1 h / liquidez |
| Transacciones | 20 | transacciones 1 h / 200 |
| Presión compradora | 15 | (compradores / (compradores + vendedores) − 0.5) × 2 |
| Aceleración | 20 | volumen 15 min × 4 / volumen 1 h − 1 |
| Compradores nuevos | 10 | compradores 15 min × 4 / compradores 1 h − 1 |
| Frescura | 10 | 1 si el par tiene menos de 6 h, 0.5 si menos de 12 h |

Filtros iniciales (editables): edad ≤ 12 h, prioridad < 6 h, liquidez ≥ 15 000 USD, volumen 1 h ≥ 3 000 USD, transacciones 1 h ≥ 30, FDV ≤ 1 000 000 USD.

Señales de posible manipulación (compras sin ventas, volumen mayor a 5× la liquidez, pocas wallets con muchas compras, liquidez −30 % desde la última consulta) quitan cualquier etiqueta favorable y mandan el token después de los limpios. Un riesgo alto del veredicto rápido lo manda al final. **No predice precio ni ganancias y su valor predictivo no está validado.**

## Precisión publicada

Cada tasa se muestra con su tamaño de muestra y su intervalo de confianza del 95 % (Wilson). Ninguna señal se presenta como útil en la página si tiene menos de 30 tokens por grupo; esa es una regla de presentación y no cambia los protocolos ya congelados. «Sin alertas» no es una señal positiva.


PRECISION_V1 (17–21 oct, 749 tokens): colapso a 24 h — riesgo alto 87 %, precaución 61 %, sin alertas 57 %. PRECISION_V2 (señales nuevas) publica resultados el 30 oct 2026.
