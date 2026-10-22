# PRECISION_V2: ¿las señales nuevas de PreBuyScan predicen un colapso?

Protocolo congelado el 22 oct 2026 (UTC), ANTES de recolectar ningún dato. Autorizado por el jefe («Avanza al punto 2»). Investigación paper descriptiva y solo lectura: no hay órdenes, claves, wallets, firmas ni dinero. Código: `precision_v2.py`; pruebas: `test_precision_v2.py`; ejecución: workflow `PRECISION_V2 (read-only research)`, cada hora en el minuto 17.

## Pregunta

PRECISION_V1 midió solo las señales de mercado. Esta versión mide las señales que se agregaron el 22 oct: control de la liquidez, reputación del creador, snipers del lanzamiento, concentración de holders, venta simulada y dueño del contrato. ¿Los tokens con cada señal colapsan más en las 24 h siguientes que los tokens sin ella?

## Escáner

Copia congelada de la página publicada (gh-pages `beb2a2f`) en `scanner/`. Huella SHA-256:
- `scanner/index.html` 00637b485542bc6ab69fb39e9eeb5640ef98e2b7a9d1eb02ea64ab98f45678a8
- `scanner/sellsim.js` 99185b66a714531190e36cf11a6d26a30ac6e43629d02cb1fda58fe63b9040f1
- `scanner/creator.js` abf6c0316acd96019a74c736a4be6e695cc4e0812971cccda6b381fe8671f3e6

Se ejecuta en Chromium sin interfaz llamando a la misma función `inspect()` que usa la página. Si la página pública cambia, el estudio NO cambia de escáner.

## Universo y muestra (prospectiva, sin sesgo de supervivencia)

- Fuente: listado público `new_pools` de GeckoTerminal para Robinhood Chain, páginas 1 a 3, consultado cada hora.
- Elegibles: pools con 15 a 75 minutos de edad en el momento de la consulta; un registro por token; tokens ya escaneados se excluyen. Si WETH es el token base, el token estudiado es el otro.
- Muestra: en cada corrida, los 8 elegibles con menor SHA-256 de su dirección (no depende de precio, liquidez ni volumen).
- Ventana de recolección: escaneos desde 2026-10-22T17:00Z hasta 2026-10-29T14:00Z.
- Los escaneos que fallan por completo se cuentan (`scan_failures`), no se descartan en silencio.

## Resultado medido

- Fuente: velas públicas de 5 min en USD de GeckoTerminal del pool en el que se muestreó el token. Igual que BASE_RATES_V1 y PRECISION_V1.
- Entrada: apertura de la primera vela que empieza en o después del escaneo. Sin operaciones en los 30 min siguientes: `no_trade_after_seen`, que cuenta como colapso.
- Colapso (definición de PRECISION_V1, sin cambios): sin operaciones después del escaneo, o caída máxima de 90 % o más, o retorno de −90 % o menos dentro de 24 h.
- Secundario: perdió la mitad (retorno a 24 h ≤ −50 %).
- Se mide 24 h + 15 min después del escaneo. Si el proveedor falla, el resultado queda desconocido y se excluye del cálculo (se reporta cuántos).

## Señales preregistradas

Cada señal se decide por el título exacto del hallazgo que muestra la página. «Desconocida» significa que la página dijo «Sin datos» para esa parte; esos tokens se excluyen de esa señal.

| Señal | Presente si el reporte dice… | Dirección |
|---|---|---|
| creador_retira_liquidez | El creador puede retirar la liquidez | riesgo |
| wallet_controla_liquidez | el creador o una wallet controla o puede retirar la liquidez | riesgo |
| liquidez_bloqueada_o_quemada | Liquidez en un contrato de bloqueo / Liquidez quemada | protectora |
| creador_tokens_muertos | El creador lanzó N tokens y M murieron / tiene N token(s) muerto(s) | riesgo |
| creador_wallet_nueva | Wallet del creador recién creada | riesgo |
| snipers_fondeados_por_creador | comprador(es) del lanzamiento fondeado(s) por el creador | riesgo |
| snipers_retienen | Los snipers (aún) tienen X % | riesgo |
| holders_concentrados | (Muy) concentrado: 10 wallets tienen X % | riesgo |
| venta_falla_o_perdida | La venta simulada falla / Pérdida (muy) alta al vender | riesgo |
| contrato_dueno_activo | El contrato tiene dueño activo | riesgo |

También se reporta la tasa de colapso por veredicto (riesgo alto, precaución, sin alertas, sin datos) y por puntuación (0–39, 40–79, 80–100).

## Mitades y regla de utilidad (únicas comparaciones que se presentarán como hallazgo)

- Mitad «descubrimiento» y mitad «confirmación», separadas por la mediana del momento de escaneo de los tokens con resultado.
- Una señal de riesgo es **útil** solo si, en AMBAS mitades, hay al menos 15 tokens con la señal y 15 sin ella, y la tasa de colapso con la señal supera a la tasa sin ella por 15 puntos porcentuales o más. Para la señal protectora, al revés.
- El veredicto es útil si «riesgo alto» supera a «sin alertas» por 20 puntos o más en ambas mitades (igual que PRECISION_V1).
- Si no se alcanzan los mínimos, el resultado es «muestra insuficiente», nunca «útil».
- Son 10 señales: con tantas comparaciones alguna puede parecer útil por azar. Por eso se exige que se repita en las dos mitades. Todo es descriptivo, no causal.

## Publicación

Se publican TODAS las señales, útiles o no, en la página de PreBuyScan y en este repositorio, después del 2026-10-30T15:00Z (cuando el último escaneo ya tiene su resultado de 24 h). No se cambia ninguna regla de la página para mejorar el estudio mientras corre.

## Límites declarados

- Una sola semana de mercado.
- El explorador público limita consultas: algunas señales saldrán «Sin datos» y se excluyen; se reporta cuántas.
- Tokens con 15 a 75 minutos de vida: no dice nada de tokens viejos.
- Colapsar no prueba estafa, y no colapsar no prueba seguridad.
