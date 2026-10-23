# GEMS_V1: ¿los datos de PreBuyScan distinguen las «joyas» entre los tokens nuevos?

Protocolo congelado el **23 oct 2026 (UTC)**, ANTES de recolectar ningún dato del estudio y antes de conocer los resultados de PRECISION_V2. Autorizado por el jefe («Prepara todo que quede terminado antes del 30»).

- **Tipo de investigación:** paper descriptiva y de solo lectura. No hay órdenes, claves, wallets, firmas ni dinero.
- **No es una señal de compra.**
- **Código:** `gems_v1.py`.
- **Pruebas:** `test_gems_v1.py`.
- **Ejecución:** workflow `GEMS_V1 (read-only research)`, cada hora en el minuto 47.

## Pregunta

PRECISION_V1 mostró que el escáner detecta riesgo, pero que «sin alertas» no significa que el token sobreviva: el 57 % de esos tokens también colapsó en 24 h. La pregunta inversa es: entre los tokens nuevos, ¿qué datos visibles al escanearlos se asocian con convertirse en una joya a los 7 días?

Se estudian dos grupos (cohortes), cada uno evaluado por separado con las mismas reglas:
- **h1:** tokens en su segunda o tercera hora de vida (pools de 1 a 3 h).
- **d1:** tokens que ya sobrevivieron su primer día (pools de 24 a 27 h).

Un mismo token puede aparecer en las dos cohortes; cada una tiene su propio resultado.

Ampliación acordada con el jefe el 23 oct (antes de recolectar datos): se agregaron 5 señales y la cohorte d1.

## Escáner

Copia congelada de la página publicada (gh-pages `fc6019d`) en `scanner/`. Su huella se guarda en cada escaneo (`scanner_sha`).

Se ejecuta en Chromium sin interfaz, llamando a la misma función `inspect()` que usa la página. El Alpha Signal Score se calcula con `PBAlpha.evaluate` de la misma copia.

Si la página pública cambia, el estudio NO cambia de escáner.

## Universo y muestra (prospectiva, sin sesgo de supervivencia)

- **Fuente:** listado público `new_pools` de GeckoTerminal para Robinhood Chain, páginas 1 a 10, consultado cada hora.
- **Índice de pools:** ese listado solo alcanza aproximadamente la última hora de lanzamientos (prueba de humo del 23 oct: 180 pools, ninguno de más de 1 h). Por eso, cada hora se anotan todos los pools que aparecen en `data/pool_index.jsonl`. El índice empieza 26 h antes de la ventana (29 oct 14:00Z), para que la cohorte d1 tenga pools de 24 h desde el inicio. Cada corrida queda en `data/runs.jsonl`.
- **Elegibles:**
  - pools del índice con **1 a 3 horas** (h1) o **24 a 27 horas** (d1) de edad en el momento del escaneo;
  - un registro por token (su primer pool creado), y los tokens ya escaneados se excluyen;
  - si WETH es el token base, el token estudiado es el otro.
- **Muestra por corrida:** los **10** (h1) y **5** (d1) elegibles con menor SHA-256 de su dirección. El criterio no depende de precio, liquidez ni volumen.
- **Ventana de escaneos:** desde **2026-10-30T16:00Z** hasta **2026-11-13T16:00Z** (14 días).
- **Al escanear se guarda:**
  - el reporte completo del escáner (veredicto, Safety Score, títulos de cada hallazgo);
  - la actividad del pool en GeckoTerminal (liquidez, volumen, compras, ventas, compradores y vendedores únicos de 1 h y 15 min, FDV);
  - el Alpha Signal Score;
  - las velas de 5 min desde la creación del pool hasta el escaneo (solo lo anterior al escaneo);
  - el número de holders, el número de pares en DexScreener, y si tiene web, redes y banner de perfil;
  - hasta 15 wallets compradoras del lanzamiento y 15 holders principales que no son contratos.
- **Fallas:** los escaneos que fallan se cuentan (`scan_failures`); no se descartan en silencio.

## Resultado medido (7 días)

- **Fuente:**
  - velas públicas de 15 min en USD de GeckoTerminal del pool muestreado;
  - liquidez del pool (`reserve_in_usd`) leída al medir, 7 días + 15 min después del escaneo.
- **Entrada:** apertura de la primera vela que empieza en o después del escaneo.
  - Si no hay velas en los 60 min siguientes, el resultado es `no_trade_after_seen`: no es joya.
  - Es un precio medio de mercado, sin comisiones ni impacto. Es descriptivo, no un resultado operable.
- **Joya (resultado principal):** retorno a 7 días ≥ **+200 %** (3×) **y** liquidez a los 7 días ≥ **10 000 USD**.
  - Liquidez desconocida o menor: no es joya.
- **Secundarios:**
  - **Doble:** retorno a 7 días ≥ +100 % con la misma condición de liquidez.
  - **Pico 5×:** el máximo de las velas dentro de los 7 días llegó a ≥ +400 %. Sirve para separar «subió y se mantuvo» de «subió y se desplomó».
- **Fallas del proveedor:** el resultado se reintenta cada hora. Si después de 48 h sigue fallando, queda «desconocido» y se excluye (se reporta cuántos).

