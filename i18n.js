/* PreBuyScan English mode (window.PBI18N). The page is written in Spanish; with English selected,
 * visible text and labels are translated in place (exact strings and patterns), including content
 * rendered later (reports, lists). Addresses, numbers and token names are left as they are.
 * Strings without a translation stay in Spanish. Choice saved in this browser ("pbs_lang").
 */
(function (root) {
  "use strict";
  const KEY = "pbs_lang";
  let lang = "es";
  try { lang = JSON.parse(root.localStorage.getItem(KEY)) || "es"; } catch (e) { lang = "es"; }

  const EXACT = {
    // navigation and chrome
    "Inicio": "Home", "Explorar": "Explore", "Simulador": "Simulator", "Historial": "History", "Ajustes": "Settings", "Favoritos": "Favorites",
    "Navegación": "Navigation", "Secciones": "Sections", "Inteligencia": "Intelligence", "Red": "Network", "Acerca de": "About", "Precisión": "Accuracy",
    "Analizar": "Analyze", "Analizar →": "Analyze →", "Analizar token →": "Analyze token →", "Pegar": "Paste", "Ver todos →": "See all →", "Lista": "List",
    "Analiza cualquier token": "Analyze any token", "antes de comprar": "before you buy", "antes de invertir.": "before investing.",
    "Pega la dirección del contrato": "Paste the contract address", "Pega la dirección del contrato o de una wallet (0x…)": "Paste a contract or wallet address (0x…)",
    "Dirección de un token o de una wallet": "Token or wallet address", "Pegar dirección del portapapeles": "Paste address from clipboard",
    "Solo lectura: sin wallet, sin firmas": "Read-only: no wallet, no signatures", "Sin wallet": "No wallet", "Sin firmas": "No signatures", "Solo análisis": "Analysis only",
    "Análisis recientes": "Recent analyses", "Últimos analizados": "Recently analyzed", "Tokens en tendencia": "Trending tokens", "Explorar tokens": "Explore tokens",
    "Nuevos": "New", "Tendencias": "Trending", "Mayor volumen": "Top volume", "Ganadores": "Winners", "⚡ Alpha Radar": "⚡ Alpha Radar",
    "Historial y favoritos": "History and favorites", "Avisos de tus favoritos": "Alerts for your favorites", "Marcar como vistos": "Mark as seen",
    "Apariencia": "Appearance", "Tema": "Theme", "Oscuro": "Dark", "Claro": "Light", "Automático": "Automatic", "Idioma": "Language",
    "Notificaciones": "Notifications", "Activar notificaciones": "Enable notifications", "Desactivar": "Disable",
    "Datos guardados en este navegador": "Data saved in this browser", "Borrar historial": "Clear history", "Borrar favoritos": "Clear favorites", "Borrar avisos": "Clear alerts",
    "Restablecer filtros del radar": "Reset radar filters", "PreBuyScan no tiene cuentas ni servidor: todo esto vive solo en tu navegador.": "PreBuyScan has no accounts or server: all of this lives only in your browser.",
    "Cambiar entre modo claro y oscuro": "Switch between light and dark mode", "Modo claro / oscuro": "Light / dark mode", "Modo": "Mode",
    "⤓ Instalar app": "⤓ Install app", "📲 Instalar PreBuyScan en tu celular": "📲 Install PreBuyScan on your phone", "Cargando…": "Loading…",
    "Filtros del Alpha Radar": "Alpha Radar filters", "Edad máxima": "Max age", "Prioridad si es menor a": "Priority if younger than", "Liquidez mínima (USD)": "Min liquidity (USD)",
    "Volumen 1 h mínimo (USD)": "Min 1 h volume (USD)", "Transacciones 1 h mínimas": "Min 1 h transactions", "FDV máximo (USD)": "Max FDV (USD)", "Valores iniciales": "Defaults",
    "Cómo calculamos": "How we calculate", "Versión del algoritmo": "Algorithm version", "Versión del algoritmo:": "Algorithm version:", "Fuentes.": "Sources.",
    "Qué tan seguido acierta": "How often it is right", "Ver método": "See method", "Medimos cuánto aciertan las señales": "We measure how often the signals are right",
    "Precisión publicada": "Published accuracy", "Venta simulada": "Simulated sale", "Creador y liquidez": "Creator and liquidity",
    "Compra y venta reales en simulación, sin firmar nada": "Real buy and sell in simulation, nothing signed", "Quién puede retirar la liquidez y qué lanzó antes": "Who can pull the liquidity and what they launched before",
    "«Sin alertas» no es una señal positiva:": "«No alerts» is not a positive signal:", "Resumen": "Summary", "Estado": "Status", "Bloque": "Block", "Gas": "Gas",
    // verdicts, states, sections
    "Riesgo alto": "High risk", "Precaución": "Caution", "Sin alertas": "No alerts", "Sin datos": "No data", "Bien": "OK", "Error técnico": "Technical error",
    "RIESGO ALTO": "HIGH RISK", "PRECAUCIÓN": "CAUTION", "SIN ALERTAS": "NO ALERTS", "SIN DATOS": "NO DATA", "NO VERIFICADO": "NOT VERIFIED", "No evaluable": "Not evaluable",
    "ANÁLISIS COMPLETADO": "ANALYSIS COMPLETE", "ANÁLISIS PARCIAL": "PARTIAL ANALYSIS", "ERROR DE CONEXIÓN": "CONNECTION ERROR", "EN CURSO": "RUNNING", "COMPLETADO": "COMPLETE",
    "Análisis completado": "Analysis complete", "Análisis parcial.": "Partial analysis.", "Error de conexión.": "Connection error.", "Reintentar análisis": "Retry analysis",
    "Análisis de token": "Token analysis", "Analizando token": "Analyzing token", "Analizando": "Analyzing", "Hallazgos": "Findings", "Gráfico": "Chart", "Ver gráfico": "Show chart",
    "Venta": "Sale", "Contrato": "Contract", "Lanzamiento": "Launch", "Holders": "Holders", "Mercado": "Market",
    "Compartir": "Share", "Copiar enlace": "Copy link", "Imagen": "Image", "☆ Favorito": "☆ Favorite", "★ Favorito": "★ Favorite", "Explorador ↗": "Explorer ↗",
    "Mercado y gráfico": "Market and chart", "Venta con montos mayores": "Sale with larger amounts", "Operaciones recientes": "Recent trades",
    "Creador, liquidez, snipers y holders": "Creator, liquidity, snipers and holders", "Simulando compra y venta…": "Simulating buy and sell…",
    "Simulando montos mayores…": "Simulating larger amounts…", "Revisando operaciones recientes…": "Checking recent trades…", "Revisando el contrato…": "Checking the contract…",
    "Buscando el monto máximo vendible…": "Finding the maximum sellable amount…", "El gráfico se carga al terminar el análisis.": "The chart loads when the analysis finishes.",
    "Haz clic o usa Ctrl + rueda para mover el gráfico": "Click or use Ctrl + wheel to move the chart",
    // finding titles (fixed)
    "Liquidez desconocida": "Unknown liquidity", "Liquidez muy baja": "Very low liquidity", "Liquidez baja": "Low liquidity", "Liquidez aceptable": "Acceptable liquidity",
    "Valoración muy alta frente a la liquidez": "Valuation far above liquidity", "Caída fuerte en la última hora": "Sharp drop in the last hour", "Caída fuerte en 24 h": "Sharp drop in 24 h",
    "Volumen inusualmente alto frente a la liquidez": "Unusually high volume versus liquidity", "Sin web ni redes sociales registradas": "No website or social networks listed",
    "Token recién creado": "Brand-new token", "Nadie ha vendido": "Nobody has sold", "Muy pocas ventas": "Very few sells", "Hay ventas de otros usuarios": "Other users are selling",
    "Ventas no confiables": "Unreliable sells", "Volumen anómalo": "Anomalous volume", "Operaciones repetidas por pocas wallets": "Repeated trades by a few wallets",
    "Volumen sin liquidez detrás": "Volume with no liquidity behind it", "Precio distinto entre pools": "Different price across pools", "Datos inconsistentes entre fuentes": "Inconsistent data between sources",
    "Un pool con comisión abusiva": "One pool with an abusive fee", "Sin mercado en DexScreener": "No market on DexScreener", "Datos de mercado no disponibles": "Market data unavailable",
    "La venta simulada funciona": "The simulated sale works", "La venta simulada falla": "The simulated sale fails", "Pérdida muy alta al vender": "Very high loss when selling",
    "Pérdida alta al vender": "High loss when selling", "La venta falla si esperas": "The sale fails if you wait", "No deja vender en el mismo bloque de la compra": "Selling in the same block as the buy is blocked",
    "Solo se puede operar desde su propio router": "Only tradable through its own router", "No se pudo simular la compra": "The buy could not be simulated", "Venta no simulada": "Sale not simulated",
    "Mucho impacto de precio en compras grandes": "High price impact on large buys", "El pool V4 tiene un hook": "The V4 pool has a hook",
    "Posible volumen inflado (wash trading)": "Possibly inflated volume (wash trading)", "Varias wallets compraron exactamente lo mismo": "Several wallets bought exactly the same amount",
    "Compras de varias wallets en el mismo bloque": "Buys from several wallets in the same block", "Una sola wallet domina las ventas": "A single wallet dominates the sells",
    "No hay contrato en esa dirección": "No contract at that address", "Clon de un contrato base (EIP-1167)": "Clone of a base contract (EIP-1167)",
    "Dueño del contrato no identificado": "Contract owner not identified", "El contrato tiene administradores (roles)": "The contract has administrators (roles)",
    "Propiedad renunciada": "Ownership renounced", "El contrato tiene dueño activo": "The contract has an active owner", "El dueño tiene mucho del suministro": "The owner holds a lot of the supply",
    "El dueño guarda una parte importante": "The owner keeps a significant share", "Roles de administración sin titular visible": "Admin roles with no visible holder",
    "Sin funciones peligrosas comunes": "No common dangerous functions", "Contrato no revisado": "Contract not checked",
    "Puede crear tokens nuevos (mint)": "Can create new tokens (mint)", "Puede bloquear wallets (lista negra)": "Can block wallets (blacklist)",
    "Puede cambiar las comisiones de compra/venta": "Can change buy/sell fees", "Puede pausar o activar el trading": "Can pause or enable trading",
    "Puede limitar cuánto se compra o vende": "Can limit how much is bought or sold", "Puede cambiar o quemar saldos ajenos": "Can change or burn other wallets' balances",
    "Creador no identificado": "Creator not identified", "Lanzado desde una plataforma": "Launched from a platform", "Historial del creador incompleto": "Creator history incomplete",
    "Historial del creador no disponible": "Creator history unavailable", "Historial incompleto en la base de creadores": "Incomplete history in the creator database",
    "No lanzó otros tokens": "Launched no other tokens", "Wallet con actividad previa: revisar": "Wallet with prior activity: review",
    "Los otros tokens del creador siguen vivos": "The creator's other tokens are still alive", "Wallet del creador recién creada": "Creator wallet freshly created",
    "Creador con tokens recientes": "Creator with recent tokens", "El creador tiene 1 token muerto": "The creator has 1 dead token",
    "El creador puede retirar la liquidez": "The creator can pull the liquidity", "Liquidez quemada": "Liquidity burned", "Una wallet puede retirar la liquidez": "A wallet can pull the liquidity",
    "Liquidez en un contrato": "Liquidity in a contract", "Liquidez repartida sin bloqueo claro": "Liquidity spread with no clear lock", "Liquidez repartida": "Liquidity spread out",
    "El creador controla parte de la liquidez": "The creator controls part of the liquidity", "Una wallet controla la liquidez": "A wallet controls the liquidity",
    "Liquidez en un contrato de bloqueo": "Liquidity in a lock contract", "Liquidez bloqueada": "Liquidity locked", "El bloqueo de la liquidez ya venció": "The liquidity lock has expired",
    "No sabemos quién tiene la liquidez": "We don't know who holds the liquidity", "Control de la liquidez no revisado": "Liquidity control not checked",
    "El creador guarda mucho del suministro": "The creator keeps a lot of the supply", "El creador guarda una parte importante": "The creator keeps a significant share", "El creador ya vendió": "The creator already sold",
    "Sin snipers detectados": "No snipers detected", "Los snipers ya casi no tienen tokens": "Snipers hold almost nothing now", "Snipers no revisados": "Snipers not checked",
    "Un comprador del lanzamiento lo fondeó el creador": "A launch buyer was funded by the creator", "Venta grande reciente": "Large recent sale",
    "Holders repartidos": "Holders spread out", "Reparto de holders engañoso": "Misleading holder spread", "Liquidez no confirmada": "Liquidity not confirmed", "Sin dueño ni administradores": "No owner or administrators", "Holders no revisados": "Holders not checked"
  };
  const PATTERNS = [
    // dynamic titles
    [/^(\d+) pools con comisión abusiva$/, "$1 pools with abusive fees"],
    [/^Precio frágil: solo (.+) del suministro está en los pools$/, "Fragile price: only $1 of the supply is in the pools"],
    [/^Solo se puede vender hasta ~(.+) ETH$/, "You can only sell up to ~$1 ETH"],
    [/^(\d+) wallets con saldos casi idénticos$/, "$1 wallets with near-identical balances"],
    [/^Un comprador del lanzamiento llegó a tener (.+)$/, "A launch buyer reached $1"],
    [/^(\d+) compradores del lanzamiento tuvieron más de (\d+) % cada uno$/, "$1 launch buyers held more than $2 % each"],
    [/^Contrato actualizable \(proxy (.+)\)$/, "Upgradeable contract ($1 proxy)"],
    [/^Impuesto declarado muy alto: (.+)$/, "Very high declared tax: $1"], [/^Impuesto declarado alto: (.+)$/, "High declared tax: $1"],
    [/^Creador serial: lanzó (\d+) tokens y (\d+) murieron$/, "Serial creator: launched $1 tokens and $2 died"],
    [/^El creador lanzó (\d+) tokens y (\d+) murieron$/, "The creator launched $1 tokens and $2 died"],
    [/^El creador tiene (\d+) tokens muertos$/, "The creator has $1 dead tokens"],
    [/^Lanza tokens en serie: (\d+) en (.+)$/, "Launches tokens in series: $1 in $2"],
    [/^Los snipers aún tienen (.+)$/, "Snipers still hold $1"], [/^Los snipers tienen (.+)$/, "Snipers hold $1"],
    [/^(\d+) compradores del lanzamiento los fondeó el creador$/, "$1 launch buyers were funded by the creator"],
    [/^(\d+) snipers fondeados por la misma wallet$/, "$1 snipers funded by the same wallet"],
    [/^Muy concentrado: 10 wallets tienen (.+)$/, "Highly concentrated: 10 wallets hold $1"], [/^Concentrado: 10 wallets tienen (.+)$/, "Concentrated: 10 wallets hold $1"],
    [/^Una wallet tiene (.+)$/, "One wallet holds $1"], [/^(.+) \(tiempo agotado\)$/, "$1 (timed out)"],
    // report chrome
    [/^Safety Score$/, "Safety Score"], [/^(\d+) de (\d+) bien$/, "$1 of $2 OK"], [/^Fuente: (.+)$/, "Source: $1"],
    [/^Revisando (0x.+)…$/, "Checking $1…"], [/^Revisando creador, liquidez, snipers y holders \(hasta (\d+) s\)…$/, "Checking creator, liquidity, snipers and holders (up to $1 s)…"],
    [/^\/100 preliminar · (.+)$/, "/100 preliminary · $1"],
    [/^Con mercado, venta simulada y contrato\. Falta creador, liquidez, snipers y holders: el resultado final puede bajar\.$/, "From market, simulated sale and contract. Creator, liquidity, snipers and holders are still running: the final result can go down."],
    [/^(Riesgo alto|Precaución|Sin alertas|Sin datos) · Safety Score (\d+)\/100 · Data Confidence (\d+) %\.$/, (m, v, s, c) => ({ "Riesgo alto": "High risk", "Precaución": "Caution", "Sin alertas": "No alerts", "Sin datos": "No data" }[v]) + " · Safety Score " + s + "/100 · Data Confidence " + c + " %."],
    [/^Lo más importante: (.+)\.$/, (m, x) => "Most important: " + x.split(" · ").map(t => tr(t)).join(" · ") + "."],
    [/^No encontramos señales de riesgo en las comprobaciones que terminaron\.$/, "We found no risk signals in the checks that finished."],
    [/^(\d+) comprobación\(es\) sin resultado concluyente; «sin alertas» nunca garantiza que sea seguro\.$/, "$1 check(s) without a conclusive result; «no alerts» never guarantees it is safe."],
    [/^Todas las comprobaciones dieron resultado; aun así, no garantiza que sea seguro\.$/, "Every check returned a result; still, this does not guarantee it is safe."],
    [/^No evaluable: ninguna comprobación concluyó\.$/, "Not evaluable: no check reached a conclusion."],
    [/^(\d+) comprobación\(es\) con error técnico: reintentar puede cambiar el resultado\.$/, "$1 check(s) with a technical error: retrying can change the result."],
    // frequent descriptions
    [/^Simulamos comprar con 0\.01 ETH y vender todo: recuperarías (.+) \(incluye comisiones e impacto\)\. No garantiza que siga así\.$/, "We simulated buying with 0.01 ETH and selling everything: you would get back $1 (fees and impact included). It may not stay that way."],
    [/^Se pudo comprar pero no vender en la simulación, ni en el mismo bloque ni 1 hora después: señal fuerte de honeypot\.$/, "The simulation could buy but not sell, neither in the same block nor 1 hour later: strong honeypot signal."],
    [/^(.+) en el par principal\.$/, "$1 in the main pair."],
    [/^(.+): una venta pequeña mueve mucho el precio y es fácil de manipular\.$/, "$1: a small sale moves the price a lot and it is easy to manipulate."],
    [/^(.+): el deslizamiento puede ser alto\.$/, "$1: slippage can be high."],
    [/^(.+) ventas en 24 h\. Que otros vendan no garantiza que tú puedas\.$/, "$1 sells in 24 h. Others selling does not guarantee you can."],
    [/^No se encontraron mint, lista negra, cambio de comisiones, pausa, límites ni cambio de saldos( en el código verificado ni)? entre las variantes conocidas\.$/, "No mint, blacklist, fee changes, pause, limits or balance changes were found among the known variants."],
    [/^Nadie más compró en el primer minuto de operaciones\.$/, "Nobody else bought in the first minute of trading."],
    [/^Las 10 wallets más grandes tienen (.+) \(sin pools ni quemado\)\.$/, "The 10 largest wallets hold $1 (excluding pools and burn)."],
    [/^Sin contar pools ni quemado\. Pocas wallets pueden tirar el precio\.$/, "Excluding pools and burn. A few wallets can crash the price."],
    [/^No encontramos otros tokens creados por (.+) en todo su historial \((\d+) transacciones\)\.$/, "We found no other tokens created by $1 in its whole history ($2 transactions)."],
    [/^Datos de mercado$/, "Market data"]
  ];

  function tr(text) {
    const t = text.trim(); if (!t) return text;
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) return text.replace(t, EXACT[t]);
    for (const [re, out] of PATTERNS) if (re.test(t)) return text.replace(t, t.replace(re, out));
    return text;
  }
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "TEXTAREA", "INPUT"]);
  function walk(node) {
    if (node.nodeType === 3) { const n = tr(node.nodeValue); if (n !== node.nodeValue) node.nodeValue = n; return; }
    if (node.nodeType !== 1 || SKIP.has(node.tagName) || (node.classList && node.classList.contains("addr"))) return;
    for (const a of ["placeholder", "aria-label", "title"]) if (node.hasAttribute && node.hasAttribute(a)) { const v = node.getAttribute(a), n = tr(v); if (n !== v) node.setAttribute(a, n); }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  function setLang(l) { try { root.localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* private mode */ } root.location.reload(); }

  function start() {
    root.document.querySelectorAll("[data-lang-set]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.langSet === lang); b.addEventListener("click", () => setLang(b.dataset.langSet)); });
    const lb = root.document.getElementById("langbtn");
    if (lb) { lb.textContent = lang === "en" ? "ES" : "EN"; lb.addEventListener("click", () => setLang(lang === "en" ? "es" : "en")); }
    if (lang !== "en") return;
    root.document.documentElement.lang = "en";
    walk(root.document.body);
    let pending = new Set(), t = null;
    new MutationObserver(ms => {
      for (const m of ms) { if (m.type === "characterData") pending.add(m.target); else m.addedNodes.forEach(n => pending.add(n)); }
      if (!t) t = setTimeout(() => { t = null; const p = pending; pending = new Set(); p.forEach(walk); }, 30);
    }).observe(root.document.body, { childList: true, subtree: true, characterData: true });
  }
  const api = { get lang() { return lang; }, tr, EXACT, PATTERNS, setLang, start };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PBI18N = api; if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
