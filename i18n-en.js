/* English UI catalog. Keep source findings in Spanish for scoring; translate only presentation. */
(function(root){
  'use strict';
  const entries = {
    "PreBuyScan, inicio":"PreBuyScan, home",
    "ANALIZA · DETECTA · PROTEGE · DECIDE":"ANALYZE · DETECT · PROTECT · DECIDE",
    "Español / English":"Spanish / English", "Español":"Spanish",
    "Detecta estafas en tokens de Robinhood Chain: simula la venta, revisa el contrato, el creador, la liquidez y los holders. Pega una wallet para ver su perfil.":"Detect scams in Robinhood Chain tokens: simulate a sale and check the contract, creator, liquidity and holders. Paste a wallet address to view its profile.",
    "Medimos las señales de mercado con 749 tokens nuevos de Robinhood Chain (17–21 oct 2026), con reglas fijadas antes de ver resultados. Porcentaje que colapsó en 24 h, con su intervalo de confianza del 95 % y el número de tokens:":"We measured market signals using 749 new Robinhood Chain tokens (Oct 17–21, 2026), with rules fixed before seeing the results. Percentage that collapsed within 24 h, with its 95% confidence interval and the number of tokens:",
    "más de la mitad de esos tokens colapsó igual, y con solo 58 tokens el dato real puede estar entre 44 % y 69 %. Un «riesgo alto» casi siempre termina mal. Ninguna señal se presenta como útil si la muestra es menor a 30 tokens por grupo. Las señales nuevas (creador, liquidez, snipers) se están midiendo ahora; resultados el 30 oct.":"more than half of those tokens still collapsed, and with only 58 tokens the true rate may be between 44% and 69%. A high-risk result almost always ends badly. No signal is presented as useful with fewer than 30 tokens per group. New signals (creator, liquidity, snipers) are being measured now; results on Oct 30.",
    "Safety Score (0–100, 100 = menor riesgo detectado).":"Safety Score (0–100, 100 = lowest detected risk).",
    "Empieza en 100: cada «Riesgo alto» resta 25, cada «Precaución» 10 y cada «Sin datos» 5. Con cualquier riesgo alto el máximo es 39; con alguna precaución, 79. Un riesgo crítico (venta que falla, liquidez retirable por el creador) nunca queda compensado por otras señales buenas.":"Starts at 100: each High risk subtracts 25, Caution subtracts 10, and No data subtracts 5. Any high-risk finding caps the score at 39; any caution caps it at 79. A critical risk (a failed sale or liquidity the creator can withdraw) is never offset by other positive signals.",
    "Qué parte de la revisión se pudo completar: mercado, venta simulada, contrato, dueño, creador e historial, control de la liquidez, snipers, holders y operaciones. Si un dato no se pudo verificar se muestra «NO VERIFICADO» y resta; nunca se toma como ausencia de riesgo.":"How much of the review could be completed: market, simulated sale, contract, owner, creator and history, liquidity control, snipers, holders and trades. Unverified data is marked NOT VERIFIED and reduces confidence; it is never treated as an absence of risk.",
    "Cada hallazgo indica de dónde sale: simulación en la RPC pública de Robinhood Chain (sin firmar ni enviar nada), código del contrato en la cadena, explorador Blockscout, DexScreener, GeckoTerminal o la base de creadores de PreBuyScan. Cada reporte indica el bloque y la hora de la revisión.":"Each finding identifies its source: simulation through Robinhood Chain's public RPC (without signing or sending anything), on-chain contract code, Blockscout, DexScreener, GeckoTerminal or PreBuyScan's creator database. Each report records the review block and time.",
    "Mide actividad observada en este momento: volumen 1 h frente a liquidez (25), transacciones 1 h (20), proporción de compradores (15), aceleración del volumen en 15 min (20), compradores nuevos (10) y edad del par (10). Es independiente del Safety Score: un token muy activo puede ser muy riesgoso. No predice precio ni ganancias y su valor predictivo no está validado; cualquier afirmación de acierto se publicará solo después de medirla con un estudio preregistrado.":"Measures current observed activity: 1 h volume versus liquidity (25), 1 h transactions (20), buyer ratio (15), volume acceleration over 15 min (20), new buyers (10) and pair age (10). Independent of the Safety Score: a very active token can be very risky. It does not predict price or profit and its predictive value is unvalidated; any accuracy claim will be published only after measurement in a preregistered study.",
    "Cobertura y estado del análisis.":"Coverage and analysis status.",
    "Cobertura = comprobaciones con resultado (bien, precaución o riesgo) sobre el total. «Error técnico» significa que un proveedor (RPC, explorador o mercado) no respondió: resta como «Sin datos», nunca cuenta como aprobado y reintentar puede cambiar el resultado. El estado del análisis es Completado, Parcial o Error de conexión.":"Coverage = checks with a result (OK, caution or risk) divided by all checks. Technical error means a provider (RPC, explorer or market) did not respond: it counts as No data, never as passed, and retrying may change the result. Analysis status is Complete, Partial or Connection error.",
    ". Cada análisis guardado registra la versión con la que se hizo.":". Each saved analysis records the version used.",
    "PreBuyScan, por VIGIA. Herramienta informativa con datos públicos (DexScreener, GeckoTerminal, explorador y RPC pública de Robinhood Chain) desde tu navegador. Simula una compra y venta sin firmar ni enviar nada. No es asesoría financiera ni una auditoría: «sin alertas» no significa «seguro».":"PreBuyScan, by VIGIA. An informational tool using public data (DexScreener, GeckoTerminal, Robinhood Chain explorer and public RPC) in your browser. Simulates a buy and sale without signing or sending anything. Not financial advice or an audit: no alerts does not mean safe.",
    "Valores iniciales configurables, no garantías de calidad. «Actividad» (Alpha Signal Score, 0–100) mide volumen frente a liquidez, transacciones, presión compradora, aceleración y edad; es independiente del Safety Score y no predice precio ni está validado. Un token con riesgo alto o señales de manipulación nunca recibe una etiqueta favorable y queda al final. Busca entre los ~150 pools más nuevos y activos de Robinhood Chain (GeckoTerminal).":"Configurable defaults, not quality guarantees. Activity (Alpha Signal Score, 0–100) measures volume versus liquidity, transactions, buying pressure, acceleration and age; it is independent of the Safety Score, does not predict price and is unvalidated. A token with high risk or manipulation signals never receives a favorable label and is ranked last. Searches approximately 150 of the newest and most active Robinhood Chain pools (GeckoTerminal).",
    "Veredicto rápido solo con datos de mercado (GeckoTerminal), con las reglas cuya precisión publicamos. Toca un token para el análisis completo.":"Quick verdict based only on market data (GeckoTerminal), using rules whose accuracy we publish. Select a token for the full analysis.",
    "Se guarda solo en este navegador.":"Saved only in this browser.",
    "Avisos de tus favoritos (liquidez retirada, caídas fuertes, cambio de veredicto) mientras la página o la app instalada estén abiertas. No se envía nada a terceros.":"Alerts for your favorites (withdrawn liquidity, sharp drops, verdict changes) while this page or the installed app is open. Nothing is sent to third parties.",
    "Seguridad del contrato":"Contract security", "Información del contrato":"Contract information", "Todos los hallazgos":"All findings", "Cobertura":"Coverage",
    "¿Por qué recibe esta puntuación?":"Why this score?", "Explicación de la puntuación":"Score explanation",
    "No hay suficientes comprobaciones concluyentes para asignar una puntuación.":"There are not enough conclusive checks to assign a score.",
    "Una señal de riesgo alto limita la puntuación a un máximo de 39/100.":"A high-risk finding caps the score at 39/100.",
    "Las señales de precaución limitan la puntuación a un máximo de 79/100.":"Caution findings cap the score at 79/100.",
    "No se detectaron alertas en las comprobaciones concluyentes. Esto no garantiza que el token sea seguro.":"No alerts were detected in the conclusive checks. This does not guarantee the token is safe.",
    "Safety Score: empieza en 100 y resta por cada alerta; lo no revisado también resta.":"Safety Score: starts at 100 and subtracts for each alert; unchecked items also subtract.",
    "Qué parte de la revisión se pudo completar (peso de cada parte en %: mercado 15, venta 20, contrato 15, dueño 5, creador 10, historial 10, liquidez 10, snipers 5, holders 5, operaciones 5). Lo no verificado nunca cuenta como seguro.":"How much of the review was completed (weights in %: market 15, sale 20, contract 15, owner 5, creator 10, history 10, liquidity 10, snipers 5, holders 5, trades 5). Unverified items never count as safe.",
    "Honeypot (venta simulada)":"Honeypot (simulated sale)", "Costo al vender (simulado)":"Selling cost (simulated)", "Puede crear tokens (mint)":"Can mint tokens", "Lista negra":"Blacklist", "Cambiar comisiones":"Change fees", "Pausar el trading":"Pause trading", "Contrato actualizable":"Upgradeable contract", "Snipers (aún tienen)":"Snipers (still holding)",
    "Retirable":"Withdrawable", "Parcialmente retirable":"Partly withdrawable", "Quemada":"Burned", "Bloqueada":"Locked", "Sin verificar":"Unverified", "Sin simular":"Not simulated", "Sin owner()":"No owner()", "sin owner()":"no owner()", "Router propio":"Own router", "Sí":"Yes", "No":"No", "A revisar":"Review needed", "Sin historial malo":"No adverse history",
    "Datos de mercado":"Market data", "Código del contrato":"Contract code", "Dueño del contrato":"Contract owner", "Creador identificado":"Creator identified", "Historial del creador":"Creator history", "Control de la liquidez":"Liquidity control", "Snipers del lanzamiento":"Launch snipers",
    "Dirección":"Address", "Copiar dirección":"Copy address", "Creado":"Created", "Creador":"Creator", "Dueño (owner)":"Owner", "Código":"Code", "verificado":"verified", "no verificado":"unverified", "verificado en el explorador":"verified on the explorer", "renunciado":"renounced", "Ver en explorador →":"View on explorer →", "Volver":"Back",
    "Precio (USD)":"Price (USD)", "Precio USD":"Price USD", "Liquidez":"Liquidity", "Volumen 24 h":"24 h volume", "Antigüedad":"Age", "Transacciones 24 h":"24 h transactions", "Edad del par":"Pair age", "Capitalización":"Market capitalization",
    "Datos del mercado":"Market data", "Transacciones":"Transactions", "Tipo":"Type", "Todas":"All", "Compras":"Buys", "Ventas":"Sells", "Mín. USD":"Min. USD", "Pausar":"Pause", "Reanudar":"Resume", "Cargando operaciones…":"Loading trades…", "Hora / tipo":"Time / side", "Compró USD":"Bought USD", "Vendió USD":"Sold USD", "Operaciones":"Trades", "% del suministro":"% of supply", "↑ Compra":"↑ Buy", "↓ Venta":"↓ Sell", "Hora no disponible":"Time unavailable", "Pausado.":"Paused.",
    "Fuente: GeckoTerminal · par principal · consulta cada 30 s; puede haber retraso del proveedor. Operaciones ejecutadas, no órdenes pendientes. Top traders: volumen de la muestra, no ganancias. Holders: captura del análisis. ⚠ = operación marcada anómala por el proveedor.":"Source: GeckoTerminal · main pair · refreshed every 30 s; provider delays are possible. Executed trades, not pending orders. Top traders: sample volume, not profits. Holders: analysis snapshot. ⚠ = trade flagged as anomalous by the provider.",
    "Holders no disponibles en este análisis.":"Holders unavailable in this analysis.", "Sin resultados para estos filtros.":"No results for these filters.", "Sin operaciones disponibles.":"No trades available.", "Sin una consulta correcta todavía.":"No successful refresh yet.", "Sin actualización: datos posiblemente desactualizados.":"Refresh failed: data may be outdated.",
    "Compra simulada":"Simulated buy", "Impacto de precio":"Price impact", "Si vendes enseguida":"If you sell immediately", "referencia":"reference", "la venta falla":"sale fails", "sin dato":"no data",
    "Compras simuladas de distinto tamaño: «impacto» = cuánto más caro sale cada token frente a la compra de 0.01 ETH. Vender enseguida recupera casi todo el impacto, por eso la última columna cambia poco; lo que pierdes ahí son comisiones e impuestos.":"Simulated buys of different sizes: impact is how much more each token costs compared with a 0.01 ETH buy. Selling immediately recovers most of the impact, so the last column changes little; the remaining loss is fees and taxes.",
    "Mayores ganadores al vender":"Largest realized sellers", "Ventas más grandes recientes":"Largest recent sells", "Compradores del primer minuto":"First-minute buyers", "Otros tokens del creador":"Creator's other tokens", "Mayores holders":"Largest holders", "Compró":"Bought", "Vendió":"Sold", "Resultado":"Result", "Hace":"Ago", "Tiene hoy":"Currently holds", "Fondeo":"Funding", "Liquidez hoy":"Current liquidity", "% del total":"% of total", "(vendió)":"(sold)", "del creador":"from the creator", "compartido":"shared", "muerto":"dead", "activo":"active", "Sin actividad para mostrar.":"No activity to display.",
    "% del suministro total. «Fondeo» = de dónde recibieron su primer ETH. ★ = creador.":"% of total supply. Funding = where their first ETH came from. ★ = creator.", "«Muerto» = menos de $1,000 de liquidez hoy.":"Dead = less than $1,000 of liquidity now.",
    "Mapa de wallets":"Wallet map", "grafo de entidades · en vivo":"entity graph · live", "Reintentar mapa de wallets":"Retry wallet map",
    "Pasa el cursor o el dedo sobre el mapa para verlo en 3D. Burbujas = mayores holders. Las une quién les dio su primer ETH o si se pasaron el token. Un grupo de color suele ser una sola persona con varias wallets.":"Move your cursor or finger over the map to view it in 3D. Bubbles represent the largest holders. Connections show who provided their first ETH or whether they transferred tokens to each other. A colored group often represents one person with several wallets.",
    "Mapa de wallets: burbujas por holder, líneas por fondeo o transferencias":"Wallet map: holder bubbles, funding or transfer links", "Pausar o reanudar el flujo":"Pause or resume flow", "Arrastra para mover · rueda o pellizco para zoom · toca una burbuja":"Drag to move · scroll or pinch to zoom · tap a bubble", "Suministro":"Supply", "Conectada con":"Connected to", "no es holder":"not a holder", "Sniper del primer minuto":"First-minute sniper", "Creó el contrato fondeador":"Created the funding contract",
    "Liquidez bloqueada en contratos de terceros: no se verifica hasta cuándo.":"Liquidity locked in third-party contracts: the lock expiry is not verified.",
    "Tarjetas para compartir":"Share cards", "Reporte premium":"Premium report", "Crear tarjetas":"Create cards", "Imágenes generadas con los datos reales de este análisis, con un enlace y un QR verificables.":"Images generated from this analysis's actual data, with a verifiable link and QR code.", "Tarjeta para X":"Card for X", "Tarjeta para Telegram":"Card for Telegram", "Escanea para verificar":"Scan to verify", "Reporte":"Report", "Descargar":"Download", "Verificar reporte":"Verify report", "Reporte verificado":"Verified report", "REPORTE VERIFICADO":"VERIFIED REPORT", "Reporte inválido":"Invalid report", "Guardar imagen":"Save image",
    "El reporte del enlace está dañado.":"The linked report is corrupted.", "El identificador no coincide con el contenido: el reporte fue modificado.":"The identifier does not match the content: the report was modified.", "La dirección del enlace no coincide con la del reporte.":"The link address does not match the report address.", "Fuente: DexScreener (mercado) y Blockscout (holders), al momento del análisis.":"Source: DexScreener (market) and Blockscout (holders), at analysis time.", "Sin par en DexScreener al momento del análisis. No se inventan cifras.":"No DexScreener pair at analysis time. No figures are invented.",
    "Sin alertas detectadas en las revisiones completadas. No significa «seguro».":"No alerts detected in completed checks. This does not mean safe.", "100 = menor riesgo detectado":"100 = lowest detected risk", "Análisis informativo. No garantiza seguridad ni rentabilidad.":"Informational analysis. Does not guarantee safety or profit.",
    "Aún no tienes favoritos. Toca ☆ Favorito en un análisis.":"No favorites yet. Select ☆ Favorite in an analysis.", "Aún no hay análisis guardados.":"No saved analyses yet.", "Aún no has analizado tokens en este navegador.":"You have not analyzed tokens in this browser yet.", "No hay datos ahora mismo.":"No data available right now.", "No se pudo cargar la lista. Prueba en un momento.":"Could not load the list. Try again shortly.", "Error de conexión con GeckoTerminal. Prueba en un momento.":"Connection error with GeckoTerminal. Try again shortly.", "Buscando entre los pools nuevos y activos…":"Searching new and active pools…", "Riesgo":"Risk", "Actividad":"Activity", "Seguridad":"Security", "Sin comprobación reciente":"No recent check", "Sin respuesta":"No response", "Conectado":"Connected", "ahora":"now", "días":"days", "operaciones":"trades", "compras":"buys", "ventas":"sells", "riesgo alto":"high risk", "precaución":"caution", "bien":"OK", "sin datos":"no data", "error técnico":"technical error",
    "Alpha Signal Score: actividad observada, no seguridad ni predicción":"Alpha Signal Score: observed activity, not safety or prediction", "Riesgo rápido con datos de mercado; el análisis completo es Risk Shield":"Quick risk from market data; Risk Shield is the full analysis",
    "Monto en dólares":"Amount in dollars", "Recibirías (venta simulada)":"You would receive (simulated sale)", "Pérdida por comisiones e impacto":"Loss from fees and impact", "sin simulación":"no simulation", "(descontando el costo simulado al vender)":"(after the simulated selling cost)",
    "Analiza un token primero; el simulador usa su precio y su venta simulada.":"Analyze a token first; the simulator uses its price and simulated sale.",
    "Este navegador no permite notificaciones.":"This browser does not support notifications.", "Bloqueadas en los ajustes del navegador.":"Blocked in browser settings.", "Activadas.":"Enabled.", "Desactivadas.":"Disabled.", "Dirección copiada":"Address copied", "Enlace copiado":"Link copied", "Quitado de favoritos":"Removed from favorites", "Agregado a favoritos":"Added to favorites", "Copia la dirección:":"Copy the address:", "Copia el enlace:":"Copy the link:",
    "Lo que copiaste no es una dirección (0x + 40 caracteres).":"What you copied is not an address (0x + 40 characters).", "No hay nada copiado. Copia la dirección del contrato y vuelve a tocar «Pegar».":"The clipboard is empty. Copy the contract address and select Paste again.", "Tu navegador no dejó leer el portapapeles: mantén presionado el campo y elige «Pegar»; la búsqueda empieza sola.":"Your browser blocked clipboard access: press and hold the field and choose Paste; the search starts automatically.", "Tu navegador no pudo exportar la imagen.":"Your browser could not export the image.", "Tu navegador no comparte imágenes: la descargué.":"Your browser cannot share images: the image was downloaded.",
    "En iPhone: toca Compartir (el cuadro con flecha ⬆) y luego «Agregar a pantalla de inicio».":"On iPhone: tap Share (the box with the ⬆ arrow), then Add to Home Screen.", "Abre el menú del navegador (⋮) y elige «Instalar app» o «Agregar a pantalla de inicio».":"Open the browser menu (⋮) and choose Install app or Add to Home Screen.",
    "No se pudo consultar ni el mercado ni la cadena. El resultado no es una evaluación.":"Neither the market nor the chain could be queried. This result is not an assessment.", "Todas las comprobaciones dieron un resultado.":"All checks returned a result.", "Sin alertas detectadas":"No alerts detected", "Sin datos suficientes":"Insufficient data", "Se detectaron señales graves. No compres sin investigar mucho más.":"Serious signals were detected. Do not buy without investigating much further.", "Hay señales que conviene entender antes de comprar.":"There are signals to understand before buying.", "No se encontraron las señales comunes. Esto no garantiza que sea seguro.":"No common signals were found. This does not guarantee safety.", "No se pudieron completar las revisiones.":"The checks could not be completed.",
    "Wallet de alto riesgo":"High-risk wallet", "Wallet con señales a revisar":"Wallet with signals to review", "Sin señales de estafa":"No scam signals", "Wallets que fondeó":"Wallets it funded", "Perfil de wallet":"Wallet profile", "Tokens creados":"Created tokens", "Tokens operados":"Traded tokens", "Wallet de plataforma o servicio":"Platform or service wallet", "No ha creado tokens":"Has not created tokens", "Tokens creados no revisados":"Created tokens not checked", "Sus tokens siguen vivos":"Its tokens are still active", "Fondeada desde un servicio grande":"Funded by a large service", "La fondeó un creador serial":"Funded by a serial creator", "Wallet recién creada":"Newly created wallet", "Su primera transacción fue hace menos de 24 h.":"Its first transaction was less than 24 h ago.", "Mandó ETH a varias wallets sin actividad previa.":"Sent ETH to several wallets with no prior activity.", "No se pudo consultar su historial completo.":"Could not retrieve its full history.", "Buscando quién la fondeó…":"Finding who funded it…", "Buscando tokens que creó…":"Finding tokens it created…", "Buscando a quién fondeó…":"Finding wallets it funded…", "Leyendo transferencias del token…":"Reading token transfers…",
    "No podemos ubicar al creador en el mapa.":"The creator could not be located on the map.", "No encontramos wallets ligadas al creador entre los mayores holders.":"No wallets linked to the creator were found among the largest holders.",
    "Simulación eth_simulateV1 en la RPC pública":"eth_simulateV1 simulation through the public RPC", "Código del contrato en la cadena (RPC pública)":"On-chain contract code (public RPC)", "Explorador Blockscout + RPC pública":"Blockscout explorer + public RPC", "Base de creadores de PreBuyScan":"PreBuyScan creator database", "GeckoTerminal (todos los pools del token)":"GeckoTerminal (all token pools)", "GeckoTerminal (últimas operaciones)":"GeckoTerminal (recent trades)", "RPC de respaldo":"Backup RPC", "Código verificado":"Verified code", "Pools del token":"Token pools", "Tamaño del contrato":"Contract size", "En manos del dueño":"Held by the owner", "Máximo por operación":"Maximum per trade", "Máximo por wallet":"Maximum per wallet", "Monto máximo vendible":"Maximum sellable amount", "En la base de PreBuyScan":"In the PreBuyScan database",
    "Usar el gráfico":"Use the chart", "Gráfico de precio en GeckoTerminal":"GeckoTerminal price chart", "Toca para ver en qué paso va":"Tap to see the current step",
    "Valor total si todos los tokens valieran el precio actual (Fully Diluted Valuation).":"Total value if all tokens were valued at the current price (Fully Diluted Valuation).", "Bots o wallets que compran en el primer minuto del lanzamiento para revender.":"Bots or wallets buying in the first minute after launch to resell.", "Bot o wallet que compra en el primer minuto del lanzamiento para revender.":"A bot or wallet buying in the first minute after launch to resell.", "Diferencia entre el precio que ves y el que realmente pagas o recibes por el tamaño de tu operación (slippage).":"Difference between the displayed price and what you actually pay or receive for your trade size (slippage).", "Diferencia entre el precio que ves y el que realmente pagas o recibes (deslizamiento).":"Difference between the displayed price and what you actually pay or receive (slippage).", "Token que deja comprar pero no vender.":"A token that allows buying but blocks selling.", "El creador retira la liquidez y el token se queda sin valor.":"The creator withdraws the liquidity, leaving the token worthless.", "Tokens que representan la liquidez aportada a un pool.":"Tokens representing liquidity deposited into a pool.", "Wallets que tienen el token.":"Wallets holding the token.", "El propio equipo compra en el lanzamiento con varias wallets para vender después.":"The team buys at launch through several wallets to sell later.", "Compras y ventas entre wallets del mismo dueño para inflar el volumen.":"Buys and sells between wallets with the same owner to inflate volume.", "Contrato que delega en otro y puede cambiar su código.":"A contract that delegates to another contract and can change its code.", "Código extra de un pool Uniswap V4 que puede cambiar reglas o comisiones.":"Extra code in a Uniswap V4 pool that can change rules or fees.", "Tiempo de espera obligatorio entre operaciones.":"A mandatory waiting period between trades."
  };
  Object.assign(entries, {
    "La venta falla con montos grandes":"Selling fails for large amounts", "El par principal no es contra WETH.":"The main pair is not paired with WETH.", "Pool V4 contra un activo distinto de ETH/WETH; simulación no disponible.":"V4 pool paired with an asset other than ETH/WETH; simulation unavailable.", "Preparación de WETH simulada fallida.":"Simulated WETH preparation failed.", "El hook del pool rechazó la compra desde los routers estándar de Uniswap: solo permite operar desde su propio router.":"The pool hook rejected the buy through standard Uniswap routers: only its own router is allowed.", "La compra simulada no entregó tokens.":"The simulated buy returned no tokens.", "La aprobación simulada falló.":"Simulated approval failed.", "La simulación no fue consistente (el saldo cambió entre llamadas).":"The simulation was inconsistent (the balance changed between calls).", "La compra funcionó pero la venta falló: posible honeypot.":"The buy worked but the sale failed: possible honeypot.", "Compra y venta simuladas con éxito.":"Buy and sale simulated successfully.", "La venta no devolvió nada.":"The sale returned nothing.", "Simulación no disponible.":"Simulation unavailable."
  });
  Object.assign(entries, {
    "RIESGO CONFIRMADO":"CONFIRMED RISK", "SEÑAL SOSPECHOSA":"SUSPICIOUS SIGNAL", "SIMULACIÓN PENDIENTE":"SIMULATION PENDING", "IDENTIDAD NO VERIFICADA":"IDENTITY UNVERIFIED", "NO DISPONIBLE":"UNAVAILABLE", "pendiente":"pending", "no disponible":"unavailable",
    "Simulador de compra/venta":"Buy/sell simulator", "Compra":"Buy", "Monto (USD)":"Amount (USD)", "Slippage máximo":"Maximum slippage", "Tokens a recibir":"Tokens to receive", "Precio por token":"Price per token", "Si vendieras enseguida":"If you sold immediately", "Valor a vender":"Value to sell", "Resultado estimado":"Estimated result", "Escenarios hipotéticos":"Hypothetical scenarios", "Cálculo con el precio actual y la venta simulada de PreBuyScan. No compra ni vende nada; los escenarios de subida son hipotéticos, no predicciones.":"Calculated using the current price and PreBuyScan's simulated sale. Nothing is bought or sold; upside scenarios are hypothetical, not predictions.",
    "Gráfico en vivo de GeckoTerminal del par principal.":"Live GeckoTerminal chart for the main pair.", "Abrir en GeckoTerminal":"Open in GeckoTerminal", "Grupo":"Group", "Del creador ★":"Creator's group ★", "Toca una burbuja para ver la wallet.":"Select a bubble to view the wallet.", "S sniper del primer minuto":"S first-minute sniper", "fondeó":"funded", "transfirió el token":"transferred the token", "no es holder (solo conecta)":"not a holder (connection only)", "Este grupo no cambia la puntuación de arriba.":"This group does not change the score above."
  });
  Object.assign(entries, {
    "Compras sin ventas (posible venta bloqueada)":"Buys without sells (selling may be blocked)", "Volumen 5× la liquidez (posible wash trading)":"Volume 5× liquidity (possible wash trading)", "Pocas wallets hacen muchas compras":"Few wallets making many buys", "Riesgo alto: sin etiqueta favorable":"High risk: no favorable label", "Sin señales extra":"No additional signals", "Ningún token pasa los filtros ahora mismo. Prueba con una edad mayor o menos liquidez mínima.":"No tokens pass the filters right now. Try a higher maximum age or lower minimum liquidity.", "Reporte no verificado":"Report not verified",
    "El contenido de este enlace coincide con su huella SHA-256 (":"The content of this link matches its SHA-256 fingerprint (", "): no fue alterado desde que se generó.":"): it has not been altered since generation.", "Analizado el":"Analyzed on", "con el algoritmo":"with algorithm", "confianza de los datos":"data confidence", "Sin firma digital todavía: esto prueba que el reporte no cambió, no quién lo generó. Abajo está el análisis actualizado de hoy para comparar.":"No digital signature yet: this proves the report has not changed, not who generated it. Today's updated analysis is below for comparison.", "No confíes en la imagen que te compartieron; abajo está el análisis real de hoy.":"Do not trust the shared image; today's actual analysis is below.",
    "Error de conexión":"Connection error", "Análisis parcial":"Partial analysis", "Imagen descargada":"Image downloaded", "Enlace verificable copiado":"Verifiable link copied", "Guardado en favoritos":"Saved to favorites",
    "Este análisis no tiene ninguna comprobación concluyente: no se genera una tarjeta para compartir. Reintenta el análisis.":"This analysis has no conclusive checks: no share card will be generated. Retry the analysis.", "Generando las tres tarjetas…":"Generating all three cards…", "Compartir en X":"Share on X", "Compartir en Telegram":"Share on Telegram", "Compartir imagen":"Share image", "Descargar PNG (X)":"Download PNG (X)", "Descargar PNG (Telegram)":"Download PNG (Telegram)", "Descargar reporte premium":"Download premium report", "Premium en WebP":"Premium in WebP", "Copiar enlace verificable":"Copy verifiable link", "con QR":"with QR", "QR no disponible":"QR unavailable", "No se pudieron generar las tarjetas en este navegador.":"Could not generate cards in this browser.",
    ". X y Telegram no permiten adjuntar una imagen desde un enlace: el botón abre la publicación con el texto y el enlace; descarga la imagen y súbela tú. Nada se publica sin que tú lo envíes.":". X and Telegram cannot attach an image from a link: the button opens a post with text and the link; download and upload the image yourself. Nothing is published unless you send it.",
    "El enlace y el QR llevan una copia del reporte: la página recalcula su huella y confirma que no fue alterado. Todavía no hay firma digital (requiere servidor), así que no prueba quién lo generó.":"The link and QR contain a copy of the report: the page recalculates its fingerprint to confirm it was not altered. There is no digital signature yet (a server is required), so this does not prove who generated it.",
    "Esa dirección no es válida. Debe empezar con 0x y tener 40 caracteres hexadecimales después.":"That address is invalid. It must start with 0x followed by 40 hexadecimal characters.",
    "Simulamos la compra y la venta, revisamos el contrato, el creador, la liquidez, los snipers y los holders. Tarda de 20 a 60 segundos.":"We simulate a buy and sale and check the contract, creator, liquidity, snipers and holders. This takes 20 to 60 seconds.",
    "Es una wallet: armando su perfil…":"This is a wallet: building its profile…", "No se pudo completar la revisión. Comprueba tu conexión y vuelve a intentarlo.":"Could not complete the review. Check your connection and try again.",
    "Revisando tokens con los que operó…":"Checking tokens it traded…", "recibió":"received", "envió":"sent", "Perfil":"Profile", "Edad":"Age", "Fondeada por":"Funded by", "wallet antigua":"established wallet", "Plataforma / servicio":"Platform / service", "Tokens que creó":"Tokens it created", "Tokens con los que operó hace poco":"Recently traded tokens", "Último movimiento":"Last activity", "meses":"months", "muertos":"dead", "historial":"history", "fondeo":"funding",
    "«Muerto» = menos de $1,000 de liquidez hoy en DexScreener.":"Dead = less than $1,000 of current liquidity on DexScreener.", "Datos públicos del explorador, la RPC y DexScreener. Un perfil limpio no garantiza nada.":"Public data from the explorer, RPC and DexScreener. A clean profile guarantees nothing.",
    "Sin alertas en las revisiones (no garantiza que sea seguro)":"No alerts in completed checks (does not guarantee safety)", "RESUMEN":"SUMMARY", "REPORTE PREMIUM":"PREMIUM REPORT", "RIESGO":"RISK", "FUENTES":"SOURCES", "PENDIENTE":"PENDING", "VERIFICAR REPORTE":"VERIFY REPORT", "DESCARGAR":"DOWNLOAD", "ANÁLISIS INFORMATIVO":"INFORMATIONAL ANALYSIS"
  });
  // Sentence fragments used around live values. Longest match wins; never touch raw data.
  const fragments = `
La puntuación de |The score of 
holders tienen entre |holders own between 
y hoy tiene |and now holds 
una parte|a share
Solo se puede vender hasta ~|You can only sell up to ~
la compra|the buy
la venta|the sale
falla desde |fails from 
Monto máximo vendible encontrado: ~|Maximum sellable amount found: ~
Causa probable: |Probable cause: 
no es realizable.|cannot be realized.
El creador tiene |The creator has 
tokens; los |tokens; the 
El par no reporta liquidez.|The pair reports no liquidity.
El FDV es |FDV is 
en 1 h: puede ser una salida masiva o un rug en curso.|in 1 h: there may be a mass exit or an ongoing rug pull.
El par reporta |The pair reports 
En los pools|In the pools
El contrato declara compra |The contract declares a buy tax of 
entre las variantes conocidas.|among known variants.
no encontramos otros tokens, pero no revisamos las anteriores.|we found no other tokens, but did not check earlier transactions.
Una sola wallet tiene |A single wallet holds 
Ya se puede retirar.|It can now be withdrawn.
%. Parte puede retirarse.|%. Some can be withdrawn.
El mayor proveedor (|The largest provider (
) tiene |) holds 
El creador no tiene posiciones en este pool (|The creator holds no positions in this pool (
El contrato usa AccessControl pero no lista a sus administradores y no pudimos identificar al creador.|The contract uses AccessControl but does not list its administrators, and the creator could not be identified.
Una wallet tiene |One wallet holds 
Ya no tiene mercado en DexScreener|No longer has a market on DexScreener
El creador controla |The creator controls 
Su wallet tiene |Its wallet holds 
wallets ligadas al creador (por fondeo o transferencias) tienen |wallets linked to the creator (through funding or transfers) hold 
wallets ligadas al creador|wallets linked to the creator
wallet(s) ligadas al creador entre los holders revisados.|wallet(s) linked to the creator among the reviewed holders.
Otro grupo controla |Another group controls 
Mostramos |Showing 
holders (los mayores, sin pools ni quemado, más los snipers que aún tienen tokens). Exchanges y puentes con miles de transacciones no cuentan como «mismo dueño».|holders (the largest, excluding pools and burned tokens, plus snipers still holding tokens). Exchanges and bridges with thousands of transactions are not treated as the same owner.
 · grupo | · group 
 · contrato| · contract
 · precio | · price 
Hay |There are 
Precio +|Price +
% en 1 h|% in 1 h
% desde tu última consulta|% since your last refresh
% desde |% since 
consulta(s) fallaron: lista incompleta|query/queries failed: incomplete list
lanzó |launched 
El creador lanzó |The creator launched 
Lanzó |Launched 
Los snipers aún tienen |Snipers still hold 
compradores del lanzamiento los fondeó el creador|launch buyers were funded by the creator
vendió |sold 
Las 10 wallets más grandes tienen |The 10 largest wallets hold 
% (sin pools ni quemado).|% (excluding pools and burned tokens).
: una venta pequeña mueve mucho el precio y es fácil de manipular.|: a small sale moves the price substantially and it is easy to manipulate.
: el deslizamiento puede ser alto.|: slippage may be high.
ventas en 24 h. Que otros vendan no garantiza que tú puedas.|sells in 24 h. Others selling does not guarantee you can.
Simulamos comprar con 0.01 ETH y vender todo: recuperarías |We simulated buying with 0.01 ETH and selling everything: you would recover 
% (incluye comisiones e impacto). No garantiza que siga así.|% (fees and impact included). This may change.
No se encontraron mint, lista negra, cambio de comisiones, pausa, límites ni cambio de saldos|No mint, blacklist, fee changes, pause, limits or balance changes were found
Nadie más compró en el primer minuto de operaciones.|Nobody else bought in the first minute of trading.
operaciones del par principal (GeckoTerminal). Entre paréntesis, número de operaciones.|trades from the main pair (GeckoTerminal). The number of trades is in parentheses.
Lo más importante: |Most important: 
comprobación(es) sin resultado concluyente; «sin alertas» nunca garantiza que sea seguro.|check(s) without a conclusive result; no alerts never guarantees safety.
comprobación(es) con error técnico: reintentar puede cambiar el resultado.|check(s) with a technical error: retrying may change the result.
pools con comisión abusiva|pools with abusive fees
Hay pools de este token con comisión de |Some pools for this token charge a fee of 
: quien compre o venda ahí pierde esa parte. Usa solo el pool principal.|: anyone buying or selling there loses that share. Use only the main pool.
mueven mucho más que su liquidez (p. ej. |trade much more than their liquidity (e.g. 
en 24 h con |in 24 h with 
de liquidez)|of liquidity)
% del volumen del token: el volumen que ves no es demanda real.|% of token volume: the displayed volume is not real demand.
: parte del volumen no es demanda real.|: some volume is not real demand.
%). Si el arbitraje no cierra la diferencia, algo impide operar en uno de ellos.|%). If arbitrage does not close the gap, something prevents trading in one of them.
de volumen en 24 h con solo |of volume in 24 h with only 
por operación)|per trade)
: no es actividad real; no lo tomes como señal de demanda.|: this is not real activity; do not treat it as a demand signal.
operaciones de solo |trades from only 
por wallet): típico de bots que inflan la actividad.|per wallet): typical of bots inflating activity.
DexScreener muestra el pool principal con |DexScreener shows the main pool with 
de liquidez, pero GeckoTerminal no lo tiene. Confía menos en las cifras de mercado.|of liquidity, but GeckoTerminal does not list it. Place less confidence in market figures.
Liquidez según DexScreener: |Liquidity according to DexScreener: 
; según GeckoTerminal: |; according to GeckoTerminal: 
(GeckoTerminal no tiene el pool principal)|(GeckoTerminal does not list the main pool)
. Una de las dos fuentes está equivocada o el pool es irregular: confía menos en las cifras de mercado.|. One source is wrong or the pool is irregular: place less confidence in market figures.
Precio según DexScreener: |Price according to DexScreener: 
. Confía menos en las cifras de mercado.|. Place less confidence in market figures.
Precio frágil: solo |Fragile price: only 
del suministro está en los pools|of supply is in pools
El precio se forma con muy pocos tokens; el resto (|The price is determined by very few tokens; the rest (
) está en wallets. Si una parte pequeña de eso se vende, el precio se desploma. El FDV de |) is held in wallets. Selling a small share can crash the price. The FDV of 
wallets con saldos casi idénticos|wallets with near-identical balances
del suministro cada uno (|of supply each (
en total). Saldos clonados suelen ser un airdrop o una sola persona repartida en muchas wallets que puede vender a la vez.|in total). Cloned balances often represent an airdrop or one person spread across wallets who can sell all at once.
Un comprador del lanzamiento llegó a tener |A launch buyer reached 
compradores del lanzamiento tuvieron más de |launch buyers held more than 
compró |bought 
del suministro en el primer minuto|of supply in the first minute
y ya vendió la mayor parte: quien entra así suele salir sobre las compras de la gente.|and has already sold most of it: such buyers often exit into other people's buys.
La venta simulada funciona con montos pequeños pero |The simulated sale works with small amounts but 
revisadas, |reviewed, 
recibieron de esta wallet su primer ETH.|received their first ETH from this wallet.
/100 se debe principalmente a: |/100 is mainly due to: 
comprobación(es) pendientes o con error técnico: reducen la puntuación por falta de datos, pero no prueban una vulnerabilidad.|check(s) pending or with technical errors: these lower the score because data is missing, but do not prove a vulnerability.
Todas las comprobaciones corrieron; |All checks ran; 
sin resultado concluyente (cuentan como «sin datos»).|without a conclusive result (counted as No data).
Última consulta correcta: |Last successful refresh: 
 operaciones.| trades.
Pausado. |Paused. 
Análisis de |Analysis of 
 en PreBuyScan| on PreBuyScan
Revisado |Reviewed 
en el bloque |at block 
 · algoritmo | · algorithm 
No revisado: |Not checked: 
Sin web ni redes registradas en DexScreener.|No website or social links listed on DexScreener.
recuperas |you recover 
Sin pools|Excluding pools
 ni quemado| and burned tokens
★ = creador|★ = creator
de |of 
 días| days
hace |ago: 
Par con menos de |Pair younger than 
 token(s) pasan los filtros. Toca uno para el análisis completo (Risk Shield).| token(s) pass the filters. Select one for the full analysis (Risk Shield).
Fuente: |Source: 
 · actualizado | · updated 
«Actividad» es el Alpha Signal Score: mide movimiento, no seguridad ni ganancias.|Activity is the Alpha Signal Score: it measures movement, not safety or profit.
Sin actualización: datos posiblemente desactualizados.|Refresh failed: data may be outdated.
Costo máximo (slippage |Maximum cost (slippage 
Volumen acelerando (15 min)|Volume accelerating (15 min)
Más compradores que vendedores (1 h)|More buyers than sellers (1 h)
Compradores únicos en aumento|Unique buyers increasing
desde ahora|from now
El grupo del creador controla |The creator's group controls 
El grupo del creador tiene |The creator's group holds 
La wallet del creador|The creator's wallet
% del suministro: pueden vender juntas.|% of supply: they can sell together.
% del suministro: puede vender de golpe.|% of supply: it can dump its holdings.
wallets conectadas entre sí (sin el creador) tienen |interconnected wallets (excluding the creator) hold 
No pudimos revisar el fondeo de |Could not check the funding of 
Faltaron transferencias del token.|Token transfers were unavailable.
contrato que fondeó a varias wallets en la misma hora: |contract that funded several wallets in the same hour: 
creó el contrato que fondeó · |created the funding contract · 
Buscando quién fondeó cada wallet… |Finding who funded each wallet… 
contrato que fondeó en la misma hora|contract that funded in the same hour
No se pudo armar el mapa: el explorador no respondió. Prueba de nuevo en un minuto.|Could not build the map: the explorer did not respond. Try again in a minute.
No se pudo cargar el mapa de wallets.|Could not load the wallet map.
wallets que compran y venden una y otra vez hacen |wallets repeatedly buying and selling account for 
% del volumen reciente: parte del volumen puede ser falso.|% of recent volume: some volume may be fake.
wallets hicieron las últimas |wallets made the last 
operaciones y 3 de ellas suman |trades and 3 of them account for 
% del volumen.|% of volume.
Ojo: este token es anterior al inicio de la base, así que su historial está incompleto.|Note: this token predates the database, so its history is incomplete.
Base de creadores de PreBuyScan (todos los tokens nuevos de Robinhood Chain desde el |PreBuyScan creator database (all new Robinhood Chain tokens since 
Creador serial: lanzó |Serial creator: launched 
tokens con resultado, |tokens with an outcome, 
quedaron sin liquidez a las 24–72 h.|lost liquidity within 24–72 h.
con resultado murieron.|with an outcome died.
con resultado siguen con liquidez.|with an outcome still have liquidity.
esta wallet creó |this wallet created 
tokens; aún no tienen resultado (se revisa a las 24 h). Quien lanza muchos tokens seguidos suele abandonarlos.|tokens; outcomes are not available yet (checked at 24 h). Serial token creators often abandon them.
tokens; ninguno tiene resultado todavía (se revisa a las 24 h).|tokens; no outcomes available yet (checked at 24 h).
Bloqueada hasta el |Locked until 
No pudimos leer hasta cuándo.|Could not read the lock expiry.
El explorador de Robinhood Chain respondió lento y la consulta se cortó a los |The Robinhood Chain explorer was slow; the query was stopped after 
s para no congelar el reporte. «Reintentar análisis» le da más tiempo.|s to avoid freezing the report. Retry analysis allows more time.
No se pudo consultar DexScreener desde este navegador.|Could not query DexScreener from this browser.
veces la liquidez: el precio de pantalla no se puede realizar en tamaño.|times liquidity: the displayed price cannot be realized for a large trade.
El precio cayó |The price dropped 
Volumen de 24 h |24 h volume 
veces la liquidez: puede ser volumen inflado entre wallets del mismo dueño.|times liquidity: volume may be inflated between wallets with the same owner.
DexScreener no tiene web ni redes de este token. Los proyectos serios casi siempre las publican.|DexScreener lists no website or social links for this token. Serious projects almost always publish them.
Menos de 1 hora de vida: la mayoría de estafas ocurren en las primeras horas.|Less than 1 hour old: most scams occur in the first few hours.
compras y 0 ventas en 24 h: señal clásica de token que no deja vender (honeypot).|buys and 0 sells in 24 h: a classic sign of a token that blocks selling (honeypot).
ventas, pero el volumen del token es anómalo: no sirven como prueba de que se pueda vender.|sells, but the token's volume is anomalous: they do not prove selling is possible.
pero GeckoTerminal no lo confirma: no cuentes con esa liquidez para vender.|but GeckoTerminal does not confirm it: do not rely on that liquidity to sell.
No hay pares de este token en Robinhood Chain: no se puede comprar ni vender de forma normal.|No pairs for this token on Robinhood Chain: normal buying and selling are not possible.
Comprar y vender en el mismo bloque falla, pero vender 1 hora después funciona (recuperas |Buying and selling in the same block fails, but selling 1 hour later works (you recover 
%). Es una protección anti-bots (cooldown), no un bloqueo permanente.|%). This is anti-bot protection (cooldown), not a permanent block.
En la simulación recuperarías solo |In the simulation you would recover only 
% de lo invertido (comisiones, impacto e impuestos del token). Posible impuesto de venta abusivo.|% of your investment (fees, impact and token taxes). Possible abusive sell tax.
En la simulación recuperarías |In the simulation you would recover 
% de lo invertido: puede haber un impuesto de venta o poca liquidez.|% of your investment: there may be a sell tax or low liquidity.
Aun así, la simulación sí pudo vender: no parece un bloqueo del contrato.|However, the simulation could sell: it does not appear to be a contract block.
Vender justo después de comprar funciona, pero la misma venta 1 hora después falla en la simulación: el contrato bloquea ventas con el tiempo.|Selling immediately after buying works, but the same sale fails 1 hour later in the simulation: the contract blocks selling over time.
El hook del pool rechaza compras desde los routers estándar de Uniswap; las compras reales pasan por un contrato propio de la plataforma. No pudimos simular la venta y dependes de esa plataforma para vender.|The pool hook rejects buys through standard Uniswap routers; real buys use the platform's own contract. We could not simulate a sale and selling depends on that platform.
La compra simulada falló.|The simulated buy failed.
Simulación no disponible para este par.|Simulation unavailable for this pair.
ETH pagarías cada token |ETH each token would cost 
% más caro que con una compra pequeña: la liquidez es poca para ese monto.|% more than with a small buy: liquidity is low for that amount.
Código extra en el pool (|Extra code in the pool (
) que puede cambiar comisiones o reglas de compra y venta.|) that can change fees or buy/sell rules.
cada una: típico de un grupo coordinado o del propio creador (bundle) que luego vende a la gente.|each: typical of a coordinated group or the creator (bundle) that later sells to other buyers.
wallets compraron en el mismo bloque: posibles bots o compras coordinadas.|wallets bought in the same block: possible bots or coordinated buys.
% del volumen vendido reciente (|% of recent sell volume (
mayores ganadores (historial de operaciones no disponible)|largest winners (trade history unavailable)
La dirección no tiene código en Robinhood Chain.|The address has no code on Robinhood Chain.
El token es una copia mínima de |The token is a minimal clone of 
: no es actualizable. Revisamos también el código de ese contrato base.|: it is not upgradeable. We also checked the base contract code.
Quien controla el proxy puede cambiar las reglas del token.|Whoever controls the proxy can change the token's rules.
Implementación: |Implementation: 
Administrador del proxy: |Proxy administrator: 
Función |Function 
en el código verificado|in the verified code
Función detectada en el código del contrato (búsqueda por huella; puede haber falsos positivos)|Function detected in contract code (signature matching; false positives are possible)
El código verificado no tiene funciones de dueño, roles ni actualización: nadie puede cambiar las reglas del token después del lanzamiento.|The verified code has no owner, role or upgrade functions: nobody can change the token rules after launch.
El contrato no expone owner(), getOwner() ni admin(), y no usa roles estándar (AccessControl).|The contract exposes no owner(), getOwner() or admin(), and does not use standard roles (AccessControl).
Revisa el código verificado.|Review the verified code.
tienen el rol de administrador.|hold the administrator role.
Combinado con las funciones de abajo, pueden cambiar las reglas.|Combined with the functions below, they can change the rules.
es la dirección cero.|is the zero address.
Ojo: el contrato también usa roles; pueden seguir activos.|Note: the contract also uses roles; they may still be active.
Combinado con las funciones de abajo, puede cambiar las reglas.|Combined with the functions below, it can change the rules.
Dueño (|Owner (
El dueño guarda |The owner holds 
% de todos los tokens: puede venderlos de golpe.|% of all tokens: they can dump them.
% del suministro está en la wallet del dueño.|% of supply is in the owner's wallet.
suministro y tokens del dueño|supply and owner's tokens
%. Parte de cada operación se la queda el contrato.|%. The contract keeps part of each trade.
aunque la propiedad está renunciada.|although ownership is renounced.
No se pudo consultar la cadena desde este navegador. Prueba de nuevo más tarde.|Could not query the chain from this browser. Try again later.
el contrato rechaza con «|the contract rejects with «
límite por operación del contrato (máximo |contract limit per trade (maximum 
límite por wallet del contrato (máximo |contract limit per wallet (maximum 
no es deslizamiento (la simulación acepta cualquier precio): el contrato o el pool rechaza la venta grande|not slippage (the simulation accepts any price): the contract or pool rejects the large sale
si se puede vender (simulación no disponible para este par)|whether selling is possible (simulation unavailable for this pair)
El explorador de Robinhood Chain no respondió o no tiene el origen de este contrato.|The Robinhood Chain explorer did not respond or has no creation data for this contract.
es la wallet de una plataforma de lanzamiento (miles de transacciones), no de una persona: su historial no dice nada de este token en particular.|is a launch platform wallet (thousands of transactions), not a person: its history says nothing about this particular token.
tiene muchas transacciones; en las últimas |has many transactions; in the latest 
no creó otros tokens, pero ya había enviado |created no other tokens, but had already sent 
transacciones: no es una wallet nueva y limpia. Revisa en el explorador qué hizo antes.|transactions: this is not a fresh wallet. Check its previous activity on the explorer.
De los que pudimos revisar, |Of those we could review, 
ya no tienen liquidez (menos de $1,000). Patrón típico de quien lanza tokens en serie y los abandona.|no longer have liquidity (less than $1,000). Typical of a serial token creator who abandons them.
además de este; |besides this one; 
más; ninguno de los revisados está abandonado.|more; none of those reviewed are abandoned.
Su primera transacción fue menos de 24 h antes de crear el token: típico de wallets desechables.|Its first transaction was less than 24 h before token creation: typical of disposable wallets.
es la wallet de una plataforma de lanzamiento, no de una persona.|is a launch platform wallet, not a person.
No se pudo consultar el historial de |Could not retrieve the history of 
No se pudo consultar quién tiene la liquidez del par.|Could not determine who holds the pair's liquidity.
% de los tokens LP del par en su wallet, sin bloqueo: puede sacar la liquidez cuando quiera (rug pull).|% of the pair's LP tokens in its wallet, unlocked: it can withdraw liquidity at any time (rug pull).
% de los tokens LP están en una dirección de quemado: nadie puede retirarla.|% of LP tokens are at a burn address: nobody can withdraw that liquidity.
% de los tokens LP, sin bloqueo.|% of LP tokens, unlocked.
% de los tokens LP está en |% of LP tokens are in 
% de los tokens LP está en un contrato (posible bloqueo). No pudimos leer hasta cuándo.|% of LP tokens are in a contract (possibly locked). Could not read the lock expiry.
%, del creador |%, creator's share 
Su wallet tiene la posición de liquidez del pool|Its wallet holds the pool's liquidity position
% de la liquidez activa)|% of active liquidity)
sin bloqueo: puede sacarla cuando quiera (rug pull).|unlocked: it can withdraw it at any time (rug pull).
% de la liquidez activa del pool.|% of the pool's active liquidity.
% de la liquidez del pool está en una dirección de quemado.|% of the pool's liquidity is at a burn address.
Aportó |Provided 
% de la liquidez del pool y la controla desde su wallet.|% of the pool's liquidity and controls it from its wallet.
% de la liquidez del pool, sin bloqueo: puede retirarla cuando quiera.|% of the pool's liquidity, unlocked: it can withdraw it at any time.
% de la liquidez (posición Uniswap |% of liquidity (Uniswap position 
) está en |) is in 
% de la liquidez está en |% of liquidity is in 
No sabemos si está bloqueada ni quién lo controla.|We do not know whether it is locked or who controls it.
pero no pudimos verificar si el resto está bloqueado.|but we could not verify whether the rest is locked.
el creador (|the creator (
tiene el rol de administrador.|holds the administrator role.
El contrato usa AccessControl pero no lista a sus administradores, y el creador no es uno de ellos. Puede haber otros con permisos.|The contract uses AccessControl but does not list its administrators, and the creator is not one of them. Others may have permissions.
% de los tokens: puede venderlos de golpe.|% of tokens: it can dump them.
% del suministro está en su wallet.|% of supply is in its wallet.
en las operaciones recientes del par.|in the pair's recent trades.
No se pudo consultar quién compró en el lanzamiento.|Could not retrieve launch buyers.
wallets compraron en el primer minuto y siguen con |wallets bought in the first minute and still hold 
% del suministro: pueden vender de golpe.|% of supply: they can dump their holdings.
wallets compraron en el primer minuto; todavía guardan |wallets bought in the first minute; they still hold 
wallets compraron en el primer minuto; hoy tienen |wallets bought in the first minute; they now hold 
Recibieron su ETH del creador o de quien fondeó al creador: es el propio equipo comprando barato (bundle) para vender después.|Their ETH came from the creator or the creator's funder: the team is buying cheaply (bundle) to sell later.
Recibieron su primer ETH del mismo origen: probablemente son de una sola persona.|Their first ETH came from the same source: they probably belong to one person.
% de la liquidez) en las últimas horas.|% of liquidity) in the last few hours.
No se pudo consultar la lista de holders.|Could not retrieve the holder list.
Sin contar pools ni quemado.|Excluding pools and burned tokens.
%, pero muchas tienen el mismo saldo: el reparto puede ser de una sola persona.|%, but many have the same balance: the distribution may belong to one person.
guarda una parte grande del suministro.|holds a large share of supply.
la RPC oficial falló en esas consultas|the official RPC failed for those queries
token y sigue|token and it still has
tokens y siguen|tokens and they still have
con liquidez.|with liquidity.
No encontramos tokens creados por esta wallet|No tokens created by this wallet were found
en sus transacciones recientes.|in its recent transactions.
Tiene |Has 
transacciones: es un servicio (plataforma de lanzamiento, exchange o bot), no una persona. Sus tokens no hablan de un solo creador.|transactions: this is a service (launch platform, exchange or bot), not a person. Its tokens do not represent a single creator.
tokens que creó ya no tienen liquidez (menos de $1,000).|tokens it created no longer have liquidity (less than $1,000).
tokens revisados que creó, |reviewed tokens it created, 
ya no tiene|no longer has
ya no tienen|no longer have
tokens; los revisados siguen con liquidez por ahora.|tokens; those reviewed still have liquidity for now.
Mandó ETH a |Sent ETH to 
wallets sin actividad previa: típico de quien prepara wallets para comprar en bloque (bundle).|wallets with no previous activity: typical of preparing wallets for bundled buys.
Su primer ETH vino de |Its first ETH came from 
transacciones: exchange, puente o servicio).|transactions: exchange, bridge or service).
que creó |which created 
Fondeó a |Funded 
wallets nuevas|new wallets
Creó |Created 
tokens que ya murieron|tokens that have died
Creó 1 token que ya murió|Created 1 token that has died
El veredicto cambió de «|The verdict changed from «
Se quedó sin liquidez (posible rug): de |Lost liquidity (possible rug): from 
La liquidez cayó |Liquidity dropped 
% desde que lo guardaste|% since you saved it
El precio subió |The price increased 
Analizado: |Analyzed: 
Analizado |Analyzed 
 · bloque | · block 
 · QR de | · QR with 
 módulos| modules
 · Informativo: no garantiza seguridad ni rentabilidad.| · Informational: does not guarantee safety or profit.
`; 
  root.PBEN_FRAGMENTS = fragments.trim().split('\n').map(l=>l.split('|')).filter(p=>p.length===2 && p[0].trim()!=="de").sort((a,b)=>b[0].trim().length-a[0].trim().length);
  root.PBEN = entries;
  if(typeof module!=="undefined"&&module.exports)module.exports=entries;
})(typeof window!=="undefined"?window:globalThis);
