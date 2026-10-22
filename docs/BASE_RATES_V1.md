# BASE_RATES_V1 — tasas base de tokens nuevos en Robinhood Chain

Protocolo congelado el 22 oct 2026 (UTC) ANTES de descargar ningún precio. Autorizado por el jefe («1 y 2», mejora 1). Investigación paper descriptiva: no hay órdenes, claves, dinero ni ajuste de estrategias. Código: `research_base_rates.py`; pruebas: `test_research_base_rates.py`; ejecución: workflow `BASE_RATES_V1 study`, disparado al empujar a la rama `research/run-base-rates-v1` (nunca main ni la rama de despliegue).

## Pregunta

De los tokens nuevos que aparecen en Robinhood Chain, ¿qué pasa con su precio 1 h, 6 h y 24 h después de que VIGIA los ve por primera vez? ¿Cuántos siguen operando, cuántos se desploman y cuántos quedarían en positivo después de costes?

## Universo (sin sesgo de supervivencia)

- Todos los tokens que VIGIA Lite registró desde los listados de pools nuevos, aceptados o descartados:
  - `research_data/lite_vistos_original_20261017_20261019.csv`, SHA256 `978895e36fabf60d8843d9c17783edb0bc56aedc047600b82d69c266f7364df5` (servidor original, 17–19 oct)
  - `research_data/lite_vistos_runtime_20261019_20261021.csv`, SHA256 `759dad085babf7364536a84d9adbd086981d9b4ef9151794c22ba132fbf323d1` (ensayo separado, 19–21 oct)
- Primera vista por token (la más temprana). Las horas de Lite están en hora de Ciudad de México (UTC−6).
- Solo entran tokens con al menos 24 h + 10 min transcurridos desde su primera vista.
- Muestra determinista: los 1,200 primeros por SHA256(dirección) más todos los que Lite marcó «PASA».
- Mitad «descubrimiento» y mitad «confirmación», separadas por la mediana del momento de primera vista.

## Medición

- Fuente: GeckoTerminal OHLCV público de 5 min en USD, ya usado en el proyecto. Son precios de operaciones ajenas, NO ejecución garantizada para una cantidad.
- Entrada: apertura de la primera vela que empieza en o después de la primera vista. Si no hay ninguna operación en los 30 min siguientes, el resultado es `no_trade_after_seen` (se cuenta, no se descarta).
- Salida en H ∈ {1 h, 6 h, 24 h}: cierre de la última vela que termina en o antes de entrada + H. Se registra la antigüedad de esa última operación; nunca se rellenan huecos.
- Retorno bruto = salida / entrada − 1. Máxima subida y caída intradía hasta 24 h.
- Costes: escenarios SUPUESTOS de ida y vuelta 2 %, 5 % y 10 % (no medidos). Neto = (1 + bruto)(1 − coste) − 1.
- Errores del proveedor: `provider_unavailable`, contados como desconocidos.

## Resultados que se reportan (todos, sin escoger)

Por grupo (todos, cada mitad, aceptados/rechazados por Lite en cada mitad, tamaño de liquidez al descubrir, DEX):
- n, con entrada, sin operación, no disponibles
- mediana y cuartiles del retorno por horizonte
- fracción en positivo bruto y neto por escenario, y media neta
- fracción con caída ≥ 50 % y ≥ 90 %; fracción que llegó a 2× y que cayó 90 % dentro de 24 h

## Comparación preregistrada (única)

H1: los tokens que el filtro de Lite aceptó («PASA») tienen mayor retorno neto medio a 24 h, con coste del 5 %, que los rechazados. Se considera consistente SOLO si la diferencia es positiva en ambas mitades. Es descriptiva, no causal. Ninguna otra comparación se presentará como hallazgo.

## Límites declarados

- Ventana de 4.5 días (17–21 oct): un solo periodo de mercado.
- Un precio que sube solo con compras puede ser un honeypot: el precio no prueba que se pueda vender. Por eso los resultados de subida son un techo optimista.
- Las velas de GeckoTerminal no dan el tamaño ejecutable ni el impacto de precio.
- Los costes son supuestos. No hay conclusión de rentabilidad, solo tasas base para decidir si vale la pena seguir.

## Cambio de ejecución (no de protocolo), 22 oct 2026

Las corridas 39707842638 (sin datos de entrada) y 39707997084 (excedió 2 h por los límites de GeckoTerminal) no produjeron resultados. La ejecución se divide en 6 partes paralelas que guardan cada token al terminarlo, y un paso final las junta. La hora de corte queda fija en 2026-10-22T01:50:00Z (1792633800), el inicio de la corrida completa, para que la muestra sea exactamente la definida arriba. Los tokens que no alcancen a procesarse se reportan como `not_processed`; no se descartan en silencio. Universo, muestra, definiciones, costes y la comparación H1 no cambian.
