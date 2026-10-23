/* PreBuyScan scoring and analysis states (window.PBScore). Pure functions, no network.
 *
 * Safety Score 0-100: 100 = lowest risk DETECTED (never "safe"). Starts at 100;
 * each high-risk finding -25, each caution -10, each unchecked or technical error -5;
 * capped at 39 with any high risk and at 79 with any caution. Weights unchanged since
 * 2026.10.22-2; 2026.10.23-1 only adds the TECHNICAL ERROR state, coverage and the
 * overall analysis state (same score for the same findings).
 *
 * Finding states: high | warn | ok | unk; unk with err:true = TECHNICAL ERROR (a
 * provider or procedure failed: retrying can change it). Technical errors never count
 * as passed.
 */
(function (root) {
  "use strict";
  const ALGO_VERSION = "2026.10.23-1";
  const LABEL = { high: "Riesgo alto", warn: "Precaución", ok: "Bien", unk: "Sin datos", err: "Error técnico" };
  const WEIGHT = { high: 25, warn: 10, unk: 5, ok: 0 };

  function stateOf(check) {
    return check.s === "unk" && check.err ? "err" : check.s;
  }
  function labelOf(check) {
    return LABEL[stateOf(check)] || LABEL.unk;
  }
  function scoreOf(checks) {
    let s = 100;
    for (const c of checks) s -= WEIGHT[c.s] || 0;
    if (checks.some(c => c.s === "high")) s = Math.min(s, 39);
    else if (checks.some(c => c.s === "warn")) s = Math.min(s, 79);
    return Math.max(0, Math.round(s));
  }
  function verdictOf(checks) {
    const n = k => checks.filter(c => c.s === k).length;
    return n("high") ? ["high", "Riesgo alto", "Se detectaron señales graves. No compres sin investigar mucho más."] :
      n("warn") ? ["warn", "Precaución", "Hay señales que conviene entender antes de comprar."] :
      n("ok") ? ["ok", "Sin alertas detectadas", "No se encontraron las señales comunes. Esto no garantiza que sea seguro."] :
      ["unk", "Sin datos suficientes", "No se pudieron completar las revisiones."];
  }
  function confidenceOf(res) {
    const { checks, pair, tr, cr } = res; const has = re => checks.some(c => re.test(c.t));
    const parts = [
      ["Datos de mercado", 15, !!pair],
      ["Venta simulada", 20, has(/^(La venta simulada funciona|La venta simulada falla|Pérdida (muy )?alta al vender)/)],
      ["Código del contrato", 15, !has(/^(Contrato no revisado|No hay contrato)/)],
      ["Dueño del contrato", 5, has(/^(Propiedad renunciada|El contrato tiene dueño activo)/)],
      ["Creador identificado", 10, !!(cr && cr.creator)],
      ["Historial del creador", 10, !!(cr && cr.creator) && !has(/^(Historial del creador (no disponible|incompleto)|Creador no identificado)/)],
      ["Control de la liquidez", 10, !has(/^(Control de la liquidez no revisado|No sabemos quién tiene la liquidez|Liquidez en un contrato$)/) && !!(cr && cr.creator)],
      ["Snipers del lanzamiento", 5, !!(cr && cr.snipers)],
      ["Holders", 5, !!(cr && cr.holders && cr.holders.top10 != null)],
      ["Operaciones recientes", 5, !!tr]];
    return { score: parts.reduce((t, p) => t + (p[2] ? p[1] : 0), 0), parts };
  }
  /* Coverage: findings that reached a conclusion (ok/warn/high) out of all findings. */
  function coverageOf(checks) {
    const done = checks.filter(c => c.s !== "unk").length;
    return { done, total: checks.length, errors: checks.filter(c => stateOf(c) === "err").length,
             pct: checks.length ? Math.round(done / checks.length * 100) : 0 };
  }
  /* A score is shown only if at least one check reached a conclusion; otherwise the
     analysis is "not evaluable" and no number is displayed or stored (never a favourable-looking 80). */
  function isEvaluable(checks) {
    return coverageOf(checks).done > 0;
  }
  /* Overall analysis state, shown next to the score; never hides a technical failure. */
  function analysisStateOf(checks) {
    const cov = coverageOf(checks);
    const failed = t => checks.some(c => stateOf(c) === "err" && c.t === t);
    if (!checks.length || (failed("Datos de mercado no disponibles") && failed("Contrato no revisado")))
      return { key: "connection_error", label: "Error de conexión", detail: "No se pudo consultar ni el mercado ni la cadena. El resultado no es una evaluación." };
    if (cov.errors) return { key: "partial", label: "Análisis parcial", detail: cov.errors + " comprobación(es) con error técnico: reintentar puede cambiar el resultado." };
    if (cov.done < cov.total) return { key: "partial", label: "Análisis parcial", detail: (cov.total - cov.done) + " comprobación(es) sin resultado concluyente." };
    return { key: "complete", label: "Análisis completado", detail: "Todas las comprobaciones dieron un resultado." };
  }
  const api = { ALGO_VERSION, LABEL, WEIGHT, stateOf, labelOf, scoreOf, verdictOf, confidenceOf, coverageOf, isEvaluable, analysisStateOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBScore = api;
})(typeof window !== "undefined" ? window : globalThis);
