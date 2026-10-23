# Metodología de puntuación

Versión del algoritmo: **2026.10.23-2** (`scoring.js`). La 2026.10.23-2 solo cambia el estado del análisis: una comprobación sin resultado concluyente ya no lo marca «parcial» (ver abajo); la puntuación no cambia. Los pesos son los de `2026.10.22-2`; esta versión solo agrega el estado «Error técnico», la cobertura, el estado del análisis y la regla de «No evaluable». Para los mismos hallazgos, la puntuación es idéntica a la versión anterior, así que los resultados históricos no se invierten ni cambian.

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

PRECISION_V1 (17–21 oct, 749 tokens): colapso a 24 h — riesgo alto 87 %, precaución 61 %, sin alertas 57 %. PRECISION_V2 (señales nuevas) publica resultados el 30 oct 2026.