## Señales preregistradas

Cada señal es presente, ausente o desconocida. Los tokens con la señal desconocida se excluyen de esa señal.

| Señal | Presente si… | Fuente |
|---|---|---|
| sin_riesgo_alto | el veredicto no es «riesgo alto» (desconocida si no es evaluable) | escáner |
| safety_80 | Safety Score ≥ 80 | escáner |
| liquidez_bloqueada_o_quemada | «Liquidez en un contrato de bloqueo» o «Liquidez quemada» | escáner |
| creador_historial_limpio | «No lanzó otros tokens» o «Los otros tokens del creador siguen vivos» (ausente: el creador tiene tokens muertos) | escáner |
| holders_repartidos | sin «Concentrado / Muy concentrado» (desconocida: holders no revisados) | escáner |
| snipers_salieron | «Los snipers ya casi no tienen tokens» o «Sin snipers detectados» (ausente: los snipers aún tienen X %) | escáner |
| compradores_unicos_30 | ≥ 30 compradores únicos en la última hora | GeckoTerminal |
| presion_compradora | compradores únicos ≥ 1.5 × vendedores únicos (1 h) | GeckoTerminal |
| compras_organicas | compras ÷ compradores únicos ≤ 3 (1 h): pocas wallets no inflan el volumen | GeckoTerminal |
| liquidez_15k | liquidez ≥ 15 000 USD | GeckoTerminal |
| alpha_signal_60 | Alpha Signal Score ≥ 60 | escáner (Alpha Radar) |
| filtro_combinado | sin_riesgo_alto + compradores_unicos_30 + presion_compradora + compras_organicas | combinado |
| equipo_invierte | tiene web **y** al menos una red social en DexScreener, o banner de perfil (perfil pagado) | DexScreener |
| aguanta_primera_ola | el último cierre antes del escaneo es ≥ 50 % del máximo desde su creación | GeckoTerminal (velas 5 min) |
| volumen_sostenido | volumen de los últimos 30 min antes del escaneo ≥ volumen de los primeros 30 min del pool (y mayor que 0) | GeckoTerminal (velas 5 min) |
| holders_100 | 100 holders o más | explorador |
| varios_pools | 2 o más pares en DexScreener | DexScreener |

**Dinero inteligente (diseño de dos etapas):**
1. Con la mitad «descubrimiento» se arma la lista de wallets que fueron compradoras del lanzamiento u holders principales de tokens que llegaron a «doble».
2. Se quitan las direcciones que aparecen en más del 20 % de los tokens de esa mitad (infraestructura, no personas).
3. En la mitad «confirmación», la señal está presente si el token tiene al menos una de esas wallets.

Nunca se evalúa con los mismos tokens con los que se aprendió.

## Mitades y regla de utilidad

Estas son las únicas comparaciones que se presentarán como hallazgo.

- **Mitades:** «descubrimiento» y «confirmación», separadas por la mediana del momento de escaneo de los tokens con resultado.
- **Una señal es útil solo si, en AMBAS mitades, se cumple todo esto:**
  - al menos 30 tokens con la señal y 30 sin ella;
  - al menos 3 joyas con la señal;
  - la tasa de joyas con la señal es al menos **2 veces** la tasa sin ella **y** al menos **3 puntos porcentuales** mayor.
- **Dinero inteligente:** se evalúa solo en confirmación, con al menos 15 tokens con la señal y 30 sin ella, y el mismo umbral.
- **Si no se alcanzan los mínimos,** el resultado es «muestra insuficiente», nunca «útil».
- **Muchas comparaciones:** son 18 señales por cohorte, y alguna puede parecer útil por azar. Por eso se exige la repetición en las dos mitades.
- **Alcance:** todo es descriptivo, no causal.

Además se reporta:
- la tasa base de joyas, dobles y picos 5×;
- cuántas joyas marcó el escáner como riesgo alto, precaución, sin alertas o sin datos (la vista inversa del escáner);
- la lista completa de joyas, con sus señales.

## Publicación

Se publican TODAS las señales, útiles o no, en este repositorio y en la página de PreBuyScan. Se publican después del **2026-11-22T17:00Z**, cuando el último escaneo ya tiene sus 7 días y el plazo de reintentos.

No se cambia ninguna regla del escáner ni de este protocolo mientras corre. Si un defecto de ejecución obliga a corregir algo, se anota con fecha al final de este documento, sin cambiar universo, muestra, señales, resultado ni reglas.

## Límites declarados

- **Rareza:** las joyas son raras, y con 14 días de muestra varias señales pueden quedar en «muestra insuficiente».
- **Un solo periodo:** dos semanas de un mercado. El comportamiento puede cambiar.
- **Precio sin costos:** el resultado se mide con precio medio, sin comisiones, deslizamiento ni la posibilidad real de vender.
- **Señales públicas:** si se publican, pueden perder valor porque otros compran lo mismo.
- **Alcance de la muestra:** solo tokens de 1 a 3 horas y de 24 a 27 horas de vida en Robinhood Chain.
- **Interpretación:** ser joya no prueba que el proyecto sea legítimo, y no serlo no prueba estafa. Nada de esto es una recomendación de inversión.
